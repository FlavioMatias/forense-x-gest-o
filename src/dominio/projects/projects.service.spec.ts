import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { User } from '../users/users.entity.js';
import { Project, ProjectMember, ProjectRole, ProjectStatus } from './dominio.entity.js';
import { ProjectsService } from './projects.service.js';

describe('ProjectsService', () => {
  const project = { id: 'project-id', status: ProjectStatus.ACTIVE } as Project;
  const member = { projectId: project.id, userId: 'user-id', role: ProjectRole.ADMINISTRATOR };
  const projectRepository = {
    create: vi.fn((value: Partial<Project>) => value),
    save: vi.fn(async (value: Partial<Project>) => ({ ...value, id: project.id })),
    findOne: vi.fn(),
  };
  const memberRepository = {
    save: vi.fn(async (value: Partial<ProjectMember>) => value),
    findOne: vi.fn(),
    count: vi.fn(),
    remove: vi.fn(),
  };
  const queryBuilder = {
    setLock: vi.fn(),
    where: vi.fn(),
    getOne: vi.fn(),
  };
  queryBuilder.setLock.mockReturnValue(queryBuilder);
  queryBuilder.where.mockReturnValue(queryBuilder);
  const manager = {
    getRepository: vi.fn((entity: unknown) =>
      entity === Project
        ? { ...projectRepository, createQueryBuilder: () => queryBuilder }
        : memberRepository,
    ),
  };
  const dataSource = {
    transaction: vi.fn(async (operation: (value: EntityManager) => unknown) =>
      operation(manager as unknown as EntityManager),
    ),
  };
  const service = new ProjectsService(
    projectRepository as unknown as Repository<Project>,
    memberRepository as unknown as Repository<ProjectMember>,
    {} as Repository<User>,
    dataSource as unknown as DataSource,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    queryBuilder.setLock.mockReturnValue(queryBuilder);
    queryBuilder.where.mockReturnValue(queryBuilder);
  });

  it('creates the project and its first administrator in one transaction', async () => {
    await service.create({ id: 'user-id' } as User, { name: 'Projeto' });

    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(memberRepository.save).toHaveBeenCalledWith({
      projectId: 'project-id',
      userId: 'user-id',
      role: ProjectRole.ADMINISTRATOR,
    });
  });

  it('does not allow a reader to create or change content', async () => {
    memberRepository.findOne.mockResolvedValue({ role: ProjectRole.READER });
    projectRepository.findOne.mockResolvedValue(project);

    await expect(
      service.requireRole({ id: 'user-id' } as User, project.id, [
        ProjectRole.ADMINISTRATOR,
        ProjectRole.CONTRIBUTOR,
      ]),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents removing the final administrator', async () => {
    memberRepository.findOne.mockResolvedValue(member);
    memberRepository.count.mockResolvedValue(0);
    projectRepository.findOne.mockResolvedValue(project);
    queryBuilder.getOne.mockResolvedValue(project);

    await expect(
      service.removeMember({ id: 'user-id' } as User, project.id, 'user-id'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(memberRepository.remove).not.toHaveBeenCalled();
  });
});