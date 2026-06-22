# i3X Explorer (Docker packaging)

> ⚠️ **This is third-party software. It is NOT part of `node-red-contrib-i3x`
> and is not authored by this project.**

This folder only contains *packaging* (a `Dockerfile` and `nginx.conf`) that
builds and serves the **official i3X Explorer** GUI. The application source
itself is **not vendored here** — the Docker build clones it from upstream at
build time.

## Source / attribution

- **Upstream repository:** <https://github.com/ace-technologies-inc/i3X-Explorer>
- **Authors:** ACE Technologies, Inc. / CESMII – The Smart Manufacturing Institute
- **License:** MIT — `Copyright (c) 2024 CESMII - The Smart Manufacturing Institute`

All rights to the i3X Explorer application belong to its authors. The MIT
license terms of the upstream project apply to the built application; this
packaging adds nothing to and claims nothing about that code.

## What this packaging does

1. Clones the upstream repo (`ARG EXPLORER_REPO` / `ARG EXPLORER_REF`).
2. Runs its web build (`npm run build:web` → `dist-web/`).
3. Serves the static bundle with nginx, with a `config.json` pre-pointed at the
   bundled mock server (`http://localhost:18810/v1`).

## Run

```bash
docker compose up -d i3x-mock i3x-explorer
```

Then open <http://localhost:18820>. The Explorer is a client-side SPA, so it
calls the i3X API directly from your browser (CORS is enabled on the mock).

To point at a different fork/version, override the build args:

```bash
docker compose build i3x-explorer \
  --build-arg EXPLORER_REPO=https://github.com/your/fork.git \
  --build-arg EXPLORER_REF=v1.2.3
```
