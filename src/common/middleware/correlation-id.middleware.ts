import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Get correlation ID from header or generate new one
    const correlationId = (req.headers[CORRELATION_ID_HEADER] as string) || uuidv4();
    
    // Store in request for later use
    req.correlationId = correlationId;
    
    // Add to response headers
    res.setHeader(CORRELATION_ID_HEADER, correlationId);
    
    next();
  }
}
