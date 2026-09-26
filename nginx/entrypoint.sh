#!/bin/sh
set -e

SSL_DIR="/etc/nginx/ssl"
CERT_FILE="${SSL_DIR}/cert.pem"
KEY_FILE="${SSL_DIR}/key.pem"

mkdir -p "${SSL_DIR}"

if [ ! -f "${CERT_FILE}" ] || [ ! -f "${KEY_FILE}" ]; then
    echo "=== [Coditent Security] Generating self-signed SSL/TLS certificates ==="
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${KEY_FILE}" \
        -out "${CERT_FILE}" \
        -subj "/C=MA/ST=Khouribga/L=Khouribga/O=Coditent/OU=Security/CN=localhost"
    chmod 600 "${KEY_FILE}"
    chmod 644 "${CERT_FILE}"
    echo "=== [Coditent Security] SSL/TLS certificates generated successfully ==="
fi

exec "$@"
