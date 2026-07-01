import { Router } from 'express';
import { generateGroundedAnswer } from '../services/claude';
import { embedText } from '../services/embeddings';
import { vectorStore } from '../services/vectorStore';
import { usageTracker } from '../services/usage';
import type { ChatMessage } from '../types';

export const chatRouter = Router({ mergeParams: true });

const TOP_K = Number(process.env.RAG_TOP_K || 4);

chatRouter.post('/', async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  const { message, history, orgName } = req.body as {
    message?: string;
    history?: ChatMessage[];
    orgName?: string;
  };

  if (!message || !message.trim()) {
    return res.status(400).json({ error: '"message" is required.' });
  }

  try {
    const queryEmbedding = await embedText(message);
    const contextChunks = vectorStore.search(tenantId, queryEmbedding, TOP_K);
    const result = await generateGroundedAnswer(
      orgName?.trim() || 'your organization',
      message,
      Array.isArray(history) ? history : [],
      contextChunks,
    );
    usageTracker.recordMessage(tenantId);
    res.json(result);
  } catch (err) {
    console.error('[chat] failed to generate answer:', err);
    const isConfigError = err instanceof Error && err.message.includes('ANTHROPIC_API_KEY');
    res.status(isConfigError ? 503 : 500).json({
      error: isConfigError
        ? 'The assistant is not configured yet: set ANTHROPIC_API_KEY on the backend.'
        : 'Failed to generate an answer.',
    });
  }
});
