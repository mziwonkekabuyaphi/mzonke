// api/passport-key/request-otp.ts
// Deployed URL: POST /api/passport-key/request-otp   body: { email }
//
// Static-site Vercel convention — see status.ts for the full explanation of
// why this differs from the earlier Next.js app-router version.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestPassportKeyOtp } from '../../lib/services/passport-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  // Vercel's Node runtime auto-parses a JSON body into req.body when
  // Content-Type: application/json is set (which fetch()'s default headers
  // in passport-key.js already do) — no manual req.json() needed here,
  // unlike the Next.js version this replaces.
  const email = req.body?.email;
  if (typeof email !== 'string' || !email.trim()) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  try {
    const result = await requestPassportKeyOtp(email);

    if (!result.ok) {
      if (result.reason === 'not_found') {
        res.status(404).json({ error: 'We could not find an account with that email.' });
        return;
      }
      if (result.reason === 'already_has_passport_key') {
        res.status(409).json({
          error: 'This account already has a Passport Key. Try logging in, or use "Lost Your Passport?" to reset it.',
        });
        return;
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('request-otp failed:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
