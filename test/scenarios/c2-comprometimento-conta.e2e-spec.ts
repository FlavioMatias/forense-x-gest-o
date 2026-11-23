import request from 'supertest';
import { DataSource } from 'typeorm';
import { writeAuditReport } from '../support/audit-report.js';
import { authHeaders } from '../support/test-auth.js';
import { ScenarioContext } from '../support/test-fixtures.js';
import { startScenario, stopScenario } from '../support/test-database.js';
import { Requirement } from '../../src/dominio/requirements/requeriment.entity.js';

describe('c2-comprometimento-conta', () => {
  let context: ScenarioContext;

  beforeAll(async () => {
    context = await startScenario();
  });

  afterAll(async () => {
    try {
      if (context) await writeAuditReport(context, 'c3-comprometimento-conta');
    } finally {
      await stopScenario(context);
    }
  });

  it('executa falhas de autenticação, atividade posterior e alteração aprovada [integral]', async () => {
    const server = request(context.app.getHttpServer());

    // Preparação: conta investigada é colaboradora e tem acesso ao projeto.
    const admin = await context.createActor('Administrador C3');
    const investigated = await context.createActor('Conta investigada C3');
    const project = await context.createProject(admin, `C3 ${context.runId}`);
    await context.addMember(admin, project.id, investigated, 'contributor');
    const target = await context.createRequirement(
      admin,
      project.id,
      'C3 requisito original',
      'Descrição inicial conhecida.',
    );
    const additional = await context.createRequirement(
      admin,
      project.id,
      'C3 requisito adicional',
      'Segundo requisito para comparar a atividade posterior.',
    );

    // Referência de atividade habitual observada antes da sequência incomum.
    await server
      .get(`/api/v1/requirements/${target.id}`)
      .set(authHeaders(investigated))
      .expect(200);

    // Comportamento incomum de autenticação: falhas de senha e resposta adicional.
    const failedPasswordOne = await server.post('/api/v1/auth/login').send({
      email: investigated.email,
      password: 'senha-incorreta-1',
    }).expect(401);
    const failedPasswordTwo = await server.post('/api/v1/auth/login').send({
      email: investigated.email,
      password: 'senha-incorreta-2',
    }).expect(401);
    expect(failedPasswordOne.body).not.toHaveProperty('accessToken');
    expect(failedPasswordTwo.body).not.toHaveProperty('accessToken');

    const challenge = await server.post('/api/v1/auth/login').send({
      email: investigated.email,
      password: investigated.password,
    }).expect(200);
    const failedSecondStep = await server.post('/api/v1/auth/login/verify').send({
      challengeId: challenge.body.challengeId,
      animal: 'resposta-incorreta',
    }).expect(401);
    expect(failedSecondStep.body).not.toHaveProperty('accessToken');

    const successfulSecondStep = await server.post('/api/v1/auth/login/verify').send({
      challengeId: challenge.body.challengeId,
      animal: investigated.animal,
    }).expect(200);
    const sessionAuth = { Authorization: `Bearer ${successfulSecondStep.body.accessToken}` };

    // Atividade posterior: consulta em sequência e proposta de alteração real.
    const projectRequirements = await server
      .get(`/api/v1/projects/${project.id}/requirements`)
      .set(sessionAuth)
      .expect(200);
    expect(projectRequirements.body.map((item: { id: string }) => item.id)).toEqual(
      expect.arrayContaining([target.id, additional.id]),
    );
    await server
      .get(`/api/v1/requirements/${additional.id}`)
      .set(sessionAuth)
      .expect(200);

    const proposal = await server
      .post(`/api/v1/requirements/${target.id}/pull-requests`)
      .set(sessionAuth)
      .send({
        proposedTitle: 'C3 requisito alterado',
        proposedDescription: 'Alteração apresentada após a autenticação incomum.',
      })
      .expect(201);
    expect(proposal.body.status).toBe('pending');

    // A mudança só é aplicada pelo fluxo de decisão autorizado do administrador.
    await server
      .post(`/api/v1/pull-requests/${proposal.body.id}/approve`)
      .set(authHeaders(admin))
      .send({ reason: 'Aprovado para reproduzir o cenário.' })
      .expect(201);

    // Resultado final HTTP e persistido.
    const finalResponse = await server
      .get(`/api/v1/requirements/${target.id}`)
      .set(authHeaders(admin))
      .expect(200);
    expect(finalResponse.body).toMatchObject({
      title: 'C3 requisito alterado',
      description: 'Alteração apresentada após a autenticação incomum.',
      status: 'ready_for_implementation',
      version: 2,
    });
    const persisted = await context.app
      .get(DataSource)
      .getRepository(Requirement)
      .findOneByOrFail({ id: target.id });
    expect(persisted).toMatchObject({
      title: finalResponse.body.title,
      description: finalResponse.body.description,
      status: finalResponse.body.status,
      version: finalResponse.body.version,
    });
  });
});