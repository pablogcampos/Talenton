FROM node:22-alpine AS build

ENV NPM_CONFIG_UPDATE_NOTIFIER=false
ENV NPM_CONFIG_FUND=false

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_DATABASE_URL
ARG VITE_FIREBASE_APP_CHECK_SITE_KEY
ARG VITE_USE_FIREBASE_EMULATORS=false
ARG VITE_ADMIN_API_URL
ARG VITE_WORKER_API_URL
ARG VITE_TURNSTILE_SITE_KEY
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY

RUN npm run check && npm run build

FROM caddy:2.10-alpine AS runtime

WORKDIR /app
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /app/dist

RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

EXPOSE 3000

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
