
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  User,
  Project,
  ProjectMember,
  Requirement,
  PullRequest,
  ProjectRole,
  RequirementStatus,
  PullRequestStatus,
} from './domain.entity.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async login(username: string, password: string) {
    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (!user || user.passwordHash !== password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return user;
  }

  async logout() {
    return { message: 'Logged out' };
  }
}

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    username: string,
    passwordHash: string,
    displayName: string,
  ) {
    const existingUser = await this.userRepository.findOne({
      where: { username },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const user = this.userRepository.create({
      username,
      passwordHash,
      displayName,
    });

    return this.userRepository.save(user);
  }

  async findByUsername(username: string) {
    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findById(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }
}

@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,

    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(
    name: string,
    description: string | undefined,
    isPrivate: boolean,
    creatorId: string,
  ) {
    const creator = await this.userRepository.findOne({
      where: { id: creatorId },
    });

    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    const project = this.projectRepository.create({
      name,
      description,
      isPrivate,
      createdBy: creator,
    });

    const savedProject = await this.projectRepository.save(project);

    const member = this.projectMemberRepository.create({
      project: savedProject,
      user: creator,
      role: ProjectRole.ADMIN,
    });

    await this.projectMemberRepository.save(member);

    return savedProject;
  }

  async findById(id: string) {
    const project = await this.projectRepository.findOne({
      where: { id },
      relations: {
        createdBy: true,
        members: true,
        requirements: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  async addMember(
    projectId: string,
    username: string,
    role: ProjectRole,
  ) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const user = await this.userRepository.findOne({
      where: { username },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const existingMember = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: user.id },
      },
    });

    if (existingMember) {
      throw new ConflictException('User is already a project member');
    }

    const member = this.projectMemberRepository.create({
      project,
      user,
      role,
    });

    return this.projectMemberRepository.save(member);
  }

  async listMembers(projectId: string) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.projectMemberRepository.find({
      where: {
        project: { id: projectId },
      },
      relations: {
        user: true,
      },
    });
  }

  async hasPermission(
    projectId: string,
    userId: string,
    requiredRole?: ProjectRole,
  ) {
    const member = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: userId },
      },
    });

    if (!member) {
      return false;
    }

    if (requiredRole && member.role !== requiredRole) {
      return false;
    }

    return true;
  }
}

@Injectable()
export class RequirementService {
  constructor(
    @InjectRepository(Requirement)
    private readonly requirementRepository: Repository<Requirement>,

    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
  ) {}

  async create(
    projectId: string,
    title: string,
    description: string,
    creatorId: string,
  ) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const creator = await this.userRepository.findOne({
      where: { id: creatorId },
    });

    if (!creator) {
      throw new NotFoundException('Creator not found');
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: { id: projectId },
        user: { id: creatorId },
      },
    });

    if (!member) {
      throw new ForbiddenException('User is not a project member');
    }

    const requirement = this.requirementRepository.create({
      project,
      title,
      description,
      createdBy: creator,
      status: RequirementStatus.DRAFT,
    });

    return this.requirementRepository.save(requirement);
  }

  async findById(id: string) {
    const requirement = await this.requirementRepository.findOne({
      where: { id },
      relations: {
        project: true,
        createdBy: true,
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    return requirement;
  }

  async listByProject(projectId: string) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.requirementRepository.find({
      where: {
        project: { id: projectId },
      },
      relations: {
        createdBy: true,
      },
      order: {
        createdAt: 'ASC',
      },
    });
  }

  async update(
    id: string,
    title: string,
    description: string,
    userId: string,
  ) {
    const requirement = await this.requirementRepository.findOne({
      where: { id },
      relations: {
        project: true,
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: { id: requirement.project.id },
        user: { id: userId },
      },
    });

    if (!member) {
      throw new ForbiddenException('User is not a project member');
    }

    requirement.title = title;
    requirement.description = description;

    return this.requirementRepository.save(requirement);
  }

  async implement(id: string, userId: string) {
    const requirement = await this.requirementRepository.findOne({
      where: { id },
      relations: {
        project: true,
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: { id: requirement.project.id },
        user: { id: userId },
      },
    });

    if (!member) {
      throw new ForbiddenException('User is not a project member');
    }

    if (requirement.status !== RequirementStatus.READY) {
      throw new ForbiddenException(
        'Requirement is not ready for implementation',
      );
    }

    requirement.status = RequirementStatus.IMPLEMENTED;

    return this.requirementRepository.save(requirement);
  }
}

@Injectable()
export class PullRequestService {
  constructor(
    @InjectRepository(PullRequest)
    private readonly pullRequestRepository: Repository<PullRequest>,

    @InjectRepository(Requirement)
    private readonly requirementRepository: Repository<Requirement>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
  ) {}

  async create(
    requirementId: string,
    authorId: string,
    title: string,
    description: string,
  ) {
    const requirement = await this.requirementRepository.findOne({
      where: { id: requirementId },
      relations: {
        project: true,
      },
    });

    if (!requirement) {
      throw new NotFoundException('Requirement not found');
    }

    const author = await this.userRepository.findOne({
      where: { id: authorId },
    });

    if (!author) {
      throw new NotFoundException('Author not found');
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: { id: requirement.project.id },
        user: { id: authorId },
      },
    });

    if (!member) {
      throw new ForbiddenException('User is not a project member');
    }

    if (requirement.status !== RequirementStatus.DRAFT) {
      throw new ForbiddenException(
        'Requirement is not available for a new pull request',
      );
    }

    const pullRequest = this.pullRequestRepository.create({
      requirement,
      author,
      title,
      description,
      status: PullRequestStatus.PENDING,
    });

    requirement.status = RequirementStatus.PENDING_REVIEW;

    await this.requirementRepository.save(requirement);

    return this.pullRequestRepository.save(pullRequest);
  }

  async findById(id: string) {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id },
      relations: {
        requirement: true,
        author: true,
        approver: true,
      },
    });

    if (!pullRequest) {
      throw new NotFoundException('Pull request not found');
    }

    return pullRequest;
  }

  async approve(id: string, approverId: string) {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id },
      relations: {
        requirement: {
          project: true,
        },
        author: true,
      },
    });

    if (!pullRequest) {
      throw new NotFoundException('Pull request not found');
    }

    if (pullRequest.status !== PullRequestStatus.PENDING) {
      throw new ForbiddenException(
        'Pull request is not pending',
      );
    }

    if (pullRequest.author.id === approverId) {
      throw new ForbiddenException(
        'Author cannot approve their own pull request',
      );
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: {
          id: pullRequest.requirement.project.id,
        },
        user: {
          id: approverId,
        },
      },
    });

    if (!member || member.role !== ProjectRole.ADMIN) {
      throw new ForbiddenException(
        'Only project administrators can approve pull requests',
      );
    }

    const approver = await this.userRepository.findOne({
      where: { id: approverId },
    });

    if (!approver) {
      throw new NotFoundException('Approver not found');
    }

    pullRequest.approver = approver;
    pullRequest.status = PullRequestStatus.APPROVED;
    pullRequest.approvedAt = new Date();

    pullRequest.requirement.status = RequirementStatus.READY;

    await this.requirementRepository.save(
      pullRequest.requirement,
    );

    return this.pullRequestRepository.save(pullRequest);
  }

  async reject(id: string, approverId: string) {
    const pullRequest = await this.pullRequestRepository.findOne({
      where: { id },
      relations: {
        requirement: {
          project: true,
        },
        author: true,
      },
    });

    if (!pullRequest) {
      throw new NotFoundException('Pull request not found');
    }

    if (pullRequest.status !== PullRequestStatus.PENDING) {
      throw new ForbiddenException(
        'Pull request is not pending',
      );
    }

    const member = await this.projectMemberRepository.findOne({
      where: {
        project: {
          id: pullRequest.requirement.project.id,
        },
        user: {
          id: approverId,
        },
      },
    });

    if (!member || member.role !== ProjectRole.ADMIN) {
      throw new ForbiddenException(
        'Only project administrators can reject pull requests',
      );
    }

    const approver = await this.userRepository.findOne({
      where: { id: approverId },
    });

    if (!approver) {
      throw new NotFoundException('Approver not found');
    }

    pullRequest.approver = approver;
    pullRequest.status = PullRequestStatus.REJECTED;
    pullRequest.rejectedAt = new Date();

    pullRequest.requirement.status = RequirementStatus.DRAFT;

    await this.requirementRepository.save(
      pullRequest.requirement,
    );

    return this.pullRequestRepository.save(pullRequest);
  }
}
