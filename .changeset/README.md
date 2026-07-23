# Changesets

This folder is managed by [changesets](https://github.com/changesets/changesets).
`@ancora/core` and `@ancora/react` are **linked**: they always publish at the
same version, so a consumer never has to reason about a compatibility matrix
between the two.

To record a change for the next release:

```bash
npm run changeset      # pick packages + bump level, write a summary
```

The release is then cut by the `Release` GitHub workflow (see
[docs/RELEASING.md](../docs/RELEASING.md)).
