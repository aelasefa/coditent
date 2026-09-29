FROM owasp/modsecurity-crs:nginx-alpine

USER root
RUN apk add --no-cache openssl

# The base image generates its own nginx.conf at container startup. Remove its
# templates so the CODITENT proxy configuration copied below remains active.
RUN rm -rf /etc/nginx/templates /etc/nginx/conf.d

COPY nginx.conf /etc/nginx/nginx.conf
COPY modsecurity/ /etc/nginx/modsecurity/
COPY entrypoint.sh /docker-entrypoint.d/00-ssl-init.sh

RUN chmod +x /docker-entrypoint.d/00-ssl-init.sh

EXPOSE 80 443

# Bypass the base image's template-generating entrypoint; it would replace the
# CODITENT reverse-proxy routes at runtime.
ENTRYPOINT ["/docker-entrypoint.d/00-ssl-init.sh"]
CMD ["nginx", "-g", "daemon off;"]
