import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuditEventsService, AUDIT_GENESIS_HASH } from '../src/audit/services/audit-events.service.js';
import { AuditAuthEvent } from '../src/audit/entities/audit-auth-event.entity.js';
import { AuditEvent } from '../src/audit/entities/audit-event.entity.js';
import { AuditMetaEvent } from '../src/audit/entities/audit-meta-event.entity.js';
import { authHeaders } from './support/test-auth.js';
import { ScenarioContext } from './support/test-fixtures.js';
import { startScenario, stopScenario } from './support/test-database.js';

describe('Audit integration', () => {
  let context: ScenarioContext;

  beforeAll(async () => {
    context = await startScenario();
  });

  afterAll(async () => {
    await stopScenario(context);
  });

  it('persists specialized events, verifies the chain, and meta-audits protected HTML reads', async () => {
    const server = request(context.app.getHttpServer());
    const dataSource = context.app.get(DataSource);
    const auditService = context.app.get(AuditEventsService);
    const admin = await context.createActor('Administrador de auditoria');
    const contributor = await context.createActor('Colaborador de auditoria');
    const reader = await context.createActor('Leitor sem acesso à auditoria');
    const project = await context.createProject(admin, `<script>alert('audit')</script> ${context.runId}`);
    await context.addMember(admin, project.id, contributor, 'contributor');
    await context.addMember(admin, project.id, reader, 'reader');
    const requirement = await context.createRequirement(
      contributor,
      project.id,
      'Requisito auditado',
      'Estado inicial verificável.',
    );

    const invalidLogin = await server.post('/api/v1/auth/login').send({
      email: admin.email,
      password: 'senha-incorreta',
    }).expect(401);
    expect(invalidLogin.body).not.toHaveProperty('accessToken');

    const proposal = await server
      .post(`/api/v1/requirements/${requirement.id}/pull-requests`)
      .set(authHeaders(contributor))
      .send({ proposedTitle: 'Requisito alterado', proposedDescription: 'Novo estado aprovado.' })
      .expect(201);
    const approvalResponse = await server
      .post(`/api/v1/pull-requests/${proposal.body.id}/approve`)
      .set(authHeaders(admin))
      .set('User-Agent', 'forense-audit-integration/1.0')
      .send({ reason: 'Decisão formal.' })
      .expect(201);

    const approved = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: { eventType: 'pull_request.approved', actorId: admin.id },
      relations: { resourceEvent: true },
      order: { sequence: 'DESC' },
    });
    expect(approved.actorRole).toBe('administrator');
    expect(approved.requestId).toBeTruthy();
    expect(approved.requestId).toBe(approvalResponse.headers['x-request-id']);
    expect(approved.sessionId).toBeTruthy();
    expect(approved.sourceIp).toBeTruthy();
    expect(approved.userAgent).toBe('forense-audit-integration/1.0');
    expect(approved.result).toMatchObject({ outcome: 'success', decision: 'approved' });
    expect(approved.resourceEvent).toMatchObject({
      resourceType: 'pull_request',
      resourceId: proposal.body.id,
      operation: 'approved',
      approverId: admin.id,
      oldValues: {
        status: 'pending',
        requirement: { title: requirement.title, version: 1 },
      },
      newValues: {
        status: 'approved',
        requirement: { title: 'Requisito alterado', version: 2 },
      },
    });
    const completedRequest = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: {
        eventType: 'http.request.completed',
        requestId: approved.requestId,
      },
    });
    expect(completedRequest.result).toMatchObject({ outcome: 'success', httpStatus: 201 });

    const authEvent = await dataSource.getRepository(AuditAuthEvent).findOneByOrFail({
      action: 'password_validation',
      username: admin.email,
      success: false,
    });
    expect(authEvent.eventId).toBeTruthy();

    const credentialResponse = await server
      .post('/api/v1/credentials')
      .set(authHeaders(admin))
      .send({ name: 'Token auditado', scopes: ['projects:read'] })
      .expect(201);
    const credentialId = credentialResponse.body.id as string;
    const credentialToken = credentialResponse.body.token as string;
    context.credentials.push(credentialId);
    await server
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${credentialToken}`)
      .expect(200);
    const credentialAuth = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: { eventType: 'auth.credential.validated', actorId: admin.id },
      relations: { authEvent: true, resourceEvent: true },
      order: { sequence: 'DESC' },
    });
    expect(credentialAuth.sessionId).toBeNull();
    expect(credentialAuth.resourceEvent).toMatchObject({
      resourceType: 'credential',
      resourceId: credentialId,
      operation: 'authenticate',
    });
    expect(credentialAuth.authEvent).toMatchObject({
      username: admin.email,
      action: 'credential_validation',
      success: true,
    });
    expect(JSON.stringify(credentialAuth)).not.toContain(credentialToken);

    await server
      .post(`/api/v1/credentials/${credentialId}/revoke`)
      .set(authHeaders(admin))
      .expect(204);
    await server
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${credentialToken}`)
      .expect(401);
    const revokedCredential = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: { eventType: 'credential.revoked', actorId: admin.id },
      relations: { resourceEvent: true },
      order: { sequence: 'DESC' },
    });
    expect(revokedCredential.resourceEvent).toMatchObject({
      resourceId: credentialId,
      operation: 'revoke',
      oldValues: { status: 'active' },
      newValues: { status: 'revoked' },
    });

    const firstEvent = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: {},
      order: { sequence: 'ASC' },
    });
    expect(firstEvent.sequence).toBe('1');
    expect(firstEvent.hash).not.toBe(AUDIT_GENESIS_HASH);

    const projectCreated = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: { eventType: 'project.created' },
      relations: { resourceEvent: true },
      order: { sequence: 'ASC' },
    });
    expect(JSON.stringify(projectCreated.resourceEvent?.newValues)).toContain('script');

    const beforeConcurrentReads = await dataSource.getRepository(AuditEvent).count();
    await Promise.all([
      server
        .get(`/api/v1/requirements/${requirement.id}`)
        .set(authHeaders(contributor))
        .expect(200),
      server
        .get(`/api/v1/requirements/${requirement.id}`)
        .set(authHeaders(contributor))
        .expect(200),
    ]);
    const concurrentEvents = await dataSource
      .getRepository(AuditEvent)
      .find({ order: { sequence: 'ASC' } });
    expect(concurrentEvents.length).toBeGreaterThan(beforeConcurrentReads);
    expect(new Set(concurrentEvents.map(({ sequence }) => sequence)).size).toBe(
      concurrentEvents.length,
    );
    expect((await auditService.verifyChain()).valid).toBe(true);

    const html = await server
      .get(`/api/v1/audit/events/${projectCreated.id}`)
      .set(authHeaders(admin))
      .expect(200)
      .expect('Content-Type', /html/);
    expect(html.text).toContain('&lt;script&gt;');
    expect(html.text).not.toContain("<script>alert('audit')</script>");
    expect(html.text).toContain(projectCreated.hash);
    const viewMeta = await dataSource.getRepository(AuditMetaEvent).findOneByOrFail({
      action: 'view',
      scope: `event:${projectCreated.id}`,
    });
    expect(viewMeta.eventId).toBeTruthy();

    await server
      .get(`/api/v1/audit/events/${projectCreated.id}`)
      .set(authHeaders(reader))
      .expect(403);
    const deniedMeta = await dataSource.getRepository(AuditMetaEvent).findOneByOrFail({
      action: 'access_denied',
      scope: `event:${projectCreated.id}`,
    });
    expect(deniedMeta.eventId).toBeTruthy();

    await server.get(`/api/v1/audit/events/${projectCreated.id}`).expect(401);
    const unauthenticatedDenial = await dataSource.getRepository(AuditEvent).findOneOrFail({
      where: {
        eventType: 'audit.access.denied',
      },
      relations: { metaEvent: true },
      order: { sequence: 'DESC' },
    });
    expect(unauthenticatedDenial.result).toMatchObject({ httpStatus: 401 });
    expect(unauthenticatedDenial.metaEvent).toMatchObject({
      action: 'access_denied',
      scope: `event:${projectCreated.id}`,
    });

    const resultBeforeTamper = approved.result;
    await dataSource.getRepository(AuditEvent).update(approved.id, { result: { outcome: 'changed' } });
    const alteredChain = await auditService.verifyChain();
    expect(alteredChain.valid).toBe(false);
    await dataSource.getRepository(AuditEvent).update(approved.id, { result: resultBeforeTamper });
    expect((await auditService.verifyChain()).valid).toBe(true);
  });
});