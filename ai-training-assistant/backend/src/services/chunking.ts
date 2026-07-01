const MAX_CHUNK_CHARS = 900;
const OVERLAP_CHARS = 150;

/**
 * Splits training material into overlapping chunks on paragraph/sentence
 * boundaries so retrieval doesn't cut answers off mid-thought.
 */
export function chunkText(rawText: string): string[] {
  const text = rawText.replace(/\r\n/g, '\n').trim();
  if (!text) return [];

  const paragraphs = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length <= MAX_CHUNK_CHARS) {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= MAX_CHUNK_CHARS) {
      current = paragraph;
    } else {
      // Paragraph itself is too long; split on sentences.
      const sentences = paragraph.split(/(?<=[.!?])\s+/);
      current = '';
      for (const sentence of sentences) {
        if ((current + ' ' + sentence).length > MAX_CHUNK_CHARS) {
          if (current) chunks.push(current);
          current = sentence;
        } else {
          current = current ? `${current} ${sentence}` : sentence;
        }
      }
    }
  }
  if (current) chunks.push(current);

  // Add small overlap between consecutive chunks for retrieval continuity.
  return chunks.map((chunk, i) => {
    if (i === 0) return chunk;
    const prevTail = chunks[i - 1].slice(-OVERLAP_CHARS);
    return `${prevTail}\n${chunk}`;
  });
}
