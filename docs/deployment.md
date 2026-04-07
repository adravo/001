# Deployment Guide

## Local Development

```bash
# 1. Clone and setup
cp .env.example .env
# Fill in your values in .env

# 2. Start infrastructure
docker-compose up -d postgres redis

# 3. Backend
cd backend
npm install
npm run start:dev

# 4. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

App will be at: http://localhost:3000
API at: http://localhost:3001
Swagger docs: http://localhost:3001/docs

---

## Production — Docker Compose

```bash
# Build and start everything
docker-compose up -d --build

# View logs
docker-compose logs -f backend

# Scale backend workers (for more automation capacity)
docker-compose up -d --scale backend=3
```

---

## Vercel (Frontend)

```bash
# Install Vercel CLI
npm i -g vercel

cd frontend
vercel

# Set environment variables in Vercel dashboard:
# NEXT_PUBLIC_API_URL=https://your-api-domain.com
# NEXT_PUBLIC_WS_URL=wss://your-api-domain.com
```

---

## Railway / Render (Backend)

1. Connect your GitHub repo
2. Set root directory to `backend/`
3. Set build command: `npm run build`
4. Set start command: `npm run start`
5. Add environment variables from `.env.example`

---

## AWS (Full Production)

### RDS PostgreSQL
```bash
aws rds create-db-instance \
  --db-instance-identifier tnland-db \
  --db-instance-class db.t3.micro \
  --engine postgres \
  --master-username tnland \
  --master-user-password YOUR_PASSWORD \
  --allocated-storage 20
```

### ElastiCache Redis
```bash
aws elasticache create-cache-cluster \
  --cache-cluster-id tnland-redis \
  --engine redis \
  --cache-node-type cache.t3.micro \
  --num-cache-nodes 1
```

### S3 Bucket
```bash
aws s3 mb s3://tn-land-verification-docs --region ap-south-1
aws s3api put-bucket-encryption \
  --bucket tn-land-verification-docs \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
```

### EC2 Backend

```bash
# Install Docker on EC2
sudo apt-get update
sudo apt-get install docker.io docker-compose -y

# Copy docker-compose and .env
scp docker-compose.yml .env ec2-user@YOUR_EC2_IP:~/

# Deploy
ssh ec2-user@YOUR_EC2_IP
docker-compose up -d backend
```

---

## GitHub Actions CI/CD

`.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: cd frontend && npm ci && npm run build
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: ./frontend

  deploy-backend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy to server
        run: |
          ssh ${{ secrets.SERVER_SSH }} "cd ~/tnland && git pull && docker-compose up -d --build backend"
```

---

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `REDIS_URL` | ✅ | Redis connection string |
| `JWT_SECRET` | ✅ | Minimum 32 chars, random string |
| `AWS_ACCESS_KEY_ID` | For S3 | AWS credentials |
| `AWS_SECRET_ACCESS_KEY` | For S3 | AWS credentials |
| `AWS_S3_BUCKET` | For S3 | Bucket name |
| `PLAYWRIGHT_HEADLESS` | | `true` in prod, `false` for debug |
| `MAX_AUTOMATION_JOBS_PER_USER` | | Default: 5/day |
| `FRONTEND_URL` | ✅ | For CORS config |

---

## Scaling Considerations

- **Multiple backend instances**: Use a shared Redis session store
- **Playwright parallelism**: Each BullMQ worker gets its own browser instance
- **Queue concurrency**: Set `concurrency: 2` in the processor for controlled parallelism
- **Database connections**: Use `pg-pool` with `max: 20` connections per instance
- **Rate limiting**: Configured per-user + per-IP at Nginx level
