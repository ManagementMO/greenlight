# Headroom rename

The user selected **Headroom** as the public project name on October 17, 2026. The GitHub repository is now [ManagementMO/headroom](https://github.com/ManagementMO/headroom).

For existing checkouts:

```sh
git remote set-url origin https://github.com/ManagementMO/headroom.git
git fetch origin
```

The existing local directory `/Users/mo/Downloads/greenlight` continues to work, including its ignored credentials and active training process. Public app names, new reports, repo metadata and presentation copy use Headroom.

The public demo is [headroom-lahacks.vercel.app](https://headroom-lahacks.vercel.app), attached to the existing deployment project, now named Headroom. The earlier Greenlight URL remains available as a compatibility alias.

Original identifiers in frozen datasets, completed model exports, Sentry issue URLs, recorded outputs and earlier Paper images remain provenance. Do not mechanically replace those strings: doing so would break hashes, remote references and experiment reproducibility. Use the new [brand pack](README.md) for all future public assets.
