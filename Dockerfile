# Multi-stage Dockerfile for Autonomous On-Chain Finance Agent
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY security-gate-server/package*.json ./security-gate-server/
COPY eliza-agent-bridge/package*.json ./eliza-agent-bridge/

# Install dependencies
RUN npm ci

# Copy source files
COPY tsconfig.json ./
COPY security-gate-server ./security-gate-server
COPY eliza-agent-bridge ./eliza-agent-bridge
COPY contracts ./contracts
COPY tests ./tests

# Build workspaces (TypeScript compile)
RUN npm run build

# Production runtime stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package*.json ./
COPY security-gate-server/package*.json ./security-gate-server/
COPY eliza-agent-bridge/package*.json ./eliza-agent-bridge/

# Install only production dependencies
RUN npm ci --omit=dev

# Copy built artifacts from builder
COPY --from=builder /app/security-gate-server/dist ./security-gate-server/dist
COPY --from=builder /app/security-gate-server/src ./security-gate-server/src
COPY --from=builder /app/eliza-agent-bridge/dist ./eliza-agent-bridge/dist
COPY --from=builder /app/eliza-agent-bridge/src ./eliza-agent-bridge/src
COPY --from=builder /app/contracts ./contracts

EXPOSE 8080

CMD ["node", "security-gate-server/dist/server.js"]
