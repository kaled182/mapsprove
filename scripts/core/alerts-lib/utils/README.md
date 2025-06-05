# 📬 Alert Queue — Fila de Alertas (queue.sh)

Módulo de gerenciamento de fila para o sistema de alertas do MapsProve.

## Funcionalidades

- **Enfileira alertas** em formato JSON com prioridade e metadados.
- **Processa a fila** enviando alertas para múltiplos canais (Slack, Email, Telegram).
- **Rotação automática** de backups da fila.
- **Promoção automática de prioridade** para alertas antigos.
- **Atomicidade** garantida via flock.
- **Métricas**: tamanho da fila, tempo de processamento, logs detalhados.

## Comandos Principais

```bash
# Enfileirar alerta
enqueue_alert <priority> <type> <message> [metadata_json]
# Exemplo:
enqueue_alert "high" "cpu" "CPU 95%" '{"host":"svr01"}'

# Processar a fila (enviar alertas)
process_alert_queue

# Consultar quantidade de alertas pendentes
get_queue_size

# Listar alertas pendentes (JSON)
get_pending_alerts
