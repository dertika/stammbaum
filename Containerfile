# Stammbaum-Dashboard – ein Container, ein Port (8080), Daten in /data
ARG NODE_IMAGE=docker.io/library/node:22.22-alpine

# Build- und Abhängigkeits-Stufen laufen immer auf der Plattform des Builders:
# das Frontend ist statisch und alle Abhängigkeiten sind reines JavaScript
# (SQLite kommt aus node:sqlite). So braucht ein arm64-Build keine Emulation.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --no-audit --no-fund
COPY shared shared
COPY frontend frontend
RUN npm run build -w frontend

FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --omit=dev --workspace backend --no-audit --no-fund

FROM ${NODE_IMAGE}
LABEL org.opencontainers.image.title="stammbaum" \
      org.opencontainers.image.description="Schlankes, rein lesendes Stammbaum-Dashboard für Gramps Web" \
      org.opencontainers.image.source="https://github.com/dertika/stammbaum"
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    STATIC_DIR=/app/frontend/dist
WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY package.json ./
COPY backend/package.json backend/
COPY backend/src backend/src
COPY shared shared
COPY --from=build /app/frontend/dist frontend/dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
# TypeScript läuft dank Type-Stripping von Node direkt, ohne Build-Schritt
CMD ["node", "--disable-warning=ExperimentalWarning", "backend/src/main.ts"]
