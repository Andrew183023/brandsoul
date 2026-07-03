# BrandSoul Legal — SLO/SLA Overview

## Objetivo

Este dashboard fornece a fundação do acompanhamento de SLO/SLA operacional inicial da BrandSoul Legal.

Ele usa preferencialmente as recording rules já consolidadas no Prometheus para medir confiabilidade operacional, latência e razões derivadas, sem criar novas métricas e sem alterar o backend.

Importante:

- este painel representa **SLO operacional inicial**;
- ele **não** representa compromisso contratual formal;
- os thresholds atuais são operacionais e podem evoluir com mais histórico.

## Dependências

O dashboard depende de:

1. datasource Prometheus configurado como `${DS_PROMETHEUS}`;
2. endpoint exportado pelo backend em `/metrics/prometheus`;
3. recording rules em:

`ops/prometheus/rules/brandsoul-legal-recording-rules.yml`

## Painéis incluídos

O dashboard contém:

- 8 painéis `stat`
- 2 painéis `timeseries`
- 1 painel `text/markdown`

Total:

- 11 painéis

## SLOs operacionais iniciais

### 1. Transaction Reliability

- Query: `brandsoul_legal:transaction:failures:increase5m`
- Meta operacional inicial: `0`
- Interpretação: qualquer valor acima de zero indica degradação crítica.

### 2. Rollback Rate

- Query: `brandsoul_legal:transaction:rollbacks:increase5m`
- Meta operacional inicial: `0`
- Interpretação: rollback recorrente indica fragilidade transacional, mesmo quando há recuperação.

### 3. Timeline Write Reliability

- Query: `brandsoul_legal:timeline:write_failures:increase5m`
- Meta operacional inicial: `0`

### 4. Message Failure Ratio

- Query: `brandsoul_legal:message:failure_ratio5m`
- Meta operacional inicial: `< 1%`

### 5. Matching Failure Ratio

- Query: `brandsoul_legal:matching:failure_ratio5m`
- Meta operacional inicial: `< 2%`

### 6. Portal Use Ratio

- Query: `brandsoul_legal:portal:use_ratio10m`
- Meta operacional inicial: `> 30%`

### 7. Canonical Read Latency Avg

- Query: `brandsoul_legal:canonical_read:latency_avg_ms:avg`
- Meta operacional inicial: `< 300ms`

### 8. Canonical Read Latency Max

- Query: `brandsoul_legal:canonical_read:latency_max_ms:max`
- Meta operacional inicial: `< 1000ms`

### 9. Case Throughput

- Queries:
  - `brandsoul_legal:case:created:increase5m`
  - `brandsoul_legal:case:closed:increase5m`

### 10. Assignment Health

- Queries:
  - `brandsoul_legal:assignment:accepted:increase5m`
  - `brandsoul_legal:assignment:rejected:increase5m`
  - `brandsoul_legal:assignment:expired:increase5m`

## Thresholds atuais

### Vermelho imediato

- transaction failures > 0
- timeline write failures > 0

### Faixas percentuais

- message failure ratio:
  - `0.01` amarelo
  - `0.05` vermelho

- matching failure ratio:
  - `0.02` amarelo
  - `0.10` vermelho

- portal use ratio:
  - abaixo de `0.30` indica degradação

### Latência

- canonical read avg:
  - `300ms` amarelo
  - `1000ms` vermelho

- canonical read max:
  - `1000ms` amarelo
  - `3000ms` vermelho

## Variáveis

O dashboard define:

- `tenant_id`
- `entity_id`
- `interval`

Nesta fase, os painéis principais priorizam recording rules globais já agregadas. Por isso, `tenant_id` e `entity_id` ficam como base de evolução futura, enquanto o painel atual permanece mais útil para visão operacional consolidada.

## Como importar no Grafana

1. Abra o Grafana.
2. Vá em `Dashboards` → `New` → `Import`.
3. Selecione:

`ops/grafana/dashboards/brandsoul-legal-slo-sla-overview.json`

4. Associe o datasource Prometheus ao placeholder `${DS_PROMETHEUS}`.
5. Salve o dashboard.

## Limitações atuais

- Não há SLA contratual formalizado neste painel.
- Não há erro budget formal.
- Não há burn rate alerts nesta fase.
- Não há cortes por tenant usando recording rules segmentadas.
- Os thresholds ainda são fundacionais e devem ser revisitados com histórico real.

## Próximos SLOs planejados

Ficam fora desta fase:

- SLO por tenant
- SLO por escritório
- SLO por profissional
- SLA de resposta a mensagens
- SLA de fechamento de caso
- burn rate baseado em error budget
