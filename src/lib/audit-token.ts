import { timingSafeEqual } from 'node:crypto';

/** Constant-time compare for founder dashboard `?token=` vs workspace row. */
export function safeEqualToken(provided: string | undefined, expected: string | null | undefined): boolean {
  if (provided == null || expected == null) return false;
  const a = Buffer.from(provided.trim(), 'utf8');
  const b = Buffer.from(String(expected).trim(), 'utf8');
  if (a.length === 0 || b.length === 0) return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
