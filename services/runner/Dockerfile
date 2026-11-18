FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY services/runner/package.json services/runner/
RUN pnpm install --frozen-lockfile --filter @codequest/runner...

FROM deps AS build
COPY tsconfig.base.json ./
COPY services/runner services/runner
RUN pnpm --filter @codequest/runner build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S runner && adduser -S runner -G runner
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/runner/node_modules ./services/runner/node_modules
COPY --from=build /app/services/runner/dist ./services/runner/dist
COPY services/runner/package.json ./services/runner/package.json
USER runner
CMD ["node", "services/runner/dist/main.js"]
