import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository, type EntityManager } from 'typeorm';
import { RequestContext } from '../../common/request-context.js';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';
import { User } from '../users/users.entity.js';
import { Project, ProjectMember, ProjectRole, ProjectStatus } from './dominio.entity.js';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
} from './dto/project.dto.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly members: Repository<ProjectMember>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    @Optional() private readonly requestContext?: RequestContext,
    @Optional() @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditEvents?: AuditEventPublisher,
  ) {}

  async create(user: User, input: CreateProjectDto) {
    return this.dataSource.transaction(async (manager) => {
      const projectRepository = manager.getRepository(Project);
      const project = await projectRepository.save(
        projectRepository.create({
          name: input.name.trim(),
          description: input.description ?? null,
          status: ProjectStatus.ACTIVE,
        }),
      );
      await manager.getRepository(ProjectMember).save({
        projectId: project.id,
        userId: user.id,
        role: ProjectRole.ADMINISTRATOR,
      });
      await this.auditEvents?.record(
        {
          eventType: 'project.created',
          actorId: user.id,
          actorRole: ProjectRole.ADMINISTRATOR,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'project',
            resourceId: project.id,
            operation: 'create',
            newValues: {
              name: project.name,
              description: project.description,
              status: project.status,
            },
          },
        },
        manager,
      );
      return project;
    });
  }

  async list(user: User) {
    const projects = await this.projects
      .createQueryBuilder('project')
      .innerJoin('project.members', 'member', 'member.userId = :userId', {
        userId: user.id,
      })
      .orderBy('project.createdAt', 'DESC')
      .getMany();
    if (projects.length) {
      const memberships = await this.members.find({
        where: { userId: user.id, projectId: In(projects.map(({ id }) => id)) },
      });
      const roles = new Map(memberships.map(({ projectId, role }) => [projectId, role]));
      for (const project of projects) {
        await this.auditEvents?.record({
          eventType: 'project.listed',
          actorId: user.id,
          actorRole: roles.get(project.id) ?? null,
          result: { outcome: 'success', count: projects.length },
          resource: {
            resourceType: 'project',
            resourceId: project.id,
            operation: 'list',
            newValues: { name: project.name, status: project.status },
          },
        });
      }
    } else {
      await this.auditEvents?.record({
        eventType: 'project.listed',
        actorId: user.id,
        result: { outcome: 'success', count: 0 },
        resource: {
          resourceType: 'project_collection',
          resourceId: user.id,
          operation: 'list',
          newValues: { projectIds: [] },
        },
      });
    }
    return projects;
  }

  async get(user: User, projectId: string) {
    const project = await this.requireRole(user, projectId);
    await this.auditEvents?.record({
      eventType: 'project.viewed',
      actorId: user.id,
      result: { outcome: 'success' },
      resource: { resourceType: 'project', resourceId: project.id, operation: 'read' },
    });
    return project;
  }

  async update(user: User, projectId: string, input: UpdateProjectDto) {
    const project = await this.requireRole(user, projectId, ProjectRole.ADMINISTRATOR);
    this.assertActive(project);
    return this.dataSource.transaction(async (manager) => {
      const oldValues = { name: project.name, description: project.description };
      if (input.name !== undefined) project.name = input.name.trim();
      if (input.description !== undefined) project.description = input.description;
      const updated = await manager.getRepository(Project).save(project);
      await this.auditEvents?.record(
        {
          eventType: 'project.updated',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'project',
            resourceId: projectId,
            operation: 'update',
            oldValues,
            newValues: { name: updated.name, description: updated.description },
          },
        },
        manager,
      );
      return updated;
    });
  }

  async archive(user: User, projectId: string) {
    const project = await this.requireRole(user, projectId, ProjectRole.ADMINISTRATOR);
    this.assertActive(project);
    return this.dataSource.transaction(async (manager) => {
      project.status = ProjectStatus.ARCHIVED;
      const archived = await manager.getRepository(Project).save(project);
      await this.auditEvents?.record(
        {
          eventType: 'project.archived',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'project',
            resourceId: projectId,
            operation: 'archive',
            oldValues: { status: ProjectStatus.ACTIVE },
            newValues: { status: archived.status },
          },
        },
        manager,
      );
      return archived;
    });
  }

  async listMembers(user: User, projectId: string) {
    await this.requireRole(user, projectId);
    const members = await this.members.find({
      where: { projectId },
      relations: { user: true },
      order: { joinedAt: 'ASC' },
    });
    await this.auditEvents?.record({
      eventType: 'project.members.listed',
      actorId: user.id,
      result: { outcome: 'success', count: members.length },
      resource: {
        resourceType: 'project_members',
        resourceId: projectId,
        operation: 'list',
        newValues: { members: members.map(({ userId, role }) => ({ userId, role })) },
      },
    });
    return members.map((member) =>
      {
        const { id, userId, role, joinedAt, user: memberUser } = member;
        return {
          id,
          userId,
          role,
          joinedAt,
          user: { id: memberUser.id, name: memberUser.name, email: memberUser.email },
        };
      },
    );
  }

  async addMember(user: User, projectId: string, input: AddProjectMemberDto) {
    const project = await this.requireRole(user, projectId, ProjectRole.ADMINISTRATOR);
    this.assertActive(project);
    if (!(await this.users.exists({ where: { id: input.userId, active: true } }))) {
      throw new NotFoundException('Usuário não encontrado');
    }
    try {
      return await this.dataSource.transaction(async (manager) => {
        const members = manager.getRepository(ProjectMember);
        if (await members.exists({ where: { projectId, userId: input.userId } })) {
          throw new ConflictException('Usuário já participa do projeto');
        }
        const member = await members.save({
          projectId,
          userId: input.userId,
          role: input.role,
        });
        await this.auditEvents?.record(
          {
            eventType: 'project.member.added',
            actorId: user.id,
            result: { outcome: 'success' },
            resource: {
              resourceType: 'project_member',
              resourceId: member.id,
              operation: 'add',
              newValues: { projectId, userId: input.userId, role: input.role },
            },
          },
          manager,
        );
        return member;
      });
    } catch (error) {
      if (this.isDuplicateKey(error)) throw new ConflictException('Usuário já participa do projeto');
      throw error;
    }
  }

  async updateMember(
    user: User,
    projectId: string,
    userId: string,
    role: ProjectRole,
  ) {
    const project = await this.requireRole(user, projectId, ProjectRole.ADMINISTRATOR);
    this.assertActive(project);
    return this.dataSource.transaction(async (manager) => {
      await this.lockProject(manager, projectId);
      const memberRepository = manager.getRepository(ProjectMember);
      const member = await memberRepository.findOne({ where: { projectId, userId } });
      if (!member) throw new NotFoundException('Membro não encontrado');
      if (member.role === ProjectRole.ADMINISTRATOR && role !== ProjectRole.ADMINISTRATOR) {
        await this.assertAnotherAdministrator(manager, projectId, userId);
      }
      const oldRole = member.role;
      member.role = role;
      const updated = await memberRepository.save(member);
      await this.auditEvents?.record(
        {
          eventType: 'project.member.role_changed',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'project_member',
            resourceId: member.id,
            operation: 'change_role',
            oldValues: { role: oldRole },
            newValues: { role },
          },
        },
        manager,
      );
      return updated;
    });
  }

  async removeMember(user: User, projectId: string, userId: string) {
    const project = await this.requireRole(user, projectId, ProjectRole.ADMINISTRATOR);
    this.assertActive(project);
    return this.dataSource.transaction(async (manager) => {
      await this.lockProject(manager, projectId);
      const memberRepository = manager.getRepository(ProjectMember);
      const member = await memberRepository.findOne({ where: { projectId, userId } });
      if (!member) throw new NotFoundException('Membro não encontrado');
      if (member.role === ProjectRole.ADMINISTRATOR) {
        await this.assertAnotherAdministrator(manager, projectId, userId);
      }
      await memberRepository.remove(member);
      await this.auditEvents?.record(
        {
          eventType: 'project.member.removed',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'project_member',
            resourceId: member.id,
            operation: 'remove',
            oldValues: { projectId, userId, role: member.role },
          },
        },
        manager,
      );
    });
  }

  async requireRole(user: User, projectId: string, role?: ProjectRole | ProjectRole[]) {
    const member = await this.members.findOne({ where: { projectId, userId: user.id } });
    if (!member) {
      await this.auditEvents?.record({
        eventType: 'authorization.project_denied',
        actorId: user.id,
        result: { outcome: 'denied', reason: 'not_a_member' },
        resource: {
          resourceType: 'project',
          resourceId: projectId,
          operation: 'access_denied',
        },
      });
      throw new NotFoundException('Projeto não encontrado');
    }
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Projeto não encontrado');
    if (role) {
      const allowedRoles = Array.isArray(role) ? role : [role];
      if (!allowedRoles.includes(member.role)) {
        await this.auditEvents?.record({
          eventType: 'authorization.project_role_denied',
          actorId: user.id,
          actorRole: member.role,
          result: { outcome: 'denied', requiredRoles: allowedRoles },
          resource: {
            resourceType: 'project',
            resourceId: projectId,
            operation: 'role_denied',
          },
        });
        throw new ForbiddenException('Permissão insuficiente');
      }
    }
    this.requestContext?.setActorRole(member.role);
    return project;
  }

  assertActive(project: Project) {
    if (project.status !== ProjectStatus.ACTIVE) {
      throw new ConflictException('Projeto arquivado não aceita alterações');
    }
  }

  private async lockProject(manager: EntityManager, projectId: string) {
    const project = await manager
      .getRepository(Project)
      .createQueryBuilder('project')
      .setLock('pessimistic_write')
      .where('project.id = :projectId', { projectId })
      .getOne();
    if (!project) throw new NotFoundException('Projeto não encontrado');
  }

  private async assertAnotherAdministrator(
    manager: EntityManager,
    projectId: string,
    excludedUserId: string,
  ) {
    const count = await manager.getRepository(ProjectMember).count({
      where: {
        projectId,
        role: ProjectRole.ADMINISTRATOR,
        userId: Not(excludedUserId),
      },
    });
    if (count < 1) throw new ConflictException('O projeto precisa manter um administrador');
  }

  private isDuplicateKey(error: unknown) {
    if (typeof error !== 'object' || error === null) return false;
    const databaseError = error as {
      code?: unknown;
      driverError?: { code?: unknown };
    };
    return databaseError.code === '23505' || databaseError.driverError?.code === '23505';
  }
}