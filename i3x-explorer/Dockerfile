# Official i3X Explorer (ACE Technologies / CESMII) packaged as a static
# nginx container. The Explorer is a client-side React/Vite SPA, so we build
# the web bundle and serve it; the browser then talks to the i3X API directly.
#
#   Source: https://github.com/ace-technologies-inc/i3X-Explorer (public)
#
# EXPLORER_REF is pinned to a commit so image builds are reproducible; upstream
# moves independently of this repo. To take a newer Explorer, bump the SHA (or
# build with --build-arg EXPLORER_REF=main to track upstream HEAD).
#   Pinned: fa9d74c5 (2026-07-06)
ARG EXPLORER_REPO=https://github.com/ace-technologies-inc/i3X-Explorer.git
ARG EXPLORER_REF=fa9d74c5da020933cf0bb5e74f767678b0e1b99e

# ── Stage 1: build the static web bundle ────────────────────────────────
FROM node:22-alpine AS build
ARG EXPLORER_REPO
ARG EXPLORER_REF
# Avoid pulling the heavy Electron binary – we only need the web build.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1 \
    CI=1
RUN apk add --no-cache git
WORKDIR /src
# --branch only accepts branches/tags, so fetch the ref explicitly – this
# works for a commit SHA as well as a branch name.
RUN git init -q . \
 && git remote add origin "${EXPLORER_REPO}" \
 && git fetch -q --depth 1 origin "${EXPLORER_REF}" \
 && git checkout -q FETCH_HEAD
RUN npm install --no-audit --no-fund
# Produce dist-web/ (vite build --config vite.web.config.ts; no Electron).
RUN npm run build:web

# Point the default config at the bundled mock (reachable from the host browser).
# config.json lives next to index.html and is applied on a user's first visit.
RUN printf '%s\n' \
    '{' \
    '  "serverUrl": "http://localhost:18810/v1",' \
    '  "recentUrls": ["http://localhost:18810/v1", "https://api.i3x.dev/v1"]' \
    '}' > dist-web/config.json

# ── Stage 2: serve with nginx ───────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /src/dist-web /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
