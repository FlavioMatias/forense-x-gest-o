import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectMemberDto,
} from './dto/project.dto.js';
import { ProjectsService } from './projects.service.js';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() input: CreateProjectDto) {
    return this.projects.create(request.user, input);
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    return this.projects.list(request.user);
  }

  @Get(':projectId')
  get(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.get(request.user, projectId);
  }

  @Patch(':projectId')
  update(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: UpdateProjectDto,
  ) {
    return this.projects.update(request.user, projectId, input);
  }

  @Post(':projectId/archive')
  archive(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.archive(request.user, projectId);
  }

  @Get(':projectId/members')
  listMembers(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.projects.listMembers(request.user, projectId);
  }

  @Post(':projectId/members')
  addMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: AddProjectMemberDto,
  ) {
    return this.projects.addMember(request.user, projectId, input);
  }

  @Patch(':projectId/members/:userId')
  updateMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @Body() input: UpdateProjectMemberDto,
  ) {
    return this.projects.updateMember(request.user, projectId, userId, input.role);
  }

  @Delete(':projectId/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
  ) {
    return this.projects.removeMember(request.user, projectId, userId);
  }
}