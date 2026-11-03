# syntax=docker/dockerfile:1.7
# Imagem única para API e workers (mesmo código, comandos diferentes).
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY server/package.json server/
RUN pnpm install --frozen-lockfile --filter server...
COPY server server
RUN pnpm --filter server build \
 && pnpm --filter server deploy --legacy --prod /out \
 && cp -r server/dist server/drizzle /out/

FROM node:22-alpine
ENV NODE_ENV=production
RUN apk add --no-cache tini postgresql16-client
WORKDIR /app
COPY --from=build /out ./
USER node
EXPOSE 4000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/api/server.js"]
