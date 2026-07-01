import { Request, Router } from 'express';
import multer from 'multer';
import { chunkText } from '../services/chunking';
import { embedTexts } from '../services/embeddings';
import { extractTextFromPdf, isPdf } from '../services/pdf';
import { vectorStore } from '../services/vectorStore';
import { fetchAndExtractWebpageText } from '../services/webpage';
import { fetchYoutubeContent, isYoutubeUrl } from '../services/youtube';

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const upload = multer({ limits: { fileSize: MAX_UPLOAD_BYTES } });
export const documentsRouter = Router({ mergeParams: true });

async function resolveSource(req: Request): Promise<{ title: string; text: string } | { error: string }> {
  const title = (req.body?.title as string | undefined)?.trim();
  const bodyText = (req.body?.text as string | undefined)?.trim();
  const url = (req.body?.url as string | undefined)?.trim();

  if (req.file) {
    const text = isPdf(req.file.originalname, req.file.mimetype)
      ? await extractTextFromPdf(req.file.buffer)
      : req.file.buffer.toString('utf-8').trim();
    if (!text) return { error: 'No extractable text was found in that file.' };
    return { title: title || req.file.originalname.replace(/\.\w+$/, ''), text };
  }

  if (url) {
    const { title: derivedTitle, text } = isYoutubeUrl(url)
      ? await fetchYoutubeContent(url)
      : await fetchAndExtractWebpageText(url);
    return { title: title || derivedTitle, text };
  }

  if (bodyText) {
    if (!title) return { error: 'A document "title" is required.' };
    return { title, text: bodyText };
  }

  return { error: 'Provide a "text" field, a "url", or a file upload.' };
}

// Ingest a training document — pasted text, an uploaded .txt/.md/.pdf file, or
// a "url" (a regular webpage, scraped for readable text, or a YouTube video,
// ingested via its captions) — into the tenant's isolated RAG namespace.
documentsRouter.post('/', upload.single('file'), async (req, res) => {
  const { tenantId } = req.params as { tenantId: string };

  try {
    const resolved = await resolveSource(req);
    if ('error' in resolved) {
      return res.status(400).json({ error: resolved.error });
    }
    const { title, text } = resolved;

    const chunks = chunkText(text);
    if (chunks.length === 0) {
      return res.status(400).json({ error: 'Document produced no ingestible content.' });
    }
    const embeddings = await embedTexts(chunks);
    const meta = vectorStore.addDocument(tenantId, title, chunks, embeddings);
    return res.status(201).json(meta);
  } catch (err) {
    console.error('[documents] ingestion failed:', err);
    const message = err instanceof Error ? err.message : 'Failed to ingest document.';
    return res.status(422).json({ error: message });
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
