import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const PAGE = { w: 612, h: 792 } as const;
const M = 50;
const LH = 11;
const FS = 9;
const MAX_LINE = 90;

export function toPdfBodyChars(s: string): string {
  return s
    .replace(/[\u2018\u2019\u00B4]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00A0\u202F]/g, ' ')
    .split('')
    .map((c) => {
      const n = c.codePointAt(0)!;
      if (n >= 0x20 && n < 0x7f) return c;
      return ' ';
    })
    .join('');
}

function wrapToLines(input: string, max: number): string[] {
  const out: string[] = [];
  for (const par of input.split('\n')) {
    if (par.length === 0) {
      out.push('');
      continue;
    }
    const words = par.split(/\s+/);
    let cur = '';
    for (const w of words) {
      if (!w) continue;
      if (w.length > max) {
        if (cur) {
          out.push(cur);
          cur = '';
        }
        for (let i = 0; i < w.length; i += max) out.push(w.slice(i, i + max));
        continue;
      }
      const test = cur ? `${cur} ${w}` : w;
      if (test.length <= max) cur = test;
      else {
        if (cur) out.push(cur);
        cur = w;
      }
    }
    if (cur) out.push(cur);
  }
  return out;
}

export async function buildPortalNdaPdfBuffer(input: {
  documentSnapshot: string;
  legalVersion: string;
  fullName: string;
  email: string;
  electronicSignature: string;
  signedAtUtc: string;
  clientIp: string | null;
  scrollMaxDepthPercent: number;
  reachedEnd: boolean;
}): Promise<Buffer> {
  const {
    documentSnapshot,
    legalVersion,
    fullName,
    email,
    electronicSignature,
    signedAtUtc,
    clientIp,
    scrollMaxDepthPercent,
    reachedEnd,
  } = input;
  const doc = await PDFDocument.create();
  const bodyFont = await doc.embedFont(StandardFonts.Helvetica);
  const titleFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const body = toPdfBodyChars(documentSnapshot);
  const signText = [
    '--- Electronic acknowledgment ---',
    `Full name: ${toPdfBodyChars(fullName)}`,
    `Email: ${toPdfBodyChars(email)}`,
    `Electronic signature (typed): ${toPdfBodyChars(electronicSignature)}`,
    `Template version: ${toPdfBodyChars(legalVersion)}`,
    `Recorded (UTC): ${toPdfBodyChars(signedAtUtc)}`,
    `IP: ${toPdfBodyChars(clientIp ?? 'n/a')}`,
    `Scroll engagement (max depth %): ${scrollMaxDepthPercent}`,
    `Reached end of document: ${reachedEnd ? 'yes' : 'no'}`,
  ].join('\n');

  let page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;
  page.drawText('Confidentiality agreement (record copy)', {
    x: M,
    y,
    size: 14,
    font: titleFont,
    color: rgb(0.08, 0.1, 0.14),
  });
  y -= 28;

  const lines = wrapToLines(body, MAX_LINE);
  for (const line of lines) {
    if (y < M + 120) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M;
    }
    page.drawText(line || ' ', { x: M, y, size: FS, font: bodyFont, color: rgb(0.15, 0.17, 0.2) });
    y -= LH;
  }

  y -= 16;
  for (const line of signText.split('\n')) {
    if (y < M + 40) {
      page = doc.addPage([PAGE.w, PAGE.h]);
      y = PAGE.h - M;
    }
    page.drawText(toPdfBodyChars(line), { x: M, y, size: FS, font: bodyFont, color: rgb(0.1, 0.12, 0.16) });
    y -= LH;
  }

  const pdf = await doc.save();
  return Buffer.from(pdf);
}
