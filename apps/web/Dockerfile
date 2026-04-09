# Build frontend dependencies
FROM node:20-alpine AS deps

# Create app directory
WORKDIR /app

# Install dependencies first for layer caching
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Build Next.js app
FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build-time public API URL for client bundle
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN npm run build

# Runtime image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next

EXPOSE 3000

# Start Next.js server on all interfaces
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
