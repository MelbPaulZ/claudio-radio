# syntax=docker/dockerfile:1.6

# ── Stage 1: builder ─────────────────────────────────────────────
# Compile native deps (better-sqlite3) against alpine musl.
FROM node:20-alpine AS builder
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ── Stage 2: runtime ─────────────────────────────────────────────
# Clean small image. Includes Claude Code CLI for optional cli mode.
FROM node:20-alpine AS runtime

# tini = PID 1 signal forwarder; wget = healthcheck probe (busybox wget lacks --spider)
RUN apk add --no-cache tini wget

# Pre-install Claude Code CLI globally (used only when CLAUDE_MODE=cli).
# Adds ~318MB but keeps cli-mode users from having to mount node_modules.
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# Copy compiled deps from builder, then app source.
COPY --from=builder /app/node_modules ./node_modules
COPY src ./src
COPY web ./web
COPY prompts ./prompts
COPY package.json ./

# Pre-create runtime dirs so volume mounts have correct ownership.
RUN mkdir -p /app/data /app/cache /app/user && \
    chown -R node:node /app

USER node
ENV NODE_ENV=production \
    PORT=8787 \
    STATE_DB_PATH=/app/data/state.db

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:8787/health || exit 1

ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]
