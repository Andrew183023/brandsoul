# BrandSoul Legal — Operational Overview

## Objetivo

Este dashboard fornece a visão operacional P0 da operação jurídica da BrandSoul Legal usando exclusivamente as métricas já exportadas pelo endpoint Prometheus do backend.

Ele foi desenhado para responder rapidamente:

- se a triagem pública está sofrendo replay, reuso ou bloqueios;
- se o portal está saudável;
- se ciclo de vida, mensagens, assignments, matching e timeline estão fluindo;
- se leituras canônicas e falhas transacionais estão sob controle.

## Datasource esperado

Use um datasource Prometheus no Grafana, referenciado no dashboard por:

`$DS_PROMETHEUS`

O datasource deve apontar para o Prometheus que faz scrape do endpoint:

`/metrics/prometheus`

## Endpoint utilizado

O dashboard consome indiretamente o endpoint autenticado:

`GET /metrics/prometheus`

O backend converte o snapshot interno do `ObservabilityService` para texto Prometheus/OpenMetrics sem alterar os fluxos jurídicos.

## Painéis incluídos

O dashboard inclui os painéis P0 abaixo:

1. Public Triage / Anti-Dup
2. Anti-Spam
3. Portal Health
4. Case Lifecycle
5. Messages
6. Assignment
7. Matching
8. Canonical Read
9. Timeline
10. Transaction / Rollback
11. Operational Failures
12. Canonical Read Latency

## Métricas cobertas

### Public Triage / Anti-Dup

- `public_triage_request_replays_total`
- `public_triage_fingerprint_hits_total`
- `public_triage_fingerprint_reservations_total`
- `public_triage_duplicate_prevented_total`
- `public_triage_case_reused_total`

### Anti-Spam

- `public_triage_spam_allowed_total`
- `public_triage_spam_blocked_total`
- `public_triage_spam_rate_limited_total`
- `public_triage_spam_invalid_payload_total`

### Portal

- `legal_portal_access_created_total`
- `legal_portal_access_used_total`
- `legal_portal_access_invalid_total`
- `legal_portal_access_expired_total`

### Case Lifecycle

- `legal_case_created_total`
- `legal_case_reused_total`
- `legal_case_status_changed_total`
- `legal_case_closed_total`

### Messages

- `legal_message_received_total`
- `legal_message_sent_total`
- `legal_message_failed_total`

### Assignment

- `legal_assignment_created_total`
- `legal_assignment_accepted_total`
- `legal_assignment_rejected_total`
- `legal_assignment_reassigned_total`
- `legal_assignment_expired_total`

### Matching

- `legal_matching_started_total`
- `legal_matching_completed_total`
- `legal_matching_failed_total`

### Canonical Read

- `legal_canonical_read_total`
- `legal_canonical_read_failed_total`
- `legal_canonical_read_duration_ms_avg`
- `legal_canonical_read_duration_ms_max`

### Timeline

- `legal_timeline_events_total`
- `legal_timeline_write_failures_total`

### Transaction / Rollback

- `legal_transaction_failures_total`
- `legal_transaction_rollbacks_total`

## Variáveis

O dashboard define:

- `tenant_id`
- `entity_id`
- `interval`

`tenant_id` e `entity_id` usam `label_values(legal_case_created_total, ...)` como base inicial. `interval` oferece:

- `5m`
- `15m`
- `1h`
- `6h`
- `24h`

## Consultas PromQL

As queries usam o padrão:

`sum(increase(metric_name{tenant_id=~"$tenant_id", entity_id=~"$entity_id"}[$interval]))`

Para métricas agregadas de leitura canônica, o dashboard usa:

- `avg(legal_canonical_read_duration_ms_avg{tenant_id=~"$tenant_id", entity_id=~"$entity_id"})`
- `max(legal_canonical_read_duration_ms_max{tenant_id=~"$tenant_id", entity_id=~"$entity_id"})`

## Métricas planejadas fora do painel ativo

As métricas abaixo permanecem fora do painel ativo nesta fase:

- `legal_matching_queue_depth`
- `public_triage_requests_total`
- `public_triage_valid_total`
- `public_triage_invalid_total`
- `public_triage_case_created_total`
- `legal_structured_identity_used_total`
- `legal_identity_fallback_used_total`

Motivo:

- algumas seguem `planned`;
- outras ainda não estão instrumentadas de forma suficientemente estável para o dashboard P0;
- a prioridade desta fase é estabilizar a fundação visual sobre as métricas já ativas.

## Como importar no Grafana

1. Abra o Grafana.
2. Vá em `Dashboards` → `New` → `Import`.
3. Selecione o arquivo:

`ops/grafana/dashboards/brandsoul-legal-operational-overview.json`

4. Associe o datasource Prometheus ao placeholder `${DS_PROMETHEUS}`.
5. Salve o dashboard.

## Limitações atuais

- `legal_matching_queue_depth` ainda não aparece no painel ativo.
- As métricas de identidade canônica ainda não foram instrumentadas.
- O dashboard não cria alertas nesta fase.
- Não há provisioning automático do Grafana nesta entrega.
- O dashboard depende de labels `tenant_id` e `entity_id` estarem presentes nas séries exportadas para uso pleno dos filtros.
