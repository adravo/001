import fs from 'fs';
import path from 'path';
import { v4 as uuid } from 'uuid';
import { cosineSimilarity } from './embeddings';
import type { DocumentChunk, DocumentMeta, TenantStore } from '../types';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', '..', 'data');

/**
 * Namespaced, per-tenant vector store. Each customer's training material
 * lives in its own isolated collection (tenantId), matching the RAG
 * multi-tenancy requirement without needing a hosted vector DB for the MVP.
 * Swap this module out for a Pinecone/Chroma-backed implementation once a
 * tenant's corpus outgrows in-process memory.
 */
class VectorStore {
  private tenants = new Map<string, TenantStore>();

  private getOrCreateTenant(tenantId: string): TenantStore {
    let tenant = this.tenants.get(tenantId);
    if (!tenant) {
      tenant = this.loadFromDisk(tenantId) || {
        tenantId,
        documents: new Map(),
        chunks: [],
      };
      this.tenants.set(tenantId, tenant);
    }
    return tenant;
  }

  addDocument(
    tenantId: string,
    title: string,
    chunkTexts: string[],
    embeddings: number[][],
  ): DocumentMeta {
    const tenant = this.getOrCreateTenant(tenantId);
    const documentId = uuid();
    const createdAt = new Date().toISOString();

    chunkTexts.forEach((text, i) => {
      tenant.chunks.push({
        id: uuid(),
        documentId,
        documentTitle: title,
        text,
        embedding: embeddings[i],
        createdAt,
      });
    });

    const meta: DocumentMeta = { id: documentId, title, chunkCount: chunkTexts.length, createdAt };
    tenant.documents.set(documentId, meta);
    this.persist(tenantId);
    return meta;
  }

  listDocuments(tenantId: string): DocumentMeta[] {
    return Array.from(this.getOrCreateTenant(tenantId).documents.values()).sort(
      (a, b) => (a.createdAt < b.createdAt ? 1 : -1),
    );
  }

  deleteDocument(tenantId: string, documentId: string): boolean {
    const tenant = this.getOrCreateTenant(tenantId);
    const existed = tenant.documents.delete(documentId);
    if (existed) {
      tenant.chunks = tenant.chunks.filter((chunk) => chunk.documentId !== documentId);
      this.persist(tenantId);
    }
    return existed;
  }

  search(tenantId: string, queryEmbedding: number[], topK = 4): DocumentChunk[] {
    const tenant = this.getOrCreateTenant(tenantId);
    return tenant.chunks
      .map((chunk) => ({ chunk, score: cosineSimilarity(chunk.embedding, queryEmbedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map((entry) => entry.chunk);
  }

  stats(tenantId: string) {
    const tenant = this.getOrCreateTenant(tenantId);
    return { documentsIngested: tenant.documents.size, chunksIngested: tenant.chunks.length };
  }

  private persist(tenantId: string) {
    try {
      const tenant = this.getOrCreateTenant(tenantId);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const serializable = {
        documents: Array.from(tenant.documents.entries()),
        chunks: tenant.chunks,
      };
      fs.writeFileSync(
        path.join(DATA_DIR, `${safeFileName(tenantId)}.json`),
        JSON.stringify(serializable),
      );
    } catch (err) {
      console.error(`[vectorStore] failed to persist tenant ${tenantId}:`, err);
    }
  }

  private loadFromDisk(tenantId: string): TenantStore | null {
    try {
      const file = path.join(DATA_DIR, `${safeFileName(tenantId)}.json`);
      if (!fs.existsSync(file)) return null;
      const raw = JSON.parse(fs.readFileSync(file, 'utf-8'));
      return {
        tenantId,
        documents: new Map(raw.documents),
        chunks: raw.chunks,
      };
    } catch (err) {
      console.error(`[vectorStore] failed to load tenant ${tenantId}:`, err);
      return null;
    }
  }
}

function safeFileName(tenantId: string): string {
  return tenantId.replace(/[^a-zA-Z0-9_-]/g, '_');
}

export const vectorStore = new VectorStore();
