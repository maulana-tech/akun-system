#!/bin/sh
set -e

echo "Running database migrations..."
npx prisma migrate deploy

echo "Seeding initial data if needed..."
# Only seed if specifically requested or if it's a new DB
# npm run db:seed 

echo "Starting application..."
npm start
