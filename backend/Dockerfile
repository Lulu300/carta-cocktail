# Literal tags in every FROM: Dependabot does not update a tag built from an ARG.

# Compiles the application on the platform of the machine that runs the build
# ($BUILDPLATFORM): the compiled JavaScript and the generated Prisma client do
# not depend on the CPU, so the multi-platform release build compiles once,
# natively, instead of once per platform under QEMU emulation.
FROM --platform=$BUILDPLATFORM node:24.21-alpine AS build
WORKDIR /app
COPY package*.json ./
# The postinstall script generates the Prisma client from prisma/schema.prisma
# into src/generated/, which `npm run build` compiles with the sources. The
# schema alone is enough: a new migration does not invalidate this layer.
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
# Also compiles src/scripts/ (seed, integrity check): the image has no tsx
RUN npm run build

# Runtime dependencies only, installed for the target platform: they hold the
# native better-sqlite3 binary and the Prisma schema engine. The first steps
# repeat those of the build stage on purpose: when both platforms are the same
# (local and CI builds), BuildKit runs them only once.
# Pruning keeps what `npm ci` installed and built without a second download.
# The runtime tree has no optional dependency of its own: --omit=optional drops the
# optional peers that only the dev tooling uses (typescript, for @prisma/client and i18next).
FROM node:24.21-alpine AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm ci
RUN npm prune --omit=dev --omit=optional

FROM node:24.21-alpine AS runtime
# tini forwards SIGTERM to the entrypoint, then to Node once the entrypoint has exec'd it
RUN apk add --no-cache tini
ENV NODE_ENV=production
# Keeps the startup logs to the entrypoint, migrations and API lines. The
# entrypoint runs the Prisma CLI through npx at each start: without these, npx
# prints an npm update notice (the node user's npm cache is new), and the CLI
# calls checkpoint.prisma.io (telemetry) and may print a Prisma update box.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false \
  CHECKPOINT_DISABLE=1
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
# The Prisma CLI config resolves the database path with this file (loaded as
# TypeScript by the CLI): the rest of src/ stays out of the image
COPY src/lib/databasePath.ts ./src/lib/
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
# The executable bit can be lost on checkouts that do not keep file modes.
# The code stays owned by root: the node user only writes to the two data folders.
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data /app/uploads \
  && chown node:node /app/data /app/uploads

# Compiled code runs from /app/dist, so the default upload path would miss the volume
ENV UPLOAD_DIR=/app/uploads

USER node

EXPOSE 3001

# Version of the running backend, read by the application. The release workflow
# passes the tag version (e.g. 1.12.0 or 1.12.0-rc.1); local and other builds
# keep "dev". Declared last so a new version only rebuilds this layer.
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION

# Checks that the data folders are writable, backs up the database, applies the
# Prisma migrations, seeds, then runs Node. A command given to `docker run`
# replaces those steps.
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
