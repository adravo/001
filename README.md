# TN Land Verify — Tamil Nadu Land Verification Platform

> **Disclaimer:** This app aggregates publicly available data from TNREGINET and TN e-Services portals. Always verify with a legal professional before property purchase. This platform does not bypass or circumvent any security mechanisms.

---

## Overview

A production-ready web + mobile-first application that helps users verify Tamil Nadu land records before purchase. It uses **controlled browser automation** (Playwright) to assist in retrieving Encumbrance Certificates and Patta/Chitta data from official portals, with full **CAPTCHA-pause-and-resume** flow, **risk analysis**, and **PDF report generation**.

---

## Features

| Feature | Details |
|---------|---------|
| 🔍 Land Search | Survey number, document number, district, SRO, village |
| 🤖 Automation | Playwright-based TNREGINET + Patta portal querying |
| 🔒 CAPTCHA Handling | Pauses automation, sends screenshot to user, resumes after solution |
| ⚠️ Risk Analysis | 7-factor risk scoring (0–100) with LOW/MEDIUM/HIGH/CRITICAL |
| 📄 PDF Reports | Downloadable report with full ownership history |
| ⏱ Real-time Updates | WebSocket (Socket.IO) for live automation status |
| 📤 Manual Fallback | Upload EC PDF manually when automation fails |
| 🔐 JWT Auth | Secure user accounts with per-user rate limits |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 14, React, Tailwind CSS, Socket.IO client |
| **Backend** | NestJS (Node.js), TypeORM, Passport/JWT |
| **Automation** | Playwright (Chromium), human-behavior simulation |
| **Queue** | BullMQ + Redis |
| **Database** | PostgreSQL |
| **Storage** | AWS S3 (PDFs, screenshots) |
| **Deployment** | Docker Compose, Vercel (frontend), EC2/Railway (backend) |

---

## Quick Start

```bash
# Clone
git clone https://github.com/adravo/001.git
cd 001

# Setup
cp .env.example .env
# Edit .env with your DB, Redis, JWT, and AWS values

# Start with Docker Compose
docker-compose up -d

# Or run locally
npm run dev
```

**URLs:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Swagger Docs: http://localhost:3001/docs

---

## API Endpoints

```
POST   /api/v1/auth/register          Register new user
POST   /api/v1/auth/login             Login
GET    /api/v1/auth/profile           Get profile

POST   /api/v1/search                 Start a land search
GET    /api/v1/search                 List searches
GET    /api/v1/search/:id             Get search status
GET    /api/v1/search/:id/report      Get full report

POST   /api/v1/automation/:id/captcha-response   Submit CAPTCHA
GET    /api/v1/automation/:id/logs               Automation logs

GET    /api/v1/reports/:id            Get report with PDF URL

POST   /api/v1/upload/ec/:searchId    Upload EC PDF manually
```

---

## Risk Scoring Logic

| Factor | Severity | Max Score |
|--------|----------|-----------|
| Incomplete data | HIGH | 20 |
| Frequent ownership changes (≥3 in 5yr) | HIGH | 25 |
| Missing EC years | MEDIUM | 15 |
| Owner name mismatch (EC vs Patta) | CRITICAL | 35 |
| Unresolved mortgage/hypothecation | HIGH | 25 |
| Active encumbrance | MEDIUM | 15 |
| Legal dispute indicators | CRITICAL | 40 |
| Multiple partition deeds | MEDIUM | 15 |

**Categories:** LOW (0–19) · MEDIUM (20–44) · HIGH (45–69) · CRITICAL (70–100)

---

## Project Structure

```
001/
├── backend/                  # NestJS API
│   └── src/
│       ├── modules/
│       │   ├── auth/         # JWT authentication
│       │   ├── search/       # Search request management
│       │   ├── automation/   # Playwright + BullMQ processor
│       │   │   └── scrapers/ # TNREGINET + Patta scrapers
│       │   ├── risk/         # Risk analysis engine
│       │   ├── reports/      # PDF report generation
│       │   └── upload/       # S3 uploads + manual EC
│       └── database/entities/
├── frontend/                 # Next.js app
│   └── src/
│       ├── app/              # App Router pages
│       │   ├── dashboard/    # Protected dashboard
│       │   └── auth/         # Login/register
│       ├── components/
│       │   ├── ui/           # Risk badge, meter, timeline
│       │   └── automation/   # CAPTCHA modal, progress
│       └── lib/              # API client, WebSocket, auth context
├── docs/                     # Architecture + deployment docs
├── scripts/                  # SQL init + deploy script
├── nginx/                    # Reverse proxy config
└── docker-compose.yml
```

---

## Compliance & Legal

- **No CAPTCHA bypass:** Automation pauses at every CAPTCHA and requires human input
- **Rate limiting:** Per-user daily limits + per-IP Nginx limits
- **Human simulation:** Random delays, keystroke timing, UA rotation
- **Activity logging:** All automation events logged with user ID and timestamps
- **Data encryption:** S3 documents encrypted at rest (AES-256)
- **No bulk scraping:** Session limits prevent abuse

---

## License

MIT License — See LICENSE file.

---

*Built for legal-tech use. Always consult a property lawyer before making real estate decisions.*
