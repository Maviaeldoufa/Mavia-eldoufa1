import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../server/app.ts';

const app = createApp();

export function normalizeVercelApiUrl(rawUrl?: string): string {
  const input = rawUrl || '/api';
  const parsed = new URL(input, 'http://localhost');
  const rewrittenPath = parsed.searchParams.get('__mvia_path');

  if (rewrittenPath !== null) {
    parsed.searchParams.delete('__mvia_path');
    const cleanSub = rewrittenPath.replace(/^\/+/, '');
    const base = cleanSub ? `/api/${cleanSub}` : '/api';
    const qs = parsed.searchParams.toString();
    return qs ? `${base}?${qs}` : base;
  }

  return `${parsed.pathname}${parsed.search}`;
}

export default async function handler(
  req: IncomingMessage & { url?: string },
  res: ServerResponse
) {
  req.url = normalizeVercelApiUrl(req.url);
  return app(req as any, res as any);
}
