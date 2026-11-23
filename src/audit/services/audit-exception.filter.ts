import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Request } from 'express';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';

@Catch()
@Injectable()
export class AuditExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AuditExceptionFilter.name);

  constructor(
    private readonly adapterHost: HttpAdapterHost,
    @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly events: AuditEventPublisher,
  ) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const request = host.switchToHttp().getRequest<Request>();
    const eventId = request.params.eventId ?? request.path.split('/').filter(Boolean).at(-1);
    const isAuditEventRoute = request.path.startsWith('/api/v1/audit/events/');
    try {
      await this.events.record({
        eventType: isAuditEventRoute ? 'audit.access.denied' : 'http.request.failed',
        result: {
          outcome: 'failure',
          httpStatus: status,
          errorType: exception instanceof Error ? exception.name : 'UnknownError',
        },
        ...(isAuditEventRoute
          ? {
              meta: {
                action: 'access_denied',
                scope: `event:${String(eventId ?? '*')}`,
              },
            }
          : {}),
      });
    } catch (error) {
      this.logger.error('Could not persist HTTP exception audit event', error);
    }

    const adapter = this.adapterHost.httpAdapter;
    const response = host.switchToHttp().getResponse();
    const body =
      exception instanceof HttpException
        ? exception.getResponse()
        : { statusCode: 500, message: 'Internal server error' };
    adapter.reply(response, body, status);
  }
}