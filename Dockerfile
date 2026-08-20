# =============================================================================
# Dockerfile — Kalender (Express + Vite-Frontend)
# Mehrstufiger Build: Abhängigkeiten → Frontend-Build → schlankes Runtime-Image.
# =============================================================================

FROM node:22-bookworm-slim AS deps

WORKDIR /usr/src/app

COPY package.json package-lock.json ./

RUN npm ci

# -----------------------------------------------------------------------------
# Build: Vite-Frontend + TypeScript-Server
# -----------------------------------------------------------------------------
FROM deps AS build

WORKDIR /usr/src/app

COPY . .

RUN npm run build

# -----------------------------------------------------------------------------
# Runtime: nur Produktionsabhängigkeiten und gebaute Artefakte, User "node"
# -----------------------------------------------------------------------------
FROM node:22-bookworm-slim

WORKDIR /usr/src/app

ENV NODE_ENV=production
ENV APP_PORT=3366
ENV TZ=Europe/Berlin

# Verknüpft das GHCR-Paket mit dem GitHub-Repository.
LABEL org.opencontainers.image.source="https://github.com/rolfwalker71-commits/mycalendar"
LABEL org.opencontainers.image.title="mycalendar"
LABEL org.opencontainers.image.description="Selbst gehosteter Kalender und Mail mit Google Workspace, Express und PostgreSQL"

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=node:node /usr/src/app/dist ./dist
COPY --from=build --chown=node:node /usr/src/app/web/dist ./web/dist

USER node

EXPOSE 3366

# Docker erkennt so, ob der Prozess noch HTTP beantwortet.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3366/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
