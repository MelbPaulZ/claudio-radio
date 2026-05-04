# claudio-ncm image

This image packages the [`ZhangDo/NeteaseCloudMusicApi`](https://github.com/ZhangDo/NeteaseCloudMusicApi)
fork as a sidecar for Claudio Radio. It runs an HTTP API on port 3335 that
proxies requests to NetEase Cloud Music.

## Upstream

- Source: <https://github.com/ZhangDo/NeteaseCloudMusicApi>
- License: MIT (see upstream `LICENSE`)
- We pin to whatever the `--depth=1` clone resolves to at image build time.

## Why a fork?

The original `Binaryify/NeteaseCloudMusicApi` was archived. ZhangDo's fork
continues to track NetEase's API changes.

## Bumping the upstream

When upstream changes warrant a new image:

1. Bump the Claudio Radio version (e.g. `v0.1.0` → `v0.2.0`)
2. CI rebuilds the NCM image from a fresh clone, pinned to the new claudio version

The NCM image tag always matches the Claudio Radio tag — they ship together.
