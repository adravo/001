import { Router } from 'express';
import multer from 'multer';
import { chunkText } from '../services/chunking';
import { embedTexts } from '../services/embeddings';
import { vectorStore } from '../services/vectorStore';

const upload = multer({ limits: { fileSize: 5 * 1024 * 1024 } });
export const documentsRouter = Router({ mergeParams: true });

// Ingest a training document (pasted text or uploaded .txt/.md file) into the
// tenant's isolated RAG namespace.
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  const title = (req.body?.title as string | undefined)?.trim();
  const bodyText = (req.body?.text as string | undefined)?.trim();
  const fileText = req.file ? req.file.buffer.toString('utf-8').trim() : undefined;
  const text = fileText || bodyText;

  if (!text) {
    return res.status(400).json({ error: 'Provide either a "text" field or a file upload.' });
  }
  if (!title) {
    return res.status(400).json({ error: 'A document "title" is required.' });
  }

  try {
    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.status(400).json({ error: 'Document produced no ingestible content.' });
    }
    const embeddings = await embedTexts(chunks);
    const meta = vectorStore.addDocument(tenantId, title, chunks, embeddings);
    return res.status(201).json(meta);
  } catch (err) {
    console.error('[documents] ingestion failed:', err);
    return res.status(500).json({ error: 'Failed to ingest document.' });
  }
});

documentsRouter.get('/', (req, res) => {
  const { tenantId } = req.params as { tenantId: string };
  res.json(vectorStore.listDocuments(tenantId));
});

documentsRouter.delete('/:documentId', (req, res) => {
  const { tenantId, documentId } = req.params as { tenantId: string; documentId: string };
  const deleted = vectorStore.deleteDocument(tenantId, documentId);
  if (!deleted) return res.status(404).json({ error: 'Document not found.' });
  res.status(204).send();
});
