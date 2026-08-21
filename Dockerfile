# syntax=docker/dockerfile:1

# The full Debian build image includes the native toolchain that better-sqlite3
# needs when its prebuilt binary is unavailable. This avoids downloading Debian
# package indexes during every Coolify build; the runtime stage remains slim.
FROM node:22.14.0-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Coolify may inject NODE_ENV=production at build time. Explicitly include dev
# dependencies because Vite/Tailwind are build tools, then prune them below.
# Keep the known-good npm release in its own layer. If dependency installation
# is interrupted, Coolify can reuse this completed step instead of spending ten
# minutes installing npm again.
RUN --mount=type=cache,id=crusade-reports-npm,target=/root/.npm,sharing=locked \
    npm install --global npm@10.8.1 --no-audit --no-fund --prefer-offline
# npm's cache is content-addressed and integrity-checked. The locked BuildKit
# mount lets retries reuse completed package downloads without concurrent builds
# corrupting the cache. Build native addons locally so a slow GitHub prebuild
# download cannot leave npm silent until Coolify's deployment deadline.
RUN --mount=type=cache,id=crusade-reports-npm,target=/root/.npm,sharing=locked \
    npm_config_build_from_source=true \
    npm ci --include=dev --no-audit --no-fund --prefer-offline --foreground-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: server + built client + prod deps only.
FROM node:22.14.0-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PERSISTENT_ROOT=/app/data \
    DB_REQUIRE_PERSISTENT_STORAGE=1 \
    DB_BACKUP_DIR=/app/data/backups \
    DB_BACKUP_INTERVAL_MINUTES=60
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/client/dist ./client/dist
COPY server ./server
# importer.js shares the crusade-type constants with the client
COPY client/src/lib/constants.js ./client/src/lib/constants.js
COPY package.json ./
# SQLite lives here — mount a persistent volume at /app/data in Coolify.
RUN mkdir -p data
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT || 4000}/api/health`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]
CMD ["node", "server/index.js"]
