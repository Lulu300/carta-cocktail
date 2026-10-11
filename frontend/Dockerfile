FROM node:24.21-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
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
