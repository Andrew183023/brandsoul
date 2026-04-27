# BrandSoul State Transition Matrix

Data: 2026-04-22

Objetivo: fechar a modelagem de estados do sistema BrandSoul antes de novas implementacoes, consolidando uma matriz unica de transicoes para os fluxos principais e uma revisao priorizada dos dead states.

## Escopo

- Interacao publica da entidade no backend TypeScript e frontend React.
- Partial publico e shadow readiness no backend TypeScript.
- Emergencia juridica no fluxo Python + frontend React.
- Agendamento do frontend React ate o backend Python.

## Tipos de estado

- `autoritativo`: o estado efetivo e decidido/persistido no backend ou em resposta oficial do backend.
- `derivado`: o estado nao e a fonte primaria; ele e inferido de outros sinais, contratos, readiness ou combinacoes de flags.
- `UI-local`: o estado existe majoritariamente no React/local state e pode se perder com refresh, remount ou erro de sincronizacao.

## Matriz Unica de Transicoes

### Interacao Publica

| Fluxo | Estado atual | Evento que causa transicao | Proximo estado | Owner do codigo | Tipo | Risco de dead state | Condicao de saida/recuperacao |
|---|---|---|---|---|---|---|---|
| Interacao publica | `presence-loading` | `Promise.all(getEntityPublicPresence, getEntitySocialState, registerEntitySignal(viewed))` resolve | `presence-ready` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `useEffect` de carga inicial | UI-local | Medio | recarregar pagina ou repetir carga com backend disponivel |
| Interacao publica | `presence-loading` | carga inicial falha | `presence-load-failed` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `useEffect` de carga inicial | UI-local | Medio | retry manual, reload, normalizacao de rede/backend |
| Interacao publica | `presence-ready` | usuario envia mensagem valida em `handleSendMessage` | `interaction-requested` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `handleSendMessage` | UI-local | Baixo | conclusao da request ou erro tratado |
| Interacao publica | `interaction-requested` | `requestPublicEntityInteraction` responde com `fallback.occurred=false` | `backend-authoritative` | `backend/src/services/publicEntityInteractionService.ts` / `resolvePublicEntityInteraction`; `backend/src/api/routes/entity.ts` / rota `POST /public/entity/:id/interactions` | Autoritativo | Baixo | novo turno do usuario ou refresh da presenca |
| Interacao publica | `interaction-requested` | `requestPublicEntityInteraction` responde com `fallback.occurred=true` | `backend-fallback` | `backend/src/services/publicEntityInteractionService.ts` / `resolvePublicEntityInteraction`; integracao FlowMind via service summary | Autoritativo | Medio | backend deixa de retornar `fallbackUsed`; nova avaliacao oficial |
| Interacao publica | `interaction-requested` | timeout, 5xx, `PUBLIC_INTERACTION_DISABLED`, `PUBLIC_INTERACTION_UNAVAILABLE` ou erro elegivel em `shouldUseFrontendFallback` | `frontend-operational-fallback` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `settleWithinBudget`, `shouldUseFrontendFallback`; `brandsoul-frontend/src/pages/public-presence/brandSoulPresenceRuntime.ts` / `resolveDegradedResponse` | UI-local | Alto | retry com backend saudavel, recovery explicito ou backoff com nova tentativa autorizada |
| Interacao publica | `interaction-requested` | erro nao elegivel para fallback | `interaction-failed` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `handleSendMessage` | UI-local | Medio | novo envio do usuario, retry manual ou refresh |
| Interacao publica | `backend-authoritative` | enfileiramento de telemetria shadow/partial apos resposta oficial | `shadow-telemetry-pending` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / bloco de telemetry enqueue | Derivado | Medio | telemetria enviada com sucesso ou descartada sem travar UX |
| Interacao publica | `backend-fallback` | resposta oficial degradada ainda aplicada no frontend | `presence-ready` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / aplicacao da resposta oficial | Derivado | Medio | proximo turno bem-sucedido sem fallback |
| Interacao publica | `frontend-operational-fallback` | usuario envia nova mensagem sem recuperacao explicita | `interaction-requested` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `handleSendMessage` | UI-local | Alto | faltam cooldown/backoff/recovery state; hoje depende de nova tentativa manual |

### Partial Publico

| Fluxo | Estado atual | Evento que causa transicao | Proximo estado | Owner do codigo | Tipo | Risco de dead state | Condicao de saida/recuperacao |
|---|---|---|---|---|---|---|---|
| Partial | `partial-not-ready` | shadow readiness fica suficiente | `partial-eligible` | `backend/src/orchestrator/dashboardProjection.ts` / `buildPublicFlowMindShadowReadiness`; `backend/src/services/publicFlowMindPartialService.ts` / `resolvePublicFlowMindPartialConfig` | Derivado | Alto | nova telemetria shadow melhora readiness |
| Partial | `partial-not-ready` | readiness continua abaixo do threshold | `partial-not-ready` | mesmos owners acima | Derivado | Alto | precisa de trafego shadow e melhoria dos indicadores |
| Partial | `partial-eligible` | bucket calculado fica dentro de `rolloutPercentage` | `partial-sampled` | `backend/src/services/publicFlowMindPartialService.ts` / `computePublicFlowMindPartialRolloutBucket`; `backend/src/api/routes/entity.ts` / rota `POST /public/entity/:id/flowmind-partial/evaluate` | Derivado | Medio | request amostrado segue para telemetry |
| Partial | `partial-eligible` | bucket fica fora de `rolloutPercentage` | `partial-unsampled` | mesmos owners acima | Derivado | Alto | novo request cair no bucket amostrado ou rollout aumentar |
| Partial | `partial-sampled` | frontend envia snapshot para `/flowmind-partial/telemetry` | `partial-normal`, `partial-watch`, `partial-degraded` ou `partial-critical` | `backend/src/api/routes/entity.ts` / rota `POST /public/entity/:id/flowmind-partial/telemetry`; `backend/src/services/publicFlowMindPartialService.ts` / `buildPublicFlowMindPartialAggregation`, `applyPublicFlowMindPartialIncidentState` | Autoritativo | Alto | chegada de novas telemetrias recalcula incidente |
| Partial | `partial-sampled` | frontend nao envia telemetria apos evaluate | `partial-sampled-without-telemetry` | `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / fila de telemetry; `backend/src/api/routes/entity.ts` / telemetry path ausente | Derivado | Alto | retry da telemetria, reconciliacao assincrona ou expiracao explicita |
| Partial | `partial-watch` | metricas melhoram em nova agregacao | `partial-normal` | `backend/src/services/publicFlowMindPartialService.ts` / `applyPublicFlowMindPartialIncidentState` | Autoritativo | Medio | nova agregacao saudavel |
| Partial | `partial-watch` | fallback rate/divergencia/inconsistencia pioram | `partial-degraded` ou `partial-critical` | mesmo owner | Autoritativo | Medio | nova agregacao ou acao operacional |
| Partial | `partial-degraded` | policy auto-adjust roda com permissao | `partial-rollout-adjusted` | `backend/src/services/publicFlowMindPartialService.ts` / `applyPublicFlowMindPartialPolicyEvaluation`, `applyPublicFlowMindPartialPolicyAdjustment`, `applyPublicFlowMindPartialOperationalSettingsUpdate` | Autoritativo | Medio | nova configuracao persistida reduz risco |
| Partial | `partial-degraded` ou `partial-critical` | kill switch manual ou rollout zero | `partial-disabled` | `backend/src/api/routes/orchestrator.ts` / rotas de controle operacional; `backend/src/services/publicFlowMindPartialService.ts` / operational settings update | Autoritativo | Medio | reabilitacao manual com readiness suficiente |
| Partial | `partial-disabled` | kill switch desligado, rollout > 0 e readiness `ready` | `partial-eligible` | `backend/src/api/routes/orchestrator.ts`; `backend/src/services/publicFlowMindPartialService.ts` / `resolvePublicFlowMindPartialConfig` | Derivado | Medio | reentrada operacional manual/automatica |
| Partial | `partial-watch/degraded/critical` | telemetria para de chegar por periodo longo | `incident-state-frozen` | `backend/src/services/publicFlowMindPartialService.ts` / incidente persistido depende de novas agregacoes | Autoritativo | Alto | timeout de incidente, invalidacao por staleness ou refresh de telemetry |

### Emergencia Juridica

| Fluxo | Estado atual | Evento que causa transicao | Proximo estado | Owner do codigo | Tipo | Risco de dead state | Condicao de saida/recuperacao |
|---|---|---|---|---|---|---|---|
| Emergencia juridica | `mode-service` | usuario aciona `handleEmergencyMode` | `mode-emergency` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `handleEmergencyMode` | UI-local | Medio | trocar de modo ou resetar conversa |
| Emergencia juridica | `mode-emergency` | pagina detecta persona com `operationMode=guidance` e emergencia habilitada | `guidance-pending` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / efeitos de modo; `brandsoul/models/persona.py` / configuracao da persona | Derivado | Alto | aceitar guidance, sair do modo ou trocar de canal |
| Emergencia juridica | `guidance-pending` | usuario aceita orientacao | `guidance-accepted` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de consentimento | UI-local | Alto | aceite explicito do guidance |
| Emergencia juridica | `guidance-accepted` | proxima mensagem enviada com `guidance_consent=true` | `guidance-active` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `sendUserMessage`; `brandsoul/main.py` / rota `/channel/message` | UI-local | Medio | backend responde com metadata de guidance |
| Emergencia juridica | `guidance-pending` | usuario recusa orientacao | `guidance-declined` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de consentimento | UI-local | Medio | reabrir guidance manualmente ou sair do modo |
| Emergencia juridica | `guidance-active` | backend retorna `guidance_progress`, `guidance_dossier`, `case_checklist`, `case_progress` | `guidance-evidence-collected` ou continua `guidance-active` | `brandsoul/services/channel_service.py` / `handle_channel_message`, `build_guidance_progress`, `build_guidance_dossier`; `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `sendUserMessage` | Derivado | Alto | novas mensagens, checklist evolui ou fluxo fecha |
| Emergencia juridica | `guidance-active` | usuario anexa evidencia ou marca ausencia de evidencia | `guidance-evidence-collected` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de evidencia; `brandsoul/services/channel_service.py` / processamento de metadata | UI-local | Medio | proxima resposta backend consolida checklist |
| Emergencia juridica | `guidance-active` ou `guidance-evidence-collected` | heuristica `should_close_guidance_flow` fecha o guidance | `guidance-flow-closed` | `brandsoul/services/channel_service.py` / `should_close_guidance_flow` | Autoritativo | Alto | novo guidance nao reabre automaticamente; depende de acao manual/contextual |
| Emergencia juridica | `guidance-flow-closed` | `caseProgress.readyForSubmission` ou CTA de encerramento fica habilitado | `case-submit-ready` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / derivacao de CTA; `brandsoul/services/channel_service.py` / `build_case_summary`, `build_guidance_progress` | Derivado | Alto | confirmar submit, retomar guidance ou abandonar fluxo |
| Emergencia juridica | `case-submit-ready` | usuario confirma envio | `case-submitting` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `handleCaseSubmitConfirm` | UI-local | Alto | submit retorna sucesso/erro |
| Emergencia juridica | `case-submitting` | `/case/submit` retorna `status='submitted'` | `case-submitted` | `brandsoul/services/case_service.py` / `submit_case`, `resolve_case_destination`; `brandsoul/main.py` / rota `/case/submit` | Autoritativo | Medio | novo fluxo ou encerramento visual |
| Emergencia juridica | `case-submitting` | `/case/submit` falha | `case-submit-failed` | `brandsoul/services/case_service.py`; `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `handleCaseSubmitConfirm` | UI-local | Medio | retry manual com tenant/slug/payload valido |
| Emergencia juridica | `case-submitted` | frontend faz `setGuidanceConsentState('declined')` apos sucesso | `guidance-visual-closed` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / pos-submit state update | UI-local | Medio | refresh/reconstrucao do estado da conversa |

### Agendamento

| Fluxo | Estado atual | Evento que causa transicao | Proximo estado | Owner do codigo | Tipo | Risco de dead state | Condicao de saida/recuperacao |
|---|---|---|---|---|---|---|---|
| Agendamento | `schedule-disabled` | brand publica carrega com `schedulingConfig.enabled=true` | `schedule-available` | `brandsoul/services/public_brand_service.py`; `brandsoul/main.py` / rotas publicas; `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / carga inicial | Derivado | Baixo | reload com brand/config corrigida |
| Agendamento | `schedule-available` | usuario chama `openScheduleWizard` | `wizard-open` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `openScheduleWizard` | UI-local | Medio | fechar wizard ou concluir fluxo |
| Agendamento | `wizard-open` | `resetScheduleWizard` calcula passo inicial | `step-service`, `step-mode` ou `step-date` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `resetScheduleWizard` | UI-local | Medio | reexecutar reset ou fechar/reabrir wizard |
| Agendamento | `step-service` | usuario seleciona servico | `step-mode` ou `step-date` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de step | UI-local | Medio | escolher servico valido |
| Agendamento | `step-mode` | usuario seleciona modalidade | `step-date` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de step | UI-local | Medio | escolher modalidade permitida |
| Agendamento | `step-date` | usuario escolhe dia valido | `step-time` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de selecao; `brandsoul/services/schedule_service.py` / `fetch_public_schedule_availability` | UI-local | Alto | voltar para data, refetch de availability ou escolher novo dia |
| Agendamento | `step-time` | usuario escolhe slot livre | `step-form` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / handlers de slot; `brandsoul/services/schedule_service.py` / availability | UI-local | Alto | voltar para data, invalidar availability stale, refetch |
| Agendamento | `step-form` | formulario valido e submit acionado | `schedule-submitting` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / submit do wizard | UI-local | Medio | backend responde sucesso/erro |
| Agendamento | `schedule-submitting` | `/schedule/booking` aceita booking | `step-confirm` e `schedule-submitted` visual | `brandsoul/services/schedule_service.py` / `submit_schedule_booking`; `brandsoul/main.py` / rota `/schedule/booking`; `brandsoul-frontend/src/lib/scheduleApi.ts` | Autoritativo + UI-local | Medio | usuario sai do wizard, reseta estado ou inicia novo booking |
| Agendamento | `schedule-submitting` | `/schedule/booking` rejeita booking | `schedule-submit-failed` | `brandsoul/services/schedule_service.py`; `brandsoul-frontend/src/pages/CustomerChatPage.tsx` | UI-local | Medio | corrigir payload, refetch availability, retry |
| Agendamento | `step-confirm` | usuario nao fecha wizard nem reseta estado | `step-confirm-persistent` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / estado local de confirmacao | UI-local | Medio | CTA de fechar, timeout visual ou reset explicito |
| Agendamento | `step-time` | availability envelhece apos outra reserva/tempo de uso | `step-time-stale` | `brandsoul-frontend/src/pages/CustomerChatPage.tsx`; `brandsoul/services/schedule_service.py` / `fetch_public_schedule_availability` | Derivado | Alto | refetch before submit, TTL de availability ou invalidacao apos erro de conflito |

## Checklist de Correcao Arquitetural

Objetivo: transformar os 5 dead states mais perigosos em um plano objetivo de correcao, sem reescrita ampla e sem implementacao imediata.

## Prioridade Critica

### 1. `incident-state-frozen`

1. Nome do estado: `incident-state-frozen`
2. Por que e perigoso: o incidente operacional continua autoritativo mesmo quando a telemetria deixou de chegar, entao o sistema pode tomar decisoes e expor dashboards com base em um estado vencido.
3. Impacto no produto: leituras falsas de saude, risco de kill switch/manual intervention desnecessaria e perda de confianca na governanca do partial.
4. Owner do codigo: `backend/src/services/publicFlowMindPartialService.ts` / `applyPublicFlowMindPartialIncidentState`; `backend/src/api/routes/entity.ts` / telemetry path; `backend/src/orchestrator/dashboardProjection.ts` / leitura de readiness.
5. Causa estrutural provavel: o incidente e recalculado quando chega telemetria, mas nao existe invalidacao temporal explicita para sinalizar staleness.
6. Correcao minima recomendada: introduzir janela de validade do incidente e transicao explicita para `stale` ou equivalente quando o ultimo snapshot ultrapassar o TTL operacional.
7. Tipo de correcao: `arquitetural`, `timeout/recovery`
8. Risco de regressao: medio, porque altera a semantica de leitura operacional e pode afetar dashboards e automacoes de rollout.
9. Dependencias: definicao do TTL operacional; ajuste de projeção/dashboard para distinguir `degraded` de `stale`; alinhamento do contrato de leitura operacional.
10. Criterio de aceite: um incidente sem telemetria nova dentro da janela definida deixa de ser tratado como incidente ativo e passa a aparecer explicitamente como estado stale/invalido em backend e dashboard.

### 2. `partial-sampled-without-telemetry`

1. Nome do estado: `partial-sampled-without-telemetry`
2. Por que e perigoso: o request entra no partial, mas o sistema de governanca nao recebe o snapshot que deveria atualizar incidente, divergencia e fallback rate.
3. Impacto no produto: o trafego real passa pelo experimento sem retroalimentar a governanca, o que distorce readiness, rollout e decisao operacional.
4. Owner do codigo: `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / fila de telemetry; `backend/src/api/routes/entity.ts` / `POST /public/entity/:id/flowmind-partial/telemetry`; `backend/src/services/publicFlowMindPartialService.ts` / agregacao partial.
5. Causa estrutural provavel: o fluxo de partial depende de dois passos frouxamente acoplados, `evaluate` e depois `telemetry`, sem reconciliacao obrigatoria se o segundo passo falhar.
6. Correcao minima recomendada: adicionar reconciliacao pequena e segura, como reenvio assinado/associado ao `evaluate`, expiracao do sampled pendente e rotina de compensacao para telemetry ausente.
7. Tipo de correcao: `arquitetural`, `contrato`, `timeout/recovery`
8. Risco de regressao: medio-alto, porque mexe no contrato entre frontend e backend do partial e pode impactar contagem/duplicacao se nao houver idempotencia.
9. Dependencias: identificador idempotente por request sampled; regra clara de expiracao; ajuste de backend para aceitar reconciliacao sem duplicar agregacoes.
10. Criterio de aceite: toda entrada sampled termina em uma destas saidas observaveis: telemetry consolidada, reconciliacao automatica ou expiracao marcada explicitamente como perdida, sem permanecer silenciosamente pendente.

### 3. `frontend-operational-fallback`

1. Nome do estado: `frontend-operational-fallback`
2. Por que e perigoso: o usuario pode cair repetidamente em resposta degradada local sem indicacao clara de recuperacao, enquanto o caminho autoritativo continua falhando ou oscilando.
3. Impacto no produto: UX inconsistente, mascaramento de indisponibilidade real e perda de observabilidade sobre quando o backend voltou a responder de forma oficial.
4. Owner do codigo: `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `handleSendMessage`, `settleWithinBudget`, `shouldUseFrontendFallback`; `brandsoul-frontend/src/pages/public-presence/brandSoulPresenceRuntime.ts` / `resolveDegradedResponse`.
5. Causa estrutural provavel: fallback hoje e tratado como escape local por request, sem estado de recovery, sem cooldown/backoff e sem handoff claro de volta ao backend autoritativo.
6. Correcao minima recomendada: introduzir estado de recovery curto com backoff e retry orientado, limitando fallback em sequencia e sinalizando retorno ao backend quando uma chamada oficial voltar a responder.
7. Tipo de correcao: `fluxo`, `timeout/recovery`
8. Risco de regressao: medio, porque muda a experiencia do chat publico e pode afetar budgets/latencia percebida.
9. Dependencias: definicao de cooldown local; telemetria de fallback consecutivo; criterio unico para sair de fallback e voltar a `backend-authoritative`.
10. Criterio de aceite: sequencias de falha elegivel nao entram em loop silencioso; o frontend indica fallback temporario, aplica backoff e retorna automaticamente ao fluxo oficial quando houver resposta saudavel do backend.

## Prioridade Alta

### 4. `step-time-stale`

1. Nome do estado: `step-time-stale`
2. Por que e perigoso: o usuario escolhe um slot possivelmente vencido, e a invalidez so aparece tarde, perto do submit ou apos conflito no backend.
3. Impacto no produto: erro em momento sensivel, percepcao de agenda inconsistente e risco de frustracao em fluxo de conversao alta.
4. Owner do codigo: `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / steps do wizard; `brandsoul/services/schedule_service.py` / `fetch_public_schedule_availability`, `submit_schedule_booking`; `brandsoul-frontend/src/lib/scheduleApi.ts`.
5. Causa estrutural provavel: a disponibilidade e consumida como snapshot local sem TTL curto nem revalidacao obrigatoria antes da reserva final.
6. Correcao minima recomendada: adicionar validade curta para availability, invalidacao ao voltar do background/navegacao prolongada e revalidacao leve do slot antes do submit final.
7. Tipo de correcao: `contrato`, `timeout/recovery`
8. Risco de regressao: medio, porque pode aumentar refetch e expor conflitos que hoje ficam mascarados ate etapas tardias.
9. Dependencias: TTL de availability acordado entre frontend e backend; endpoint ou regra de revalidacao leve; tratamento claro para conflito de slot no wizard.
10. Criterio de aceite: slot selecionado ha mais tempo que o TTL nao pode ser submetido sem revalidacao; conflitos sao detectados antes ou no submit com caminho claro de retorno para reescolha.

## Prioridade Media

### 5. `case-submit-ready`

1. Nome do estado: `case-submit-ready`
2. Por que e perigoso: ele parece fim natural do guidance, mas ainda nao representa caso oficialmente submetido, entao o fluxo pode ficar parado no limiar sem conclusao operacional.
3. Impacto no produto: falsa sensacao de encerramento para o usuario, pendencia invisivel para operacao e abandono de casos que pareciam prontos.
4. Owner do codigo: `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / derivacao de CTA e `handleCaseSubmitConfirm`; `brandsoul/services/channel_service.py` / `build_case_summary`, `build_guidance_progress`; `brandsoul/services/case_service.py` / `submit_case`.
5. Causa estrutural provavel: o readiness do submit e derivado no frontend a partir de sinais do guidance, mas nao existe drenagem explicita desse estado com reminder, rascunho ou expiracao.
6. Correcao minima recomendada: tratar `case-submit-ready` como pendencia operacional explicita, com reminder leve, banner de estado e opcao de retomar ou submeter depois sem parecer encerrado.
7. Tipo de correcao: `fluxo`, `timeout/recovery`
8. Risco de regressao: baixo-medio, porque a mudanca e pequena e concentrada na orquestracao do fechamento do guidance.
9. Dependencias: evento visual ou metadata de pendencia; regra simples de expiracao/inatividade; alinhamento entre frontend e backend para retomar draft sem perda de contexto.
10. Criterio de aceite: quando o fluxo chega em `case-submit-ready`, o usuario enxerga claramente que o caso ainda nao foi enviado, pode retomá-lo depois e o estado nao fica invisivelmente preso sem CTA de saida.

### Observacao de prioridade

- Nenhum dos 5 dead states prioritarios foi rebaixado para correcoes cosméticas; todos merecem tratamento real.
- `case-submit-ready` fica em prioridade media apenas relativa aos demais porque admite mitigacao segura com ajuste menor de fluxo, sem depender de mudanca estrutural ampla.
- Se houver capacidade para apenas 3 correcoes antes de novas features, a ordem recomendada e: `incident-state-frozen`, `partial-sampled-without-telemetry`, `frontend-operational-fallback`.

## Ordem de Execucao por Sprint

Objetivo: definir a sequencia mais segura para atacar os 5 dead states prioritarios com baixo risco de regressao e sem reescrita ampla.

## Analise de Ordem por Item

### `incident-state-frozen`

1. Dependencia tecnica: definicao do TTL operacional e ajuste da leitura backend/dashboard para distinguir `active incident` de `stale incident`.
2. Risco de regressao: medio, porque altera a interpretacao de saude operacional e pode impactar automacao e observabilidade.
3. Impacto sistemico: alto, porque corrige a fonte autoritativa usada para leitura de estado do partial e reduz decisao operacional baseada em dado vencido.
4. Desbloqueia outros itens: sim, principalmente `partial-sampled-without-telemetry`, porque separa corretamente "faltou telemetria recente" de "incidente real ainda ativo".
5. Deve entrar antes ou depois de outro: deve entrar antes de `partial-sampled-without-telemetry`, para que a reconciliacao do partial seja desenhada sobre uma semantica de incidente ja estabilizada.

### `partial-sampled-without-telemetry`

1. Dependencia tecnica: identificador idempotente por request sampled, regra de expiracao e reconciliacao backend para telemetry ausente.
2. Risco de regressao: medio-alto, porque toca contrato frontend/backend e pode gerar duplicidade de agregacao se entrar sem base idempotente.
3. Impacto sistemico: muito alto, porque afeta diretamente o ciclo de aprendizado e governanca do partial.
4. Desbloqueia outros itens: sim, reduz ruído sobre readiness/incident e melhora a qualidade da leitura operacional usada por suporte e rollout.
5. Deve entrar antes ou depois de outro: deve entrar depois de `incident-state-frozen` e antes de `frontend-operational-fallback`, porque primeiro precisa estabilizar a semantica autoritativa do partial e depois atacar o comportamento do cliente publico em cima dessa base.

### `frontend-operational-fallback`

1. Dependencia tecnica: cooldown local, telemetria de fallback consecutivo e criterio unico para reentrada no caminho autoritativo.
2. Risco de regressao: medio, porque altera UX, timing de retry e comportamento percebido da interacao publica.
3. Impacto sistemico: alto no produto, mas menor no nucleo autoritativo do que os dois itens de partial/governanca.
4. Desbloqueia outros itens: parcialmente, porque reduz mascaramento de falha e facilita observar se a correcao do partial realmente melhorou o comportamento publico.
5. Deve entrar antes ou depois de outro: deve entrar depois de `incident-state-frozen` e `partial-sampled-without-telemetry`, para evitar calibrar fallback do frontend com semantica backend ainda instavel.

### `step-time-stale`

1. Dependencia tecnica: TTL de availability, regra de revalidacao leve e tratamento claro de conflito de slot no submit.
2. Risco de regressao: medio, porque pode aumentar refetch e expor conflitos que hoje nao aparecem cedo.
3. Impacto sistemico: medio-alto, mas localizado no fluxo de agendamento, com pouca dependencia do ecossistema partial/public interaction.
4. Desbloqueia outros itens: nao diretamente, mas isola um fluxo de agendamento com risco alto de friccao sem competir com os ajustes estruturais do partial.
5. Deve entrar antes ou depois de outro: deve entrar depois do bloco de partial/fallback, porque e relativamente independente e nao desbloqueia os itens mais sistemicos.

### `case-submit-ready`

1. Dependencia tecnica: metadata de pendencia, regra simples de expiracao/inatividade e alinhamento leve para retomada de draft.
2. Risco de regressao: baixo-medio, porque o ajuste e mais de drenagem de fluxo do que de semantica autoritativa central.
3. Impacto sistemico: medio, com impacto claro no fluxo juridico, mas menor efeito cascata sobre os outros dominios.
4. Desbloqueia outros itens: nao diretamente; serve mais como endurecimento de UX/operacao antes de ampliar features de guidance.
5. Deve entrar antes ou depois de outro: deve entrar depois dos itens criticos e pode compartilhar sprint com `step-time-stale` se a capacidade estiver folgada, mas com prioridade relativa menor.

## Sprint 1

- Objetivo do sprint: estabilizar a semantica autoritativa do partial para que o sistema deixe de interpretar telemetria ausente como incidente ativo indefinidamente.
- Itens incluidos:
	- `incident-state-frozen`
- Justificativa da ordem: este item mexe na base de leitura operacional. Corrigir primeiro o estado autoritativo reduz ambiguidade e evita que os sprints seguintes construam reconciliacao e recovery em cima de uma noção instavel de incidente.
- Risco principal: dashboards, alertas e automacoes podem mudar de comportamento ao diferenciar `stale` de `active incident`.
- Criterio de saida do sprint: existe semantica temporal explicita para incidente stale, o backend deixa de manter incidente ativo sem telemetria recente e o dashboard reflete essa distinção sem quebrar leitura operacional.

## Sprint 2

- Objetivo do sprint: fechar o ciclo do partial e reduzir mascaramento de falha no fluxo publico sem ampliar escopo para reescrita.
- Itens incluidos:
	- `partial-sampled-without-telemetry`
	- `frontend-operational-fallback`
- Justificativa da ordem: primeiro sprinta a confiabilidade do caminho sampled/telemetry, que corrige a retroalimentacao do sistema. Na mesma janela, atacar o fallback do frontend passa a ser mais seguro, porque o backend ja entrega uma base mais confiavel para calibrar recovery e observar melhora real. Esses dois itens juntos fecham a principal fronteira fragil entre backend autoritativo e reconciliacao tardia pelo cliente.
- Risco principal: alterar contrato do partial e comportamento de fallback no mesmo sprint pode gerar ruído de observabilidade se nao houver idempotencia e telemetria suficiente.
- Criterio de saida do sprint: requests sampled nao ficam silenciosamente pendentes sem telemetry consolidada/reconciliada/expirada, e o frontend nao entra em loop silencioso de fallback, exibindo recovery/backoff e retorno claro ao caminho autoritativo.

### Inicio do Sprint 2: `partial-sampled-without-telemetry`

Objetivo imediato: iniciar o Sprint 2 pelo item `partial-sampled-without-telemetry`, sem abrir ainda a frente `frontend-operational-fallback`, sem mexer em cognicao e sem alterar a ordem global dos sprints.

#### 1. Diagnostico curto

- O sampled request nasce em `POST /public/entity/:id/flowmind-partial/evaluate`, onde o backend calcula `requestId`, `rolloutBucket` e decide se a request entrou no partial.
- Hoje a observabilidade autoritativa so nasce quando o frontend envia `POST /public/entity/:id/flowmind-partial/telemetry`, porque apenas esse caminho persiste `PublicFlowMindPartialTelemetrySnapshot` em `entityProfile.metadata.notes`.
- Se a request e sampled e o POST de telemetry nao chega, o backend nao guarda nenhum registro pendente do sampled. O ciclo fica aberto apenas no cliente e a request pode desaparecer sem consolidacao, reconciliacao nem expiracao observavel.

#### 2. Contrato minimo

- Unidade autoritativa: um `sampled request` identificado por `requestId`, `entityId` e timestamp de sampling.
- Estados/resultados minimos do sampled request:
	- `consolidated`: telemetry valida chegou e foi incorporada uma unica vez na agregacao.
	- `reconciled`: o backend fechou o sampled por compensacao/idempotencia sem nova consolidacao material, deixando rastro operacional explicito.
	- `expired`: a janela de telemetry venceu e o sampled foi encerrado explicitamente como perdido, sem continuar pendente.
	- `missing telemetry`: estado pendente temporario entre `evaluate` e a saida final, visivel apenas enquanto estiver dentro da janela de reconciliacao.
- O que conta como `observavel`:
	- existe registro backend consultavel por `requestId`;
	- existe timestamp de `sampledAt` e de fechamento (`consolidatedAt`, `reconciledAt` ou `expiredAt`);
	- existe classificacao final que o dashboard/backend consegue excluir ou incluir conscientemente nas leituras;
	- existe evidência operacional minima em log, nota persistida ou metrica contavel por estado final.

#### 3. Caminho backend

- Centralizacao recomendada: `backend/src/services/publicFlowMindPartialService.ts`, ao lado de `appendPublicFlowMindPartialTelemetrySnapshot`, porque este service ja e o owner do contrato partial, da agregacao e da persistencia em `metadata.notes`.
- Correcao minima de arquitetura: introduzir um registro backend de sampled pendente, separado do snapshot consolidado, com helpers de `append/list/reconcile/expire` por `requestId`.
- O `evaluate` deve passar a persistir esse sampled pendente no momento em que retorna `sampled: true`; o `telemetry` deve consumir esse registro com idempotencia e promover para `consolidated` ou `reconciled` sem duplicar agregacao.
- A agregacao e o dashboard devem ler apenas sampled observavel fechado ou pendencia explicitamente classificada, nunca depender da fila do frontend como fonte de verdade.
- O frontend continua apenas como emissor de telemetry; a reconciliação, expiracao e idempotencia ficam no backend para evitar duplicacao de regra e divergencia de estados entre cliente e servidor.

#### 4. Cobertura minima

- `sampled consolidado`: `evaluate` sampled seguido de `telemetry` fecha em `consolidated` e atualiza agregacao uma unica vez.
- `sampled expirado`: `evaluate` sampled sem telemetry dentro da janela vira `expired` explicitamente e deixa de aparecer como pendencia invisivel.
- `sampled duplicado/idempotente`: replay do mesmo `requestId` em telemetry nao duplica contadores nem reabre estado ja fechado.
- `sampled sem telemetry detectavel`: leitura backend/dashboard encontra `missing telemetry` apenas dentro da janela de reconciliacao e depois observa fechamento por `expired` ou `reconciled`.

#### 5. Criterios de aceite

- Nenhum sampled fica invisivel: toda request sampled possui registro backend e converge para `consolidated`, `reconciled` ou `expired`.
- Readiness e incidents nao sao contaminados por sampled sem destino: requests em `missing telemetry` ou `expired` nao entram como telemetria consolidada nem congelam incidente/risk score.
- O dashboard passa a refletir so sampled observavel: agregacoes e contagens exibem apenas snapshots consolidados e, quando necessario, pendencias/expiracoes explicitamente classificadas fora da leitura de saude ativa.

#### 6. Restricoes

- Nao abrir `frontend-operational-fallback` ainda; esse item continua na ordem do Sprint 2, mas fora do escopo imediato desta entrada.
- Nao mexer em cognicao nem no resolver de decisao; o trabalho fica restrito ao contrato operational/backend do public partial.
- Nao alterar a ordem dos sprints; apenas detalhar o primeiro passo de execucao dentro do Sprint 2 ja definido.

## Sprint 3

- Objetivo do sprint: endurecer fluxos de conversao localizados com baixo acoplamento sistêmico, reduzindo friccao tardia sem tocar a espinha dorsal do partial.
- Itens incluidos:
	- `step-time-stale`
	- `case-submit-ready`
- Justificativa da ordem: ambos sao fluxos mais localizados e com menor efeito cascata. Depois de estabilizar partial e fallback publico, faz sentido atacar agendamento e guidance juridico, que pedem correcoes pequenas e seguras de timeout/recovery/drenagem. `step-time-stale` vem com peso ligeiramente maior dentro do sprint por risco de conversao e conflito de disponibilidade; `case-submit-ready` entra depois por depender mais de organizacao de fluxo do que de contrato central.
- Risco principal: multiplicar pequenos mecanismos de timeout/expiracao sem padrao de UX pode gerar comportamentos inconsistentes entre wizard e guidance.
- Criterio de saida do sprint: slots vencidos nao chegam ao submit sem revalidacao e o guidance juridico nao termina preso em falso encerramento; ambos os fluxos passam a ter saida explicita, retomada clara e menor chance de estado invisivelmente parado.

## Plano de Validacao por Sprint

Objetivo: transformar cada criterio de saida em validacao objetiva antes de implementar qualquer task, preservando a ordem dos sprints e focando em sinais praticos e seguros.

## Validacao do Sprint 1

1. Objetivo de validacao: comprovar que `incident-state-frozen` deixa de ser tratado como incidente ativo quando a telemetria envelhece e que a leitura operacional distingue claramente `active` de `stale`.
2. Estados afetados: `partial-watch`, `partial-degraded`, `partial-critical`, `incident-state-frozen`, estado derivado/operacional `stale` ou equivalente no dashboard.
3. Sinal esperado de sucesso: um incidente previamente ativo deixa de aparecer como ativo apos a janela de validade, sem apagar telemetria historica e sem colapsar a leitura de readiness atual.
4. Risco principal de regressao: dashboards, regras operacionais ou ajustes automaticos passarem a interpretar `stale` como `normal` em vez de `invalid/expired`.
5. Testes necessarios:
	- Unitarios: calculo de TTL/staleness; transicao de incidente ativo para stale; nao regressao para incidente com telemetria recente.
	- Integracao: caminho `telemetry -> aggregation -> dashboardProjection`; leitura da projeção com ultimo snapshot dentro e fora da janela; comportamento de policy evaluation quando o incidente esta stale.
	- Smoke/manual: simular tenant com incidente aberto, interromper telemetria, validar no dashboard a troca de estado e conferir que alertas/controles nao tratam mais o caso como incidente fresco.
6. Metricas/observabilidade que devem confirmar a correcao: idade do ultimo snapshot por entidade/tenant; contagem de incidentes `active` vs `stale`; numero de policy actions disparadas sobre incidentes stale; logs/eventos de invalidacao temporal.
7. Condicao clara de saida do sprint: existe evidencia de teste automatizado e validacao manual de que incidentes sem telemetria nova mudam explicitamente para stale/invalido, e nenhuma tela ou rotina principal continua lendo esse estado como incidente ativo.

## Validacao do Sprint 2

1. Objetivo de validacao: provar que o ciclo sampled do partial fecha sempre em um destino observavel e que o fallback publico para de entrar em loop silencioso sem recovery explicito.
2. Estados afetados: `partial-sampled`, `partial-sampled-without-telemetry`, `partial-normal/watch/degraded/critical`, `interaction-requested`, `frontend-operational-fallback`, `backend-authoritative`, `backend-fallback`.
3. Sinal esperado de sucesso: requests sampled passam a terminar em `telemetry consolidada`, `reconciliacao` ou `expiracao explicita`, e sequencias de falha publica mostram fallback temporario com backoff e retorno claro ao caminho autoritativo quando o backend volta.
4. Risco principal de regressao: duplicidade de agregacao no partial ou UX mais ruidosa no fluxo publico por retry/cooldown mal calibrado.
5. Testes necessarios:
	- Unitarios: idempotencia de request sampled; regra de expiracao/reconciliacao; logica de cooldown/backoff do fallback; criterio de saida de fallback para `backend-authoritative`.
	- Integracao: `evaluate -> telemetry` com sucesso, perda de telemetry e reconciliacao; `POST /public/entity/:id/interactions` em timeout/5xx seguido de recuperacao; verificacao de que uma mesma request sampled nao atualiza agregacao duas vezes.
	- Smoke/manual: simular falha elegivel no backend publico, observar fallback temporario no frontend, repetir tentativa apos backoff e validar retorno ao fluxo oficial; simular sampled sem telemetry e confirmar que o painel operacional mostra reconciliado ou expirado, nunca silenciosamente pendente.
6. Metricas/observabilidade que devem confirmar a correcao: taxa de sampled sem telemetry final; contagem de reconciliacoes bem-sucedidas; taxa de expiracao de sampled pendente; numero de fallbacks consecutivos por sessao; tempo medio de retorno de `frontend-operational-fallback` para `backend-authoritative`; divergencia entre sampled requests e telemetry consolidada.
7. Condicao clara de saida do sprint: nao existe request sampled sem destino observavel apos a janela definida, e o frontend deixa de repetir fallback silencioso, exibindo recovery/backoff e retorno verificavel ao backend autoritativo quando ha recuperacao.

## Validacao do Sprint 3

1. Objetivo de validacao: garantir que estados locais de alta friccao nao avancem com dados vencidos nem fiquem presos sem saida operacional clara.
2. Estados afetados: `step-time`, `step-time-stale`, `schedule-submitting`, `schedule-submit-failed`, `case-submit-ready`, `case-submitting`, `case-submitted`, estados de pendencia/retomada do guidance.
3. Sinal esperado de sucesso: slots vencidos nao chegam ao submit sem revalidacao e o usuario juridico nunca interpreta `case-submit-ready` como envio concluido; ambos os fluxos apresentam retomada ou retorno claros.
4. Risco principal de regressao: excesso de expiracoes ou revalidacoes criar friccao desnecessaria e inconsistencias de UX entre wizard de agendamento e guidance juridico.
5. Testes necessarios:
	- Unitarios: TTL da availability; regra de invalidação ao reenfocar/retomar fluxo; derivacao visual/operacional de `case-submit-ready`; CTA/reminder/expiracao do draft juridico.
	- Integracao: `fetch_public_schedule_availability -> selecionar slot -> submit` com slot valido e slot vencido; `guidance-flow-closed -> case-submit-ready -> case-submitting`; retomada de draft juridico apos inatividade.
	- Smoke/manual: abrir wizard, esperar o slot envelhecer e confirmar revalidacao obrigatoria antes do booking; fechar ou abandonar fluxo juridico em `case-submit-ready` e validar que a UI retorna com banner/pendencia clara, sem sugerir envio concluido.
6. Metricas/observabilidade que devem confirmar a correcao: taxa de conflito de slot detectado antes do submit vs no submit; idade media da availability no momento da reserva; tempo medio em `case-submit-ready`; numero de casos prontos nao submetidos apos janela de inatividade; taxa de retomada de draft juridico.
7. Condicao clara de saida do sprint: availability vencida nao e submetida sem revalidacao, `case-submit-ready` passa a ser visivelmente pendente e retomavel, e os dois fluxos mostram saida explicita sem estados locais invisivelmente presos.

## Casos de Teste Detalhados por Sprint

Objetivo: transformar cada criterio de validacao em cenarios de teste claros e executaveis por endpoint, por tela e por transicao de estado.

## Sprint 1

### Item: `incident-state-frozen`

### Testes por endpoint (backend)

#### Cenario 1. Expiracao de incidente sem telemetria recente

1. Nome do cenario de teste: Expirar incidente ativo apos TTL sem telemetria
2. Fluxo: dashboard / partial operacional
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/telemetry`; leitura operacional projetada por `backend/src/orchestrator/dashboardProjection.ts`
4. Pre-condicao do sistema: entidade com incidente `watch`, `degraded` ou `critical` previamente consolidado e ultimo snapshot mais antigo que o TTL operacional definido
5. Acao do usuario ou evento: leitura do dashboard/projecao operacional sem chegada de nova telemetria
6. Resposta esperada do backend: a projeção deixa de devolver incidente ativo e passa a sinalizar `stale`, `expired` ou equivalente sem reclassificar como `normal`
7. Estado esperado apos execucao: `incident-state-frozen` deixa de ser lido como incidente ativo; estado operacional passa a `stale`/invalido
8. Sinal de erro se falhar: dashboard continua mostrando `critical/degraded/watch` como vigente apesar da telemetria vencida
9. Evidencia observavel (UI, log, métrica): dashboard com badge/estado stale; log de invalidacao temporal; métrica de incidentes `stale` incrementada
10. Tipo de teste: `integracao`

#### Cenario 2. Telemetria recente nao deve expirar incidente valido

1. Nome do cenario de teste: Preservar incidente ativo com snapshot dentro da janela
2. Fluxo: dashboard / partial operacional
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/telemetry`
4. Pre-condicao do sistema: incidente consolidado e ultimo snapshot dentro do TTL operacional
5. Acao do usuario ou evento: leitura imediata da projeção operacional
6. Resposta esperada do backend: incidente permanece `watch`, `degraded` ou `critical` conforme agregacao vigente
7. Estado esperado apos execucao: incidente continua ativo e nao migra para stale
8. Sinal de erro se falhar: backend devolve estado `stale` com telemetria ainda fresca
9. Evidencia observavel (UI, log, métrica): projeção coerente com timestamp recente; ausencia de log de expiracao; métrica de stale inalterada
10. Tipo de teste: `unitario`

### Testes por tela (frontend)

#### Cenario 3. Dashboard distingue incidente stale de incidente normalizado

1. Nome do cenario de teste: Exibir stale como pendencia operacional, nao como normalizacao
2. Fluxo: dashboard
3. Endpoint(s) envolvidos: endpoint ou fetch usado pela dashboard projection/orchestrator state
4. Pre-condicao do sistema: backend devolvendo estado stale para entidade previamente em incidente
5. Acao do usuario ou evento: abrir ou atualizar dashboard
6. Resposta esperada do backend: payload com indicador explicito de stale/invalido
7. Estado esperado apos execucao: UI mostra stale como problema de validade de telemetria, nao como saude normal
8. Sinal de erro se falhar: UI traduz stale como `normal`, verde ou pronta para rollout
9. Evidencia observavel (UI, log, métrica): badge textual/visual distinto; ausência de CTA operacional indevido; evento de render de stale
10. Tipo de teste: `manual/smoke`

### Testes de estado (transicoes)

#### Cenario 4. Transicao `partial-critical` -> `stale`

1. Nome do cenario de teste: Invalidar incidente critico vencido sem apagar historico
2. Fluxo: transicao de estado operacional
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/telemetry` como origem do estado; leitura de projeção como verificação
4. Pre-condicao do sistema: entidade em `partial-critical` com histórico preservado e sem telemetria nova apos o TTL
5. Acao do usuario ou evento: passagem do tempo sem novo snapshot
6. Resposta esperada do backend: projeção marca estado stale/invalido e preserva dados históricos para inspeção
7. Estado esperado apos execucao: `partial-critical` deixa de ser estado atual e vira histórico; estado corrente passa a `stale`
8. Sinal de erro se falhar: sistema mantém `partial-critical` como estado corrente indefinidamente
9. Evidencia observavel (UI, log, métrica): timeline/histórico presente; estado atual stale; métrica de incidentes ativos reduzida
10. Tipo de teste: `integracao`

## Sprint 2

### Item: `partial-sampled-without-telemetry`

### Testes por endpoint (backend)

#### Cenario 5. Request sampled com telemetry consolidada

1. Nome do cenario de teste: Fechar ciclo sampled com telemetry bem-sucedida
2. Fluxo: página pública / partial
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/evaluate`; `POST /public/entity/:id/flowmind-partial/telemetry`
4. Pre-condicao do sistema: partial habilitado, readiness suficiente e request bucketizada dentro do rollout
5. Acao do usuario ou evento: frontend chama `evaluate` e em seguida envia `telemetry` correspondente
6. Resposta esperada do backend: `evaluate` retorna sampled ativo; `telemetry` consolida snapshot sem erro e atualiza agregacao uma unica vez
7. Estado esperado apos execucao: `partial-sampled` converge para estado agregado observavel (`normal/watch/degraded/critical`)
8. Sinal de erro se falhar: sampled fica pendente sem consolidacao ou agregacao duplica o mesmo request
9. Evidencia observavel (UI, log, métrica): log com correlation/idempotency key; métrica de sampled reconciliado; contadores de agregacao coerentes
10. Tipo de teste: `integracao`

#### Cenario 6. Request sampled sem telemetry expira ou reconcilia

1. Nome do cenario de teste: Encerrar sampled pendente sem telemetry silenciosa
2. Fluxo: página pública / partial
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/evaluate`; mecanismo backend de reconciliacao/expiracao associado
4. Pre-condicao do sistema: request sampled criada com identificador idempotente e nenhuma telemetry entregue dentro da janela definida
5. Acao do usuario ou evento: expiração da janela de telemetry ou rotina de reconciliacao
6. Resposta esperada do backend: request sampled passa a `expired`, `reconciled` ou equivalente observavel, sem permanecer em limbo
7. Estado esperado apos execucao: `partial-sampled-without-telemetry` nao persiste como estado silencioso
8. Sinal de erro se falhar: request sampled continua sem destino observavel apos o timeout
9. Evidencia observavel (UI, log, métrica): contagem de expiracao/reconciliacao incrementada; log com request id; painel operacional sem pendencia silenciosa
10. Tipo de teste: `integracao`

#### Cenario 7. Idempotencia da telemetry sampled

1. Nome do cenario de teste: Rejeitar ou neutralizar telemetry duplicada do mesmo sampled request
2. Fluxo: página pública / partial
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/telemetry`
4. Pre-condicao do sistema: sampled request previamente consolidada com idempotency key conhecida
5. Acao do usuario ou evento: envio repetido da mesma telemetry
6. Resposta esperada do backend: segunda chamada nao duplica agregacao nem altera contadores indevidamente
7. Estado esperado apos execucao: estado agregado permanece igual ao da primeira consolidacao
8. Sinal de erro se falhar: fallback rate, divergence ou sampled volume sobem artificialmente apos replay da mesma telemetry
9. Evidencia observavel (UI, log, métrica): log de duplicate/no-op; métrica de duplicate telemetry; contadores estaveis
10. Tipo de teste: `unitario`

### Testes por tela (frontend)

#### Cenario 8. Página pública nao deixa sampled invisivelmente pendente

1. Nome do cenario de teste: Encaminhar sampled para destino observavel apos evaluate
2. Fluxo: página pública
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/evaluate`; `POST /public/entity/:id/flowmind-partial/telemetry`
4. Pre-condicao do sistema: partial habilitado e frontend com fila de telemetry ativa
5. Acao do usuario ou evento: usuario envia mensagem que cai em sampled bucket
6. Resposta esperada do backend: `evaluate` confirma sampled; `telemetry` confirma consolidacao ou sistema marca expiracao/reconciliacao
7. Estado esperado apos execucao: a request nao fica em `partial-sampled-without-telemetry`
8. Sinal de erro se falhar: fluxo some da UI e nao aparece nem no backend nem em observabilidade como consolidado/expirado
9. Evidencia observavel (UI, log, métrica): evento de telemetry enfileirada/enviada; painel com sampled reconciliada ou expirada; ausência de limbo operacional
10. Tipo de teste: `manual/smoke`

### Testes de estado (transicoes)

#### Cenario 9. Transicao `partial-sampled` -> `partial-sampled-without-telemetry` bloqueada por expiracao explicita

1. Nome do cenario de teste: Impedir sampled pendente indefinida
2. Fluxo: transicao de estado partial
3. Endpoint(s) envolvidos: `POST /public/entity/:id/flowmind-partial/evaluate`; `POST /public/entity/:id/flowmind-partial/telemetry`
4. Pre-condicao do sistema: sampled request criada e telemetry ausente
5. Acao do usuario ou evento: passagem da janela de telemetry sem consolidacao
6. Resposta esperada do backend: estado sampled pendente recebe destino operacional observavel
7. Estado esperado apos execucao: `partial-sampled-without-telemetry` nao permanece estado final oculto; converge para `expired`/`reconciled`
8. Sinal de erro se falhar: sampled fica invisivelmente aberta e sem qualquer destino operacional
9. Evidencia observavel (UI, log, métrica): log de timeout de sampled; métrica de pending sampled zerando; estado final observavel em painel
10. Tipo de teste: `integracao`

### Item: `frontend-operational-fallback`

### Testes por endpoint (backend)

#### Cenario 10. Recuperacao do caminho autoritativo apos falha elegivel

1. Nome do cenario de teste: Backend volta a responder e encerra fallback do frontend
2. Fluxo: página pública
3. Endpoint(s) envolvidos: `POST /public/entity/:id/interactions`
4. Pre-condicao do sistema: chamadas anteriores para o endpoint falharam com timeout/5xx elegivel para fallback; backend volta a responder normalmente
5. Acao do usuario ou evento: novo envio de mensagem apos janela de backoff
6. Resposta esperada do backend: resposta autoritativa 2xx sem fallback local necessario
7. Estado esperado apos execucao: `frontend-operational-fallback` -> `interaction-requested` -> `backend-authoritative`
8. Sinal de erro se falhar: frontend permanece em fallback apesar de o backend voltar a responder com sucesso
9. Evidencia observavel (UI, log, métrica): logs de recovery; queda em métrica de fallback consecutivo; resposta oficial visivel na UI
10. Tipo de teste: `integracao`

### Testes por tela (frontend)

#### Cenario 11. Fallback temporario com backoff visivel

1. Nome do cenario de teste: Exibir fallback operacional sem loop silencioso
2. Fluxo: página pública
3. Endpoint(s) envolvidos: `POST /public/entity/:id/interactions`
4. Pre-condicao do sistema: endpoint falhando com erro elegivel para fallback e budget de request excedido
5. Acao do usuario ou evento: usuario envia mensagem durante a indisponibilidade
6. Resposta esperada do backend: falha elegivel ou timeout
7. Estado esperado apos execucao: `interaction-requested` -> `frontend-operational-fallback`, com sinal de recovery/backoff antes de nova tentativa
8. Sinal de erro se falhar: a UI responde sempre com fallback sem indicar indisponibilidade temporaria, cooldown ou proxima tentativa
9. Evidencia observavel (UI, log, métrica): banner/status de fallback temporario; log de shouldUseFrontendFallback; métrica de fallback consecutivo por sessão
10. Tipo de teste: `manual/smoke`

#### Cenario 12. Saida do fallback para backend-authoritative

1. Nome do cenario de teste: Retornar ao fluxo oficial apos backend saudavel
2. Fluxo: página pública
3. Endpoint(s) envolvidos: `POST /public/entity/:id/interactions`
4. Pre-condicao do sistema: sessão previamente em fallback operacional e backend já recuperado
5. Acao do usuario ou evento: nova mensagem enviada apos cooldown
6. Resposta esperada do backend: resposta oficial 2xx e payload autoritativo
7. Estado esperado apos execucao: `frontend-operational-fallback` deixa de ser o estado vigente e a sessão volta a `backend-authoritative`
8. Sinal de erro se falhar: mesmo com backend 2xx, a UI continua se comportando como fallback local
9. Evidencia observavel (UI, log, métrica): resposta oficial da entidade; evento de recovery; tempo de retorno ao autoritativo dentro do esperado
10. Tipo de teste: `manual/smoke`

### Testes de estado (transicoes)

#### Cenario 13. Transicao `interaction-requested` -> `frontend-operational-fallback` -> `backend-authoritative`

1. Nome do cenario de teste: Fechar ciclo de falha temporaria com recovery verificavel
2. Fluxo: transicao de estado da página pública
3. Endpoint(s) envolvidos: `POST /public/entity/:id/interactions`
4. Pre-condicao do sistema: primeira tentativa falha de modo elegivel; segunda tentativa ocorre com backend saudavel
5. Acao do usuario ou evento: envio de duas mensagens em sequência respeitando cooldown
6. Resposta esperada do backend: primeira chamada falha; segunda chamada retorna 2xx autoritativo
7. Estado esperado apos execucao: o fluxo percorre fallback temporario e volta ao caminho oficial sem ficar preso
8. Sinal de erro se falhar: transicao para recovery nunca acontece ou fallback torna-se permanente
9. Evidencia observavel (UI, log, métrica): trilha de estados; métrica de recovery; ausencia de fallback infinita
10. Tipo de teste: `integracao`

## Sprint 3

### Item: `step-time-stale`

### Testes por endpoint (backend)

#### Cenario 14. Booking com slot expirado deve ser rejeitado ou revalidado

1. Nome do cenario de teste: Bloquear submit de slot vencido
2. Fluxo: agendamento
3. Endpoint(s) envolvidos: `GET/POST` equivalente de disponibilidade publica via `fetch_public_schedule_availability`; `POST /schedule/booking`
4. Pre-condicao do sistema: availability carregada, slot selecionado e TTL de validade ultrapassado antes do submit
5. Acao do usuario ou evento: usuario tenta concluir booking com slot velho
6. Resposta esperada do backend: conflito, rejeição controlada ou exigencia de revalidacao antes de aceitar reserva
7. Estado esperado apos execucao: `step-time` ou `step-time-stale`, nunca `schedule-submitted`
8. Sinal de erro se falhar: booking aceita slot vencido ou erro opaco sem possibilidade de reescolha
9. Evidencia observavel (UI, log, métrica): log de slot stale/conflict; métrica de conflito detectado; retorno claro para novo slot
10. Tipo de teste: `integracao`

#### Cenario 15. Slot valido dentro do TTL segue normalmente

1. Nome do cenario de teste: Preservar booking valido com availability fresca
2. Fluxo: agendamento
3. Endpoint(s) envolvidos: `fetch_public_schedule_availability`; `POST /schedule/booking`
4. Pre-condicao do sistema: availability fresca e slot livre ainda valido
5. Acao do usuario ou evento: submit normal do wizard
6. Resposta esperada do backend: booking confirmado sem necessidade de revalidacao adicional extraordinaria
7. Estado esperado apos execucao: `schedule-submitting` -> `step-confirm` / `schedule-submitted`
8. Sinal de erro se falhar: backend rejeita slot ainda valido ou força refetch indevido
9. Evidencia observavel (UI, log, métrica): confirmação visível; métrica de booking sucesso; ausencia de erro de stale
10. Tipo de teste: `unitario`

### Testes por tela (frontend)

#### Cenario 16. Wizard invalida slot envelhecido antes do submit

1. Nome do cenario de teste: Revalidar slot envelhecido ao retomar wizard
2. Fluxo: agendamento
3. Endpoint(s) envolvidos: `fetch_public_schedule_availability`; `POST /schedule/booking`
4. Pre-condicao do sistema: usuário abriu wizard, selecionou slot e ficou inativo até ultrapassar o TTL
5. Acao do usuario ou evento: voltar ao wizard e tentar concluir o fluxo
6. Resposta esperada do backend: refetch ou validação que indique slot desatualizado antes do submit final
7. Estado esperado apos execucao: `step-time-stale` ou retorno para `step-time` com nova escolha obrigatoria
8. Sinal de erro se falhar: UI mantém slot antigo como se estivesse válido até receber erro tardio no booking
9. Evidencia observavel (UI, log, métrica): aviso de disponibilidade expirada; nova lista de horários; evento de refetch/revalidation
10. Tipo de teste: `manual/smoke`

### Testes de estado (transicoes)

#### Cenario 17. Transicao `step-time` -> `step-time-stale` -> `step-time`

1. Nome do cenario de teste: Forçar reentrada segura na escolha de horario
2. Fluxo: transicao de estado do agendamento
3. Endpoint(s) envolvidos: `fetch_public_schedule_availability`
4. Pre-condicao do sistema: slot selecionado, TTL vencido e wizard ainda aberto
5. Acao do usuario ou evento: tentativa de avançar com slot antigo
6. Resposta esperada do backend: payload de availability atualizado ou sinal de slot invalido
7. Estado esperado apos execucao: `step-time` migra para `step-time-stale` e depois retorna a `step-time` com nova seleção obrigatória
8. Sinal de erro se falhar: fluxo pula diretamente para `step-form` ou `schedule-submitting` com slot vencido
9. Evidencia observavel (UI, log, métrica): etapa regressa para escolha de horario; log de invalidacao; métrica de stale-before-submit
10. Tipo de teste: `integracao`

### Item: `case-submit-ready`

### Testes por endpoint (backend)

#### Cenario 18. Guidance pronto nao equivale a caso submetido

1. Nome do cenario de teste: Manter separacao entre pronto para submit e submit concluido
2. Fluxo: emergência jurídica
3. Endpoint(s) envolvidos: `POST /channel/message`; `POST /case/submit`
4. Pre-condicao do sistema: guidance encerrado com checklist suficiente para habilitar submit, mas sem chamada a `/case/submit`
5. Acao do usuario ou evento: leitura do estado após fechamento do guidance e antes da confirmação final
6. Resposta esperada do backend: metadata indica prontidão/pêndencia, mas não devolve `submitted`
7. Estado esperado apos execucao: `case-submit-ready`, nunca `case-submitted`
8. Sinal de erro se falhar: backend ou frontend passam a tratar prontidão como caso já enviado
9. Evidencia observavel (UI, log, métrica): metadata de pending submit; ausência de registro de submit_case; métrica de ready-but-not-submitted
10. Tipo de teste: `integracao`

#### Cenario 19. Submit confirmado drena estado ready

1. Nome do cenario de teste: Converter prontidao em caso submetido somente apos confirmacao
2. Fluxo: emergência jurídica
3. Endpoint(s) envolvidos: `POST /case/submit`
4. Pre-condicao do sistema: fluxo em `case-submit-ready` com payload válido
5. Acao do usuario ou evento: confirmação explícita do envio
6. Resposta esperada do backend: resposta `submitted` com destino resolvido e sem ambiguidade de estado intermediário
7. Estado esperado apos execucao: `case-submit-ready` -> `case-submitting` -> `case-submitted`
8. Sinal de erro se falhar: estado ready permanece ativo após sucesso ou submit responde sem drenar a pendência
9. Evidencia observavel (UI, log, métrica): registro de submit_case; UI de sucesso; redução em métrica de ready pendente
10. Tipo de teste: `integracao`

### Testes por tela (frontend)

#### Cenario 20. UI sinaliza pendencia real em `case-submit-ready`

1. Nome do cenario de teste: Exibir caso pronto como pendente, nao concluido
2. Fluxo: emergência jurídica
3. Endpoint(s) envolvidos: `POST /channel/message`; `POST /case/submit` apenas como próximo passo possível
4. Pre-condicao do sistema: guidance fechado e submit habilitado, sem envio ainda realizado
5. Acao do usuario ou evento: usuário observa a tela ou retorna à conversa após inatividade
6. Resposta esperada do backend: metadata continua indicando estado pronto para submit, não submetido
7. Estado esperado apos execucao: UI mostra banner/CTA de pendência e retomada, mantendo `case-submit-ready`
8. Sinal de erro se falhar: a tela sugere encerramento definitivo ou ausência completa de CTA para retomar/submeter
9. Evidencia observavel (UI, log, métrica): banner de pending case; CTA de submit/retomar; métrica de tempo em ready visível
10. Tipo de teste: `manual/smoke`

#### Cenario 21. Retomada de draft juridico apos inatividade

1. Nome do cenario de teste: Retomar pendencia juridica sem perder contexto
2. Fluxo: emergência jurídica
3. Endpoint(s) envolvidos: `POST /channel/message`; `POST /case/submit`
4. Pre-condicao do sistema: conversa saiu de foco enquanto estava em `case-submit-ready`
5. Acao do usuario ou evento: usuário retorna à conversa antes do envio final
6. Resposta esperada do backend: contexto e metadata permitem reconstruir que ainda há caso pronto, porém não submetido
7. Estado esperado apos execucao: `case-submit-ready` continua retomável, com CTA clara para submissão
8. Sinal de erro se falhar: contexto some, CTA desaparece ou usuário precisa reconstruir o fluxo inteiro
9. Evidencia observavel (UI, log, métrica): banner de retomada; estado reidratado; métrica de retomada de draft
10. Tipo de teste: `manual/smoke`

### Testes de estado (transicoes)

#### Cenario 22. Transicao `guidance-flow-closed` -> `case-submit-ready` -> `case-submitted`

1. Nome do cenario de teste: Garantir que o fluxo juridico nao salta do fechamento para sucesso sem confirmacao
2. Fluxo: transicao de estado da emergência jurídica
3. Endpoint(s) envolvidos: `POST /channel/message`; `POST /case/submit`
4. Pre-condicao do sistema: guidance fechado com checklist suficiente e CTA de submit ativa
5. Acao do usuario ou evento: primeiro apenas observar/retomar; depois confirmar submit
6. Resposta esperada do backend: primeira fase mantém pendência; segunda fase confirma `submitted`
7. Estado esperado apos execucao: existe estado intermediário observável `case-submit-ready`, drenado apenas após submit explícito
8. Sinal de erro se falhar: o sistema salta de guidance fechado direto para sucesso ou fica preso em ready após submit concluído
9. Evidencia observavel (UI, log, métrica): trilha de estados; log de ready antes do submit; log de submit_case depois da confirmação
10. Tipo de teste: `integracao`

## Auditoria de Cobertura Atual dos Cenarios

Objetivo: mapear os 22 cenarios detalhados contra a cobertura automatizada/manual atualmente existente no workspace, sem alterar o plano de validacao nem reclassificar a prioridade dos sprints.

Resumo atual:

- Cenarios ja cobertos totalmente: `0`
- Cenarios parcialmente cobertos: `10`
- Cenarios sem cobertura relevante: `12`

## Cenarios Ja Cobertos

- Nenhum dos 22 cenarios esta totalmente coberto hoje de ponta a ponta no nivel exigido pelo plano.

## Cenarios Parcialmente Cobertos

### Cenario 1

1. Nome do cenário: Expirar incidente ativo apos TTL sem telemetria
2. Sprint: `Sprint 1`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `backend/src/services/publicFlowMindPartialService.test.ts`; `backend/src/orchestrator/dashboardProjection.test.ts`
5. Nível de cobertura: `parcial`
6. O que já está coberto: calculo e projeção de `incidentState` em agregacoes normais/criticas; leitura de agregacao parcial no dashboard.
7. O que falta: TTL/staleness explicito, expiracao temporal sem nova telemetria e projeção de `stale` em vez de incidente ativo.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao backend entre telemetry, aggregation e dashboardProjection com tempo controlado`

### Cenario 2

1. Nome do cenário: Preservar incidente ativo com snapshot dentro da janela
2. Sprint: `Sprint 1`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `backend/src/services/publicFlowMindPartialService.test.ts`
5. Nível de cobertura: `parcial`
6. O que já está coberto: manutenção de `enteredAt`/`updatedAt` quando o estado permanece estável; agregações saudáveis e degradadas sem expiração indevida.
7. O que falta: garantia explícita de que snapshot dentro do TTL nunca migra para `stale`.
8. Severidade da lacuna: `media`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `unitario de TTL/staleness com relógio fixo`

### Cenario 5

1. Nome do cenário: Fechar ciclo sampled com telemetry bem-sucedida
2. Sprint: `Sprint 2`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`; `brandsoul-frontend/src/backend-bridge/api/publicFlowMindPartialApi.test.ts`; `backend/src/services/publicFlowMindPartialService.test.ts`
5. Nível de cobertura: `parcial`
6. O que já está coberto: frontend chama `evaluate` e envia `telemetry` no caminho saudável; wrapper da API valida chamadas; agregação backend consolida snapshots e calcula métricas.
7. O que falta: integração real de rota `evaluate -> telemetry`, garantia de consolidação única via backend e evidência operacional de correlação/idempotência.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao backend nas rotas publicas de partial`

### Cenario 8

1. Nome do cenário: Encaminhar sampled para destino observavel apos evaluate
2. Sprint: `Sprint 2`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`
5. Nível de cobertura: `parcial`
6. O que já está coberto: a página pública dispara `evaluate` e `recordPublicEntityFlowMindPartialTelemetry` no fluxo saudável.
7. O que falta: prova de destino observável quando há perda de telemetry, reconciliacao ou expiracao; nenhuma validação de painel/observabilidade/manual flow.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `smoke/manual orientado a observabilidade ou E2E frontend+backend`

### Cenario 10

1. Nome do cenário: Backend volta a responder e encerra fallback do frontend
2. Sprint: `Sprint 2`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`; `backend/src/services/publicEntityInteractionService.test.ts`
5. Nível de cobertura: `parcial`
6. O que já está coberto: caminho saudável autoritativo do backend e fallback local em erro/timeout são cobertos isoladamente.
7. O que falta: recuperação após falha anterior, cooldown/backoff e retorno explícito ao caminho autoritativo na mesma sessão.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao frontend com duas chamadas sequenciais falha->sucesso`

### Cenario 11

1. Nome do cenário: Exibir fallback operacional sem loop silencioso
2. Sprint: `Sprint 2`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`; `brandsoul-frontend/src/pages/public-presence/brandSoulPresenceRuntime.test.ts`
5. Nível de cobertura: `parcial`
6. O que já está coberto: fallback explícito por erro elegível e por timeout; resposta degradada local é renderizada corretamente.
7. O que falta: qualquer noção de backoff visível, cooldown, sinal de recovery ou prevenção de loop silencioso entre múltiplas tentativas.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `manual/smoke frontend com assert de UI de recovery/backoff`

### Cenario 12

1. Nome do cenário: Retornar ao fluxo oficial apos backend saudavel
2. Sprint: `Sprint 2`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`
5. Nível de cobertura: `parcial`
6. O que já está coberto: existe teste do fluxo oficial saudável e testes separados do fallback local.
7. O que falta: exercício da saída de um estado prévio de fallback para `backend-authoritative` na mesma sessão e após cooldown.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao frontend stateful com recuperação pós-fallback`

### Cenario 13

1. Nome do cenário: Fechar ciclo de falha temporaria com recovery verificavel
2. Sprint: `Sprint 2`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `brandsoul-frontend/src/pages/EntityPublicPage.test.tsx`
5. Nível de cobertura: `parcial`
6. O que já está coberto: as extremidades do ciclo existem em testes separados, com entrada em fallback e uso do backend saudável.
7. O que falta: a trilha completa `interaction-requested -> frontend-operational-fallback -> backend-authoritative` em sequência, com métrica/log de recovery.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao frontend com sequência de duas mensagens e tempo controlado`

### Cenario 14

1. Nome do cenário: Bloquear submit de slot vencido
2. Sprint: `Sprint 3`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `brandsoul/tests/test_auth_api.py`
5. Nível de cobertura: `parcial`
6. O que já está coberto: booking válido persiste, retorna `pending`, aparece em `/admin/bookings` e atualiza `/public/brands/:slug/schedule`.
7. O que falta: rejeição ou revalidação de slot expirado/conflitante; hoje não há teste de stale slot nem de conflito controlado.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao Python para booking com slot stale/conflitante`

### Cenario 15

1. Nome do cenário: Preservar booking valido com availability fresca
2. Sprint: `Sprint 3`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `brandsoul/tests/test_auth_api.py`
5. Nível de cobertura: `parcial`
6. O que já está coberto: caminho feliz de `POST /schedule/booking` e leitura de disponibilidade pública atualizada após a reserva.
7. O que falta: semântica explícita de TTL fresco, teste unitário de janela válida e distinção entre slot fresco versus stale.
8. Severidade da lacuna: `media`
9. Se bloqueia encerramento do sprint: `nao`, desde que o cenário stale seja coberto
10. Melhor tipo de teste para fechar a lacuna: `unitario ou integracao curta no schedule_service para frescor de availability`

## Cenarios Sem Cobertura

### Cenario 3

1. Nome do cenário: Exibir stale como pendencia operacional, nao como normalizacao
2. Sprint: `Sprint 1`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há teste de UI para representação de `stale` no dashboard.
7. O que falta: renderização distinta de `stale`, badge/CTA corretos e não regressão para verde/normal.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `manual/smoke de dashboard ou teste de componente da visualização operacional`

### Cenario 4

1. Nome do cenário: Invalidar incidente critico vencido sem apagar historico
2. Sprint: `Sprint 1`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: existe apenas manutenção de incidente estável e troca simples de estado, sem `stale`.
7. O que falta: transição `partial-critical -> stale`, preservação de histórico e remoção do incidente corrente vencido.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao backend com histórico e relógio controlado`

### Cenario 6

1. Nome do cenário: Encerrar sampled pendente sem telemetry silenciosa
2. Sprint: `Sprint 2`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há teste de expiração nem reconciliacao de sampled sem telemetry.
7. O que falta: destino operacional explícito (`expired`/`reconciled`) após a janela sem telemetry.
8. Severidade da lacuna: `critica`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao backend com timeout/reconciliacao`

### Cenario 7

1. Nome do cenário: Rejeitar ou neutralizar telemetry duplicada do mesmo sampled request
2. Sprint: `Sprint 2`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há assert de idempotência em `telemetry` sampled.
7. O que falta: replay da mesma request, comportamento no-op e estabilidade de contadores.
8. Severidade da lacuna: `critica`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `unitario/integracao backend sobre idempotency key`

### Cenario 9

1. Nome do cenário: Impedir sampled pendente indefinida
2. Sprint: `Sprint 2`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há transição de timeout/expiração modelada nos testes.
7. O que falta: bloqueio explícito de `partial-sampled-without-telemetry` como estado final invisível.
8. Severidade da lacuna: `critica`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao de transição com relógio e estado operacional`

### Cenario 16

1. Nome do cenário: Revalidar slot envelhecido ao retomar wizard
2. Sprint: `Sprint 3`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não existe teste automatizado para `CustomerChatPage`, wizard de agenda ou revalidação de slot no frontend.
7. O que falta: refetch/revalidation ao retomar o wizard e aviso visual de disponibilidade expirada.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `manual/smoke ou componente/E2E do wizard de agendamento`

### Cenario 17

1. Nome do cenário: Forçar reentrada segura na escolha de horario
2. Sprint: `Sprint 3`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `nenhum especifico`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: nenhuma transição `step-time -> step-time-stale -> step-time` é exercitada atualmente.
7. O que falta: regressão explícita de etapa, nova escolha obrigatória e bloqueio de avanço com slot antigo.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao frontend stateful do wizard`

### Cenario 18

1. Nome do cenário: Manter separacao entre pronto para submit e submit concluido
2. Sprint: `Sprint 3`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `brandsoul/tests/test_api.py`; `brandsoul/tests/test_auth_api.py`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: `/channel/message` só é testado em bootstrap/contexto básico; não há assert de metadata jurídica de readiness.
7. O que falta: qualquer validação de `case-submit-ready`, metadata de pendência e distinção entre pronto versus submetido.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao Python cobrindo metadata de guidance e pending submit`

### Cenario 19

1. Nome do cenário: Converter prontidao em caso submetido somente apos confirmacao
2. Sprint: `Sprint 3`
3. Tipo: `endpoint/backend`
4. Arquivo(s) de teste existentes: `nenhum`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não existe teste para `POST /case/submit` no workspace atual.
7. O que falta: sucesso do submit, drenagem da pendência `ready`, resolução de destino e resposta `submitted`.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao Python do endpoint /case/submit`

### Cenario 20

1. Nome do cenário: Exibir caso pronto como pendente, nao concluido
2. Sprint: `Sprint 3`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `nenhum`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há testes de `CustomerChatPage` nem de banners/CTA jurídicos.
7. O que falta: banner de pendência, CTA de submit/retomar e ausência de sinal falso de conclusão.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `manual/smoke ou teste de componente de CustomerChatPage`

### Cenario 21

1. Nome do cenário: Retomar pendencia juridica sem perder contexto
2. Sprint: `Sprint 3`
3. Tipo: `tela/frontend`
4. Arquivo(s) de teste existentes: `nenhum`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não existe hidratação/reabertura de draft jurídico coberta por teste.
7. O que falta: retomada após inatividade, reconstrução do estado `case-submit-ready` e preservação do CTA.
8. Severidade da lacuna: `media-alta`
9. Se bloqueia encerramento do sprint: `nao`, mas deixa o encerramento frágil
10. Melhor tipo de teste para fechar a lacuna: `manual/smoke com reidratação de conversa`

### Cenario 22

1. Nome do cenário: Garantir que o fluxo juridico nao salta do fechamento para sucesso sem confirmacao
2. Sprint: `Sprint 3`
3. Tipo: `transição de estado`
4. Arquivo(s) de teste existentes: `nenhum`
5. Nível de cobertura: `inexistente`
6. O que já está coberto: não há teste da trilha `guidance-flow-closed -> case-submit-ready -> case-submitted`.
7. O que falta: estado intermediário observável antes do submit e drenagem correta após confirmação.
8. Severidade da lacuna: `alta`
9. Se bloqueia encerramento do sprint: `sim`
10. Melhor tipo de teste para fechar a lacuna: `integracao ponta a ponta do fluxo jurídico`

## Regra de Sequenciamento

- `incident-state-frozen` deve vir antes de `partial-sampled-without-telemetry`.
- `partial-sampled-without-telemetry` deve vir antes de `frontend-operational-fallback`.
- `frontend-operational-fallback` deve vir antes de ajustes de tuning mais finos da pagina publica.
- `step-time-stale` pode esperar ate o backend/public partial estabilizar, porque nao desbloqueia os itens mais sistemicos.
- `case-submit-ready` deve entrar por ultimo entre os 5 prioritarios, porque tem menor risco estrutural e admite mitigacao segura de fluxo.

## Owners Centrais por Fluxo

- Interacao publica oficial: `backend/src/services/publicEntityInteractionService.ts` / `resolvePublicEntityInteraction`; `backend/src/api/routes/entity.ts`
- Fallback operacional da pagina: `brandsoul-frontend/src/pages/EntityPublicPage.tsx` / `handleSendMessage`, `settleWithinBudget`; `brandsoul-frontend/src/pages/public-presence/brandSoulPresenceRuntime.ts` / `resolveDegradedResponse`
- Partial e incidentes: `backend/src/services/publicFlowMindPartialService.ts` / `resolvePublicFlowMindPartialConfig`, `computePublicFlowMindPartialRolloutBucket`, `applyPublicFlowMindPartialIncidentState`, `applyPublicFlowMindPartialPolicyEvaluation`, `applyPublicFlowMindPartialPolicyAdjustment`
- Shadow readiness: `backend/src/orchestrator/dashboardProjection.ts` / `buildPublicFlowMindShadowReadiness`
- Emergencia juridica: `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `handleEmergencyMode`, `sendUserMessage`, `handleCaseSubmitConfirm`; `brandsoul/services/channel_service.py` / `handle_channel_message`, `should_close_guidance_flow`; `brandsoul/services/case_service.py` / `submit_case`
- Agendamento: `brandsoul-frontend/src/pages/CustomerChatPage.tsx` / `openScheduleWizard`, `resetScheduleWizard`; `brandsoul-frontend/src/lib/scheduleApi.ts`; `brandsoul/services/schedule_service.py` / `fetch_public_schedule_availability`, `submit_schedule_booking`

## Decisao de modelagem antes de novas features

- Nao ampliar partial, fallback publico, emergencia juridica ou agendamento sem antes explicitar staleness, timeout e recovery nos estados destacados.
- O maior risco atual nao e falta de estados; e falta de ciclo de encerramento claro para estados derivados e UI-locais.
- A fronteira mais fragil do sistema hoje e: backend autoritativo parcial + reconciliacao tardia pelo frontend.

