// api/phone-pin/set.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCustomerPin } from '../../lib/services/phone-pin';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { phone, pin, verificationToken } = req.body ?? {};
    if (!phone || !pin || !verificationToken) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    await setCustomerPin(phone, pin, verificationToken);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('phone-pin/set error:', err);
    const message = err instanceof Error ? err.message : 'Could not set your PIN. Please try again.';
    return res.status(400).json({ error: message });
  }
}
