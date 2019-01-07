const { promises: fsp } = require('fs');
const path = require('path');
const childProcess = require('child_process');

const { Toolkit } = require('actions-toolkit');
const tools = new Toolkit();
const octokit = tools.createOctokit();

const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const BUILD_DOMAIN = process.env.BUILD_DOMAIN;

const STAGING_ENVIRONMENT = 'STAGING_ENVIRONMENT';
const PRODUCTION_ENVIRONMENT = 'PRODUCTION_ENVIRONMENT';

const STAGING_KEY_PREFIX = 'REBUILD_STAGING_';
const PRODUCTION_KEY_PREFIX = 'REBUILD_PRODUCTION_';
const ALL_ENVIRONMENTS_KEY_PREFIX = 'REBUILD_';

async function installModules() {
  console.log('Installing modules');

  childProcess.execSync('npm install', {
    cwd: GITHUB_WORKSPACE,
  });
}

async function build(environment) {
  console.log(`Building ${environment}...`)
  console.log('- Generating environment variables file');

  const targetPrefix = environment === STAGING_ENVIRONMENT ?
    STAGING_KEY_PREFIX : PRODUCTION_KEY_PREFIX;

  const targetEnv = [];

  function applySecret(prefix, key) {
    const formattedKey = key.replace(prefix, '');

    targetEnv.push(`${formattedKey}=${process.env[key]}`);
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith(targetPrefix)) {
      applySecret(targetPrefix, key);
    } else if (key.startsWith(ALL_ENVIRONMENTS_KEY_PREFIX)) {
      applySecret(ALL_ENVIRONMENTS_KEY_PREFIX, key);
    }
  }

  const envFileContent = targetEnv.join('\n');
  const envFilePath = path.join(GITHUB_WORKSPACE, '.env');

  console.log('- Writing application environment variables to disk');

  await fsp.writeFile(envFilePath, envFileContent);

  console.log('- Building src');

  const package = require(path.join(GITHUB_WORKSPACE, 'package.json'));
  const { scripts } = package;

  if (! scripts || ! scripts['ci:build']) {
    console.log('No ci:build command defined, exiting early.')
    return;
  }

  childProcess.execSync('npm run ci:build', {
    cwd: GITHUB_WORKSPACE,
  });

  return 'google.com';
}

async function postComment(comment) {
  const { context: { sha } } = tools.context.event;

  const params = tools.context.repo({
    sha,
    body: comment,
  });

  octokit.repos.createCommitComment(params);
}

new Promise((resolve) => installModules().then(resolve))
  .then(async () => {
    const stagingUrl = await build(STAGING_ENVIRONMENT);
    const productionUrl = await build(PRODUCTION_ENVIRONMENT);

    const comment = `## Deployment\n${stagingUrl}\n${productionUrl}`;

    await postComment(comment);
  })
  .catch(async (error) => {
    console.error(error);

    await postComment(`${error.message}\n${error.stack}`);
  });
