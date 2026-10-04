FROM node:22-alpine AS dependencies

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci


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
    NEXT_PUBLIC_API_URL=/api-proxy \
    NEXT_PUBLIC_OAUTH_API_URL= \
    BACKEND_PROXY_URL=http://api:8001

RUN addgroup --system --gid 10001 nextjs \
    && adduser --system --uid 10001 --ingroup nextjs nextjs

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
    && npm cache clean --force

COPY --from=builder --chown=nextjs:nextjs /app/.next ./.next
COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/next.config.mjs ./next.config.mjs

USER 10001:10001
EXPOSE 3000

CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
