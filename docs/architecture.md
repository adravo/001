# TN Land Verification — Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USER BROWSER / MOBILE                        │
│   Next.js 14 (React)  ·  Tailwind CSS  ·  Socket.IO client          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTPS / WSS
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                           NGINX (Reverse Proxy)                      │
│   Rate limiting · Gzip · Static assets · SSL termination            │
└───────┬───────────────────────────────────────────┬─────────────────┘
        │ /api/*                                    │ /
        ▼                                           ▼
┌───────────────────────┐               ┌──────────────────────┐
│   NestJS Backend      │               │  Next.js Frontend    │
│   Port 3001           │               │  Port 3000           │
│                       │               └──────────────────────┘
│  ┌─────────────────┐  │
│  │  REST API v1    │  │
│  │  /auth          │  │
│  │  /search        │  │
│  │  /automation    │  │
│  │  /reports       │  │
│  │  /upload        │  │
│  └────────┬────────┘  │
│           │            │
│  ┌────────▼────────┐  │
│  │  WebSocket GW   │  │   Real-time events:
│  │  /automation    │  │   · status_update
│  │  (Socket.IO)    │  │   · captcha_required
│  └────────┬────────┘  │   · progress
│           │            │   · completed / failed
│  ┌────────▼────────┐  │
│  │  BullMQ Queue   │  │◄──── Job: land-search
│  │  (Redis-backed) │  │      · 3 attempts
│  └────────┬────────┘  │      · exponential backoff
│           │            │
│  ┌────────▼────────┐  │
│  │  Automation     │  │
│  │  Processor      │  │
│  └──┬──────────┬───┘  │
│     │          │       │
└─────│──────────│───────┘
      │          │
      ▼          ▼
┌──────────┐ ┌──────────────┐
│TNREGINET │ │ Patta/Chitta │   (Official TN Govt Portals)
│ Scraper  │ │   Scraper    │
│Playwright│ │ Playwright   │
└────┬─────┘ └──────┬───────┘
     │               │
     └──────┬────────┘
            │ Extracted data
            ▼
┌─────────────────────────────┐
│      Risk Analysis Engine   │
│                             │
│  7 Risk Checks:             │
│  · Data completeness        │
│  · Frequent ownership       │
│  · Missing EC years         │
│  · Owner mismatch           │
│  · Active mortgage          │
│  · Encumbrance              │
│  · Legal dispute indicators │
│                             │
│  → Risk Score (0–100)       │
│  → Category: LOW/MED/HIGH/  │
│             CRITICAL/UNKNOWN│
└─────────┬───────────────────┘
          │
          ▼
┌─────────────────────────────┐
│     PDF Report Generator    │
│  (PDFKit → S3 Upload)       │
└─────────────────────────────┘

━━━━━━━━━━━━ INFRASTRUCTURE ━━━━━━━━━━━━

┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐
│  PostgreSQL  │  │    Redis     │  │      AWS S3          │
│  (TypeORM)   │  │  (BullMQ +   │  │  · PDF reports       │
│              │  │   Sessions)  │  │  · Screenshots       │
│  Tables:     │  └──────────────┘  │  · Raw HTML evidence │
│  · users     │                    └──────────────────────┘
│  · search_   │
│    requests  │
│  · land_     │
│    records   │
│  · transact- │
│    ions      │
│  · risk_     │
│    reports   │
│  · automation│
│    _logs     │
└──────────────┘
```

## CAPTCHA Handling Flow

```
Browser → Portal → CAPTCHA Detected
                        │
                        ▼
              Scraper takes screenshot
                        │
                        ▼
              Pause Playwright session
                        │
                        ▼
              Update DB: status = 'captcha_required'
                        │
                        ▼
              Emit WebSocket: 'captcha_required'
              (includes base64 screenshot)
                        │
                        ▼
              Frontend shows CaptchaModal
              User types the CAPTCHA text
                        │
                        ▼
              POST /api/v1/automation/:id/captcha-response
                        │
                        ▼
              Backend resolves Promise in session map
                        │
                        ▼
              Scraper types solution → continues
                        │
                        ▼
              Emit WebSocket: 'status_update' (running)
                        │
                        ▼
              Automation resumes normally
```

## Smart Automation Rules

| Rule | Implementation |
|------|---------------|
| Human-like typing | Random 60–180ms delay per keystroke |
| Random delays | 1–5 second pauses between actions |
| User-agent rotation | 4 realistic UA strings rotated randomly |
| Timeout handling | 45s navigation, 30s wait, 3min CAPTCHA |
| Retry logic | 3 attempts with exponential backoff (3s, 6s, 12s) |
| Rate limiting | Per-user daily limit (configurable) |
| Webdriver masking | navigator.webdriver = undefined |
| Locale/timezone | en-IN / Asia/Kolkata |

## Deployment Stack

| Component | Platform |
|-----------|---------|
| Frontend  | Vercel (Next.js) |
| Backend   | AWS EC2 / Railway / Render |
| Database  | AWS RDS PostgreSQL |
| Redis     | AWS ElastiCache / Upstash |
| Storage   | AWS S3 |
| CDN       | CloudFront |
| CI/CD     | GitHub Actions |
