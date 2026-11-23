import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/users.entity.js';
import { AuthChallenge } from './auth-challenge.entity.js';
import { AuthSession } from './auth-session.entity.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { Credential } from '../credentials/credential.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([User, AuthChallenge, AuthSession, Credential])],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
  exports: [AuthGuard],
})
export class AuthModule {}