FROM node:22-alpine AS build
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install

COPY . .
RUN pnpm build

# Production image
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install

COPY --from=build /app/dist ./dist
COPY server ./server

RUN mkdir -p /app/data
EXPOSE 3001

CMD ["npx", "tsx", "server/index.ts"]
