# Build context: the repository root (taqam/), e.g.
#   docker build -f apps/api/Dockerfile -t taqam-api .
# ---- 1. build @taqam/core (local file: dependency) ----
FROM node:22-alpine AS core
WORKDIR /repo/packages/core
COPY packages/core/package.json packages/core/package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY packages/core/ ./
RUN npm run build && npm prune --omit=dev

# ---- 2. build the API ----
FROM node:22-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /repo
COPY --from=core /repo/packages/core/package.json packages/core/package.json
COPY --from=core /repo/packages/core/dist packages/core/dist
WORKDIR /repo/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY apps/api/ ./
RUN npx prisma generate && npm run build
# (the `build` stage keeps dev deps so docker-compose's demo `seed` service can run ts-node)

FROM build AS prod-deps
RUN npm prune --omit=dev

# ---- 3. runtime ----
FROM node:22-alpine AS runtime
RUN apk add --no-cache openssl
ENV NODE_ENV=production PORT=4100
WORKDIR /repo
COPY --from=core /repo/packages/core/package.json packages/core/package.json
COPY --from=core /repo/packages/core/dist packages/core/dist
WORKDIR /repo/apps/api
COPY --from=build /repo/apps/api/package.json ./package.json
COPY --from=prod-deps /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/prisma ./prisma
EXPOSE 4100
# apply migrations then start (prisma CLI is a devDependency → use npx with a pinned version)
CMD ["sh", "-c", "npx --yes prisma@5.22.0 migrate deploy && node dist/main.js"]
