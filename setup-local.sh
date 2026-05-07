#!/bin/bash

echo "🚀 Setting up local SQLite database..."

# Go to backend
cd backend

# Install backend dependencies if not done
npm install

# Generate Prisma client for SQLite
npx prisma generate

# Run migrations to create dev.db
npx prisma migrate dev --name init

# Seed initial data
npm run db:seed

echo "✅ Local setup complete! You can now run 'npm start' from the root to open the Desktop App."
