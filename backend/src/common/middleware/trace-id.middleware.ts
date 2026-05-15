import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuid } from 'uuid';

@Injectable()
export class TraceIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const incoming = req.header('x-trace-id');
    const traceId =
      incoming && /^[a-zA-Z0-9-]{8,64}$/.test(incoming) ? incoming : uuid();
    (req as any).trace_id = traceId;
    res.setHeader('x-trace-id', traceId);
    next();
  }
}
