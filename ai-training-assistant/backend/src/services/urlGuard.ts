import dns from 'node:dns/promises';
import net from 'node:net';
import { Agent } from 'undici';
import { IngestionError } from './ingestionError';

export interface GuardedUrl {
  url: URL;
  /**
   * A dispatcher pinned to the exact IP validated by this guard. Call
   * `dispatcher.close()` once the request using it is done.
   */
  dispatcher: Agent;
}

/**
 * SSRF guard for the admin-triggered "ingest from URL" feature: rejects
 * non-http(s) schemes, resolves the hostname, and blocks loopback/private/
 * link-local/reserved addresses (including the cloud metadata IP).
 *
 * Crucially, the returned `dispatcher` pins the actual HTTP connection to the
 * one IP address that was just validated — the caller must use it for the
 * fetch. Re-resolving the hostname at fetch time (the naive approach) would
 * reopen the exact gap this guard exists to close: an attacker controlling
 * DNS for their domain could return a public IP for this check and a
 * private/internal IP moments later for the real connection (DNS rebinding).
 * Pinning to the validated IP, rather than re-trusting the hostname, is what
 * makes the check load-bearing instead of decorative.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<GuardedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new IngestionError('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new IngestionError('Only http:// and https:// URLs can be ingested.');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new IngestionError('Local URLs cannot be ingested.');
  }

  let addresses: { address: string; family: number }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new IngestionError("Could not resolve that URL's host.");
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new IngestionError('URLs resolving to private or internal addresses cannot be ingested.');
  }

  const pinned = addresses[0];
  const dispatcher = new Agent({
    connect: {
      lookup: (_hostname, _options, callback) => {
        callback(null, [{ address: pinned.address, family: pinned.family as 4 | 6 }]);
      },
    },
  });

  return { url, dispatcher };
}

function isPrivateOrReservedIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata (169.254.169.254)
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    return false;
  }

  const lower = ip.toLowerCase();
  if (lower === '::1') return true;
  if (lower.startsWith('fe80:')) return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (lower.startsWith('::ffff:')) return isPrivateOrReservedIp(lower.slice(7));
  return false;
}
