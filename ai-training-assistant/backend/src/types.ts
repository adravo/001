export interface DocumentChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  text: string;
  embedding: number[];
  createdAt: string;
}

export interface DocumentMeta {
  id: string;
  title: string;
  chunkCount: number;
  createdAt: string;
}

export interface TenantStore {
  tenantId: string;
  documents: Map<string, DocumentMeta>;
  chunks: DocumentChunk[];
}

export interface ChatMessage {
  role: 'trainee' | 'assistant';
  content: string;
}

export type ResponseTone = 'neutral' | 'positive' | 'thinking' | 'concerned';

export interface ChatResult {
  reply: string;
  tone: ResponseTone;
  sourcesUsed: { documentTitle: string; snippet: string }[];
}

export interface UsageStats {
  tenantId: string;
  messageCount: number;
  sessionMinutesEstimate: number;
  documentsIngested: number;
  chunksIngested: number;
}
