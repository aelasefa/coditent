FROM owasp/modsecurity-crs:nginx-alpine

USER root
RUN apk add --no-cache openssl

COPY nginx.conf /etc/nginx/nginx.conf
COPY modsecurity/ /etc/nginx/modsecurity/
COPY entrypoint.sh /docker-entrypoint.d/00-ssl-init.sh

RUN chmod +x /docker-entrypoint.d/00-ssl-init.sh

EXPOSE 80 443
