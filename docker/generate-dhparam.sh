#!/bin/sh
# Generate strong Diffie-Hellman parameters for enhanced TLS security

set -e

SSL_DIR="/etc/nginx/ssl"
DHPARAM_FILE="${SSL_DIR}/dhparam.pem"

echo "Checking for Diffie-Hellman parameters..."

# Create SSL directory if it doesn't exist
mkdir -p ${SSL_DIR}

# Check if dhparam already exists
if [ -f "${DHPARAM_FILE}" ]; then
    echo "DH parameters already exist at ${DHPARAM_FILE}"
    exit 0
fi

# Check if openssl is available, install if not (nginx:alpine doesn't include it)
if ! command -v openssl > /dev/null 2>&1; then
    echo "Installing openssl..."
    apk add --no-cache openssl
fi

echo "Generating 2048-bit DH parameters (this may take a few minutes)..."
openssl dhparam -out ${DHPARAM_FILE} 2048

# Set proper permissions
chmod 644 ${DHPARAM_FILE}

echo "DH parameters generated successfully at ${DHPARAM_FILE}"