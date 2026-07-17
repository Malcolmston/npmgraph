# syntax=docker/dockerfile:1

# ---- Build stage ----
FROM node:24-slim AS build
WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable

# Install dependencies (leverage layer caching)
COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

# Build the static site with Parcel
COPY . .
# BUGSNAG_KEY is baked in at build time; override with --build-arg if needed
ARG BUGSNAG_KEY=""
ENV BUGSNAG_KEY=$BUGSNAG_KEY
RUN pnpm run build

# ---- Serve stage ----
FROM nginx:1.27-alpine AS serve
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
