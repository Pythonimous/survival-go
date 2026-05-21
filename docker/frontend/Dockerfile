# Production frontend build served by nginx with API proxy to backend.
FROM node:20-bookworm-slim AS build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/scripts/ ./scripts/
RUN npm ci
COPY frontend/ ./

# Baked at image build time (git short SHA from host via compose build-arg).
# Used to cache-bust coi-serviceworker.js and /wasm/* in the static bundle.
ARG VITE_APP_BUILD_ID=dev
ENV VITE_APP_BUILD_ID=${VITE_APP_BUILD_ID}

RUN npm run build

FROM nginx:1.27-alpine

COPY docker/frontend/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html

EXPOSE 80
