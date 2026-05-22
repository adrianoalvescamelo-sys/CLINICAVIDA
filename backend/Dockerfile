# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

# Copy workspace root package files
COPY package*.json ./
COPY backend/package*.json ./backend/

# Install all deps (including devDeps for build)
RUN npm ci --workspace backend

# Copy source
COPY backend/ ./backend/

# Generate Prisma client
RUN npx --workspace backend prisma generate

# Build TypeScript
RUN npm --workspace backend run build

# ---- Runtime stage ----
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

# Prisma engine precisa de openssl no Alpine
RUN apk add --no-cache openssl

COPY package*.json ./
COPY backend/package*.json ./backend/

# Install production deps only
RUN npm ci --workspace backend --omit=dev

# Copy built output and Prisma generated client
# Em workspace npm, `prisma generate` coloca o client em /app/node_modules/.prisma
COPY --from=builder /app/backend/dist ./backend/dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY backend/prisma ./backend/prisma

# Create non-root user e dá ownership de /app
# (prisma migrate deploy precisa escrever em node_modules/@prisma/engines)
RUN addgroup -g 1001 -S nodejs \
  && adduser -S nestjs -u 1001 \
  && chown -R nestjs:nodejs /app
USER nestjs

EXPOSE 3000

# Run migrations then start
CMD ["sh", "-c", "npx --workspace backend prisma migrate deploy && node backend/dist/main.js"]
