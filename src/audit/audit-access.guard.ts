import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestContext } from '../common/request-context.js';
import { Project, ProjectMember, ProjectRole, ProjectStatus } from '../dominio/projects/dominio.entity.js';
import type { AuthenticatedRequest } from '../dominio/auth/auth.guard.js';

@Injectable()
export class AuditAccessGuard implements CanActivate {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly members: Repository<ProjectMember>,
    private readonly requestContext: RequestContext,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const hasAdminProject = await this.members
      .createQueryBuilder('member')
      .innerJoin(Project, 'project', 'project.id = member.projectId')
      .where('member.userId = :userId', { userId: request.user.id })
      .andWhere('member.role = :role', { role: ProjectRole.ADMINISTRATOR })
      .andWhere('project.status = :status', { status: ProjectStatus.ACTIVE })
      .getExists();

    if (!hasAdminProject) {
      throw new ForbiddenException('Acesso à auditoria restrito a administradores');
    }
    this.requestContext.setActorRole(ProjectRole.ADMINISTRATOR);
    return true;
  }
}