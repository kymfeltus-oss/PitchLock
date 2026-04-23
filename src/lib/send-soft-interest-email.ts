import { Resend } from 'resend';

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanFrom(value: string | undefined): string | null {
  if (!value) return null;
  let v = value.trim();
  if (v.length >= 2 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    v = v.slice(1, -1).trim();
  }
  return v.includes('@') ? v : null;
}

export async function sendSoftInterestFounderEmail(input: {
  founderEmail: string;
  brandName: string;
  investorEmail: string;
  commitmentLabel: string;
  pdfBase64: string;
}): Promise<{ ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    cleanFrom(process.env.RESEND_FROM_EMAIL) ||
    cleanFrom(process.env.NEXT_PUBLIC_INVESTOR_CONTACT_EMAIL) ||
    cleanFrom(process.env.OWNER_ALERT_EMAIL);
  if (!key || !from) return { ok: false, error: 'resend_unconfigured' };

  const resend = new Resend(key);
  const subject = `Soft interest logged — ${input.brandName}`;
  const html = `<p><strong>${escHtml(input.investorEmail)}</strong> logged a non-binding soft interest.</p>
<p style="font-size:14px;color:#64748b">Amount (illustrative): ${escHtml(input.commitmentLabel)}</p>
<p style="font-size:13px">A PDF summary is attached for your records and can be filed alongside the investor NDA packet.</p>`;

  const r = await resend.emails.send({
    from,
    to: input.founderEmail,
    subject,
    html,
    attachments: [{ filename: 'summary-of-interest.pdf', content: input.pdfBase64, contentType: 'application/pdf' }],
  });
  if (r.error) return { ok: false, error: r.error.message };
  return { ok: true };
}
