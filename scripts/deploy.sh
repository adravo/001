#!/bin/bash
# =============================================================
# TN Land Verification — Deployment Script
# Usage: ./scripts/deploy.sh [staging|production]
# =============================================================

set -euo pipefail

ENV=${1:-staging}
echo "🚀 Deploying TN Land Verify to: $ENV"

# ---- Validate env ----
if [ ! -f ".env" ]; then
  echo "❌ .env file not found. Copy .env.example and fill in values."
  exit 1
fi

# ---- Build & push Docker images ----
echo "🔧 Building Docker images..."
docker-compose build --no-cache

# ---- Run DB migrations ----
echo "📦 Running database migrations..."
docker-compose run --rm backend npm run migration:run

# ---- Start services ----
echo "▶ Starting services..."
docker-compose up -d

# ---- Health check ----
echo "🔍 Waiting for health checks..."
sleep 10

BACKEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/v1/auth/health 2>/dev/null || echo "000")
if [ "$BACKEND_STATUS" = "200" ] || [ "$BACKEND_STATUS" = "404" ]; then
  echo "✅ Backend is up"
else
  echo "⚠ Backend may not be ready yet (status: $BACKEND_STATUS)"
fi

FRONTEND_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>/dev/null || echo "000")
if [ "$FRONTEND_STATUS" = "200" ]; then
  echo "✅ Frontend is up"
else
  echo "⚠ Frontend may not be ready yet (status: $FRONTEND_STATUS)"
fi

echo ""
echo "✅ Deployment complete!"
echo "   Frontend: http://localhost:3000"
echo "   Backend:  http://localhost:3001"
echo "   API Docs: http://localhost:3001/docs"
