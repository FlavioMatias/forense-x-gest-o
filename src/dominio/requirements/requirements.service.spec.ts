import { ConflictException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/users.entity.js';
import { ProjectsService } from '../projects/projects.service.js';
import { PullRequest, PullRequestStatus } from '../pull-requests/pr.entity.js';
import { Requirement, RequirementStatus } from './requeriment.entity.js';
import { RequirementsService } from './requirements.service.js';

describe('RequirementsService', () => {
  const pullRequest = {
    id: 'pr-id',
    requirementId: 'requirement-id',
    authorId: 'author-id',
    status: PullRequestStatus.PENDING,
    baseVersion: 3,
    proposedTitle: 'Título atualizado',
    proposedDescription: 'Descrição atualizada',
  } as PullRequest;
  const requirement = {
    id: 'requirement-id',
    projectId: 'project-id',
    version: 3,
    status: RequirementStatus.DRAFT,
  } as Requirement;
  const pullQuery = { setLock: vi.fn(), where: vi.fn(), getOne: vi.fn() };
  const requirementQuery = { setLock: vi.fn(), where: vi.fn(), getOne: vi.fn() };
  pullQuery.setLock.mockReturnValue(pullQuery);
  pullQuery.where.mockReturnValue(pullQuery);
  requirementQuery.setLock.mockReturnValue(requirementQuery);
  requirementQuery.where.mockReturnValue(requirementQuery);
  const pullRepository = {
    createQueryBuilder: vi.fn(() => pullQuery),
    save: vi.fn(async (value: PullRequest) => value),
  };
  const requirementRepository = {
    createQueryBuilder: vi.fn(() => requirementQuery),
    update: vi.fn(async () => ({ affected: 1 })),
  };
  const manager = {
    getRepository: vi.fn((entity: unknown) =>
      entity === PullRequest ? pullRepository : requirementRepository,
    ),
  };
  const dataSource = {
    transaction: vi.fn(async (operation: (value: EntityManager) => unknown) =>
      operation(manager as unknown as EntityManager),
    ),
  };
  const projects = {
    requireRole: vi.fn(async () => ({ id: 'project-id' })),
    assertActive: vi.fn(),
  };
  const service = new RequirementsService(
    {} as Repository<Requirement>,
    {} as Repository<PullRequest>,
    projects as unknown as ProjectsService,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    pullQuery.setLock.mockReturnValue(pullQuery);
    pullQuery.where.mockReturnValue(pullQuery);
    requirementQuery.setLock.mockReturnValue(requirementQuery);
    requirementQuery.where.mockReturnValue(requirementQuery);
    pullQuery.getOne.mockResolvedValue({
      id: pullRequest.id,
      requirementId: pullRequest.requirementId,
      authorId: pullRequest.authorId,
      status: pullRequest.status,
      baseVersion: pullRequest.baseVersion,
      proposedTitle: pullRequest.proposedTitle,
      proposedDescription: pullRequest.proposedDescription,
    });
    requirementQuery.getOne.mockResolvedValue({
      id: requirement.id,
      projectId: requirement.projectId,
      version: requirement.version,
      status: requirement.status,
    });
    requirementRepository.update.mockResolvedValue({ affected: 1 });
  });

  it('applies an approved proposal and records the decision together', async () => {
    const result = await service.decide(
      { id: 'reviewer-id' } as User,
      pullRequest.id,
      PullRequestStatus.APPROVED,
      'Aprovado',
    );

    expect(requirementRepository.update).toHaveBeenCalledWith(
      { id: requirement.id, version: 3 },
      {
        title: pullRequest.proposedTitle,
        description: pullRequest.proposedDescription,
        status: RequirementStatus.READY_FOR_IMPLEMENTATION,
        version: 4,
      },
    );
    expect(result).toMatchObject({
      status: PullRequestStatus.APPROVED,
      reviewerId: 'reviewer-id',
      decisionReason: 'Aprovado',
    });
  });

  it('rejects stale proposals without changing the requirement', async () => {
    requirementQuery.getOne.mockResolvedValue({
      id: requirement.id,
      projectId: requirement.projectId,
      version: 4,
      status: requirement.status,
    });

    await expect(
      service.decide(
        { id: 'reviewer-id' } as User,
        pullRequest.id,
        PullRequestStatus.APPROVED,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(requirementRepository.update).not.toHaveBeenCalled();
    expect(pullRepository.save).not.toHaveBeenCalled();
  });
});