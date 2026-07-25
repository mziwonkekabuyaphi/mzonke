// api/passport-key/verify-otp.ts
// Deployed URL: POST /api/passport-key/verify-otp   body: { email, code }

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPassportKeyOtp } from '../../lib/services/passport-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const email = req.body?.email;
  const code = req.body?.code;
  if (typeof email !== 'string' || !email.trim() || typeof code !== 'string' || !code.trim()) {
    res.status(400).json({ error: 'Email and code are required.' });
    return;
  }

  try {
    const result = await verifyPassportKeyOtp(email, code);

    if (!result.ok) {
      const messages: Record<string, string> = {
        not_found: 'We could not find an account with that email.',
        invalid_or_expired: 'That code is incorrect or has expired. Please request a new one.',
        too_many_attempts: 'Too many incorrect attempts. Please request a new code.',
      };
      res.status(400).json({ error: messages[result.reason ?? ''] ?? 'Verification failed.' });
      return;
    }

    res.status(200).json({ ok: true, verificationToken: result.verificationToken });
  } catch (err) {
    console.error('verify-otp failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
