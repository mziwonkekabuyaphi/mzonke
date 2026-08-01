// api/passport/status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkPassportStatus, type IdentifierType } from '../../lib/services/passport';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const type = req.query.type;
  const value = req.query.value;

  if (type !== 'email' && type !== 'phone') {
    return res.status(400).json({ error: 'type must be "email" or "phone".' });
  }
  if (!value || typeof value !== 'string' || !value.trim()) {
    return res.status(400).json({ error: 'value is required.' });
  }

  try {
    const status = await checkPassportStatus(type as IdentifierType, value);
    return res.status(200).json(status);
  } catch (err) {
    console.error('passport/status error:', err);
    return res.status(500).json({ error: 'Could not check account status.' });
  }
}
