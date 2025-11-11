import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_INTERCEPTOR, APP_FILTER, APP_GUARD } from '@nestjs/core';
import { UsersModule } from './modules/users/users.module';
import { TasksModule } from './modules/tasks/tasks.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { TaskProcessorModule } from './queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from './queues/scheduled-tasks/scheduled-tasks.module';
import { CacheService } from './common/services/cache.service';
import { ObservableLogger } from './common/services/logger.service';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { RateLimitInterceptor } from './common/interceptors/rate-limit.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { CorrelationIdMiddleware } from './common/middleware/correlation-id.middleware';
import { CustomThrottlerGuard } from './common/guards/throttler.guard';
import { RateLimitService } from './common/services/rate-limit.service';
import jwtConfig from './config/jwt.config';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [jwtConfig],
    }),
    
    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get('DB_HOST'),
        port: configService.get('DB_PORT'),
        username: configService.get('DB_USERNAME'),
        password: configService.get('DB_PASSWORD'),
        database: configService.get('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging: configService.get('NODE_ENV') === 'development',
        
        // Connection pooling configuration for high concurrency
        extra: {
          max: configService.get('DB_POOL_MAX', 20),              // Maximum pool size
          min: configService.get('DB_POOL_MIN', 5),               // Minimum pool size
          idleTimeoutMillis: configService.get('DB_POOL_IDLE_TIMEOUT', 30000),     // Close idle connections after 30s
          connectionTimeoutMillis: configService.get('DB_POOL_CONNECTION_TIMEOUT', 2000), // Timeout acquiring connection
        },
      }),
    }),
    
    // Scheduling
    ScheduleModule.forRoot(),
    
    // Queue
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST'),
          port: configService.get('REDIS_PORT'),
        },
      }),
    }),
    
    // Rate limiting
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ([
        {
          name: 'default',
          ttl: configService.get('RATE_LIMIT_TTL', 60000), // 60 seconds
          limit: configService.get('RATE_LIMIT_MAX', 100), // 100 requests
        },
        {
          name: 'auth',
          ttl: configService.get('RATE_LIMIT_AUTH_TTL', 900000), // 15 minutes
          limit: configService.get('RATE_LIMIT_AUTH_MAX', 5), // 5 login attempts
        },
      ]),
    }),
    
    // Feature modules
    UsersModule,
    TasksModule,
    AuthModule,
    HealthModule,
    
    // Queue processing modules
    TaskProcessorModule,
    ScheduledTasksModule,
  ],
  providers: [
    // Services
    CacheService,
    ObservableLogger,
    RateLimitService,
    // Global guards
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    // Global interceptors
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RateLimitInterceptor,
    },
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [
    CacheService,
    ObservableLogger,
    RateLimitService,
  ]
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply correlation ID middleware to all routes
    consumer
      .apply(CorrelationIdMiddleware)
      .forRoutes('*');
  }
} 