// api/passport-key/status.ts
//
// STATIC-SITE VERCEL CONVENTION — this repo has no Next.js, so serverless
// functions live at repo-root /api/*.ts (not app/api/*/route.ts) and use
// @vercel/node's request/response types instead of NextRequest/NextResponse.
// This file replaces the earlier Next.js version of the same endpoint.
//
// Deployed URL: /api/passport-key/status?email=...
// Called by assets/js/login.js right when the customer submits their email,
// before deciding whether to attempt a password sign-in or switch to the
// OTP/Passport-Key-setup flow.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPassportKeyStatus } from '../../lib/services/passport-key';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed.' });
    return;
  }

  const email = typeof req.query.email === 'string' ? req.query.email : null;
  if (!email || !email.trim()) {
    res.status(400).json({ error: 'Email is required.' });
    return;
  }

  try {
    const status = await checkPassportKeyStatus(email);
    res.status(200).json(status);
  } catch (err) {
    console.error('passport-key status check failed:', err);
    res.status(500).json({ error: 'Something went wrong.' });
  }
}
