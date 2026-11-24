# Runs on the platform of the machine that runs the build ($BUILDPLATFORM): the
# static files do not depend on the CPU, so the multi-platform release build
# compiles them once, natively, instead of once per platform under QEMU.
FROM --platform=$BUILDPLATFORM node:24.22-alpine AS build

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

# Official nginx image, mainline branch (the newest nginx), pinned on a minor version: a
# rebuild picks up its patch releases. It replaces nginxinc/nginx-unprivileged, which was
# still on a vulnerable nginx a week after the security releases of 2026-11-18.
FROM nginx:1.31-alpine AS nginx

# Same changes as nginxinc/nginx-unprivileged makes to the official image: nginx runs as the
# nginx user (uid 101) on port 8080, so it also works under rootless Docker and Podman. The
# pid file and temporary files go to /tmp, and the entrypoint writes the configuration from
# the templates into /etc/nginx/conf.d. Group 0 with write access, as in that image, lets
# nginx run under another uid of group 0 too. The grep lines stop the build if a future
# nginx.conf no longer matches these edits, instead of leaving root paths or the user line.
RUN sed -i 's,listen       80;,listen       8080;,' /etc/nginx/conf.d/default.conf \
    && sed -i '/user  nginx;/d' /etc/nginx/nginx.conf \
    && sed -i 's,\(/var\)\{0\,1\}/run/nginx.pid,/tmp/nginx.pid,' /etc/nginx/nginx.conf \
    && sed -i "/^http {/a \    proxy_temp_path /tmp/proxy_temp;\n    client_body_temp_path /tmp/client_temp;\n    fastcgi_temp_path /tmp/fastcgi_temp;\n    uwsgi_temp_path /tmp/uwsgi_temp;\n    scgi_temp_path /tmp/scgi_temp;\n" /etc/nginx/nginx.conf \
    && grep -q '^pid  */tmp/nginx.pid;' /etc/nginx/nginx.conf \
    && grep -q '^    proxy_temp_path /tmp/proxy_temp;' /etc/nginx/nginx.conf \
    && ! grep -q '^user' /etc/nginx/nginx.conf \
    && chown -R 101:0 /var/cache/nginx /etc/nginx \
    && chmod -R g+w /var/cache/nginx /etc/nginx

# Flattened into an empty image: the official image declares EXPOSE 80, which no later
# instruction can remove. With 80 and 8080 exposed, a reverse proxy that picks the container
# port by itself (Traefik, nginx-proxy, SWAG auto-proxy) takes 80, where nothing listens, and
# answers 502. FROM scratch drops the base image's settings: the start-up ones are declared
# again. Its NGINX_VERSION-style variables are left out: only its own build used them.
FROM scratch
COPY --from=nginx / /
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
STOPSIGNAL SIGQUIT

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf /etc/nginx/snippets/security-headers.conf

ENV BACKEND_HOST=carta-cocktail-backend
# Lets the entrypoint export NGINX_LOCAL_RESOLVERS (from /etc/resolv.conf) for the template.
ENV NGINX_ENTRYPOINT_LOCAL_RESOLVERS=1

EXPOSE 8080
USER 101
