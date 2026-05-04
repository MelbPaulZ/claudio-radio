# syntax=docker/dockerfile:1.6

# ── Stage 1: clone + install ─────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache git python3 make g++
WORKDIR /app
RUN git clone --depth=1 https://github.com/ZhangDo/NeteaseCloudMusicApi /app
RUN rm -f package-lock.json && \
    npm install --omit=dev --ignore-scripts \
      --registry=https://registry.npmjs.org/

# ── Stage 2: runtime ─────────────────────────────────────────────
FROM node:20-alpine AS runtime
RUN apk add --no-cache tini wget
WORKDIR /app
COPY --from=builder /app /app
RUN chown -R node:node /app
USER node
ENV PORT=3335
EXPOSE 3335
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q --spider http://localhost:3335 || exit 1
ENTRYPOINT ["tini", "--"]
CMD ["node", "app.js"]
