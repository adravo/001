const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small';
const FALLBACK_DIMENSIONS = 256;

/**
 * Embeds text for RAG retrieval. Uses OpenAI embeddings when an API key is
 * configured (production path). Falls back to a deterministic hashed
 * bag-of-words vector so the RAG loop is demoable with zero external keys —
 * this fallback is for local/demo use only, not retrieval-quality production use.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (OPENAI_API_KEY) {
    return embedWithOpenAI(texts);
  }
  return texts.map(hashEmbedding);
}

export async function embedText(text: string): Promise<number[]> {
  const [embedding] = await embedTexts([text]);
  return embedding;
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embeddings request failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as { data: { embedding: number[]; index: number }[] };
  return data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
}

function hashEmbedding(text: string): number[] {
  const vector = new Array(FALLBACK_DIMENSIONS).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) || [];
  for (const token of tokens) {
    const bucket = hashString(token) % FALLBACK_DIMENSIONS;
    vector[bucket] += 1;
  }
  return normalize(vector);
}

function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / magnitude);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}
