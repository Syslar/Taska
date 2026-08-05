# ── Stage 1: Build ───────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files and install ALL deps (including devDeps for TypeScript)
COPY package*.json ./
RUN npm install --include=dev

# Copy source and compile TypeScript → dist/
COPY . .
RUN npm run build

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:22-alpine AS runner

WORKDIR /app

# Copy package files and install production deps only
COPY package*.json ./
RUN npm install --omit=dev

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Railway injects PORT automatically
EXPOSE 4000

CMD ["node", "dist/index.js"]
