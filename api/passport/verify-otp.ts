// api/passport/verify-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPassportOtp } from '../../lib/services/passport';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profileId, code } = req.body ?? {};
    if (!profileId || !code) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const result = await verifyPassportOtp(profileId, code);
    if (!result.ok) {
      const message =
        result.reason === 'too_many_attempts'
          ? 'Too many incorrect attempts. Please request a new code.'
          : 'That code is incorrect or has expired.';
      return res.status(400).json({ error: message });
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('passport/verify-otp error:', err);
    const message = err instanceof Error ? err.message : 'Could not verify that code. Please try again.';
    return res.status(400).json({ error: message });
  }
}
