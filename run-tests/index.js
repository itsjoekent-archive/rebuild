const { promises: fsp } = require('fs');
const path = require('path');
const childProcess = require('child_process');

const request = require('request-promise-native');
const { Toolkit } = require('actions-toolkit');
const tools = new Toolkit();
const octokit = tools.createOctokit();

const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const INCOMING_SLACK = process.env.INCOMING_SLACK;

const TEST_STATUS_IN_PROGRESS = 'in_progress';
const TEST_STATUS_COMPLETED = 'completed';

const TEST_CONCLUSION_SUCCESS = 'success';
const TEST_CONCLUSION_FAILURE = 'failure';

const ENVIRONMENTS_KEY_PREFIX = 'REBUILD_';

let checkId = null;

async function installModules() {
  console.log('Installing modules');

  childProcess.execSync('npm install', {
    cwd: GITHUB_WORKSPACE,
  });
}

async function runTests() {
  console.log('Running tests...');
  console.log('- Locating application environment variables');

  const envFileContent = Object.keys(process.env)
    .filter(key => key.startsWith(ENVIRONMENTS_KEY_PREFIX))
    .map(key => `${key.replace(ENVIRONMENTS_KEY_PREFIX, '')}=${process.env[key]}`)
    .join('\n');

  console.log('- Writing application environment variables to disk');

  const envFilePath = path.join(GITHUB_WORKSPACE, '.env');
  await fsp.writeFile(envFilePath, envFileContent);

  const package = require(path.join(GITHUB_WORKSPACE, 'package.json'));
  const { scripts } = package;

  if (! scripts || ! scripts['ci:test']) {
    console.log('No ci:test command defined, exiting early.')
    return;
  }

  console.log('- Running test suite');

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

async function postToSlack(message, color) {
  const { number } = tools.context.issue();

  const {
    context: {
      sha,
      payload: {
        repository: {
          full_name: repoName,
          html_url: repoUrl,
        },
        pusher: {
          name: githubUserName,
        },
      },
    },
  } = tools;

  const title = `*${repoName} run-tests triggered by ${githubUserName}*`;
  const link = number ? `${repoUrl}/pulls/${number}` : `${repoUrl}/commit/${sha}`;

  const payload = {
    text: `${title}\n${message}\n${link}`,
  };

  if (color) {
    payload.color = color;
  }

  await request({
    uri: INCOMING_SLACK,
    method: 'POST',
    body: payload,
    json: true,
  });
}

(async () => {
  await updateGithubStatus(TEST_STATUS_IN_PROGRESS);
  await postToSlack(`Test suite started.`, '#FFDC00');
  await installModules();
  await runTests();
  await updateGithubStatus(TEST_STATUS_COMPLETED, TEST_CONCLUSION_SUCCESS);
  await postToSlack('Test suite completed.', '#01FF70');
})().catch(async (error) => {
  console.error(error);

  const message = `${error.message}\n${error.stack}`;

  await updateGithubStatus(TEST_STATUS_COMPLETED, TEST_CONCLUSION_FAILURE, message).catch(console.error);
  await postToSlack('Test suite failed.', '#FF4136').catch(console.error);

  process.exit(1);
});
