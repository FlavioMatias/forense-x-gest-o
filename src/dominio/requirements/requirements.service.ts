import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AUDIT_EVENT_PUBLISHER } from '../../common/audit-event.port.js';
import type { AuditEventPublisher } from '../../common/audit-event.port.js';
import { User } from '../users/users.entity.js';
import { ProjectRole } from '../projects/dominio.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { PullRequest, PullRequestStatus } from '../pull-requests/pr.entity.js';
import { Requirement, RequirementStatus } from './requeriment.entity.js';
import { CreatePullRequestDto, CreateRequirementDto } from './dto/requirement.dto.js';

@Injectable()
export class RequirementsService {
  constructor(
    @InjectRepository(Requirement)
    private readonly requirements: Repository<Requirement>,
    @InjectRepository(PullRequest)
    private readonly pullRequests: Repository<PullRequest>,
    private readonly projects: ProjectsService,
    private readonly dataSource: DataSource,
    @Optional() @Inject(AUDIT_EVENT_PUBLISHER)
    private readonly auditEvents?: AuditEventPublisher,
  ) {}

  async create(user: User, projectId: string, input: CreateRequirementDto) {
    const project = await this.projects.requireRole(user, projectId, [
      ProjectRole.ADMINISTRATOR,
      ProjectRole.CONTRIBUTOR,
    ]);
    this.projects.assertActive(project);
    return this.dataSource.transaction(async (manager) => {
      const requirements = manager.getRepository(Requirement);
      const requirement = await requirements.save(
        requirements.create({
          projectId,
          title: input.title.trim(),
          description: input.description ?? '',
          status: RequirementStatus.DRAFT,
          version: 1,
        }),
      );
      await this.auditEvents?.record(
        {
          eventType: 'requirement.created',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'requirement',
            resourceId: requirement.id,
            operation: 'create',
            newValues: {
              projectId,
              title: requirement.title,
              description: requirement.description,
              status: requirement.status,
              version: requirement.version,
            },
          },
        },
        manager,
      );
      return requirement;
    });
  }

  async list(user: User, projectId: string) {
    await this.projects.requireRole(user, projectId);
    const requirements = await this.requirements.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
    await this.auditEvents?.record({
      eventType: 'requirement.listed',
      actorId: user.id,
      result: { outcome: 'success', count: requirements.length },
      resource: {
        resourceType: 'requirement_collection',
        resourceId: projectId,
        operation: 'list',
        newValues: { requirementIds: requirements.map(({ id }) => id) },
      },
    });
    return requirements;
  }

  async get(user: User, requirementId: string) {
    const requirement = await this.requirements.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException('Requisito não encontrado');
    await this.projects.requireRole(user, requirement.projectId);
    await this.auditEvents?.record({
      eventType: 'requirement.viewed',
      actorId: user.id,
      result: { outcome: 'success' },
      resource: {
        resourceType: 'requirement',
        resourceId: requirement.id,
        operation: 'read',
      },
    });
    return requirement;
  }

  async implement(user: User, requirementId: string) {
    const requirement = await this.requirements.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException('Requisito não encontrado');
    const project = await this.projects.requireRole(
      user,
      requirement.projectId,
      ProjectRole.ADMINISTRATOR,
    );
    this.projects.assertActive(project);
    if (requirement.status !== RequirementStatus.READY_FOR_IMPLEMENTATION) {
      throw new ConflictException('Requisito não está pronto para implementação');
    }

    return this.dataSource.transaction(async (manager) => {
      const requirements = manager.getRepository(Requirement);
      const oldValues = {
        status: requirement.status,
        version: requirement.version,
      };
      const result = await requirements.update(
        {
          id: requirement.id,
          version: requirement.version,
          status: RequirementStatus.READY_FOR_IMPLEMENTATION,
        },
        { status: RequirementStatus.IMPLEMENTED },
      );
      if (result.affected !== 1) throw new ConflictException('Requisito alterado em paralelo');
      const implemented = await requirements.findOneByOrFail({ id: requirement.id });
      await this.auditEvents?.record(
        {
          eventType: 'requirement.implemented',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'requirement',
            resourceId: requirement.id,
            operation: 'implement',
            oldValues,
            newValues: {
              status: implemented.status,
              version: implemented.version,
            },
          },
        },
        manager,
      );
      return implemented;
    });
  }

  async createPullRequest(user: User, requirementId: string, input: CreatePullRequestDto) {
    const requirement = await this.requirements.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException('Requisito não encontrado');
    const project = await this.projects.requireRole(user, requirement.projectId, [
      ProjectRole.ADMINISTRATOR,
      ProjectRole.CONTRIBUTOR,
    ]);
    this.projects.assertActive(project);
    if (requirement.status === RequirementStatus.IMPLEMENTED) {
      throw new ConflictException('Requisito implementado não aceita propostas');
    }
    return this.dataSource.transaction(async (manager) => {
      const pullRequests = manager.getRepository(PullRequest);
      const pullRequest = await pullRequests.save(
        pullRequests.create({
          requirementId,
          authorId: user.id,
          reviewerId: null,
          status: PullRequestStatus.PENDING,
          proposedTitle: input.proposedTitle.trim(),
          proposedDescription: input.proposedDescription,
          decisionReason: null,
          baseVersion: requirement.version,
          decidedAt: null,
        }),
      );
      await this.auditEvents?.record(
        {
          eventType: 'pull_request.created',
          actorId: user.id,
          result: { outcome: 'success' },
          resource: {
            resourceType: 'pull_request',
            resourceId: pullRequest.id,
            operation: 'propose_change',
            newValues: {
              requirementId,
              status: pullRequest.status,
              proposedTitle: pullRequest.proposedTitle,
              proposedDescription: pullRequest.proposedDescription,
              baseVersion: pullRequest.baseVersion,
              authorId: pullRequest.authorId,
            },
          },
        },
        manager,
      );
      return pullRequest;
    });
  }

  async listPullRequests(user: User, requirementId: string) {
    const requirement = await this.requirements.findOne({ where: { id: requirementId } });
    if (!requirement) throw new NotFoundException('Requisito não encontrado');
    await this.projects.requireRole(user, requirement.projectId);
    const pullRequests = await this.pullRequests.find({
      where: { requirementId },
      order: { createdAt: 'DESC' },
    });
    await this.auditEvents?.record({
      eventType: 'pull_request.listed',
      actorId: user.id,
      result: { outcome: 'success', count: pullRequests.length },
      resource: {
        resourceType: 'pull_request_collection',
        resourceId: requirementId,
        operation: 'list',
        newValues: { pullRequestIds: pullRequests.map(({ id }) => id) },
      },
    });
    return pullRequests;
  }

  async getPullRequest(user: User, pullRequestId: string) {
    const pullRequest = await this.pullRequests.findOne({ where: { id: pullRequestId } });
    if (!pullRequest) throw new NotFoundException('Proposta não encontrada');
    const requirement = await this.requirements.findOne({
      where: { id: pullRequest.requirementId },
    });
    if (!requirement) throw new NotFoundException('Proposta não encontrada');
    await this.projects.requireRole(user, requirement.projectId);
    await this.auditEvents?.record({
      eventType: 'pull_request.viewed',
      actorId: user.id,
      result: { outcome: 'success' },
      resource: {
        resourceType: 'pull_request',
        resourceId: pullRequest.id,
        operation: 'read',
      },
    });
    return pullRequest;
  }

  async decide(
    user: User,
    pullRequestId: string,
    decision: PullRequestStatus.APPROVED | PullRequestStatus.REJECTED,
    reason?: string,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const pullRequests = manager.getRepository(PullRequest);
      const requirements = manager.getRepository(Requirement);
      const pullRequest = await pullRequests
        .createQueryBuilder('pullRequest')
        .setLock('pessimistic_write')
        .where('pullRequest.id = :pullRequestId', { pullRequestId })
        .getOne();
      if (!pullRequest) throw new NotFoundException('Proposta não encontrada');

      const requirement = await requirements
        .createQueryBuilder('requirement')
        .setLock('pessimistic_write')
        .where('requirement.id = :requirementId', {
          requirementId: pullRequest.requirementId,
        })
        .getOne();
      if (!requirement) throw new NotFoundException('Proposta não encontrada');

      const project = await this.projects.requireRole(
        user,
        requirement.projectId,
        ProjectRole.ADMINISTRATOR,
      );
      this.projects.assertActive(project);
      if (pullRequest.authorId === user.id) {
        throw new ForbiddenException('O autor não pode avaliar a própria proposta');
      }
      if (pullRequest.status !== PullRequestStatus.PENDING) {
        throw new ConflictException('A proposta já foi decidida');
      }

      if (decision === PullRequestStatus.APPROVED) {
        if (requirement.version !== pullRequest.baseVersion) {
          throw new ConflictException('A versão do requisito mudou desde a proposta');
        }
        const update = await requirements.update(
          { id: requirement.id, version: pullRequest.baseVersion },
          {
            title: pullRequest.proposedTitle,
            description: pullRequest.proposedDescription,
            status: RequirementStatus.READY_FOR_IMPLEMENTATION,
            version: pullRequest.baseVersion + 1,
          },
        );
        if (update.affected !== 1) {
          throw new ConflictException('A versão do requisito mudou desde a proposta');
        }
      }

      const oldValues = {
        status: pullRequest.status,
        reviewerId: pullRequest.reviewerId,
        decisionReason: pullRequest.decisionReason,
        requirement: {
          title: requirement.title,
          description: requirement.description,
          status: requirement.status,
          version: requirement.version,
        },
      };
      pullRequest.status = decision;
      pullRequest.reviewerId = user.id;
      pullRequest.decisionReason = reason?.trim() || null;
      pullRequest.decidedAt = new Date();
      const decided = await pullRequests.save(pullRequest);
      await this.auditEvents?.record(
        {
          eventType:
            decision === PullRequestStatus.APPROVED
              ? 'pull_request.approved'
              : 'pull_request.rejected',
          actorId: user.id,
          actorRole: ProjectRole.ADMINISTRATOR,
          result: { outcome: 'success', decision, reason: decided.decisionReason },
          resource: {
            resourceType: 'pull_request',
            resourceId: decided.id,
            operation: decision,
            oldValues,
            newValues: {
              status: decided.status,
              reviewerId: decided.reviewerId,
              decisionReason: decided.decisionReason,
              requirement:
                decision === PullRequestStatus.APPROVED
                  ? {
                      title: decided.proposedTitle,
                      description: decided.proposedDescription,
                      status: RequirementStatus.READY_FOR_IMPLEMENTATION,
                      version: decided.baseVersion + 1,
                    }
                  : oldValues.requirement,
            },
            approverId: user.id,
          },
        },
        manager,
      );
      return decided;
    });
  }
}