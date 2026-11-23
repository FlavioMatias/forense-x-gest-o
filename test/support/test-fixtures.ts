import { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { DataSource, In } from 'typeorm';
import { AuthChallenge } from '../../src/dominio/auth/auth-challenge.entity.js';
import { AuthSession } from '../../src/dominio/auth/auth-session.entity.js';
import { Credential } from '../../src/dominio/credentials/credential.entity.js';
import { PullRequest } from '../../src/dominio/pull-requests/pr.entity.js';
import { Project, ProjectMember } from '../../src/dominio/projects/dominio.entity.js';
import { Requirement } from '../../src/dominio/requirements/requeriment.entity.js';
import { User } from '../../src/dominio/users/users.entity.js';

export type ScenarioActor = {
  id: string;
  name: string;
  email: string;
  password: string;
  animal: string;
  token: string;
};

export class ScenarioContext {
  readonly runId = randomUUID();
  readonly app: INestApplication<App>;
  readonly users: string[] = [];
  readonly projects: string[] = [];
  readonly requirements: string[] = [];
  readonly credentials: string[] = [];
  private readonly dataSource: DataSource;
  private actorCounter = 0;

  constructor(app: INestApplication<App>) {
    this.app = app;
    this.dataSource = app.get(DataSource);
  }

  async clearAuditEvents() {
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM audit_meta_events');
      await manager.query('DELETE FROM audit_auth_events');
      await manager.query('DELETE FROM audit_resource_events');
      await manager.query('DELETE FROM audit_events');
    });
  }

  async createActor(name: string): Promise<ScenarioActor> {
    this.actorCounter += 1;
    const email = `scenario-${this.runId}-${this.actorCounter}@example.test`;
    const password = 'Scenario-password-42';
    const animal = 'coelho';
    const server = request(this.app.getHttpServer());
    const registration = await server.post('/api/v1/auth/register').send({
      name,
      email,
      password,
      animal,
    }).expect(201);
    this.users.push(registration.body.id as string);

    const challenge = await server.post('/api/v1/auth/login').send({ email, password }).expect(200);
    const verification = await server.post('/api/v1/auth/login/verify').send({
      challengeId: challenge.body.challengeId,
      animal,
    }).expect(200);

    return {
      id: registration.body.id as string,
      name,
      email,
      password,
      animal,
      token: verification.body.accessToken as string,
    };
  }

  async createProject(actor: ScenarioActor, name: string) {
    const response = await request(this.app.getHttpServer())
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ name, description: `Execução ${this.runId}` })
      .expect(201);
    const projectId = response.body.id as string;
    this.projects.push(projectId);
    return { id: projectId, name };
  }

  async addMember(
    admin: ScenarioActor,
    projectId: string,
    actor: ScenarioActor,
    role: 'administrator' | 'contributor' | 'reader',
  ) {
    return request(this.app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: actor.id, role })
      .expect(201);
  }

  async createRequirement(
    actor: ScenarioActor,
    projectId: string,
    title: string,
    description: string,
  ) {
    const response = await request(this.app.getHttpServer())
      .post(`/api/v1/projects/${projectId}/requirements`)
      .set('Authorization', `Bearer ${actor.token}`)
      .send({ title, description })
      .expect(201);
    const requirementId = response.body.id as string;
    this.requirements.push(requirementId);
    return { ...response.body, id: requirementId } as {
      id: string;
      title: string;
      description: string;
      status: string;
      version: number;
    };
  }

  async cleanup() {
    if (this.requirements.length) {
      await this.dataSource.getRepository(PullRequest).delete({
        requirementId: In(this.requirements),
      });
      await this.dataSource.getRepository(Requirement).delete({ id: In(this.requirements) });
    }
    if (this.credentials.length) {
      await this.dataSource.getRepository(Credential).delete({ id: In(this.credentials) });
    }
    if (this.projects.length) {
      await this.dataSource.getRepository(ProjectMember).delete({ projectId: In(this.projects) });
      await this.dataSource.getRepository(Project).delete({ id: In(this.projects) });
    }
    if (this.users.length) {
      await this.dataSource.getRepository(AuthSession).delete({ userId: In(this.users) });
      await this.dataSource.getRepository(AuthChallenge).delete({ userId: In(this.users) });
      await this.dataSource.getRepository(User).delete({ id: In(this.users) });
    }
    await this.clearAuditEvents();
  }
}