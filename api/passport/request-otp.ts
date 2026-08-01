// api/passport/request-otp.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requestPassportOtp } from '../../lib/services/passport';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profileId } = req.body ?? {};
    if (!profileId) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const result = await requestPassportOtp(profileId);
    return res.status(200).json(result);
  } catch (err) {
    console.error('passport/request-otp error:', err);
    const message = err instanceof Error ? err.message : 'Could not send a code. Please try again.';
    return res.status(400).json({ error: message });
  }
}
