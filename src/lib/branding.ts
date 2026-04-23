import type { CSSProperties } from 'react';

/**
 * Sanitize tenant-supplied colors for inline CSS (white-label header / accents).
 * Returns a hex string or null if unsafe / invalid.
 */
export function normalizeWorkspacePrimaryColor(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = input.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  return m[0].toLowerCase();
}

export function workspaceThemeVars(primary: string | null): CSSProperties {
  const p = normalizeWorkspacePrimaryColor(primary) ?? '#18181b';
  return { ['--workspace-primary' as string]: p };
}
