const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export type ChatRole = 'trainee' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type ResponseTone = 'neutral' | 'positive' | 'thinking' | 'concerned';

export interface ChatResponse {
  reply: string;
  tone: ResponseTone;
  sourcesUsed: { documentTitle: string; snippet: string }[];
}

export interface DocumentMeta {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

export interface UsageStats {
  tenantId: string;
  messageCount: number;
  sessionMinutesEstimate: number;
  documentsIngested: number;
  chunksIngested: number;
}

function tenantUrl(tenantId: string, resource: string): string {
  return `${API_BASE_URL}/api/tenants/${encodeURIComponent(tenantId)}/${resource}`;
}

async function parseJsonOrThrow(response: Response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }
  return response.json();
}

export async function sendChatMessage(
  tenantId: string,
  orgName: string,
  message: string,
  history: ChatMessage[],
): Promise<ChatResponse> {
  const response = await fetch(tenantUrl(tenantId, 'chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, orgName }),
  });
  return parseJsonOrThrow(response);
}

export async function uploadDocument(
  tenantId: string,
  title: string,
  text: string,
): Promise<DocumentMeta> {
  const response = await fetch(tenantUrl(tenantId, 'documents'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, text }),
  });
  return parseJsonOrThrow(response);
}

export async function listDocuments(tenantId: string): Promise<DocumentMeta[]> {
  const response = await fetch(tenantUrl(tenantId, 'documents'));
  return parseJsonOrThrow(response);
}

export async function deleteDocument(tenantId: string, documentId: string): Promise<void> {
  const response = await fetch(tenantUrl(tenantId, `documents/${documentId}`), {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`Failed to delete document (status ${response.status})`);
  }
}

export async function getUsage(tenantId: string): Promise<UsageStats> {
  const response = await fetch(tenantUrl(tenantId, 'usage'));
  return parseJsonOrThrow(response);
}

export async function getTtsStatus(tenantId: string): Promise<{ configured: boolean }> {
  const response = await fetch(tenantUrl(tenantId, 'tts/status'));
  return parseJsonOrThrow(response);
}

/** Requests server-side TTS audio. Returns null if no provider is configured. */
export async function fetchTtsAudio(tenantId: string, text: string): Promise<Blob | null> {
  const response = await fetch(tenantUrl(tenantId, 'tts'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (response.status === 204) return null;
  if (!response.ok) throw new Error(`TTS request failed (${response.status})`);
  return response.blob();
}
