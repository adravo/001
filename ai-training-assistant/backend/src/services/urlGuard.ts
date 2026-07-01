import dns from 'node:dns/promises';
import net from 'node:net';

/**
 * Best-effort SSRF guard for the admin-triggered "ingest from URL" feature:
 * rejects non-http(s) schemes and resolves the hostname to block requests
 * aimed at loopback/private/link-local addresses (cloud metadata endpoints,
 * internal services, etc). This is defense-in-depth, not a complete
 * mitigation — a DNS-rebinding attacker could still change the record
 * between this check and the actual fetch, which is why the ingestion
 * fetch also refuses to follow redirects (a common bypass vector).
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('That is not a valid URL.');
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http:// and https:// URLs can be ingested.');
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new Error('Local URLs cannot be ingested.');
  }

  let addresses: { address: string }[];
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new Error('Could not resolve that URL\'s host.');
  }

  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new Error('URLs resolving to private or internal addresses cannot be ingested.');
  }

  return url;
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
