import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthSession } from '../auth/auth-session.entity.js';
import { User } from '../users/users.entity.js';
import { Credential } from '../credentials/credential.entity.js';
import { Project, ProjectMember } from './dominio.entity.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    AuthModule,
    TypeOrmModule.forFeature([Project, ProjectMember, User, AuthSession, Credential]),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, AuthGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}