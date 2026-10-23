# Production image: Next.js app + Chromium (PDF export). Migrations run at start-up.
FROM node:22-bookworm-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

COPY package.json package-lock.json ./
RUN npm ci \
 && npx playwright-core install --with-deps chromium \
 && rm -rf /var/lib/apt/lists/* /root/.npm

COPY . .
RUN npm run build && chown -R node:node /app

ENV NODE_ENV=production
USER node
EXPOSE 10000
CMD ["node", "--import", "tsx", "scripts/start.ts"]
