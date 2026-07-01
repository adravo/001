import { YoutubeTranscript } from 'youtube-transcript';

const YOUTUBE_HOST_PATTERN = /(^|\.)(youtube\.com|youtu\.be)$/i;

export function isYoutubeUrl(rawUrl: string): boolean {
  try {
    return YOUTUBE_HOST_PATTERN.test(new URL(rawUrl).hostname);
  } catch {
    return false;
  }
}

/** Pulls the spoken-word training content out of a YouTube video via its captions. */
export async function fetchYoutubeContent(rawUrl: string): Promise<{ title: string; text: string }> {
  let segments;
  try {
    segments = await YoutubeTranscript.fetchTranscript(rawUrl);
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `Could not fetch captions for that video: ${err.message}`
        : 'Could not fetch captions for that video.',
    );
  }
  if (!segments.length) {
    throw new Error('No captions/transcript are available for that video.');
  }

  const text = segments
    .map((segment) => segment.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  let title = rawUrl;
  try {
    const oembedResponse = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(rawUrl)}&format=json`,
    );
    if (oembedResponse.ok) {
      const data = (await oembedResponse.json()) as { title?: string };
      if (data.title) title = data.title;
    }
  } catch {
    // Title lookup is best-effort; falling back to the raw URL is fine.
  }

  return { title, text };
}
