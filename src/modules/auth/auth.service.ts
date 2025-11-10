import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { User } from '../users/entities/user.entity';
import { ObservableLogger } from '../../common/services/logger.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  private readonly logger = new ObservableLogger();

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {
    this.logger.setContext('AuthService');
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const startTime = Date.now();

    this.logger.log('Login attempt', { email });

    try {
      const user = await this.usersService.findByEmail(email);
      
      // Use generic error message to not show if email exist or not
      if (!user || !(await bcrypt.compare(password, user.password))) {
        this.logger.warn('Failed login attempt', { email, reason: 'Invalid credentials' });
        throw new UnauthorizedException('Invalid credentials');
      }

      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store hashed refresh token
      const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
      await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

      const duration = Date.now() - startTime;
      this.logger.log('Login successful', { 
        userId: user.id,
        email: user.email,
        role: user.role,
        duration,
      });

      return {
        accessToken,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      
      // If it's already an UnauthorizedException, rethrow it
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Login error', errorStack, { email, duration });
      // For any other error, throw generic message to avoid information leakage
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async register(registerDto: RegisterDto) {
    const startTime = Date.now();
    this.logger.log('Registration attempt', { email: registerDto.email });

    const existingUser = await this.usersService.findByEmail(registerDto.email);

    if (existingUser) {
      this.logger.warn('Registration failed - email exists', { email: registerDto.email });
      throw new UnauthorizedException('Email already exists');
    }

    const user = await this.usersService.create(registerDto);

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user);

    // Store hashed refresh token
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
    await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

    const duration = Date.now() - startTime;
    this.logger.log('Registration successful', { 
      userId: user.id,
      email: user.email,
      duration,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  private generateAccessToken(user: User): string {
    // Stateless: Include ALL user data in JWT
    const payload = { 
      sub: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };
    return this.jwtService.sign(payload, { expiresIn: '15m' });
  }

  private generateRefreshToken(user: User): string {
    const payload = { 
      sub: user.id,
      tokenVersion: user.tokenVersion,
    };
    return this.jwtService.sign(payload, { expiresIn: '7d' });
  }

  async refreshTokens(refreshToken: string) {
    this.logger.debug('Token refresh attempt');

    try {
      const payload = this.jwtService.verify(refreshToken);
      
      // Fetch fresh user data from DB (gets updated role)
      const user = await this.usersService.findOne(payload.sub);
      
      if (!user || !user.refreshToken) {
        this.logger.warn('Invalid refresh token - user not found or no token stored', { 
          userId: payload.sub,
        });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify the refresh token matches
      const isValidRefreshToken = await bcrypt.compare(refreshToken, user.refreshToken);
      
      if (!isValidRefreshToken) {
        this.logger.warn('Invalid refresh token - token mismatch', { userId: user.id });
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify token version (for immediate revocation)
      if (payload.tokenVersion !== user.tokenVersion) {
        this.logger.warn('Token revoked - version mismatch', { 
          userId: user.id,
          tokenVersion: payload.tokenVersion,
          currentVersion: user.tokenVersion,
        });
        throw new UnauthorizedException('Token has been revoked');
      }

      // Generate new tokens with UPDATED role from database
      const newAccessToken = this.generateAccessToken(user);
      const newRefreshToken = this.generateRefreshToken(user);

      // Token rotation: update stored refresh token
      const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
      await this.usersService.updateRefreshToken(user.id, hashedRefreshToken);

      this.logger.log('Token refresh successful', { userId: user.id });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    } catch (error: any) {
      this.logger.error('Token refresh failed', error?.stack);
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    this.logger.log('User logout', { userId });
    await this.usersService.updateRefreshToken(userId, null);
  }

  async revokeAllTokens(userId: string): Promise<void> {
    this.logger.log('Revoking all tokens for user', { userId });
    // Increment token version to invalidate all existing tokens
    await this.usersService.incrementTokenVersion(userId);
    await this.usersService.updateRefreshToken(userId, null);
  }

  async validateUser(userId: string): Promise<any> {
    const user = await this.usersService.findOne(userId);
    
    if (!user) {
      return null;
    }
    
    return user;
  }

  async validateUserRoles(userRole: string, requiredRoles: string[]): Promise<boolean> {
    // Stateless: Use role from JWT payload (passed from request.user)
    try {
      return requiredRoles.includes(userRole);
    } catch (error: any) {
      console.error('Error validating user roles:', error);
      return false;
    }
  }
} 