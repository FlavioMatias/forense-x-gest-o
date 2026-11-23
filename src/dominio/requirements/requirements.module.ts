import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthSession } from '../auth/auth-session.entity.js';
import { Credential } from '../credentials/credential.entity.js';
import { PullRequest } from '../pull-requests/pr.entity.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { Requirement } from './requeriment.entity.js';
import { RequirementsController } from './requirements.controller.js';
import { RequirementsService } from './requirements.service.js';

@Module({
  imports: [
    AuthModule,
    ProjectsModule,
    TypeOrmModule.forFeature([Requirement, PullRequest, AuthSession, Credential]),
  ],
  controllers: [RequirementsController],
  providers: [RequirementsService, AuthGuard],
})
export class RequirementsModule {}