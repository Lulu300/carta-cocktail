# Runs on the platform of the machine that runs the build ($BUILDPLATFORM): the
# static files do not depend on the CPU, so the multi-platform release build
# compiles them once, natively, instead of once per platform under QEMU.
FROM --platform=$BUILDPLATFORM node:24.21-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# Version shown in the admin. The release workflow passes the tag version
# (e.g. 1.8.0); local and other builds keep "dev". Declared after npm ci so a
# new version does not invalidate the dependency layer.
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION
RUN npm run build

# Non-root nginx (uid 101) listening on 8080. Pinned on a minor version of the stable branch.
FROM nginxinc/nginx-unprivileged:1.30-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

ENV BACKEND_HOST=carta-cocktail-backend
# Lets the entrypoint export NGINX_LOCAL_RESOLVERS (from /etc/resolv.conf) for the template.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 8080
