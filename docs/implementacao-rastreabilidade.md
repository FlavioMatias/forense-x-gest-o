# Implementação do modelo prescritivo de rastreabilidade

Este documento relaciona as diretrizes do modelo prescritivo à implementação existente no sistema Forense x Gestão. O foco é o mecanismo de auditoria da API NestJS e sua aplicação ao gerenciamento de projetos, requisitos e credenciais. A descrição distingue os recursos implementados daqueles que permanecem como possibilidades do modelo.

## Visão geral

O mecanismo de auditoria é implementado como um módulo próprio, separado dos serviços de domínio por um contrato (`AuditEventPublisher`). Os serviços publicam eventos de negócio sem depender diretamente das entidades ou da implementação interna do módulo de auditoria. As evidências são persistidas no PostgreSQL e podem ser consultadas por uma rota protegida da API.

O registro é síncrono: quando uma operação de negócio fornece seu `EntityManager`, o evento é gravado na mesma transação; nos demais casos, o módulo abre uma transação própria. Assim, nas operações transacionais integradas, uma falha ao persistir a evidência também impede a confirmação da alteração de negócio.

## Captura

A captura ocorre em diferentes pontos da aplicação, correspondendo às camadas de informação previstas pelo modelo:

| Grupo de informação | Como é obtido |
| --- | --- |
| Rede e requisição | O middleware cria um `requestId` por requisição, devolve-o no cabeçalho `x-request-id` e mantém no contexto o IP observado pelo Express e o `User-Agent`. |
| Sessão e identidade | Os componentes de autenticação e autorização atualizam o contexto com ator, sessão e papel quando esses dados estão disponíveis. Credenciais de integração podem autenticar sem uma sessão de usuário. |
| Aplicação e objeto | Serviços do domínio publicam eventos explícitos para operações relevantes, como alterações em projetos e requisitos, decisões sobre propostas e operações com credenciais. O evento pode indicar o tipo e o identificador do objeto, a operação e os valores anterior e posterior. |
| Integridade e meta-auditoria | O serviço de auditoria calcula o hash de cada registro. A consulta de eventos também gera registros de meta-auditoria para visualizações e acessos negados. |

O interceptor global registra requisições HTTP concluídas com resultado e status HTTP observados. O filtro de exceções registra falhas de requisição; quando a rota é de consulta de auditoria, também caracteriza a ocorrência como tentativa de acesso negado. Esses eventos HTTP complementam os eventos semânticos publicados pelos serviços: o status de uma resposta, isoladamente, não comprova o resultado de negócio.

Os eventos de autenticação incluem ação, usuário quando disponível e indicação de sucesso ou falha. Senhas e tokens não devem ser incluídos nos registros; além dos dados preparados pelos componentes de autenticação, o serviço aplica redação recursiva a campos cujos nomes indicam senha, token, segredo, autorização ou hash.

## Composição

Cada ocorrência possui um evento principal com identificador, sequência, horários de ocorrência e criação, tipo, ator, papel, contexto HTTP, resultado e hash. Quando pertinente, o evento é acompanhado por uma especialização:

- **Recurso:** tipo e identificador do objeto, operação, valores anteriores e novos e, quando aplicável, identificador do aprovador.
- **Autenticação:** usuário, ação e resultado da validação.
- **Meta-auditoria:** ação realizada sobre a auditoria e o escopo correspondente.

Essa composição permite representar o contexto da ocorrência sem exigir que todas as categorias de informação estejam presentes em todos os eventos. Por exemplo, uma leitura HTTP pode não ter dados de alteração de recurso, enquanto uma aprovação de proposta pode registrar o ator decisor, o recurso, os estados anterior e posterior e a requisição associada.

Os valores anteriores e novos são fornecidos pelos serviços no contexto da operação. Eles não são inferidos automaticamente a partir das instruções SQL executadas.

## Correlação

A correlação disponível combina referências temporais e contextuais:

- `requestId` relaciona eventos produzidos durante a mesma requisição;
- `sessionId` e `actorId` relacionam operações ao contexto de autenticação e ao ator, quando conhecidos;
- tipo e identificador do recurso permitem localizar eventos associados ao mesmo objeto;
- horário e sequência permitem ordenar os registros.

A sequência é única e crescente no fluxo de gravação. Um bloqueio consultivo transacional do PostgreSQL serializa a obtenção do próximo número, inclusive quando há gravações concorrentes.

O sistema **não possui um identificador de caso ou de correlação próprio para agrupar requisições diferentes**. Portanto, `requestId` e `sessionId` não devem ser interpretados como substitutos de um identificador de investigação ou de atividade de negócio.

## Armazenamento

Uma migration cria quatro tabelas no PostgreSQL:

- `audit_events`, para os dados comuns e a sequência de registros;
- `audit_resource_events`, para detalhes de operações sobre recursos;
- `audit_auth_events`, para eventos de autenticação;
- `audit_meta_events`, para operações de consulta e acesso à auditoria.

As especializações referenciam o evento principal por chave estrangeira restritiva. Índices apoiam a consulta por ator e horário, e por tipo e identificador de recurso. Os campos estruturados de resultado e de valores anteriores e novos são armazenados como `JSONB`.

A persistência em PostgreSQL permite recuperar os eventos pela aplicação, mas não equivale a um repositório imutável nem define, por si só, política de retenção, cópias de segurança ou acesso operacional direto ao banco. A aplicação não coleta consultas SQL realizadas fora de suas rotas.

## Integridade e meta-auditoria

Cada evento recebe um hash SHA-256 calculado a partir de uma representação canônica dos campos do evento, de seus detalhes e do hash do evento anterior. A representação ordena as chaves dos objetos para tornar o cálculo reproduzível. O primeiro registro usa como predecessor um hash de gênese composto por zeros.

`verifyChain()` percorre a sequência, verifica a numeração e recalcula os hashes, retornando se a cadeia é válida e quais registros apresentam divergências. A consulta de um evento apresenta o resultado dessa verificação junto aos dados consultados.

O encadeamento permite detectar alterações que não tenham sido acompanhadas da recomputação correta dos registros seguintes. Ele não impede que alguém com privilégios suficientes reescreva todos os eventos e hashes; não é uma garantia criptográfica independente, assinatura digital ou armazenamento externo imutável.

A leitura de um evento e a negação de acesso são registradas como eventos de meta-auditoria com ação e escopo. A rota de consulta exige autenticação e que o usuário seja administrador em pelo menos um projeto ativo. O acesso direto ao PostgreSQL não passa por essa autorização nem é coberto pela meta-auditoria da API.

## Análise e utilização

A implementação disponibiliza `GET /api/v1/audit/events/:eventId`, que retorna uma representação HTML do evento, de sua especialização e do estado da verificação da cadeia. A saída escapa caracteres HTML e define uma política de segurança de conteúdo para reduzir a possibilidade de execução de conteúdo fornecido nos dados auditados.

O sistema oferece, portanto, consulta detalhada de um evento e verificação da cadeia. As mesmas evidências podem apoiar leituras gerenciais ou forenses, mas as visualizações têm objetivos distintos: a análise gerencial tende a consolidar atividades e responsabilidades, enquanto a forense examina registros individuais, contexto e sequência temporal.

**Painéis, gráficos, indicadores agregados e navegação de uma visão consolidada até os eventos de origem não estão implementados nessa consulta.** Esses recursos são possibilidades de evolução do modelo, não funcionalidades que devam ser atribuídas ao sistema atual.

## Síntese de aderência

| Diretriz | Implementação observada |
| --- | --- |
| Captura | Contexto HTTP, autenticação, eventos explícitos de domínio, respostas e exceções HTTP. |
| Composição | Evento principal com especializações para recurso, autenticação e meta-auditoria. |
| Correlação | Requisição, sessão, ator, recurso, horário e sequência; sem identificador de caso. |
| Armazenamento | Tabelas relacionais no PostgreSQL, detalhes estruturados em `JSONB` e escrita transacional. |
| Integridade | Hash SHA-256 encadeado e rotina de verificação; não impede reescrita integral por administrador privilegiado. |
| Análise | Consulta HTML protegida de evento individual e resultado da verificação; sem painéis ou agregações gerenciais. |

Para o mapeamento detalhado das categorias de evidência, fontes de coleta e limitações verificadas, consulte [auditoria.md](./auditoria.md).
