FROM node:24.21-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
# The postinstall script generates the Prisma client from prisma/schema.prisma
# into src/generated/, which `npm run build` compiles with the sources
RUN npm ci

COPY . .
RUN npm run build

RUN mkdir -p /app/data /app/uploads
# Compiled code runs from /app/dist, so the default upload path would miss the volume
ENV UPLOAD_DIR=/app/uploads

# The executable bit can be lost on checkouts that do not keep file modes
RUN chmod +x /app/docker-entrypoint.sh

EXPOSE 3001

# Backs up the database, applies the Prisma migrations, seeds, then runs Node
ENTRYPOINT ["/app/docker-entrypoint.sh"]
