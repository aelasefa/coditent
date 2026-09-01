FROM node:20-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build args for Next.js client-side env variables
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build Next.js for production
RUN npm run build

EXPOSE 3000

# Run Next.js production server
CMD ["npm", "run", "start"]
