# Forense x Gestão

API experimental NestJS para gerenciamento de projetos e requisitos. O domínio não depende do módulo `audit`; a auditoria permanece fora do escopo atual.

## Requisitos

- Node.js compatível com o projeto e npm.
- PostgreSQL dedicado ao ambiente da aplicação.

## Configuração

Copie `.env.example` para `.env` e ajuste as credenciais do PostgreSQL. `DB_SYNCHRONIZE=true` serve apenas para desenvolvimento inicial; use migrations antes de estabilizar o esquema. Não aponte os testes e2e para dados de produção.

```bash
npm install
npm run start:dev
```

A API usa o prefixo `/api/v1`. O cadastro aceita `name`, `email`, `password` e `animal`; e-mail e resposta adicional são normalizados antes do hash. A resposta adicional é simplificada para o experimento e não substitui MFA robusto.

## Autenticação

1. `POST /api/v1/auth/register`
2. `POST /api/v1/auth/login` retorna um desafio temporário.
3. `POST /api/v1/auth/login/verify` consome o desafio e retorna token de sessão.
4. Envie `Authorization: Bearer <token>` para rotas protegidas.
5. `GET /api/v1/auth/me` consulta a identidade; `POST /api/v1/auth/logout` revoga a sessão.

Tokens de integração são exibidos somente na criação. Os escopos aceitos são `projects:read`, `projects:write`, `requirements:read`, `requirements:write`, `requirements:review` e `requirements:implement`; eles não substituem a associação e o papel do usuário no projeto.

## Auditoria

O modelo, o mapeamento das 14 categorias, a gênese/hash encadeado, a consulta HTML e as limitações de acesso direto ao PostgreSQL estão descritos em [docs/auditoria.md](docs/auditoria.md). A cadeia detecta alterações não recompostas, mas não impede a reescrita completa por um administrador privilegiado.

## Verificação

Os cenários usam PostgreSQL real e exigem um banco descartável cujo nome contenha `_test`, além de `DB_SYNCHRONIZE=true`. Configure as variáveis de ambiente para esse banco antes de executar; o suporte falha explicitamente se a configuração estiver ausente ou apontar para um nome sem `_test`.

Em um terminal, inicie o banco descartável:

```bash
docker run --rm --name forense-x-gestao-e2e \
	-e POSTGRES_USER=forense_test \
	-e POSTGRES_PASSWORD=forense_test_pw \
	-e POSTGRES_DB=forense_x_gestao_test \
	-p 54329:5432 postgres:16-alpine
```

Em outro terminal, configure o cliente de teste:

```bash
export DB_HOST=127.0.0.1
export DB_PORT=54329
export DB_USERNAME=forense_test
export DB_PASSWORD=forense_test_pw
export DB_DATABASE=forense_x_gestao_test
export DB_SYNCHRONIZE=true
```

```bash
npm run build
npm test
npm run lint
npm run test:e2e
```

Para executar um cenário isoladamente:

```bash
npm run test:e2e:scenario -- c1-acesso-indevido
npm run test:e2e:scenario -- c2-uso-indevido-credencial
npm run test:e2e:scenario -- c3-comprometimento-conta
```

Cada execução gera um UUID próprio para os dados criados. Os testes usam HTTP para cadastro, login, projetos, membros, requisitos, propostas e credenciais; a limpeza final usa TypeORM no banco de teste. nenhum teste implementa detecção de incidente ou consulta registros de auditoria.
