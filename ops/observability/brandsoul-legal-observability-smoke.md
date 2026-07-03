# BrandSoul Legal — Observability Smoke Test

## Objetivo

Validar rapidamente se a trilha de observabilidade jurídica está operacional do backend até Prometheus e Grafana.

## Pré-requisitos

- backend da BrandSoul Legal acessível
- Prometheus carregado com `ops/prometheus/prometheus.yml`
- rules copiadas para `/etc/prometheus/rules/`
- Grafana com datasource e dashboard provisioning ativos
- credencial interna autorizada para acessar `/metrics/prometheus`

## 1. Endpoint Prometheus do backend

### Sem autenticação

```bash
curl -i http://localhost:10000/metrics/prometheus
```

Esperado:

- `401` sem credencial

### Com autenticação

Exemplo com bearer token interno:

```bash
curl -i \
  -H "Authorization: Bearer <INTERNAL_METRICS_TOKEN>" \
  http://localhost:10000/metrics/prometheus
```

Esperado:

- `200`
- header `Content-Type: text/plain; version=0.0.4`
- presença de métricas `legal_*` e `public_triage_*`

Verificações rápidas:

```bash
curl -s \
  -H "Authorization: Bearer <INTERNAL_METRICS_TOKEN>" \
  http://localhost:10000/metrics/prometheus | grep -E "legal_case_created_total|legal_transaction_failures_total|brandsoul_legal"
```

## 2. Prometheus

Verificar alvo:

```promql
up{job="brandsoul-legal-backend"}
```

Esperado:

- valor `1`

Verificar métrica exportada:

```promql
legal_case_created_total
```

Verificar recording rule:

```promql
brandsoul_legal:transaction:failures:increase5m
```

Verificar alert rule dependente:

```promql
legal_transaction_failures_total
```

## 3. Grafana

Validar:

- datasource `Prometheus` provisionado
- dashboard `BrandSoul Legal — Operational Overview` carregado
- dashboard `BrandSoul Legal — SLO/SLA Overview` carregado
- painéis sem erro de datasource
- variáveis renderizadas

## 4. Dashboards

No dashboard operacional, conferir ao menos:

- `Public Triage / Anti-Dup`
- `Portal Health`
- `Transaction / Rollback`

No dashboard SLO/SLA, conferir ao menos:

- `Transaction Reliability`
- `Message Failure Ratio`
- `Canonical Read Latency Avg`

## 5. Regras

No Prometheus, confirmar carregamento de:

- `brandsoul-legal-alerts.yml`
- `brandsoul-legal-recording-rules.yml`

## Critério de aprovação do smoke

O smoke é considerado aprovado quando:

- `/metrics/prometheus` responde `401` sem auth
- `/metrics/prometheus` responde `200` com auth
- `up{job="brandsoul-legal-backend"} == 1`
- `legal_case_created_total` aparece no Prometheus
- `brandsoul_legal:transaction:failures:increase5m` aparece no Prometheus
- os dois dashboards carregam no Grafana sem erro de datasource
