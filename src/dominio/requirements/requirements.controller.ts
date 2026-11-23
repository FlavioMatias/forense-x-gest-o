import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard.js';
import type { AuthenticatedRequest } from '../auth/auth.guard.js';
import { PullRequestStatus } from '../pull-requests/pr.entity.js';
import {
  CreatePullRequestDto,
  CreateRequirementDto,
  DecisionDto,
} from './dto/requirement.dto.js';
import { RequirementsService } from './requirements.service.js';

@Controller()
@UseGuards(AuthGuard)
export class RequirementsController {
  constructor(private readonly requirements: RequirementsService) {}

  @Post('projects/:projectId/requirements')
  create(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() input: CreateRequirementDto,
  ) {
    return this.requirements.create(request.user, projectId, input);
  }

  @Get('projects/:projectId/requirements')
  list(@Req() request: AuthenticatedRequest, @Param('projectId') projectId: string) {
    return this.requirements.list(request.user, projectId);
  }

  @Get('requirements/:requirementId')
  get(@Req() request: AuthenticatedRequest, @Param('requirementId') requirementId: string) {
    return this.requirements.get(request.user, requirementId);
  }

  @Post('requirements/:requirementId/implement')
  implement(
    @Req() request: AuthenticatedRequest,
    @Param('requirementId') requirementId: string,
  ) {
    return this.requirements.implement(request.user, requirementId);
  }

  @Post('requirements/:requirementId/pull-requests')
  createPullRequest(
    @Req() request: AuthenticatedRequest,
    @Param('requirementId') requirementId: string,
    @Body() input: CreatePullRequestDto,
  ) {
    return this.requirements.createPullRequest(request.user, requirementId, input);
  }

  @Get('requirements/:requirementId/pull-requests')
  listPullRequests(
    @Req() request: AuthenticatedRequest,
    @Param('requirementId') requirementId: string,
  ) {
    return this.requirements.listPullRequests(request.user, requirementId);
  }

  @Get('pull-requests/:pullRequestId')
  getPullRequest(
    @Req() request: AuthenticatedRequest,
    @Param('pullRequestId') pullRequestId: string,
  ) {
    return this.requirements.getPullRequest(request.user, pullRequestId);
  }

  @Post('pull-requests/:pullRequestId/approve')
  approve(
    @Req() request: AuthenticatedRequest,
    @Param('pullRequestId') pullRequestId: string,
    @Body() input: DecisionDto,
  ) {
    return this.requirements.decide(
      request.user,
      pullRequestId,
      PullRequestStatus.APPROVED,
      input.reason,
    );
  }

  @Post('pull-requests/:pullRequestId/reject')
  reject(
    @Req() request: AuthenticatedRequest,
    @Param('pullRequestId') pullRequestId: string,
    @Body() input: DecisionDto,
  ) {
    return this.requirements.decide(
      request.user,
      pullRequestId,
      PullRequestStatus.REJECTED,
      input.reason,
    );
  }
}