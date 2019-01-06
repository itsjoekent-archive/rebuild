const { promises: fsp } = require('fs');
const path = require('path');
const childProcess = require('child_process');

const { Toolkit } = require('actions-toolkit');
const tools = new Toolkit();
const octokit = tools.createOctokit();

const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;

const TEST_STATUS_IN_PROGRESS = 'in_progress';
const TEST_STATUS_COMPLETED = 'completed';

const TEST_CONCLUSION_SUCCESS = 'success';
const TEST_CONCLUSION_FAILURE = 'failure';

let checkId = null;

async function installModules() {
  console.log('Installing modules');

  childProcess.execSync('npm install', {
    cwd: GITHUB_WORKSPACE,
  });
}

async function runTests() {
  console.log('Running tests');

  const package = require(path.join(GITHUB_WORKSPACE, 'package.json'));
  const { scripts } = package;

  if (! scripts || ! scripts['ci:test']) {
    return;
  }

  childProcess.execSync(scripts['ci:test'], {
    cwd: GITHUB_WORKSPACE,
  });
}

async function updateGithubStatus(status, conclusion = null, message = null) {
  console.log('Updating Github');

  const params = {
    ...tools.context.repo(),
    ...tools.context.issue(),
    status,
    head_sha: tools.context.sha,
    name: 'rebuild tests',
  };

  if (status === TEST_STATUS_IN_PROGRESS) {
    params.started_at = new Date().toISOString();
  }

  if (conclusion) {
    params.conclusion = conclusion;
    params.completed_at = new Date().toISOString();
    params.check_run_id = checkId;

    if (message) {
      params.output = {
        title: 'rebuild tests',
        summary: conclusion === TEST_CONCLUSION_SUCCESS ? 'Success' : 'Failure',
        text: message,
      };
    }
  }

  if (! checkId) {
    const result = await octokit.checks.create(params);
    checkId = result.id;
  } else {
    await octokit.checks.update(params);
  }
}

new Promise((resolve, reject) => {
  updateGithubStatus(TEST_STATUS_IN_PROGRESS).then(resolve);
})
  .then(installModules)
  .then(runTests)
  .then(() => updateGithubStatus(TEST_STATUS_COMPLETED, TEST_CONCLUSION_SUCCESS))
  .catch(async (error) => {
    const message = `${error.message}\n${error.stack}`;

    await updateGithubStatus(TEST_STATUS_COMPLETED, TEST_CONCLUSION_FAILURE, message).catch(console.error);
  });
