# rebuild

_Rebuild the single-page app CI/CD experience!_

Set of Github actions to test & deploy SPA's to S3, update Cloudflare K/V (_coming soon_) storage and post Slack notifications (_coming soon_). Also contains an AWS Lambda function for retrieving metadata of a deployment through a Slack command (_coming soon_) and a slack command for aliasing a deployment with a domain (_coming soon_).

# rebuild slack commands (coming soon!)

A preview of the commands available,

**whoami** [`/rebuild whoami <deployment-link>`]: Used to fetch metadata of a given deployment.
**traceroute** [`/rebuild traceroute <domain>`]: Find the deployment aliased to a given domain.
**alias** [`/rebuild alias <deployment-link> <domain>`]: Point a domain at a deployment.
**promote** [`/rebuild promote`]: Point the production domain at the deployment currently aliased as staging.

# rebuild github actions

Drop these Github actions into any SPA repositories workflow to get started. If you're starting a new repository, create a workflow file at the following path in your project `.github/main.workflow`

## run-tests

Checks if the attached repository has a `ci:test` command defined in its `package.json`. Updates the pull request with test results and posts a summary to Slack.

**Workflow**

```
workflow "Test most recent commit" {
  on = "push"
  resolves = ["Test Container"]
}

action "Test Container" {
  uses = "itsjoekent/rebuild/run-tests@master"
  secrets = [
    "GITHUB_TOKEN",
  ]
}
```

Additionally, any environment variables configured in your workflow with the `REBUILD_` prefix will be written to an `.env` file in the container before the test process.

## ship-it

Creates a "deployment" for every commit for staging and production environments. Deployments are identified by the repository name and commit hash. Links to deployments for both environments are placed in the pull request and posted to Slack.

```
workflow "Deploy most recent commit" {
  on = "push"
  resolves = ["Ship It"]
}

action "Ship It" {
  uses = "itsjoekent/rebuild/ship-it@master"
  secrets = [
    "GITHUB_TOKEN",
    "BUILD_DOMAIN",
  ]
}
```

The following credentials are required,

- `BUILD_DOMAIN`: An internal name that has rebuild Cloudflare functions attached to route traffic.

Additionally, any environment variables with the following naming prefixes will be written to an `.env` file before the build process for each environment.

- `REBUILD_${YOUR_KEY_HERE}`. Applies to both both staging & production builds.
- `REBUILD_STAGING_${YOUR_KEY_HERE}`. Applies to staging builds only.
- `REBUILD_PRODUCTION_${YOUR_KEY_HERE}`. Applies to production builds only.
