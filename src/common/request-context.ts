import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

export type RequestAuditContext = {
  requestId: string;
  sourceIp: string | null;
  userAgent: string | null;
  actorId: string | null;
  actorRole: string | null;
  sessionId: string | null;
};

@Injectable()
export class RequestContext {
  private readonly storage = new AsyncLocalStorage<RequestAuditContext>();

  run(request: Request, response: Response, next: NextFunction) {
    const requestId = randomUUID();
    response.setHeader('x-request-id', requestId);
    this.storage.run(
      {
        requestId,
        sourceIp: request.ip || null,
        userAgent: request.get('user-agent') ?? null,
        actorId: null,
        actorRole: null,
        sessionId: null,
      },
      next,
    );
  }

  current(): RequestAuditContext {
    return (
      this.storage.getStore() ?? {
        requestId: randomUUID(),
        sourceIp: null,
        userAgent: null,
        actorId: null,
        actorRole: null,
        sessionId: null,
      }
    );
  }

  setActor(actorId: string, sessionId: string | null) {
    const store = this.storage.getStore();
    if (!store) return;
    store.actorId = actorId;
    store.sessionId = sessionId;
  }

  setSessionId(sessionId: string) {
    const store = this.storage.getStore();
    if (store) store.sessionId = sessionId;
  }

  setActorRole(actorRole: string) {
    const store = this.storage.getStore();
    if (store) store.actorRole = actorRole;
  }
}

@Injectable()
export class RequestContextMiddleware {
  constructor(private readonly requestContext: RequestContext) {}

  use(request: Request, response: Response, next: NextFunction) {
    this.requestContext.run(request, response, next);
  }
}