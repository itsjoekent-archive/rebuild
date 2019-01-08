const fs = require('fs');
const { promises: fsp } = fs;
const path = require('path');
const childProcess = require('child_process');

const request = require('request-promise-native');
const aws = require('aws-sdk');
const { Toolkit } = require('actions-toolkit');

const INCOMING_SLACK = process.env.INCOMING_SLACK;
const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE;
const BUILD_DOMAIN = process.env.BUILD_DOMAIN;
const STORAGE_ENDPOINT = process.env.STORAGE_ENDPOINT;

const STAGING_ENVIRONMENT = 'STAGING_ENVIRONMENT';
const PRODUCTION_ENVIRONMENT = 'PRODUCTION_ENVIRONMENT';

const STAGING_KEY_PREFIX = 'REBUILD_STAGING_';
const PRODUCTION_KEY_PREFIX = 'REBUILD_PRODUCTION_';
const ALL_ENVIRONMENTS_KEY_PREFIX = 'REBUILD_';

const storageEndpoint = new aws.Endpoint(STORAGE_ENDPOINT);
const s3 = new aws.S3({ endpoint: storageEndpoint });

const tools = new Toolkit();
const octokit = tools.createOctokit();

async function installModules() {
  console.log('Installing modules');

  childProcess.execSync('npm install', {
    cwd: GITHUB_WORKSPACE,
  });
}

async function uploadArtifactToS3(environment) {
  console.log('- Uploading files to S3');
  const { context: { sha, payload: { repository: { name } } } } = tools;

  const environmentName = environment === STAGING_ENVIRONMENT ? 'staging' : 'prod';
  const bucketName = `${name}-${sha}-${environmentName}`;

  await s3.createBucket({ Bucket: bucketName }).promise();

  const buildDirectory = path.join(GITHUB_WORKSPACE, '/build');

  // TODO Promisify this.
  function walkDirectory(directory) {
    fs.readdirSync(directory).forEach(async (name) => {
      const filePath = path.join(directory, name);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        const key = filePath.replace(`${GITHUB_WORKSPACE}/build/`, '');

        const params = {
          Bucket: bucketName,
          Key: key,
          Body: fs.readFileSync(filePath),
          ACL: 'public-read',
        };

        await s3.putObject(params).promise();
      } else if (stat.isDirectory()) {
        walkDirectory(filePath);
      }
    });
  }

  walkDirectory(buildDirectory);

  return `https://${bucketName}.${STORAGE_ENDPOINT}`;
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

  return uploadArtifactToS3(environment);
}

async function postComment(comment) {
  const { context: { sha } } = tools;

  const params = tools.context.repo({
    sha,
    body: comment,
  });

  octokit.repos.createCommitComment(params);
}

async function postToSlack(message, color) {
  if (! INCOMING_SLACK) {
    return;
  }

  const {
    context: {
      sha,
      payload: {
        ref,
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

  const branch = ref.split('/')[ref.split('/').length - 1];

  const title = `[ship-it] on ${repoName}:${branch} by ${githubUserName}`;

  const attachment = {
    title,
    text: `${message}`,
  };

  if (color) {
    attachment.color = color;
  }

  const payload = {
    attachments: [attachment],
  };

  await request({
    uri: INCOMING_SLACK,
    method: 'POST',
    body: payload,
    json: true,
  });
}

(async () => {
  const {
    context: {
      payload: {
        deleted,
      },
    },
  } = tools;

  if (deleted) {
    console.log('Branch delete, terminating early.');
    process.exit(0);

    return;
  }

  await postToSlack(`Starting build.`, '#FFDC00');

  await installModules();

  const stagingUrl = await build(STAGING_ENVIRONMENT);
  const productionUrl = await build(PRODUCTION_ENVIRONMENT);

  const githubComment = `## Deployments\n[Staging](${stagingUrl})\n[Production](${productionUrl})`;

  await postComment(githubComment);

  const slackComment = `Build completed.\n*Staging* ${stagingUrl}\n*Production*${stagingUrl}`;
  await postToSlack(slackComment, '#01FF70');
})().catch(async (error) => {
  console.error(error);

  const message = `${error.message}\n${error.stack}`;

  await postComment(`${error.message}\n${error.stack}`).catch(console.error);
  await postToSlack('Build failed.', '#FF4136').catch(console.error);

  process.exit(1);
});
