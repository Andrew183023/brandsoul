# BrandSoul Legal — Alert Rules Foundation

## Objetivo

Este pacote define a fundação de alertas P0 da operação jurídica da BrandSoul Legal sobre as métricas já exportadas pelo endpoint Prometheus do backend.

O objetivo desta fase é criar um conjunto inicial de regras versionadas para detecção rápida de falhas operacionais relevantes, sem alterar o backend, o exporter ou o dashboard.

## Dependência

As regras dependem do endpoint:

`GET /metrics/prometheus`

O Prometheus deve fazer scrape desse endpoint para que as métricas estejam disponíveis para avaliação das expressões PromQL abaixo.

## Como carregar no Prometheus

1. Copie o arquivo:

`ops/prometheus/rules/brandsoul-legal-alerts.yml`

2. Referencie o arquivo na configuração do Prometheus, em `rule_files`.

3. Recarregue o Prometheus ou reinicie o serviço.

Exemplo conceitual:

```yaml
rule_files:
  - /path/to/brandsoul-legal-alerts.yml
```

## Grupo de regras

As regras estão agrupadas em:

`brandsoul-legal-p0`

com:

- `interval: 30s`

## Alertas incluídos

### 1. BrandSoulLegalTransactionFailures

- Severidade: `critical`
- Área: `transaction`
- Query:

```promql
sum(increase(legal_transaction_failures_total[5m])) > 0
```

### 2. BrandSoulLegalTransactionRollbacks

- Severidade: `warning`
- Área: `transaction`
- Query:

```promql
sum(increase(legal_transaction_rollbacks_total[5m])) > 0
```

### 3. BrandSoulLegalTimelineWriteFailures

- Severidade: `critical`
- Área: `timeline`
- Query:

```promql
sum(increase(legal_timeline_write_failures_total[5m])) > 0
```

### 4. BrandSoulLegalMessageFailures

- Severidade: `warning`
- Área: `message`
- Query:

```promql
sum(increase(legal_message_failed_total[5m])) > 0
```

### 5. BrandSoulLegalCanonicalReadFailures

- Severidade: `warning`
- Área: `canonical_read`
- Query:

```promql
sum(increase(legal_canonical_read_failed_total[5m])) > 0
```

### 6. BrandSoulLegalMatchingFailures

- Severidade: `warning`
- Área: `matching`
- Query:

```promql
sum(increase(legal_matching_failed_total[5m])) > 0
```

### 7. BrandSoulLegalPortalInvalidSpike

- Severidade: `warning`
- Área: `portal`
- Query:

```promql
sum(increase(legal_portal_access_invalid_total[10m])) > 20
```

### 8. BrandSoulLegalPortalExpiredSpike

- Severidade: `info`
- Área: `portal`
- Query:

```promql
sum(increase(legal_portal_access_expired_total[10m])) > 20
```

### 9. BrandSoulLegalSpamBlockSpike

- Severidade: `warning`
- Área: `public_triage`
- Query:

```promql
sum(increase(public_triage_spam_blocked_total[10m])) > 20
```

### 10. BrandSoulLegalSpamRateLimitSpike

- Severidade: `warning`
- Área: `public_triage`
- Query:

```promql
sum(increase(public_triage_spam_rate_limited_total[10m])) > 20
```

### 11. BrandSoulLegalCanonicalReadLatencyHigh

- Severidade: `warning`
- Área: `canonical_read`
- Query:

```promql
max(legal_canonical_read_duration_ms_max) > 1000
```

## Severidades

As severidades usadas nesta fundação são:

- `critical`
- `warning`
- `info`

Critério atual:

- `critical` para falhas que comprometem persistência ou integridade operacional;
- `warning` para degradações relevantes ou picos suspeitos;
- `info` para comportamento anômalo que ainda não implica falha crítica.

## Limitações atuais

- Não há thresholds por tenant.
- Não há recording rules nesta fase.
- Não há correlação por profissional, SLA ou carga operacional.
- As regras operam em agregação global.
- O pacote não inclui integração com Alertmanager nesta entrega.

## Alertas planejados para fases futuras

Ficam explicitamente fora do escopo nesta fase:

- assignment acceptance ratio
- matching no_match ratio
- portal conversion ratio
- case close SLA
- message response SLA
- per-professional workload
- tenant-specific alert thresholds

## Métricas planejadas ainda fora das rules

As métricas abaixo não entram nas regras ativas desta fase:

- `legal_matching_queue_depth`
- `legal_structured_identity_used_total`
- `legal_identity_fallback_used_total`

Motivo:

- permanecem planejadas ou exigem uma modelagem de alerta mais madura antes de uso operacional confiável.
