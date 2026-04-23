import { Resend } from 'resend';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanFrom(value: string): string {
  let v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v;
}

function resolveFrom(): string | null {
  const fromEnv = process.env.RESEND_FROM_EMAIL?.trim();
  const contact = process.env.NEXT_PUBLIC_INVESTOR_CONTACT_EMAIL?.trim();
  const raw = fromEnv || contact;
  if (!raw) return null;
  const v = cleanFrom(raw);
  return v.includes('@') ? v : null;
}

export type NdaPortalEmailInput = {
  brandName: string;
  investorEmail: string;
  ownerEmail: string;
  signerName: string;
  pdfBase64: string;
  pdfFilename: string;
  heatmapUrl: string;
  scrollMaxDepthPercent: number;
  reachedEnd: boolean;
};

export async function sendNdaPortalEmails(input: NdaPortalEmailInput): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = resolveFrom();
  if (!key || !from) {
    return { ok: false, error: 'resend_unconfigured' };
  }

  const resend = new Resend(key);
  const engagement =
    input.reachedEnd && input.scrollMaxDepthPercent >= 98
      ? 'They reached the end of the document (high read-through).'
      : input.scrollMaxDepthPercent < 40
        ? 'They spent limited time in the scroll region (may have skimmed).'
        : `They reached about ${input.scrollMaxDepthPercent}% scroll depth before signing.`;

  const invSubject = `Copy of your signed Confidentiality Agreement with ${input.brandName}`;
  const invHtml = `<p>Attached is a PDF record of your signed confidentiality agreement.</p>
<p style="color:#64748b;font-size:13px">If you did not sign this, contact ${escHtml(input.ownerEmail)}.</p>`;

  const ownerSubject = `New NDA signed: ${input.signerName} has accessed the pitch portal`;
  const ownerHtml = `<p><strong>${escHtml(input.signerName)}</strong> (${escHtml(input.investorEmail)}) completed the NDA gate.</p>
<p style="font-size:14px">${escHtml(engagement)}</p>
<p><a href="${escHtml(input.heatmapUrl)}" style="color:#00f2ff">Open read-through summary</a> (private link)</p>`;

  const r1 = await resend.emails.send({
    from,
    to: input.investorEmail,
    subject: invSubject,
    html: invHtml,
    attachments: [{ filename: input.pdfFilename, content: input.pdfBase64, contentType: 'application/pdf' }],
  });
  if (r1.error) return { ok: false, error: r1.error.message };

  const r2 = await resend.emails.send({
    from,
    to: input.ownerEmail,
    subject: ownerSubject,
    html: ownerHtml,
    attachments: [{ filename: input.pdfFilename, content: input.pdfBase64, contentType: 'application/pdf' }],
  });
  if (r2.error) return { ok: false, error: r2.error.message };

  return { ok: true };
}
