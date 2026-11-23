import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Inject,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { Request } from 'express';
import { Repository } from 'typeorm';
import { RequestContext } from '../../common/request-context.js';
import { AuthSession } from './auth-session.entity.js';
import { User } from '../users/users.entity.js';
import { Credential, CredentialStatus } from '../credentials/credential.entity.js';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';

export type AuthenticatedRequest = Request & {
  user: User;
  session: AuthSession;
  authType: 'session' | 'credential';
  credentialScopes?: string[];
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @InjectRepository(AuthSession)
    private readonly sessions: Repository<AuthSession>,
    @InjectRepository(Credential)
    private readonly credentials: Repository<Credential>,
    private readonly requestContext: RequestContext,
    @Optional() @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditEvents?: AuditEventPublisher,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    if (!token) {
      await this.auditEvents?.record({
        eventType: 'auth.bearer.missing',
        result: { outcome: 'failure', httpStatus: 401 },
        auth: { username: null, action: 'bearer_authentication', success: false },
      });
      throw new UnauthorizedException('Autenticação necessária');
    }

    const tokenHash = createHash('sha256').update(token).digest('hex');
    const session = await this.sessions
      .createQueryBuilder('session')
      .leftJoinAndSelect('session.user', 'user')
      .where('session.tokenHash = :tokenHash', { tokenHash })
      .andWhere('session.revokedAt IS NULL')
      .andWhere('session.expiresAt > :now', { now: new Date() })
      .andWhere('user.active = true')
      .getOne();

    if (session) {
      request.user = session.user;
      request.session = session;
      request.authType = 'session';
      this.requestContext.setActor(session.user.id, session.id);
      await this.auditEvents?.record({
        eventType: 'auth.session.validated',
        actorId: session.user.id,
        result: { outcome: 'success' },
        auth: { username: session.user.email, action: 'session_validation', success: true },
      });
      return true;
    }

    const credential = await this.credentials
      .createQueryBuilder('credential')
      .addSelect('credential.tokenHash')
      .leftJoinAndSelect('credential.user', 'user')
      .where('credential.tokenHash = :tokenHash', { tokenHash })
      .andWhere('credential.status = :status', { status: CredentialStatus.ACTIVE })
      .andWhere('(credential.expiresAt IS NULL OR credential.expiresAt > :now)', {
        now: new Date(),
      })
      .andWhere('credential.revokedAt IS NULL')
      .andWhere('user.active = true')
      .getOne();

    if (!credential) {
      await this.auditEvents?.record({
        eventType: 'auth.bearer.rejected',
        result: { outcome: 'failure', httpStatus: 401 },
        auth: { username: null, action: 'bearer_authentication', success: false },
      });
      throw new UnauthorizedException('Credencial inválida ou expirada');
    }
    const requiredScope = this.requiredScope(request);
    if (!requiredScope || !credential.scopes.includes(requiredScope)) {
      this.requestContext.setActor(credential.user.id, null);
      await this.auditEvents?.record({
        eventType: 'authorization.scope_denied',
        actorId: credential.user.id,
        result: { outcome: 'denied', requiredScope },
        resource: {
          resourceType: 'http_route',
          resourceId: request.path,
          operation: request.method,
        },
      });
      throw new ForbiddenException('Escopo insuficiente');
    }
    request.user = credential.user;
    request.authType = 'credential';
    request.credentialScopes = credential.scopes;
    this.requestContext.setActor(credential.user.id, null);
    await this.auditEvents?.record({
      eventType: 'auth.credential.validated',
      actorId: credential.user.id,
      result: { outcome: 'success' },
      auth: { username: credential.user.email, action: 'credential_validation', success: true },
      resource: {
        resourceType: 'credential',
        resourceId: credential.id,
        operation: 'authenticate',
      },
    });
    return true;
  }

  private requiredScope(request: AuthenticatedRequest) {
    const path = request.path.replace(/^\/api\/v1/, '').replace(/\/$/, '');
    const projectRequirementsPath = /^\/projects\/[^/]+\/requirements(?:\/|$)/.test(path);
    if (projectRequirementsPath && request.method === 'GET') return 'requirements:read';
    if (projectRequirementsPath) return 'requirements:write';
    if (request.method === 'GET' && path.startsWith('/projects')) return 'projects:read';
    if (request.method !== 'GET' && path.startsWith('/projects')) return 'projects:write';
    if (request.method === 'GET' && (path.startsWith('/requirements') || path.startsWith('/pull-requests'))) {
      return 'requirements:read';
    }
    if (/^\/requirements\/[^/]+\/implement$/.test(path)) return 'requirements:implement';
    if (/^\/pull-requests\/[^/]+\/(approve|reject)$/.test(path)) {
      return 'requirements:review';
    }
    if (path.startsWith('/requirements') || path.startsWith('/pull-requests')) {
      return 'requirements:write';
    }
    return undefined;
  }
}