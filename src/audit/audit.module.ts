import {
	Global,
	Module,
	NestModule,
	RequestMethod,
	MiddlewareConsumer,
} from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestContext, RequestContextMiddleware } from '../common/request-context.js';
import { AuthGuard } from '../dominio/auth/auth.guard.js';
import { AuthSession } from '../dominio/auth/auth-session.entity.js';
import { Credential } from '../dominio/credentials/credential.entity.js';
import { Project, ProjectMember } from '../dominio/projects/dominio.entity.js';
import { User } from '../dominio/users/users.entity.js';
import { AUDIT_EVENT_PUBLISHER } from '../common/audit-event.port.js';
import { AuditAccessGuard } from './audit-access.guard.js';
import { AuditController } from './audit.controller.js';
import { AuditQueryService } from './audit-query.service.js';
import { AuditAuthEvent } from './entities/audit-auth-event.entity.js';
import { AuditEvent } from './entities/audit-event.entity.js';
import { AuditMetaEvent } from './entities/audit-meta-event.entity.js';
import { AuditResourceEvent } from './entities/audit-resource-event.entity.js';
import { AuditExceptionFilter } from './services/audit-exception.filter.js';
import { AuditHttpInterceptor } from './services/audit-http.interceptor.js';
import { AuditEventsService } from './services/audit-events.service.js';

@Global()
@Module({
	imports: [
		TypeOrmModule.forFeature([
			AuditEvent,
			AuditResourceEvent,
			AuditAuthEvent,
			AuditMetaEvent,
			AuthSession,
			Credential,
			Project,
			ProjectMember,
			User,
		]),
	],
	controllers: [AuditController],
	providers: [
		RequestContext,
		RequestContextMiddleware,
		AuditEventsService,
		{ provide: AUDIT_EVENT_PUBLISHER, useExisting: AuditEventsService },
		AuditQueryService,
		AuditAccessGuard,
		AuthGuard,
		AuditHttpInterceptor,
		AuditExceptionFilter,
		{ provide: APP_INTERCEPTOR, useExisting: AuditHttpInterceptor },
		{ provide: APP_FILTER, useExisting: AuditExceptionFilter },
	],
	exports: [AUDIT_EVENT_PUBLISHER, RequestContext, AuditEventsService],
})
export class AuditModule implements NestModule {
	configure(consumer: MiddlewareConsumer) {
		consumer
			.apply(RequestContextMiddleware)
			.forRoutes({ path: '/{*path}', method: RequestMethod.ALL });
	}
}
