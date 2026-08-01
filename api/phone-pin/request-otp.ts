// api/phone-pin/request-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestPhonePinOtp } from '../../lib/services/phone-pin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone } = req.body ?? {};
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const result = await requestPhonePinOtp(phone);

    if (!result.ok) {
      const message =
        result.reason === 'not_found'
          ? "We couldn't find an account with that phone number."
          : 'This account already has a PIN set up. Try signing in instead.';
      return res.status(400).json({ error: message });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('phone-pin/request-otp error:', err);
    return res.status(500).json({ error: 'Could not send a code. Please try again.' });
  }
}
