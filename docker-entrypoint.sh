#!/bin/sh
set -e

echo "Starting WhatsApp API Gateway..."

# Apply database migrations if DATABASE_URL is available
if [ -n "$DATABASE_URL" ]; then
  echo "Applying Prisma database migrations..."
  npx prisma migrate deploy || echo "Prisma migrate warning: proceeding to start application"
fi

# Execute application
exec "$@"
