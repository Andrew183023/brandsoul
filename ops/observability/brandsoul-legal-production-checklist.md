# BrandSoul Legal — Observability Production Checklist

## Objetivo

Checklist operacional para subir a observabilidade jurídica em produção com Prometheus e Grafana, preservando autenticação no endpoint `/metrics/prometheus`.

## Pré-deploy

- Confirmar que `ops/prometheus/prometheus.yml` está versionado e revisado.
- Confirmar que `ops/prometheus/rules/brandsoul-legal-alerts.yml` está presente.
- Confirmar que `ops/prometheus/rules/brandsoul-legal-recording-rules.yml` está presente.
- Confirmar que `ops/grafana/provisioning/datasources/prometheus.yml` está presente.
- Confirmar que `ops/grafana/provisioning/dashboards/brandsoul-legal.yml` está presente.
- Confirmar que os dashboards JSON foram copiados para o path esperado do Grafana.
- Confirmar credencial interna ou caminho privado para scrape de `/metrics/prometheus`.
- Confirmar que `/metrics/prometheus` não será exposto publicamente sem proteção.
- Validar YAML/JSON localmente antes do deploy.

## Deploy

### Prometheus

- Copiar `ops/prometheus/prometheus.yml` para o host/container do Prometheus.
- Copiar rules para:
  - `/etc/prometheus/rules/brandsoul-legal-alerts.yml`
  - `/etc/prometheus/rules/brandsoul-legal-recording-rules.yml`
- Recarregar Prometheus ou reiniciar o serviço.

### Grafana

- Copiar datasource provisioning para:
  - `/etc/grafana/provisioning/datasources/prometheus.yml`
- Copiar dashboard provisioning para:
  - `/etc/grafana/provisioning/dashboards/brandsoul-legal.yml`
- Copiar dashboards JSON para:
  - `/var/lib/grafana/dashboards/brandsoul-legal/`
- Recarregar Grafana ou reiniciar o serviço.

## Pós-deploy

- Executar o smoke test em `ops/observability/brandsoul-legal-observability-smoke.md`.
- Confirmar `up{job="brandsoul-legal-backend"} == 1`.
- Confirmar que `legal_case_created_total` está visível.
- Confirmar que `brandsoul_legal:transaction:failures:increase5m` está visível.
- Confirmar que o dashboard operacional carrega.
- Confirmar que o dashboard SLO/SLA carrega.
- Confirmar que rules de alerta e recording aparecem carregadas no Prometheus.

## Rollback

- Restaurar a versão anterior de `prometheus.yml`.
- Restaurar a versão anterior das rules.
- Restaurar a versão anterior do datasource provisioning.
- Restaurar a versão anterior do dashboard provisioning.
- Restaurar a versão anterior dos dashboards JSON.
- Recarregar Prometheus e Grafana.
- Confirmar retorno do estado anterior por smoke básico.

## Riscos

- Endpoint `/metrics/prometheus` inacessível por auth mal configurada.
- Prometheus sem caminho privado para scrape.
- Dashboards provisionados antes da cópia dos JSON.
- Rules carregadas com caminho divergente do `rule_files`.
- Grafana sem datasource `DS_PROMETHEUS`.

## Pendências conhecidas

- Não há Alertmanager configurado nesta fase.
- Não há provisioning automático de infraestrutura nesta entrega.
- Não há scrape auth exemplificado com segredo real.
- Não há instalação de Prometheus/Grafana nesta fase.
- Não há dashboards avançados por tenant ou profissional.
