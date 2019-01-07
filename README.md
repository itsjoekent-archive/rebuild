# rebuild

_Rebuild the single-page app CI/CD experience!_

Set of Github actions to test & deploy SPA's to S3, update Cloudflare K/V storage and post Slack deploy messages. Also contains an AWS Lambda function for retrieving metadata of a deployment.

**rebuild** as a project is only concerned with creating a new immutable static deployment in cloud object storage for every commit. To point your deployments at a domain or subdomain, use [to be named](...).

# rebuild slack commands (coming soon!)

**rebuild** contains an AWS Lambda function that is invoked by the following Slack command, `/rebuild <deployment-link>`

This function is deployed to AWS by [deploy-lambda-action](https://github.com/lannonbr/deploy-lambda-action).

# rebuild github actions

Drop these Github actions into any SPA repositories workflow to get started. If you're starting a new repository, create a workflow file at the following path in your project `.github/main.workflow`

## run-tests

Checks if the attached repository has a `ci:test` command defined in its `package.json`. Updates the pull request with test results and posts a summary to Slack.

```
workflow "Test most recent commit" {
  on = "push"
  resolves = ["Test Container"]
}

action "Test Container" {
  uses = "itsjoekent/rebuild/run-tests@master"
  secrets = [
    "GITHUB_TOKEN",
    "SLACK_WEBHOOK_URL",
  ]
}
```

**NOTE**: Slack notifications are WIP.

Additionally, any environment variables with the `REBUILD_` prefix will be written to an `.env` file before the test process.

## ship-it

Creates a "deployment" for every commit for staging and production environments. Deployments are identified by the repository name, commit hash and environment. Links to deployments for both environments are placed in the pull request and posted to Slack.

```
Workflow TODO
```

The following credentials are required,

- TODO...

Additionally, any environment variables with the following naming prefixes will be written to an `.env` file before the build process for each environment.

- `REBUILD_${YOUR_KEY_HERE}`. Applies to both both staging & production builds.
- `REBUILD_STAGING_${YOUR_KEY_HERE}`. Applies to staging builds only.
- `REBUILD_PRODUCTION_${YOUR_KEY_HERE}`. Applies to production builds only.
