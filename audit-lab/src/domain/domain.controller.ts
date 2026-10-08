import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';

import {
  ProjectRole,
} from './domain.entity.js';

import {
  AuthService,
  ProjectService,
  PullRequestService,
  RequirementService,
  UserService,
} from './domain.service.js';

/* -------------------------------------------------------------------------- */
/*                                    AUTH                                    */
/* -------------------------------------------------------------------------- */

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
  ) {}

  @Post('login')
  async login(
    @Body()
    body: {
      username: string;
      password: string;
    },
  ) {
    return this.authService.login(
      body.username,
      body.password,
    );
  }

  @Post('logout')
  async logout() {
    return this.authService.logout();
  }
}

/* -------------------------------------------------------------------------- */
/*                                    USER                                    */
/* -------------------------------------------------------------------------- */

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      username: string;
      password: string;
      displayName: string;
    },
  ) {
    return this.userService.create(
      body.username,
      body.password,
      body.displayName,
    );
  }

  @Get(':username')
  async findByUsername(
    @Param('username') username: string,
  ) {
    return this.userService.findByUsername(username);
  }
}

/* -------------------------------------------------------------------------- */
/*                                  PROJECT                                   */
/* -------------------------------------------------------------------------- */

@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      name: string;
      description?: string;
      isPrivate?: boolean;
      creatorId: string;
    },
  ) {
    return this.projectService.create(
      body.name,
      body.description ,
      body.isPrivate ?? false,
      body.creatorId,
    );
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
  ) {
    return this.projectService.findById(id);
  }

  @Post(':id/members')
  async addMember(
    @Param('id') projectId: string,
    @Body()
    body: {
      username: string;
      role: ProjectRole;
    },
  ) {
    return this.projectService.addMember(
      projectId,
      body.username,
      body.role,
    );
  }

  @Get(':id/members')
  async listMembers(
    @Param('id') projectId: string,
  ) {
    return this.projectService.listMembers(projectId);
  }
}

/* -------------------------------------------------------------------------- */
/*                                REQUIREMENT                                 */
/* -------------------------------------------------------------------------- */

@Controller('requirements')
export class RequirementController {
  constructor(
    private readonly requirementService: RequirementService,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      projectId: string;
      title: string;
      description: string;
      creatorId: string;
    },
  ) {
    return this.requirementService.create(
      body.projectId,
      body.title,
      body.description,
      body.creatorId,
    );
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
  ) {
    return this.requirementService.findById(id);
  }

  @Get('project/:projectId')
  async listByProject(
    @Param('projectId') projectId: string,
  ) {
    return this.requirementService.listByProject(projectId);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body()
    body: {
      title: string;
      description: string;
      userId: string;
    },
  ) {
    return this.requirementService.update(
      id,
      body.title,
      body.description,
      body.userId,
    );
  }

  @Post(':id/implement')
  async implement(
    @Param('id') id: string,
    @Body()
    body: {
      userId: string;
    },
  ) {
    return this.requirementService.implement(
      id,
      body.userId,
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              PULL REQUEST                                  */
/* -------------------------------------------------------------------------- */

@Controller('pull-requests')
export class PullRequestController {
  constructor(
    private readonly pullRequestService: PullRequestService,
  ) {}

  @Post()
  async create(
    @Body()
    body: {
      requirementId: string;
      authorId: string;
      title: string;
      description?: string;
    },
  ) {
    return this.pullRequestService.create(
      body.requirementId,
      body.authorId,
      body.title,
      body.description ?? null,
    );
  }

  @Get(':id')
  async findById(
    @Param('id') id: string,
  ) {
    return this.pullRequestService.findById(id);
  }

  @Post(':id/approve')
  async approve(
    @Param('id') id: string,
    @Body()
    body: {
      approverId: string;
    },
  ) {
    return this.pullRequestService.approve(
      id,
      body.approverId,
    );
  }

  @Post(':id/reject')
  async reject(
    @Param('id') id: string,
    @Body()
    body: {
      approverId: string;
    },
  ) {
    return this.pullRequestService.reject(
      id,
      body.approverId,
    );
  }
}