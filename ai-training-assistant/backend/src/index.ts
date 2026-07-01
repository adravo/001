import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { chatRouter } from './routes/chat';
import { documentsRouter } from './routes/documents';
import { ttsRouter } from './routes/tts';
import { usageRouter } from './routes/usage';
import { isServerTtsConfigured } from './services/tts';

const app = express();
const PORT = Number(process.env.PORT || 4000);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    llmConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    embeddingsProvider: process.env.OPENAI_API_KEY ? 'openai' : 'local-hash-fallback',
    serverTtsConfigured: isServerTtsConfigured(),
  });
});

// Each customer account is addressed by :tenantId, keeping RAG namespaces,
// usage counters, and document collections isolated per tenant.
app.use('/api/tenants/:tenantId/documents', documentsRouter);
app.use('/api/tenants/:tenantId/chat', chatRouter);
app.use('/api/tenants/:tenantId/tts', ttsRouter);
app.use('/api/tenants/:tenantId/usage', usageRouter);

app.listen(PORT, () => {
  console.log(`AI Training Assistant backend listening on http://localhost:${PORT}`);
});
