FROM nginx:1.25-alpine

RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY entrypoint.sh /docker-entrypoint.d/00-ssl-init.sh

RUN chmod +x /docker-entrypoint.d/00-ssl-init.sh

EXPOSE 80 443
