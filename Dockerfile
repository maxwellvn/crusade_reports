# Debian/glibc lets better-sqlite3 use its published Node 22 prebuilt binary.
# Alpine/musl fell back to downloading a full C++ toolchain, which made Coolify
# builds take 25+ minutes and hit the deployment command timeout.
FROM node:22.14.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Toolchain for better-sqlite3: when the prebuilt binary download aborts (flaky
# CDN in a container build), node-gyp falls back to compiling from source and
# needs Python + a C++ compiler. Removing them afterwards keeps the layer small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# Coolify may inject NODE_ENV=production at build time. Explicitly include dev
# dependencies because Vite/Tailwind are build tools, then prune them below.
# Avoid a shared BuildKit npm cache here. Coolify can leave that cache in a
# partial state after a slow/interrupted registry download, which makes npm
# terminate with "Exit handler never called" on the next build. npm 10.8.2+
# also has a known Docker exit-handler regression, so use the last unaffected
# npm 10 release for the deterministic install.
RUN npm install --global npm@10.8.1 --no-audit --no-fund \
    && npm ci --include=dev --no-audit --no-fund
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
