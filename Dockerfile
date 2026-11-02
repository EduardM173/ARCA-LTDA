FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS build
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --store-dir=/tmp/arca-pnpm-store && rm -rf /tmp/arca-pnpm-store
COPY . .
RUN for s in identity personnel vacation contract payment; do pnpm exec prisma generate --schema apps/$s-service/prisma/schema.prisma; done
RUN pnpm exec tsc && for s in identity personnel vacation contract payment; do ln -s /app/apps/$s-service/generated /app/dist/apps/$s-service/generated; done
FROM node:24-alpine@sha256:8a32c8cf649a49915a66e81e7a609223c708d0adabf288ee3f4077d765542f85 AS runtime
WORKDIR /app
ENV NODE_ENV=production BIND_HOST=0.0.0.0
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps ./apps
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node infra/start-service.mjs ./infra/start-service.mjs
RUN mkdir -p .runtime/documents && chown node:node .runtime .runtime/documents
USER node
CMD ["node", "infra/start-service.mjs"]
