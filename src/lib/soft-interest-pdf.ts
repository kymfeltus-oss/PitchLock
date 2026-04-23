import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { toPdfBodyChars } from '@/lib/nda-pdf-portal';

const PAGE = { w: 612, h: 792 } as const;
const M = 50;
const LH = 14;

export async function buildSoftInterestPdfBuffer(input: {
  pitchTitle: string;
  investorEmail: string;
  commitmentAmount: string;
  valueAddNotes: string;
  ndaSignatureId: string;
  signedAtUtc: string;
}): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const body = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([PAGE.w, PAGE.h]);
  let y = PAGE.h - M;

  const title = 'Summary of interest (non-binding)';
  page.drawText(title, { x: M, y, size: 16, font: bold, color: rgb(0.05, 0.45, 0.5) });
  y -= LH * 2;

  const lines = [
    `Pitch: ${toPdfBodyChars(input.pitchTitle)}`,
    `Investor email: ${toPdfBodyChars(input.investorEmail)}`,
    `Recorded at (UTC): ${toPdfBodyChars(input.signedAtUtc)}`,
    `Linked NDA signature id: ${toPdfBodyChars(input.ndaSignatureId)}`,
    '',
    'Soft interest amount (illustrative, non-binding):',
    toPdfBodyChars(input.commitmentAmount),
    '',
    'Primary value add:',
    toPdfBodyChars(input.valueAddNotes),
    '',
    'This document is an internal record of a soft expression of interest. It does not constitute an offer,',
    'subscription, or commitment. Any transaction remains subject to definitive documentation and approvals.',
  ];

  for (const line of lines) {
    page.drawText(line.slice(0, 500), { x: M, y, size: 10, font: body, color: rgb(0.15, 0.15, 0.18) });
    y -= LH;
    if (y < M) break;
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}
