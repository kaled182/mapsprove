#!/usr/bin/env bash
# ===================================================
# 🔍 TESTE DE CANAIS - Validação dos canais de alerta (v0.2)
# Local: scripts/core/alerts-lib/channels/test_channels.sh
# ===================================================

set -euo pipefail

# --- Cores (simples) ---
GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'

# --- Descobrir pasta deste script para importar os canais ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# --- Importar canais (devem exportar: test_email_channel, test_slack_channel, test_telegram_channel, test_webhook_channel) ---
source "${SCRIPT_DIR}/email.sh"
source "${SCRIPT_DIR}/slack.sh"
source "${SCRIPT_DIR}/telegram.sh"
source "${SCRIPT_DIR}/webhook.sh"

usage() {
  cat <<EOF
Uso: ${0##*/} [--only email,slack,telegram,webhook]

Exemplos:
  ${0##*/}                # testa todos os canais
  ${0##*/} --only slack   # testa apenas o Slack
  ${0##*/} --only email,webhook
EOF
}

# --- Seleção de canais ---
ALL_CHANNELS=("email" "slack" "telegram" "webhook")
SELECTED_CHANNELS=("${ALL_CHANNELS[@]}")

if (( $# )); then
  case "${1:-}" in
    --only)
      shift || true
      IFS=',' read -r -a SELECTED_CHANNELS <<< "${1:-}"
      shift || true
      ;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Argumento desconhecido: $1"; usage; exit 2;;
  esac
fi

# --- Execução dos testes ---
passed=0; failed=0

check_channel_health() {
  local channel="$1"
  local test_func="test_${channel}_channel"

  # Verifica se a função existe (canal disponível)
  if ! declare -F "$test_func" >/dev/null 2>&1; then
    echo -e "${RED}🔴 ${channel}: função ${test_func} não encontrada${NC}"
    ((failed++))
    return
  fi

  # Em condição if, um exit code != 0 NÃO interrompe com 'set -e'
  if "$test_func"; then
    echo -e "${GREEN}🟢 ${channel} OK${NC}"
    ((passed++))
  else
    echo -e "${RED}🔴 ${channel} OFFLINE${NC}"
    ((failed++))
  fi
}

echo "== Iniciando verificação dos canais =="
for ch in "${SELECTED_CHANNELS[@]}"; do
  check_channel_health "$ch"
done

echo "--------------------------------------"
echo "Resumo: ${GREEN}${passed} OK${NC} | ${RED}${failed} OFFLINE${NC}"

# Exit code: 0 se todos OK, 1 caso contrário
if (( failed > 0 )); then exit 1; else exit 0; fi
