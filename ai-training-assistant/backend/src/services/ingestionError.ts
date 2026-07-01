/**
 * Thrown by ingestion services (webpage/YouTube/URL-guard) for messages that
 * are deliberately written to be shown to the tenant admin (e.g. "that URL
 * redirects", "no captions available"). The documents route only relays
 * `err.message` to the client when it's this type — any other thrown error
 * (an unexpected exception from pdf-parse, the filesystem, etc.) falls back
 * to a generic message instead of leaking internal detail.
 */
export class IngestionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IngestionError';
  }
}
