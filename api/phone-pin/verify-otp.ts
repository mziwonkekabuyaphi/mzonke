// api/phone-pin/verify-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyPhonePinOtp } from '../../lib/services/phone-pin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone, code } = req.body ?? {};
    if (!phone || !code || typeof phone !== 'string' || typeof code !== 'string') {
      return res.status(400).json({ error: 'Phone number and code are required.' });
    }

    const result = await verifyPhonePinOtp(phone, code);

    if (!result.ok) {
      const message =
        result.reason === 'too_many_attempts'
          ? 'Too many incorrect attempts. Please request a new code.'
          : result.reason === 'not_found'
          ? "We couldn't find an account with that phone number."
          : 'That code is incorrect or has expired.';
      return res.status(400).json({ error: message });
    }

    return res.status(200).json({ ok: true, verificationToken: result.verificationToken });
  } catch (err) {
    console.error('phone-pin/verify-otp error:', err);
    return res.status(500).json({ error: 'Could not verify that code. Please try again.' });
  }
}
