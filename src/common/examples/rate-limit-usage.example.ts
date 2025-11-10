/**
 * Rate Limiting Usage Examples
 * 
 * This file demonstrates various ways to use the rate limiting system
 * in your NestJS controllers.
 */

import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { RateLimit, SkipRateLimit } from '../decorators/rate-limit.decorator';
import { JwtAuthGuard } from '../../modules/auth/guards/jwt-auth.guard';

// Example 1: Controller-level rate limiting
// All routes in this controller will be limited to 50 requests per minute
@Controller('api/v1/products')
@RateLimit({ limit: 50, ttl: 60 })
export class ProductsController {
  @Get()
  findAll() {
    return { message: 'Limited to 50 requests per minute' };
  }
}

// Example 2: Route-specific rate limiting
// Override controller-level limits for specific routes
@Controller('api/v1/orders')
@RateLimit({ limit: 100, ttl: 60 })
export class OrdersController {
  @Get()
  findAll() {
    return { message: 'Limited to 100 requests per minute' };
  }

  @Post()
  @RateLimit({ limit: 20, ttl: 60, keyPrefix: 'orders:create' })
  create() {
    return { message: 'Limited to 20 requests per minute' };
  }
}

// Example 3: Authentication endpoints with strict limits
@Controller('auth')
export class AuthExampleController {
  @Post('login')
  @RateLimit({ limit: 5, ttl: 900, keyPrefix: 'auth:login' })
  login() {
    return { message: 'Limited to 5 login attempts per 15 minutes' };
  }

  @Post('register')
  @RateLimit({ limit: 3, ttl: 3600, keyPrefix: 'auth:register' })
  register() {
    return { message: 'Limited to 3 registrations per hour' };
  }

  @Post('forgot-password')
  @RateLimit({ limit: 3, ttl: 3600, keyPrefix: 'auth:forgot' })
  forgotPassword() {
    return { message: 'Limited to 3 password reset requests per hour' };
  }
}

// Example 4: Skip rate limiting for specific routes
@Controller('system')
export class SystemController {
  @Get('health')
  @SkipRateLimit()
  healthCheck() {
    return { status: 'ok', message: 'No rate limiting applied' };
  }

  @Get('metrics')
  @SkipRateLimit()
  metrics() {
    return { message: 'Monitoring endpoints should not be rate limited' };
  }
}

// Example 5: Conditional rate limiting
@Controller('api/v1/reports')
export class ReportsController {
  @Get('generate')
  @RateLimit({
    limit: 5,
    ttl: 60,
    keyPrefix: 'reports:generate',
    skipIf: (context) => {
      const request = context.switchToHttp().getRequest();
      // Skip rate limiting for admin users
      return request.user?.role === 'admin';
    },
  })
  generateReport() {
    return { message: 'Limited to 5 reports per minute (except admins)' };
  }
}

// Example 6: Different limits for authenticated vs anonymous users
@Controller('api/v1/search')
export class SearchController {
  @Get()
  @RateLimit({
    limit: 30,
    ttl: 60,
    keyPrefix: 'search',
  })
  search() {
    // Authenticated users tracked by user ID
    // Anonymous users tracked by hashed IP
    return { message: 'Limited to 30 searches per minute' };
  }
}

// Example 7: Resource-intensive operations
@Controller('api/v1/exports')
@UseGuards(JwtAuthGuard)
export class ExportsController {
  @Post('csv')
  @RateLimit({ limit: 5, ttl: 300, keyPrefix: 'export:csv' })
  exportCsv() {
    return { message: 'Limited to 5 CSV exports per 5 minutes' };
  }

  @Post('pdf')
  @RateLimit({ limit: 3, ttl: 300, keyPrefix: 'export:pdf' })
  exportPdf() {
    return { message: 'Limited to 3 PDF exports per 5 minutes' };
  }

  @Post('bulk')
  @RateLimit({ limit: 1, ttl: 600, keyPrefix: 'export:bulk' })
  bulkExport() {
    return { message: 'Limited to 1 bulk export per 10 minutes' };
  }
}

// Example 8: API versioning with different limits
@Controller('api/v1/data')
@RateLimit({ limit: 100, ttl: 60 })
export class DataV1Controller {
  @Get()
  getData() {
    return { message: 'v1: 100 requests per minute' };
  }
}

@Controller('api/v2/data')
@RateLimit({ limit: 200, ttl: 60 })
export class DataV2Controller {
  @Get()
  getData() {
    return { message: 'v2: 200 requests per minute (improved limits)' };
  }
}

// Example 9: Webhook endpoints
@Controller('webhooks')
export class WebhooksController {
  @Post('payment')
  @RateLimit({ limit: 100, ttl: 60, keyPrefix: 'webhook:payment' })
  handlePayment() {
    return { message: 'Limited to 100 webhook calls per minute' };
  }

  @Post('notification')
  @SkipRateLimit() // Trusted webhook source
  handleNotification() {
    return { message: 'No rate limiting for trusted webhooks' };
  }
}

// Example 10: File upload endpoints
@Controller('api/v1/files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  @Post('upload')
  @RateLimit({ limit: 10, ttl: 60, keyPrefix: 'files:upload' })
  uploadFile() {
    return { message: 'Limited to 10 file uploads per minute' };
  }

  @Post('batch-upload')
  @RateLimit({ limit: 2, ttl: 300, keyPrefix: 'files:batch' })
  batchUpload() {
    return { message: 'Limited to 2 batch uploads per 5 minutes' };
  }
}

/**
 * Best Practices:
 * 
 * 1. Use keyPrefix to separate different types of operations
 * 2. Set stricter limits for expensive operations (exports, uploads, etc.)
 * 3. Use longer TTL for authentication endpoints to prevent brute force
 * 4. Skip rate limiting for health checks and monitoring endpoints
 * 5. Consider user roles when applying conditional rate limits
 * 6. Monitor rate limit hits and adjust limits accordingly
 * 7. Document rate limits in API documentation
 * 8. Use different limits for different API versions
 * 9. Protect webhook endpoints but allow trusted sources
 * 10. Test rate limits in staging before deploying to production
 */
