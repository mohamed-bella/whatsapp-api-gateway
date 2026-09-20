#!/bin/sh
set -e

echo "Starting WhatsApp API Gateway..."

# Apply database migrations if DATABASE_URL is available
if [ -n "$DATABASE_URL" ]; then
  echo "Syncing Prisma database schema..."
  npx prisma db push --skip-generate || echo "Prisma db push warning: proceeding to start application"
fi

# Execute application
exec "$@"
