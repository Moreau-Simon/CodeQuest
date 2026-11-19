FROM node:20-alpine AS build
RUN corepack enable
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY services/runner/package.json services/runner/
RUN CI=true pnpm install --frozen-lockfile --filter @codequest/web...
COPY tsconfig.base.json ./
COPY apps/web apps/web
RUN pnpm --filter @codequest/web build

FROM nginx:1.27-alpine AS runtime
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
