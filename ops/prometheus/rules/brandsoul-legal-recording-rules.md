# BrandSoul Legal — Recording Rules Foundation

## Objetivo

Este pacote define a fundação de recording rules P0 da BrandSoul Legal para consolidar indicadores operacionais reutilizáveis no Prometheus.

O objetivo é reduzir repetição de PromQL em dashboards e alertas futuros, padronizar nomes derivados e preparar a camada de observabilidade para painéis e regras mais avançadas, sem alterar backend, exporter ou métricas do código.

## Como carregar no Prometheus

1. Copie o arquivo:

`ops/prometheus/rules/brandsoul-legal-recording-rules.yml`

2. Adicione-o em `rule_files` na configuração do Prometheus.

3. Recarregue o Prometheus ou reinicie o serviço.

Exemplo conceitual:

```yaml
rule_files:
  - /path/to/brandsoul-legal-recording-rules.yml
```

## Grupo de regras

As regras estão agrupadas em:

`brandsoul-legal-recording-p0`

com:

- `interval: 30s`

## Convenção de nomes

As recording rules usam o prefixo:

`brandsoul_legal:`

Padrões adotados nesta fase:

- `brandsoul_legal:<area>:<metric>:increase5m`
- `brandsoul_legal:<area>:<metric>:increase10m`
- `brandsoul_legal:<area>:<metric>:ratio5m`
- `brandsoul_legal:<area>:<metric>:ratio10m`
- `brandsoul_legal:<area>:<metric>:avg`
- `brandsoul_legal:<area>:<metric>:max`

Exemplos:

- `brandsoul_legal:transaction:failures:increase5m`
- `brandsoul_legal:portal:invalid_access:increase10m`
- `brandsoul_legal:canonical_read:latency_max_ms:max`

## Recording rules incluídas

### Transaction

- `brandsoul_legal:transaction:failures:increase5m`
- `brandsoul_legal:transaction:rollbacks:increase5m`

### Timeline

- `brandsoul_legal:timeline:write_failures:increase5m`

### Message

- `brandsoul_legal:message:failed:increase5m`
- `brandsoul_legal:message:received:increase5m`
- `brandsoul_legal:message:sent:increase5m`
- `brandsoul_legal:message:failure_ratio5m`

### Portal

- `brandsoul_legal:portal:invalid_access:increase10m`
- `brandsoul_legal:portal:expired_access:increase10m`
- `brandsoul_legal:portal:created:increase10m`
- `brandsoul_legal:portal:used:increase10m`
- `brandsoul_legal:portal:use_ratio10m`

### Public Triage / Spam

- `brandsoul_legal:public_triage:spam_blocked:increase10m`
- `brandsoul_legal:public_triage:spam_rate_limited:increase10m`
- `brandsoul_legal:public_triage:spam_invalid_payload:increase10m`

### Matching

- `brandsoul_legal:matching:started:increase5m`
- `brandsoul_legal:matching:completed:increase5m`
- `brandsoul_legal:matching:failed:increase5m`
- `brandsoul_legal:matching:failure_ratio5m`

### Canonical Read

- `brandsoul_legal:canonical_read:failed:increase5m`
- `brandsoul_legal:canonical_read:latency_avg_ms:avg`
- `brandsoul_legal:canonical_read:latency_max_ms:max`

### Case Lifecycle

- `brandsoul_legal:case:created:increase5m`
- `brandsoul_legal:case:reused:increase5m`
- `brandsoul_legal:case:closed:increase5m`
- `brandsoul_legal:case:status_changed:increase5m`

### Assignment

- `brandsoul_legal:assignment:created:increase5m`
- `brandsoul_legal:assignment:accepted:increase5m`
- `brandsoul_legal:assignment:rejected:increase5m`
- `brandsoul_legal:assignment:reassigned:increase5m`
- `brandsoul_legal:assignment:expired:increase5m`

## Uso em dashboards

Estas recording rules podem substituir queries repetidas de `sum(increase(...))` e de agregações simples em dashboards operacionais.

Exemplos de uso:

- painéis de volume de falhas transacionais;
- painéis de falhas de mensagem;
- painéis de eficiência de matching;
- painéis de uso do portal;
- painéis de latência de leitura canônica.

## Uso em alertas futuros

Essas regras também preparam a base para alertas mais econômicos e legíveis, reduzindo repetição de PromQL dentro dos arquivos de alertas.

Exemplos futuros:

- alertas sobre `brandsoul_legal:message:failure_ratio5m`;
- alertas sobre `brandsoul_legal:matching:failure_ratio5m`;
- alertas sobre `brandsoul_legal:portal:use_ratio10m`;
- alertas derivados de tendência de falha ou degradação contínua.

## Métricas planned fora do escopo

As métricas abaixo não entram nas recording rules ativas desta fase:

- `legal_matching_queue_depth`
- `legal_structured_identity_used_total`
- `legal_identity_fallback_used_total`
- `public_triage_requests_total`
- `public_triage_valid_total`
- `public_triage_invalid_total`
- `public_triage_case_created_total`

Motivo:

- seguem planejadas;
- ainda não estão suficientemente estáveis/instrumentadas;
- exigem modelagem de indicadores mais madura antes de consolidação.

## Limitações atuais

- As regras são agregadas globalmente, sem thresholds por tenant.
- Não há SLO/SLA formal nesta fase.
- Não há recording rules por profissional, time ou fila.
- Não há segmentação por escritório além do que as métricas originais já permitirem em consultas diretas.
- As ratios são fundacionais e não implicam, por si só, alertas ativos nesta fase.
