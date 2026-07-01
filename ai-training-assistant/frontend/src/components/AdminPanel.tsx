import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  deleteDocument,
  DocumentMeta,
  getUsage,
  listDocuments,
  uploadDocument,
  UsageStats,
} from '../lib/api';

interface AdminPanelProps {
  tenantId: string;
}

export function AdminPanel({ tenantId }: AdminPanelProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [docs, usageStats] = await Promise.all([listDocuments(tenantId), getUsage(tenantId)]);
      setDocuments(docs);
      setUsage(usageStats);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to load tenant data.');
    }
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!title) setTitle(file.name.replace(/\.\w+$/, ''));
    setText(await file.text());
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !text.trim()) return;
    setIsSubmitting(true);
    setStatus(null);
    try {
      const meta = await uploadDocument(tenantId, title.trim(), text.trim());
      setStatus(`Ingested "${meta.title}" as ${meta.chunkCount} chunk(s).`);
      setTitle('');
      setText('');
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to ingest document.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (documentId: string) => {
    try {
      await deleteDocument(tenantId, documentId);
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to delete document.');
    }
  };

  return (
    <div className="admin-panel">
      <h3>Training material — namespace: {tenantId}</h3>
      <p className="admin-hint">
        Paste or upload text-based training content (policies, product docs, onboarding guides). It's chunked and
        embedded into this customer's isolated RAG collection so the avatar can ground its answers in it.
      </p>

      <form className="admin-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Document title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input type="file" accept=".txt,.md" onChange={handleFileChange} />
        <textarea
          placeholder="Paste training content here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
        />
        <button type="submit" disabled={isSubmitting || !title.trim() || !text.trim()}>
          {isSubmitting ? 'Ingesting…' : 'Ingest document'}
        </button>
      </form>

      {status && <div className="admin-status">{status}</div>}

      <div className="admin-documents">
        <h4>Ingested documents ({documents.length})</h4>
        {documents.length === 0 && <p className="admin-hint">No training material uploaded yet.</p>}
        <ul>
          {documents.map((doc) => (
            <li key={doc.id}>
              <span>
                {doc.title} <em>({doc.chunkCount} chunks)</em>
              </span>
              <button type="button" onClick={() => handleDelete(doc.id)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      {usage && (
        <div className="admin-usage">
          <h4>Usage</h4>
          <ul>
            <li>Messages answered: {usage.messageCount}</li>
            <li>Estimated session minutes: {usage.sessionMinutesEstimate}</li>
            <li>Documents ingested: {usage.documentsIngested}</li>
            <li>Chunks ingested: {usage.chunksIngested}</li>
          </ul>
        </div>
      )}
    </div>
  );
}
