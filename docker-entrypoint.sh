#!/bin/sh
set -e

echo "Pushing database schema..."
if npx drizzle-kit push --force; then
  echo "Schema ready."
else
  echo "WARNING: Schema push failed. Continuing anyway..."
fi

echo "Seeding default admin user..."
if npx tsx server/seed.ts; then
  echo "Seed complete."
else
  echo "WARNING: Seed failed. Continuing anyway..."
fi

echo "Starting application..."
exec node dist/index.js
