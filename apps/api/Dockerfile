FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
# node-gyp peut être invoqué sur musl (argon2, msgpackr-extract) : prévoir l'outillage.
RUN apk add --no-cache python3 make g++
# Tous les manifests du workspace sont nécessaires à pnpm pour résoudre le graphe.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY services/runner/package.json services/runner/
RUN CI=true pnpm install --frozen-lockfile --filter @codequest/api...

FROM deps AS build
COPY tsconfig.base.json ./
COPY apps/api apps/api
RUN pnpm --filter @codequest/api prisma:generate \
 && pnpm --filter @codequest/api build

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S api && adduser -S api -G api
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json
USER api
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
