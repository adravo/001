# AI Training Assistant — 3D Avatar (MVP)

A web-based AI training assistant with a real-time, browser-rendered 3D avatar
(Ready Player Me + Three.js) that answers trainee questions conversationally,
grounded in a company's own training material via RAG + Claude.

> This lives alongside other unrelated experiments in this repository — it is
> a standalone product with its own `backend/` and `frontend/`, independent of
> the TN Land Verify app at the repo root.

## Core loop

Trainee asks a question (typed or spoken) → the question is embedded and
matched against that customer's ingested training documents → Claude answers
grounded in the retrieved context → the answer is spoken by TTS → the avatar
lip-syncs to the audio and nods/tilts its head based on the response's tone.

## Architecture

```
frontend/                      Vite + React + TypeScript
  src/components/Avatar.tsx     Three.js/R3F avatar: GLB loading, morph-target
                                 lip-sync, idle blink/breathing, tone gestures
  src/lib/lipSyncEngine.ts      Drives mouth-open amplitude from either a real
                                 TTS audio analyser or a SpeechSynthesis fallback
  src/hooks/useSpeechRecognition.ts   Browser STT (Web Speech API)
  src/components/ChatPanel.tsx  Trainee chat + voice input UI
  src/components/AdminPanel.tsx Per-tenant document ingestion + usage view

backend/                       Express + TypeScript
  src/services/chunking.ts      Paragraph/sentence-aware text splitter
  src/services/embeddings.ts    OpenAI embeddings (or local hashing fallback)
  src/services/vectorStore.ts   Per-tenant (namespaced) in-memory + on-disk
                                 vector store — swap for Pinecone/Chroma at scale
  src/services/claude.ts        Trainer-persona system prompt + RAG context,
                                 calls the Claude API, extracts a tone tag
  src/services/tts.ts            Pluggable ElevenLabs/Azure TTS
  src/routes/                   /documents, /chat, /tts, /usage — all scoped
                                 under /api/tenants/:tenantId/*
```

## MVP scope

- Single avatar, single voice, web-only, English
- One RAG namespace per customer (`tenantId`)
- Usage counters as a stub for future usage-based billing
- No auth — add an API-key/JWT layer in front of `/api/tenants/:tenantId/*`
  before exposing this beyond a local demo

## Running locally

### Backend

```bash
cd backend
cp .env.example .env
# At minimum, set ANTHROPIC_API_KEY. Everything else has a demo-friendly fallback.
npm install
npm run dev   # http://localhost:4000
```

### Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev   # http://localhost:5173
```

Open the app, switch to the **Admin** tab, paste in some training content
(e.g. an onboarding doc), then go to **Chat** and ask the avatar about it.

### Docker Compose

```bash
cp backend/.env.example backend/.env   # fill in ANTHROPIC_API_KEY at least
docker-compose up --build
```

## Configuration notes

- **LLM**: requires `ANTHROPIC_API_KEY`. Model defaults to `claude-sonnet-5`
  (override with `CLAUDE_MODEL`).
- **Embeddings**: set `OPENAI_API_KEY` for real semantic retrieval. Without
  it, a deterministic local hashing embedding is used so the RAG loop still
  works end-to-end for a demo — not suitable for production retrieval quality.
- **TTS**: set `ELEVENLABS_API_KEY` (or `AZURE_TTS_KEY`/`AZURE_TTS_REGION`) for
  natural speech with accurate audio-driven lip-sync. Without either, the
  frontend falls back to the browser's `SpeechSynthesis` voice and
  approximates mouth movement from word-boundary events.
- **Avatar**: point `VITE_DEFAULT_AVATAR_URL` at any Ready Player Me GLB.
  Append `?morphTargets=ARKit,Oculus%20Visemes` when exporting so mouth/blink
  blend shapes are included — the app auto-detects whichever morph target
  names are present (`mouthOpen`, `viseme_aa`, `jawOpen`, `eyeBlinkLeft/Right`).
- **Multi-tenancy**: every API route is namespaced under `/api/tenants/:tenantId/*`.
  The "Customer account" field in the header switches namespaces; each has
  its own isolated document collection and usage counters, persisted to
  `backend/data/<tenantId>.json`.

## What's stubbed for a real product

- Auth per customer account (currently the `tenantId` field is trust-based)
- A hosted vector DB (Pinecone/Chroma) instead of the in-memory/on-disk store
- Real usage-based billing hooks (Stripe metered billing, etc.) instead of
  the in-memory `usageTracker` counters
- Session/progress persistence across page reloads (currently in-memory per
  browser tab)
