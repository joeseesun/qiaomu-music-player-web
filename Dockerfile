FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY index.html vite.config.ts tsconfig.json postcss.config.cjs tailwind.config.cjs ./
COPY server.js Dockerfile docker-compose.yml ./
COPY public public
COPY src src
COPY scripts scripts
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY server.js server.js
COPY --from=build /app/dist dist

RUN mkdir -p /data/music /data/covers && chown -R node:node /data
USER node

EXPOSE 3068
CMD ["node", "server.js"]
