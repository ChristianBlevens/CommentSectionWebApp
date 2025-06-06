#!/bin/sh
set -e

echo "Starting API service..."

# Check if migrations should be run
if [ "$RUN_MIGRATIONS" = "true" ]; then
  echo "Running database migrations..."
  node /usr/src/app/migrations/migrate.js || {
    echo "Migration failed, but continuing..."
  }
fi

# Execute the main command
exec "$@"