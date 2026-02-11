import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import {
  Strategy,
  type Profile,
  type VerifyCallback,
} from 'passport-google-oauth20';

type GoogleUser = {
  email: string;
  name: string;
  googleId: string;
};

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    // Don’t crash app startup if env isn’t configured (tests/dev).
    // The guard will block the route until these are configured.
    super({
      clientID: process.env.GOOGLE_CLIENT_ID ?? 'DISABLED',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? 'DISABLED',
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ??
        'http://localhost:3000/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const email = profile.emails?.[0]?.value?.trim().toLowerCase();
    if (!email) {
      return done(
        new UnauthorizedException('Google account has no email.'),
        false,
      );
    }

    const name =
      profile.displayName?.trim() ||
      [profile.name?.givenName, profile.name?.familyName]
        .filter(Boolean)
        .join(' ') ||
      'Customer';

    const user: GoogleUser = {
      email,
      name,
      googleId: String(profile.id ?? ''),
    };

    return done(null, user);
  }
}
