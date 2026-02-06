FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

RUN mkdir -p /app/data /app/uploads

EXPOSE 3001

CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npm run db:seed && npm start"]
