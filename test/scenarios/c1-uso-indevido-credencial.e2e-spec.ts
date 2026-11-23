import request from 'supertest';
import { DataSource } from 'typeorm';
import { writeAuditReport } from '../support/audit-report.js';
import { authHeaders } from '../support/test-auth.js';
import { ScenarioContext } from '../support/test-fixtures.js';
import { startScenario, stopScenario } from '../support/test-database.js';
import { Requirement } from '../../src/dominio/requirements/requeriment.entity.js';

describe('c1-uso-indevido-credencial', () => {
  let context: ScenarioContext;

  beforeAll(async () => {
    context = await startScenario();
  });

  afterAll(async () => {
    try {
      if (context) await writeAuditReport(context, 'c2-uso-indevido-credencial');
    } finally {
      await stopScenario(context);
    }
  });

  it('usa a mesma credencial em vários projetos e rejeita projeto não autorizado [integral]', async () => {
    const server = request(context.app.getHttpServer());

    // Preparação: o titular tem dois projetos; um terceiro pertence a outro usuário.
    const owner = await context.createActor('Titular da integração C2');
    const outsider = await context.createActor('Titular externo C2');
    const projectA = await context.createProject(owner, `C2 Alpha ${context.runId}`);
    const projectB = await context.createProject(owner, `C2 Beta ${context.runId}`);
    const deniedProject = await context.createProject(outsider, `C2 Restrito ${context.runId}`);
    const requirementA1 = await context.createRequirement(
      owner,
      projectA.id,
      'C2 Alpha requisito consultado',
      'Conteúdo autorizado A1.',
    );
    const requirementA2 = await context.createRequirement(
      owner,
      projectA.id,
      'C2 Alpha requisito não consultado',
      'Conteúdo autorizado A2.',
    );
    const requirementB = await context.createRequirement(
      owner,
      projectB.id,
      'C2 Beta requisito consultado',
      'Conteúdo autorizado B.',
    );
    const deniedRequirement = await context.createRequirement(
      outsider,
      deniedProject.id,
      'C2 requisito restrito',
      'Conteúdo que não deve ser retornado.',
    );

    // Funcionamento normal anterior: o titular consulta um requisito pela sessão.
    await server
      .get(`/api/v1/requirements/${requirementA1.id}`)
      .set(authHeaders(owner))
      .expect(200);

    // Emissão pelo fluxo real; o token só aparece nesta resposta.
    const issued = await server
      .post('/api/v1/credentials')
      .set(authHeaders(owner))
      .send({ name: `C2 integração ${context.runId}`, scopes: ['projects:read', 'requirements:read'] })
      .expect(201);
    const credentialId = issued.body.id as string;
    const token = issued.body.token as string;
    context.credentials.push(credentialId);
    const credentialAuth = { Authorization: `Bearer ${token}` };
    expect(token).toBeTruthy();

    // Sequência investigada: consultas repetidas em dois projetos autorizados.
    const readA1 = await server
      .get(`/api/v1/requirements/${requirementA1.id}`)
      .set(credentialAuth)
      .expect(200);
    expect(readA1.body.title).toBe(requirementA1.title);

    const listB = await server
      .get(`/api/v1/projects/${projectB.id}/requirements`)
      .set(credentialAuth)
      .expect(200);
    expect(listB.body.map((item: { id: string }) => item.id)).toContain(requirementB.id);

    const readB = await server
      .get(`/api/v1/requirements/${requirementB.id}`)
      .set(credentialAuth)
      .expect(200);
    expect(readB.body.title).toBe(requirementB.title);

    // Tentativas negativas de fronteira: sem vínculo ao projeto e fora dos escopos de leitura.
    const denied = await server
      .get(`/api/v1/requirements/${deniedRequirement.id}`)
      .set(credentialAuth)
      .expect(404);
    expect(JSON.stringify(denied.body)).not.toContain(deniedRequirement.title);

    await server
      .post(`/api/v1/projects/${projectA.id}/requirements`)
      .set(credentialAuth)
      .send({ title: 'Não deve ser criado', description: 'Escopo insuficiente.' })
      .expect(403);

    const listedCredentials = await server
      .get('/api/v1/credentials')
      .set(authHeaders(owner))
      .expect(200);
    expect(listedCredentials.body[0]).not.toHaveProperty('token');
    expect(listedCredentials.body[0]).not.toHaveProperty('tokenHash');

    // Estado final: leitura não alterou requisitos, versões ou estado.
    const dataSource = context.app.get(DataSource);
    for (const initial of [requirementA1, requirementA2, requirementB, deniedRequirement]) {
      const persisted = await dataSource.getRepository(Requirement).findOneByOrFail({
        id: initial.id,
      });
      expect(persisted).toMatchObject({
        title: initial.title,
        description: initial.description,
        status: initial.status,
        version: initial.version,
      });
    }
  });
});