import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('jwt.secret'),
    });
  }

  async validate(payload: any) {
    // Truly stateless: Trust JWT payload completely, NO DB call
    // TokenVersion is checked only during refresh (in auth.service.ts)
    // This gives us ~1ms validation time
    
    // Trade-off:
    // - Revoked tokens remain valid until they expire (15 min max)
    // - But we get excellent performance and scalability
    // - For immediate revocation, user must wait until token expires or refresh
    
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      role: payload.role,
    };
  }
} 