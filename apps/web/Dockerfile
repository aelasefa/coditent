FROM node:20-alpine

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=/api-proxy
ARG BACKEND_PROXY_URL=http://api:8001

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BACKEND_PROXY_URL=$BACKEND_PROXY_URL

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
