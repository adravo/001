import { YoutubeTranscript } from 'youtube-transcript';
import { IngestionError } from './ingestionError';

const YOUTUBE_HOST_PATTERN = /(^|\.)(youtube\.com|youtu\.be)$/i;

export function isYoutubeUrl(rawUrl: string): boolean {
  try {
    return YOUTUBE_HOST_PATTERN.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

async function fetchOembedTitle(rawUrl: string): Promise<string | null> {
  try {
    const oembedResponse = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
    );
    if (!oembedResponse.ok) return null;
    const data = (await oembedResponse.json()) as { title?: string };
    return data.title || null;
  } catch {
    return null; // Title lookup is best-effort; falling back to the raw URL is fine.
  }
}

/** Pulls the spoken-word training content out of a YouTube video via its captions. */
export async function fetchYoutubeContent(rawUrl: string): Promise<{ title: string; text: string }> {
  // Captions and the oEmbed title are independent lookups against the same
  // video — fetch them concurrently instead of paying both round trips serially.
  const [transcriptResult, oembedTitle] = await Promise.all([
    YoutubeTranscript.fetchTranscript(rawUrl).catch((err: unknown) => {
      throw new IngestionError(
        err instanceof Error
          ? `Could not fetch captions for that video: ${err.message}`
          : 'Could not fetch captions for that video.',
      );
    }),
    fetchOembedTitle(rawUrl),
  ]);

  if (!transcriptResult.length) {
    throw new IngestionError('No captions/transcript are available for that video.');
  }

  const text = transcriptResult
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) {
    throw new IngestionError('That video\'s captions contained no usable text.');
  }

  return { title: oembedTitle || rawUrl, text };
}
