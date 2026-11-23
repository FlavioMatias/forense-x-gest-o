import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
import { ProjectsModule } from './projects/projects.module.js';
import { RequirementsModule } from './requirements/requirements.module.js';
import { CredentialsModule } from './credentials/credentials.module.js';

@Module({ imports: [AuthModule, ProjectsModule, RequirementsModule, CredentialsModule] })
export class DominioModule {}
