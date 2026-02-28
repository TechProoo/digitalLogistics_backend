import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export type AdminJwtPayload = {
  sub: string;
  email: string;
  role: string;
};

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor() {
    const secret = process.env.ADMIN_JWT_SECRET ?? process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('ADMIN_JWT_SECRET (or JWT_SECRET) is not set');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: AdminJwtPayload) {
    if (payload.role !== 'admin') {
      throw new UnauthorizedException('Admin access required.');
    }
    return { adminId: payload.sub, email: payload.email, role: payload.role };
  }
}
