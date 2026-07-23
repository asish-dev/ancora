# Releasing

`@ancora/core` and `@ancora/react` are published together (linked versions) via
[changesets](https://github.com/changesets/changesets). Nothing publishes by
hand from a laptop; the `Release` workflow does it from `main`.

## Day-to-day: record a changeset with each PR

When a PR changes published behavior:

```bash
npm run changeset
```

Pick the affected package(s) and the bump level (patch / minor / major), and
write a one-line summary — it becomes the changelog entry. Commit the generated
file in `.changeset/`. (Docs-only / CI-only PRs need no changeset.)

## Cutting a release

1. As changesets land on `main`, the **Release** workflow opens (and keeps
   updating) a **"Version Packages"** PR that bumps versions and rewrites
   changelogs.
2. Merging that PR triggers the workflow again; this time it runs
   `changeset publish`, which builds and pushes both packages to npm and tags
   the release.

## One-time setup before the first publish

- **npm scope**: confirm the `@ancora` scope (or org) exists and the publishing
  account owns it. `npm org ls ancora` / `npm access`.
- **`NPM_TOKEN` secret**: create an automation token with publish rights and add
  it as a repository secret named `NPM_TOKEN`
  (`gh secret set NPM_TOKEN`). Until it exists, the publish step is a safe no-op.
- **First version**: both packages start at `0.1.0`. Pre-1.0 means minor bumps
  may carry breaking changes — call them out in the changeset summary.

## Verifying a build locally (no publish)

```bash
npm run build                      # emits packages/*/dist
npm pack --workspace @ancora/react --dry-run   # inspect the tarball contents
```

The tarball must contain only `dist/**`, `package.json`, `README.md`, and
`LICENSE` — never `src/` or tests.
