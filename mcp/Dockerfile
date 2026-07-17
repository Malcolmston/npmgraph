# syntax=docker/dockerfile:1
FROM node:24-slim AS build
WORKDIR /app/mcp
RUN corepack enable

COPY mcp/package.json mcp/pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile

COPY mcp/tsconfig.json ./
COPY mcp/src ./src
RUN pnpm build

# ---- Runtime ----
FROM node:24-slim AS runtime
WORKDIR /app/mcp
RUN corepack enable
ENV NODE_ENV=production

COPY mcp/package.json ./
# Only the deps we actually load at runtime are needed; a full install keeps it simple.
COPY --from=build /app/mcp/node_modules ./node_modules
COPY --from=build /app/mcp/dist ./dist

# stdio MCP server
CMD ["node", "dist/index.js"]
