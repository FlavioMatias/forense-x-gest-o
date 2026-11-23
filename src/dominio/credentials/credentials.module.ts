import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module.js';
import { AuthGuard } from '../auth/auth.guard.js';
import { AuthSession } from '../auth/auth-session.entity.js';
import { User } from '../users/users.entity.js';
import { Credential } from './credential.entity.js';
import { CredentialsController } from './credentials.controller.js';
import { CredentialsService } from './credentials.service.js';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Credential, AuthSession, User])],
  controllers: [CredentialsController],
  providers: [CredentialsService, AuthGuard],
})
export class CredentialsModule {}