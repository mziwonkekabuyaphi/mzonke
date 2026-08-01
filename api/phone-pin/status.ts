// api/phone-pin/status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPhonePinStatus } from '../../lib/services/phone-pin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const phone = req.query.phone;
    if (!phone || typeof phone !== 'string') {
      return res.status(400).json({ error: 'Phone number is required.' });
    }

    const status = await checkPhonePinStatus(phone);
    return res.status(200).json(status);
  } catch (err) {
    console.error('phone-pin/status error:', err);
    return res.status(500).json({ error: 'Could not check account status.' });
  }
}
