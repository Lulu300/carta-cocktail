# Literal tags in every FROM: Dependabot does not update a tag built from an ARG.

# All dependencies, to compile the application
FROM node:24.21-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
# The postinstall script generates the Prisma client from prisma/schema.prisma
# into src/generated/, which `npm run build` compiles with the sources
RUN npm ci

FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
# Also compiles src/scripts/ (seed, integrity check): the image has no tsx
RUN npm run build

# Runtime dependencies only. Pruning keeps what `npm ci` installed and built for
# this platform (better-sqlite3 binary, Prisma schema engine) without a second download.
# The runtime tree has no optional dependency of its own: --omit=optional drops the
# optional peers that only the dev tooling uses (typescript, for @prisma/client and i18next).
FROM deps AS prod-deps
RUN npm prune --omit=dev --omit=optional && npm cache clean --force

FROM node:24.21-alpine AS runtime
# tini forwards signals to the entrypoint and then Node; su-exec drops root
# once the entrypoint has given the volumes to the node user
RUN apk add --no-cache tini su-exec
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json prisma.config.ts ./
# The Prisma CLI config resolves the database path with this file (loaded as
# TypeScript by the CLI): the rest of src/ stays out of the image
COPY src/lib/databasePath.ts ./src/lib/
COPY prisma ./prisma
COPY docker-entrypoint.sh ./
# The executable bit can be lost on checkouts that do not keep file modes
RUN chmod +x docker-entrypoint.sh \
  && mkdir -p /app/data /app/uploads \
  && chown node:node /app/data /app/uploads

# Compiled code runs from /app/dist, so the default upload path would miss the volume
ENV UPLOAD_DIR=/app/uploads

EXPOSE 3001

# Backs up the database, applies the Prisma migrations, seeds, then runs Node as
# the node user. A command given to `docker run` replaces those steps.
ENTRYPOINT ["/sbin/tini", "--", "/app/docker-entrypoint.sh"]
