// api/passport/set.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setPassportKey, type IdentifierType } from '../../lib/services/passport';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profileId, identifierType, identifierValue, password, verificationToken } = req.body ?? {};

    if (!profileId || !identifierType || !identifierValue || !verificationToken) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }
    if (identifierType !== 'email' && identifierType !== 'phone') {
      return res.status(400).json({ error: 'identifierType must be "email" or "phone".' });
    }
    // password is intentionally optional — see Decision 1 in the task doc:
    // omitted when attaching a second identifier to an account that
    // already has a Passport Key set.
    if (password !== undefined && typeof password !== 'string') {
      return res.status(400).json({ error: 'password must be a string.' });
    }

    await setPassportKey(
      profileId,
      identifierType as IdentifierType,
      identifierValue,
      password,
      verificationToken,
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('passport/set error:', err);
    const message =
      err instanceof Error ? err.message : 'Could not set your Passport Key. Please try again.';
    return res.status(400).json({ error: message });
  }
}
