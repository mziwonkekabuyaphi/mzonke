// api/passport-key/set.ts
// Deployed URL: POST /api/passport-key/set   body: { email, password, verificationToken }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setPassportKey } from '../../lib/services/passport-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const email = req.body?.email;
  const password = req.body?.password;
  const verificationToken = req.body?.verificationToken;

  if (
    typeof email !== 'string' || !email.trim() ||
    typeof password !== 'string' ||
    typeof verificationToken !== 'string' || !verificationToken.trim()
  ) {
    res.status(400).json({ error: 'Email, password, and verification token are required.' });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: 'Passport Key must be at least 8 characters.' });
    return;
  }

  try {
    await setPassportKey(email, password, verificationToken);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('set-passport-key failed:', err);
    const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
    res.status(400).json({ error: message });
  }
}
