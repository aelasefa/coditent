FROM node:22-alpine AS dependencies

WORKDIR /app
ENV NPM_CONFIG_FETCH_RETRIES=10 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000 \
    NPM_CONFIG_FETCH_TIMEOUT=600000 \
    NPM_CONFIG_MAXSOCKETS=3
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit --fund=false


FROM node:22-alpine AS builder

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=/api-proxy
ARG NEXT_PUBLIC_OAUTH_API_URL=
ARG BACKEND_PROXY_URL=http://api:8001

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_OAUTH_API_URL=$NEXT_PUBLIC_OAUTH_API_URL \
    BACKEND_PROXY_URL=$BACKEND_PROXY_URL

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build


FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    NEXT_PUBLIC_API_URL=/api-proxy \
    NEXT_PUBLIC_OAUTH_API_URL= \
    BACKEND_PROXY_URL=http://api:8001

RUN addgroup --system --gid 10001 nextjs \
    && adduser --system --uid 10001 --ingroup nextjs nextjs

COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nextjs /app/public ./public

USER 10001:10001
EXPOSE 3000

CMD ["node", "server.js"]
