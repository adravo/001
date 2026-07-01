import * as cheerio from 'cheerio';
import { fetch as undiciFetch } from 'undici';
import { IngestionError } from './ingestionError';
import { assertPublicHttpUrl } from './urlGuard';

const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 10000;

export async function fetchAndExtractWebpageText(rawUrl: string): Promise<{ title: string; text: string }> {
  const { url, dispatcher } = await assertPublicHttpUrl(rawUrl);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let response: Awaited<ReturnType<typeof undiciFetch>>;
  try {
    response = await undiciFetch(url, {
      signal: controller.signal,
      // The dispatcher pins this request to the exact IP assertPublicHttpUrl
      // already validated (see urlGuard.ts) — do not swap this for the
      // global fetch, which would re-resolve DNS and reopen the SSRF gap.
      dispatcher,
      // Redirects are not followed automatically: the target of a redirect
      // is unvalidated by assertPublicHttpUrl, which would otherwise be an
      // SSRF bypass (e.g. a public URL 302-ing to an internal address).
      redirect: 'manual',
      headers: { 'User-Agent': 'AITrainingAssistant-Ingestor/1.0' },
    });
  } catch (err) {
    throw new IngestionError(
      err instanceof Error && err.name === 'AbortError'
        ? 'Timed out fetching that URL.'
        : 'Failed to fetch that URL.',
    );
  } finally {
    clearTimeout(timeout);
    await dispatcher.close();
  }

  if (response.status >= 300 && response.status < 400) {
    throw new IngestionError('That URL redirects — please provide the direct destination URL instead.');
  }
  if (!response.ok) {
    throw new IngestionError(`Failed to fetch URL (status ${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new IngestionError(`Unsupported content type for ingestion: ${contentType || 'unknown'}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new IngestionError('That page is too large to ingest (5MB limit).');
  }

  const html = buffer.toString('utf-8');
  const $ = cheerio.load(html);
  $('script, style, nav, footer, header, noscript, svg, iframe').remove();
  const title = $('title').first().text().trim() || url.hostname;
  const text = $('body').text().replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();

  if (!text) throw new IngestionError('No readable text content was found at that URL.');
  return { title, text };
}
