# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
COPY frontend/package*.json ./frontend/

RUN npm ci --workspace frontend

COPY frontend/ ./frontend/

# Build com base path / e API URL relativo (proxy via nginx)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

RUN npm --workspace frontend run build

# ---- Runtime stage ----
FROM nginx:1.27-alpine AS runtime

# Remove default
RUN rm /etc/nginx/conf.d/default.conf

COPY frontend/nginx.conf /etc/nginx/conf.d/clinicavida.conf

# Static assets
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

EXPOSE 80

# 127.0.0.1 (não "localhost"): em alpine localhost resolve ::1 (IPv6) primeiro,
# mas nginx faz "listen 80" só em IPv4 → wget daria Connection refused.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health-nginx || exit 1

CMD ["nginx", "-g", "daemon off;"]
