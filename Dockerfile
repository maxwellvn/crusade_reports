# syntax=docker/dockerfile:1

# Use the same supported Node release for building and runtime. pdfjs-dist needs
# Node 22.13+, and the bundled npm avoids a separate global npm installation.
FROM node:22.14.0-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Coolify may inject NODE_ENV=production at build time. Explicitly include dev
# dependencies because Vite/Tailwind are build tools, then prune them below.
# Install the locked tree without opaque lifecycle scripts. The only relevant
# Linux install scripts are esbuild and better-sqlite3; rebuild them explicitly
# below so a native download cannot leave npm silent until Coolify times out.
RUN --mount=type=cache,id=crusade-reports-npm,target=/root/.npm,sharing=locked \
    npm ci --include=dev --ignore-scripts --no-audit --no-fund --prefer-offline
RUN npm rebuild esbuild --foreground-scripts
# Compile SQLite against headers already present in the official Node image.
# npm_config_nodedir prevents node-gyp from downloading headers from nodejs.org.
RUN npm_config_nodedir=/usr/local \
    npm rebuild better-sqlite3 --build-from-source --foreground-scripts
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
