import {
  Injectable,
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

function isGoogleConfigured(): boolean {
  return Boolean(
    (process.env.GOOGLE_CLIENT_ID ?? '').trim() &&
    (process.env.GOOGLE_CLIENT_SECRET ?? '').trim() &&
    (process.env.GOOGLE_CALLBACK_URL ?? '').trim(),
  );
}

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  override canActivate(context: ExecutionContext) {
    if (!isGoogleConfigured()) {
      throw new ServiceUnavailableException('Google login is not configured.');
    }

    return super.canActivate(context);
  }
}
