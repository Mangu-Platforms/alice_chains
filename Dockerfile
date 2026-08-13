# syntax=docker/dockerfile:1

# ─── Stage 1: install full dependency tree (incl. dev, needed to build) ───────
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ─── Stage 2: build client bundle + server bundle ─────────────────────────────
FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Vite inlines VITE_* vars at build time, so they must be present here.
ARG VITE_KIMI_AUTH_URL
ARG VITE_APP_ID
ENV VITE_KIMI_AUTH_URL=$VITE_KIMI_AUTH_URL
ENV VITE_APP_ID=$VITE_APP_ID
RUN npm run build

# ─── Stage 3: slim runtime ────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

# Production deps only. The server is bundled by esbuild, but drizzle-kit needs
# a real node_modules to run migrations on boot.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/db ./db
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts

RUN useradd --system --uid 10001 --create-home alice \
  && chown -R alice:alice /app
USER alice

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/trpc/ping').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/boot.js"]
