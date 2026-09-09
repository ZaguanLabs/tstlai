# Package maintenance and releases

## Validation

Run `npm ci` and `npm run validate` before releasing. Validation includes type
checking, lint (including React hook rules), regression tests, a build, and an
isolated consumer check of the actual npm tarball.

The tarball check installs runtime dependencies without React, loads the public
server APIs from both CommonJS and native ESM, compiles the shipped declarations,
and verifies that importing the CLI does not execute it. It then installs React
and checks the client exports and legacy import paths. Temporary consumers are
removed after the check. These installation checks require registry access.

CI runs on pushes to `main` and pull requests, with Node 20, 22, and 24 crossed
with React 18.3.1 and 19.3.0. Node 20 remains in the compatibility matrix because
it is the existing runtime minimum; use a maintained LTS release for deployments.
The publishing job uses Node 24. See the [Node release schedule](https://nodejs.org/en/about/previous-releases).

Dependency updates stay within the tested major versions unless a separate
migration is needed. This refresh resolves all findings reported by `npm audit`
at implementation time. CI checks production dependencies for high/critical
findings, and Dependabot opens grouped dependency and Actions update PRs.

## Package entry points

| Import                                                             | Purpose                                                                                                          |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `tstlai`                                                           | Core API and the legacy `integrations` namespace; React loads only when its `AutoTranslate` property is accessed |
| `tstlai/core`                                                      | Core API with no React references                                                                                |
| `tstlai/server`                                                    | Core API and server adapters, including Next route handlers; no React references                                 |
| `tstlai/express`, `tstlai/fastify`, `tstlai/astro`, `tstlai/remix` | Individual server adapters                                                                                       |
| `tstlai/client`                                                    | React providers, hooks, and `AutoTranslate`; preserves the `use client` directive                                |
| `tstlai/next`, `tstlai/integrations`                               | Existing mixed server/client entry points retained for compatibility; require React                              |
| `tstlai/integrations/next-intl`                                    | Server message adapters                                                                                          |
| `tstlai/cli`                                                       | Importable generation API; the executable still runs through `npx tstlai`                                        |
| `tstlai/languages`                                                 | Language metadata and normalization helpers                                                                      |

CommonJS output remains supported by `require()` and native ESM `import`.
For bundlers, prefer explicit server and client entry points so optional React
code is outside the server dependency graph. No application API migration is
required for the existing working imports.

## Publishing

`.github/workflows/release.yml` runs on a published GitHub release. It checks that
the tag is exactly `v` plus the package version, validates the package, audits
runtime dependencies, and publishes with provenance. Update both `package.json`
and `package-lock.json` before creating a new version tag.

The workflow supports npm trusted publishing and retains the existing `NPM_TOKEN`
secret as a fallback. npm tries OIDC first and can fall back to traditional token
authentication. The npm account's trust relationship is separate from repository
configuration; it has not been changed by this code update.

To enable trusted publishing for this package in npm's package settings, select
GitHub Actions and register:

- Organization: `ZaguanLabs`
- Repository: `tstlai`
- Workflow filename: `release.yml`
- Environment: leave empty (this workflow does not declare an environment)

Verify a successful trusted publish before removing the token fallback. See
[npm's trusted publishing instructions](https://docs.npmjs.com/trusted-publishers/)
for the account configuration and required CLI versions. The workflow installs
npm 11 and grants `id-token: write` to the publishing job.
