/** Founder-defined numeric stress model (stored as JSON on `pitches.yield_config`). */

export type YieldSliderDef = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
};

export type YieldConfig = {
  revenueBase?: number;
  years?: number;
  sliders?: YieldSliderDef[];
  /** Optional expression using slider ids, `revenueBase`, `years`, and `revenue` (for profit line). */
  revenueExpr?: string;
  profitExpr?: string;
};

function isFiniteNum(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

function sanitizeExpr(raw: string): string | null {
  const s = raw.trim().slice(0, 200);
  if (!s) return null;
  if (!/^[0-9eE.+\-*/()\s_a-zA-Z]+$/.test(s)) return null;
  const banned = /\b(import|eval|constructor|prototype|process|globalThis|window|document|fetch)\b/i;
  if (banned.test(s)) return null;
  return s;
}

function evalExpr(expr: string, scope: Record<string, number>): number {
  const names = Object.keys(scope);
  const values = names.map((k) => scope[k]);
  const fn = new Function(...names, `"use strict"; return (${expr});`);
  const out = fn(...values);
  return typeof out === 'number' && Number.isFinite(out) ? out : NaN;
}

export function defaultSliderValues(cfg: YieldConfig): Record<string, number> {
  const out: Record<string, number> = {};
  const sliders = Array.isArray(cfg.sliders) ? cfg.sliders : [];
  for (const s of sliders) {
    if (typeof s?.id === 'string' && s.id && isFiniteNum(s.default)) {
      out[s.id] = s.default;
    }
  }
  return out;
}

export function runYieldStress(cfg: YieldConfig, sliderValues: Record<string, number>): {
  revenue: number;
  profit: number;
} {
  const revenueBase = isFiniteNum(cfg.revenueBase) ? cfg.revenueBase : 0;
  const years = isFiniteNum(cfg.years) ? Math.min(80, Math.max(0, Math.floor(cfg.years))) : 0;
  const scope: Record<string, number> = {
    revenueBase,
    years,
    ...sliderValues,
  };

  const revRaw = typeof cfg.revenueExpr === 'string' ? cfg.revenueExpr : 'revenueBase * (1 + g) ** years';
  const profRaw = typeof cfg.profitExpr === 'string' ? cfg.profitExpr : 'revenue * m';

  const revSan = sanitizeExpr(revRaw) ?? 'revenueBase * (1 + g) ** years';
  let revenue = evalExpr(revSan, scope);
  if (!Number.isFinite(revenue)) revenue = 0;
  scope.revenue = revenue;

  const profSan = sanitizeExpr(profRaw) ?? 'revenue * m';
  let profit = evalExpr(profSan, scope);
  if (!Number.isFinite(profit)) profit = 0;

  return { revenue, profit };
}
