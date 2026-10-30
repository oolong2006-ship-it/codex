# Build context: taqam/ (repo folder root) — see docker-compose.yml
FROM node:22-alpine AS core
WORKDIR /app/packages/core
COPY packages/core/package*.json ./
RUN npm ci
COPY packages/core/ ./
RUN npm run build

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=core /app/packages/core /app/packages/core
WORKDIR /app/apps/web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web/ ./
ARG NEXT_PUBLIC_API_URL=http://localhost:4100/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
# canonical site URL for SEO metadata, robots.txt and sitemap.xml
ARG NEXT_PUBLIC_SITE_URL=https://www.shuoon.net
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production PORT=3100 HOSTNAME=0.0.0.0 NEXT_TELEMETRY_DISABLED=1
# owned by the unprivileged `node` user so Next can write its runtime cache (.next/cache)
COPY --from=build --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/web/.next/static ./.next/static
COPY --from=build --chown=node:node /app/apps/web/public ./public
USER node
EXPOSE 3100
CMD ["node", "server.js"]
