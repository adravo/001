import { ChangeEvent, FormEvent, useCallback, useEffect, useState } from 'react';
import {
  deleteDocument,
  DocumentMeta,
  getUsage,
  ingestFromUrl,
  listDocuments,
  uploadDocument,
  uploadDocumentFile,
  UsageStats,
} from '../lib/api';

interface AdminPanelProps {
  tenantId: string;
}

export function AdminPanel({ tenantId }: AdminPanelProps) {
  const [textTitle, setTextTitle] = useState('');
  const [text, setText] = useState('');
  const [isSubmittingText, setIsSubmittingText] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [isSubmittingFile, setIsSubmittingFile] = useState(false);

  const [url, setUrl] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [isSubmittingUrl, setIsSubmittingUrl] = useState(false);

  const [documents, setDocuments] = useState<DocumentMeta[]>([]);
  const [usage, setUsage] = useState<UsageStats | null>(null);
  const [status, setStatus] = useState<string | null>(null);

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

  const handleTextSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!textTitle.trim() || !text.trim()) return;
    setIsSubmittingText(true);
    setStatus(null);
    try {
      const meta = await uploadDocument(tenantId, textTitle.trim(), text.trim());
      setStatus(`Ingested "${meta.title}" as ${meta.chunkCount} chunk(s).`);
      setTextTitle('');
      setText('');
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to ingest document.');
    } finally {
      setIsSubmittingText(false);
    }
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
    if (file && !fileTitle) setFileTitle(file.name.replace(/\.\w+$/, ''));
  };

  const handleFileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;
    setIsSubmittingFile(true);
    setStatus(null);
    try {
      const meta = await uploadDocumentFile(tenantId, selectedFile, fileTitle.trim() || undefined);
      setStatus(`Ingested "${meta.title}" as ${meta.chunkCount} chunk(s).`);
      setSelectedFile(null);
      setFileTitle('');
      (e.target as HTMLFormElement).reset();
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to ingest file.');
    } finally {
      setIsSubmittingFile(false);
    }
  };

  const handleUrlSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    setIsSubmittingUrl(true);
    setStatus(null);
    try {
      const meta = await ingestFromUrl(tenantId, url.trim(), urlTitle.trim() || undefined);
      setStatus(`Ingested "${meta.title}" as ${meta.chunkCount} chunk(s).`);
      setUrl('');
      setUrlTitle('');
      await refresh();
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to ingest from that URL.');
    } finally {
      setIsSubmittingUrl(false);
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
        Add training content from pasted text, an uploaded file, or a URL. Each is chunked and embedded into this
        customer's isolated RAG collection so the avatar can ground its answers in it.
      </p>

      <h4>Paste text</h4>
      <form className="admin-form" onSubmit={handleTextSubmit}>
        <input
          type="text"
          placeholder="Document title"
          value={textTitle}
          onChange={(e) => setTextTitle(e.target.value)}
        />
        <textarea
          placeholder="Paste training content here…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
        />
        <button type="submit" disabled={isSubmittingText || !textTitle.trim() || !text.trim()}>
          {isSubmittingText ? 'Ingesting…' : 'Ingest text'}
        </button>
      </form>

      <h4>Upload a file</h4>
      <form className="admin-form" onSubmit={handleFileSubmit}>
        <input
          type="text"
          placeholder="Document title (optional — defaults to file name)"
          value={fileTitle}
          onChange={(e) => setFileTitle(e.target.value)}
        />
        <input type="file" accept=".txt,.md,.pdf" onChange={handleFileChange} />
        <button type="submit" disabled={isSubmittingFile || !selectedFile}>
          {isSubmittingFile ? 'Ingesting…' : 'Ingest file'}
        </button>
      </form>

      <h4>Ingest from a URL</h4>
      <form className="admin-form" onSubmit={handleUrlSubmit}>
        <input
          type="text"
          placeholder="Document title (optional — auto-detected)"
          value={urlTitle}
          onChange={(e) => setUrlTitle(e.target.value)}
        />
        <input
          type="url"
          placeholder="https://example.com/article or a YouTube link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button type="submit" disabled={isSubmittingUrl || !url.trim()}>
          {isSubmittingUrl ? 'Fetching…' : 'Ingest URL'}
        </button>
      </form>
      <p className="admin-hint">
        Webpages are scraped for readable text. YouTube links are ingested via their captions/transcript — the
        video must have captions available.
      </p>

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
