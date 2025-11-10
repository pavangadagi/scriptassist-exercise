import { Injectable, LoggerService as NestLoggerService, Scope } from '@nestjs/common';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogContext {
  correlationId?: string;
  userId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: any;
}

@Injectable({ scope: Scope.TRANSIENT })
export class ObservableLogger implements NestLoggerService {
  private context?: string;
  private defaultContext: LogContext = {};

  setContext(context: string) {
    this.context = context;
  }

  setDefaultContext(context: LogContext) {
    this.defaultContext = { ...this.defaultContext, ...context };
  }

  log(message: string, context?: LogContext) {
    this.writeLog(LogLevel.INFO, message, context);
  }

  error(message: string, trace?: string, context?: LogContext) {
    this.writeLog(LogLevel.ERROR, message, { ...context, trace });
  }

  warn(message: string, context?: LogContext) {
    this.writeLog(LogLevel.WARN, message, context);
  }

  debug(message: string, context?: LogContext) {
    this.writeLog(LogLevel.DEBUG, message, context);
  }

  private writeLog(level: LogLevel, message: string, context?: LogContext) {
    const timestamp = new Date().toISOString();
    const mergedContext = { ...this.defaultContext, ...context };
    
    const logEntry = {
      timestamp,
      level,
      context: this.context || 'Application',
      message,
      ...mergedContext,
    };

    // Structured JSON logging for production
    if (process.env.NODE_ENV === 'production') {
      console.log(JSON.stringify(logEntry));
    } else {
      // Human-readable format for development
      const contextStr = Object.keys(mergedContext).length > 0 
        ? ` | ${JSON.stringify(mergedContext)}` 
        : '';
      
      const colorCode = this.getColorCode(level);
      console.log(
        `${colorCode}[${timestamp}] [${level.toUpperCase()}] [${this.context || 'App'}]${'\x1b[0m'} ${message}${contextStr}`
      );
    }
  }

  private getColorCode(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR: return '\x1b[31m'; // Red
      case LogLevel.WARN: return '\x1b[33m';  // Yellow
      case LogLevel.INFO: return '\x1b[36m';  // Cyan
      case LogLevel.DEBUG: return '\x1b[35m'; // Magenta
      default: return '\x1b[0m';
    }
  }
}
