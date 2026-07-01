import { Router } from 'express';
import { usageTracker } from '../services/usage';
import { vectorStore } from '../services/vectorStore';
import type { UsageStats } from '../types';

export const usageRouter = Router({ mergeParams: true });

usageRouter.get('/', (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  const usage = usageTracker.get(tenantId);
  const { documentsIngested, chunksIngested } = vectorStore.stats(tenantId);

  const stats: UsageStats = {
    tenantId,
    messageCount: usage.messageCount,
    sessionMinutesEstimate: Math.round((usage.sessionSecondsEstimate / 60) * 10) / 10,
    documentsIngested,
    chunksIngested,
  };
  res.json(stats);
});
