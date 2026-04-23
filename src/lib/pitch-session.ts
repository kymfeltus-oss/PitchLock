import { SignJWT, jwtVerify } from 'jose';

const issuer = 'pitch-portal';

function secretKey(): Uint8Array {
  const s = process.env.SESSION_JWT_SECRET?.trim();
  if (!s || s.length < 16) {
    throw new Error('SESSION_JWT_SECRET must be set (min 16 chars)');
  }
  return new TextEncoder().encode(s);
}

export type InvestorPitchJwt = {
  typ: 'investor_pitch';
  pitch_id: string;
  session_id: string;
  nda_id: string;
};

export type FounderJwt = {
  typ: 'founder';
  workspace_id: string;
};

export async function signInvestorPitchCookiePayload(
  pitchId: string,
  sessionId: string,
  ndaId: string,
  email: string,
  /** Default 24h NDA gate session. */
  maxAgeSeconds = 60 * 60 * 24,
): Promise<string> {
  return new SignJWT({
    typ: 'investor_pitch',
    pitch_id: pitchId,
    session_id: sessionId,
    nda_id: ndaId,
  } satisfies InvestorPitchJwt)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(email.toLowerCase())
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience('investor')
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyInvestorPitchJwt(token: string): Promise<InvestorPitchJwt & { email: string }> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer,
    audience: 'investor',
  });
  if (payload.typ !== 'investor_pitch') throw new Error('invalid_typ');
  const pitch_id = String(payload.pitch_id || '');
  const session_id = String(payload.session_id || '');
  const nda_id = String(payload.nda_id || '');
  const email = String(payload.sub || '').toLowerCase();
  if (!pitch_id || !session_id || !nda_id || !email) throw new Error('invalid_claims');
  return { typ: 'investor_pitch', pitch_id, session_id, nda_id, email };
}

export async function signFounderSession(workspaceId: string, maxAgeSeconds = 60 * 60 * 12): Promise<string> {
  return new SignJWT({ typ: 'founder', workspace_id: workspaceId } satisfies FounderJwt)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience('founder')
    .setExpirationTime(`${maxAgeSeconds}s`)
    .sign(secretKey());
}

export async function verifyFounderJwt(token: string): Promise<FounderJwt> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer,
    audience: 'founder',
  });
  if (payload.typ !== 'founder') throw new Error('invalid_typ');
  const workspace_id = String(payload.workspace_id || '');
  if (!workspace_id) throw new Error('invalid_claims');
  return { typ: 'founder', workspace_id };
}
