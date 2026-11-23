# Auditoria e evidências

## Modelo e persistência

A migration `CreateAuditTables1761739200000` cria somente `audit_events`, `audit_resource_events`, `audit_auth_events` e `audit_meta_events`. Cada detalhe especializado aponta para um evento principal por FK restritiva e possui no máximo um detalhe por tipo/evento.

O publisher é exposto pelo token `AUDIT_EVENT_PUBLISHER` em `common`. Serviços de domínio dependem apenas desse contrato opcional; não importam entidades ou serviços de `audit`. Mutação e evento são gravados no mesmo `EntityManager` quando o caso de uso já possui transação. As demais gravações usam uma transação do módulo.

Cada gravação executa `pg_advisory_xact_lock(741852963)`, consulta a maior sequência e adiciona 1. O hash usa SHA-256 sobre JSON canônico concatenado com o hash predecessor em bytes. A gênese reproduzível é `0000000000000000000000000000000000000000000000000000000000000000` (`AUDIT_GENESIS_HASH`). A rotina `AuditEventsService.verifyChain()` recalcula a sequência e os hashes incluindo a especialização.

A cadeia detecta alterações que não sejam acompanhadas da recomputação correta dos eventos seguintes. Ela não impede que alguém com privilégios suficientes reescreva todos os eventos e hashes.

## Mapa das categorias

| Categoria | Fonte de coleta | Persistência/estado |
| --- | --- | --- |
| 1. Ator individual | `AuthService`, `AuthGuard` e `RequestContext` | `AuditEvent.actorId`; identidade vem do usuário/sessão/credencial validada. |
| 2. Timestamp | `AuditEventsService.recordInTransaction()` | `occurredAt` e `createdAt` gerados no servidor como `timestamptz`. |
| 3. Objeto/alvo | Serviços de projetos, requisitos e credenciais | `AuditResourceEvent.resourceType` e `resourceId`. |
| 4. Tipo de operação | Eventos explícitos nos serviços de aplicação | `AuditEvent.eventType` e `AuditResourceEvent.operation`; não inferidos de SQL. |
| 5. Valores anteriores/novos | Serviços capturam antes da escrita e após resultado efetivo | `oldValues` e `newValues` JSONB; chaves sensíveis são redigidas. |
| 6. Sessão/requisição | Middleware HTTP e `AuthGuard` | `sessionId` e `requestId`; tokens não são persistidos. Não há conceito de caso/correlation ID no domínio atual. |
| 7. RBAC | Associação carregada por `ProjectsService.requireRole()` e papel da listagem | `actorRole`; decisões negadas também produzem evento. |
| 8. Aprovador formal | `RequirementsService.decide()` | `approverId`, operação, proposta e snapshots de requisito; autor e decisor são distintos. |
| 9. Integridade | `AuditEventsService` | `sequence` e `hash`; predecessor localizado pela sequência, sem `previousHash` ou tabela extra. |
| 10. Autenticação | `AuthService` e `AuthGuard` | `AuditEvent` mais `AuditAuthEvent`; sucesso/falha, username e ação; sem senha/token. |
| 11. Origem | Middleware HTTP | IP observado por Express e User-Agent em `AuditEvent`. `X-Forwarded-For` não é confiado/configurado; atrás de proxy, o endereço observado pode ser o do proxy. |
| 12. Resultado técnico | Interceptor para respostas concluídas; filtro de exceção para falhas | `AuditEvent.result` inclui outcome e status HTTP observado; não equivale por si só à confirmação de negócio. |
| 13. Estado/decisão | Serviços de requisitos e propostas | Estados/versões anteriores e posteriores em `oldValues`/`newValues`. |
| 14. Meta-auditoria | `AuditQueryService` e `AuditAccessGuard` | Visualização e negação com escopo em `AuditMetaEvent`; sem recursão porque gravar meta-evento não consulta a rota. |

## Consulta e operação

`GET /api/v1/audit/events/:eventId` exige sessão válida e papel administrador em pelo menos um projeto ativo. Retorna HTML escapado com contexto, especialização, sequência, hash e resultado da verificação da cadeia. A consulta efetiva e a autorização negada geram meta-eventos.

Teste de integração PostgreSQL: `test/audit.e2e-spec.ts`. Ele verifica evento de autenticação, snapshot e aprovador, contexto HTTP, concorrência de sequência, HTML/XSS, acesso negado, autenticação/revogação de credencial e alteração deliberada seguida de detecção/restauração do hash.

## Limitações verificadas

- Não existe identificador de caso/correlação distinto de `requestId` e `sessionId`; nenhum foi inventado.
- O PostgreSQL descartável `postgres:16-alpine` não disponibilizou `pgaudit` em `pg_available_extensions`. Consultas SQL diretas não foram coletadas nem testadas. A aplicação cobre chamadas feitas por suas rotas, não acesso externo direto ao banco.
- O IP registrado é o observado pelo Express. Configuração de proxy confiável precisa ser feita conforme a infraestrutura real antes de aceitar cabeçalhos encaminhados.
- A aplicação usa gravação síncrona. Se a persistência de auditoria falhar dentro de uma mutação, a transação de negócio também falha; para eventos fora da transação do domínio, o filtro registra o erro, mas não há outbox/reprocessamento.