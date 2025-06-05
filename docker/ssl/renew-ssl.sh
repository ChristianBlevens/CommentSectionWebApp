#!/bin/bash
# SSL Certificate Renewal Script
# This script renews Let's Encrypt certificates and copies them to the Docker SSL directory

# Configuration
DOMAIN="${SSL_DOMAIN:-mycomments.duckdns.org}"
# Get project root directory (two levels up from docker/ssl/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "=== SSL Certificate Renewal ==="
echo "Domain: $DOMAIN"
echo "Project directory: $PROJECT_DIR"

# Stop frontend container to free up port 80
echo "Stopping frontend container..."
cd "$PROJECT_DIR"
docker-compose stop frontend

# Run certbot renewal
echo "Running certbot renewal..."
certbot renew --quiet

# Check if renewal was successful
if [ $? -eq 0 ]; then
    echo "Certificate renewal successful"
    
    # Copy new certificates to Docker SSL directory (same directory as this script)
    echo "Copying certificates to Docker SSL directory..."
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem "$SCRIPT_DIR/"
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem "$SCRIPT_DIR/"
    cp /etc/letsencrypt/live/$DOMAIN/chain.pem "$SCRIPT_DIR/"
    
    # Set proper permissions
    chmod 644 "$SCRIPT_DIR/fullchain.pem"
    chmod 644 "$SCRIPT_DIR/chain.pem"
    chmod 600 "$SCRIPT_DIR/privkey.pem"
    
    echo "Certificates copied successfully"
else
    echo "Certificate renewal failed"
fi

# Start frontend container again
echo "Starting frontend container..."
docker-compose start frontend

echo "=== Renewal process complete ==="