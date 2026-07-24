// app/api/passport-key/request-otp/route.ts
// TODO(you): confirm this matches your project's router convention (App
// Router assumed — if you're on the Pages Router, this becomes
// pages/api/passport-key/request-otp.ts with the (req, res) signature).

import { NextRequest, NextResponse } from 'next/server';
import { requestPassportKeyOtp } from '@/lib/services/passport-key';

export async function POST(req: NextRequest) {
  let email: unknown;
  try {
    const body = await req.json();
    email = body?.email;
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (typeof email !== 'string' || !email.trim()) {
    return NextResponse.json({ error: 'Email is required.' }, { status: 400 });
  }

  try {
    const result = await requestPassportKeyOtp(email);

    if (!result.ok) {
      // Deliberately vague on "not_found" to avoid leaking which emails are
      // registered — same generic message either way from the client's
      // perspective, but distinct reasons logged/returned for the UI to
      // route to the right screen.
      if (result.reason === 'not_found') {
        return NextResponse.json(
          { error: 'We could not find an account with that email.' },
          { status: 404 },
        );
      }
      if (result.reason === 'already_has_passport_key') {
        return NextResponse.json(
          { error: 'This account already has a Passport Key. Try logging in, or use "Lost Your Passport?" to reset it.' },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('request-otp failed:', err);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}
