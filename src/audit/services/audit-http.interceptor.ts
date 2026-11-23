import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { Observable, mergeMap } from 'rxjs';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';

@Injectable()
export class AuditHttpInterceptor implements NestInterceptor {
  constructor(
    @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly events: AuditEventPublisher,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    return next.handle().pipe(
      mergeMap(async (body) => {
        const status =
          response.statusCode ??
          this.reflector.get<number>(HTTP_CODE_METADATA, context.getHandler()) ??
          (request.method === 'POST' ? 201 : 200);
        await this.events.record({
          eventType: 'http.request.completed',
          result: { outcome: 'success', httpStatus: status },
        });
        return body;
      }),
    );
  }
}