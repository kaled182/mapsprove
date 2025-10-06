#!/usr/bin/env bash
# ------------------------------------------------------------------------------
# scripts/ops/bootstrap-roadmap.sh
#
# Bootstrap do roadmap do repositório (labels, milestones e issues) a partir de
# um arquivo YAML (scripts/ops/roadmap.yml), usando GitHub CLI (gh) + yq.
#
# Requisitos:
#   - gh (GitHub CLI) instalado e autenticado:  gh auth status
#   - yq (Mike Farah, v4+):                     https://github.com/mikefarah/yq
#
# Uso:
#   chmod +x scripts/ops/bootstrap-roadmap.sh
#   scripts/ops/bootstrap-roadmap.sh <owner/repo> [caminho/para/roadmap.yml]
#
#   Exemplo:
#     scripts/ops/bootstrap-roadmap.sh kaled182/mapsprove
#     scripts/ops/bootstrap-roadmap.sh kaled182/mapsprove scripts/ops/roadmap.yml
#
# Notas:
#   - Idempotente: reexecutar não duplica labels/milestones/issues.
#   - Datas dos milestones: calculadas a partir da semana (week) do YAML,
#     usando o horário UTC em ISO-8601.
#   - Compatível com GNU date (Linux) e BSD date (macOS).
# ------------------------------------------------------------------------------

set -euo pipefail
IFS=$'\n\t'

# ---- Configuração de saída (cores opcionais) ---------------------------------
if [[ -t 1 ]]; then
  BOLD="$(tput bold)"; DIM="$(tput dim)"; RESET="$(tput sgr0)"
else
  BOLD=""; DIM=""; RESET=""
fi

log()  { echo "[$(date -u +%H:%M:%S)] $*"; }
die()  { echo "❌ $*" >&2; exit 1; }

require_tools() {
  command -v gh >/dev/null 2>&1 || die "GitHub CLI (gh) não encontrado. Instale: https://cli.github.com/"
  gh auth status >/dev/null 2>&1 || die "gh não está autenticado. Rode: gh auth login"

  command -v yq >/dev/null 2>&1 || die "yq (YAML parser) não encontrado. Instale: https://github.com/mikefarah/yq/"
}

# Retorna a data due_on (ISO-8601 UTC) somando N semanas a partir de hoje.
# Compatível com GNU date (Linux) e BSD date (macOS).
compute_due_on_iso() {
  local week="$1"

  if date --version >/dev/null 2>&1; then
    # GNU date
    date -u -d "+$((week * 7)) days" --iso-8601=seconds
  else
    # BSD date (macOS)
    date -u -v+"${week}"w -Iseconds
  fi
}

# ------------------------------------------------------------------------------
# Labels
# ------------------------------------------------------------------------------
process_labels() {
  local repo="$1" file="$2"
  log "==> Criando/atualizando labels…"

  # yq retorna: name \t color \t description
  yq -r '.labels[] | [.name, .color, .description] | @tsv' "$file" | \
  while IFS=$'\t' read -r name color desc; do
    if gh label list -R "$repo" --limit 300 | grep -Fq "$name"; then
      gh label edit "$name" -R "$repo" --color "$color" --description "$desc" >/dev/null
      echo "🔁  label atualizado: ${BOLD}$name${RESET}"
    else
      gh label create "$name" -R "$repo" --color "$color" --description "$desc" >/dev/null
      echo "🏷️  label criado: ${BOLD}$name${RESET}"
    fi
  done
}

# ------------------------------------------------------------------------------
# Milestones
# ------------------------------------------------------------------------------
process_milestones() {
  local repo="$1" file="$2"
  log "==> Criando/atualizando milestones…"

  # Loop por milestones: title, description, week
  yq -r '.milestones[] | [.title, .description, .week] | @tsv' "$file" | \
  while IFS=$'\t' read -r title desc week; do
    local due_on
    due_on="$(compute_due_on_iso "$week")"

    # Buscar milestone por título (em todas as situações: open/closed)
    local id
    id="$(gh api "repos/$repo/milestones?state=all" --jq ".[] | select(.title==\"$title\") | .number" 2>/dev/null || true)"

    if [[ -z "${id}" ]]; then
      gh api "repos/$repo/milestones" \
        -f title="$title" \
        -f description="$desc" \
        -f due_on="$due_on" >/dev/null
      echo "🏁  milestone criado: ${BOLD}$title${RESET} ${DIM}(due: ${due_on})${RESET}"
    else
      gh api -X PATCH "repos/$repo/milestones/$id" \
        -f title="$title" \
        -f description="$desc" \
        -f due_on="$due_on" >/dev/null
      echo "🔁  milestone atualizado: ${BOLD}$title${RESET} ${DIM}(due: ${due_on})${RESET}"
    fi
  done
}

# ------------------------------------------------------------------------------
# Issues
# ------------------------------------------------------------------------------
process_issues() {
  local repo="$1" file="$2"
  log "==> Criando/atualizando issues…"

  local count
  count="$(yq '.issues | length' "$file")"
  if [[ "${count}" -eq 0 ]]; then
    echo "ℹ️  Nenhuma issue definida em ${file}"
    return 0
  fi

  for i in $(seq 0 $((count - 1))); do
    local title body milestone labels_csv
    title="$(yq -r ".issues[$i].title" "$file")"
    body="$(yq -r ".issues[$i].body" "$file")"
    milestone="$(yq -r ".issues[$i].milestone" "$file")"
    labels_csv="$(yq -r ".issues[$i].labels | (if length>0 then join(\",\") else \"\" end)" "$file")"

    # Tenta localizar uma issue existente por título (em qualquer estado)
    local existing_issue
    existing_issue="$(gh issue list -R "$repo" --state all --search "in:title \"$title\"" --json number --jq '.[0].number' 2>/dev/null || true)"

    if [[ -n "$existing_issue" ]]; then
      echo "🔎  issue já existe (#$existing_issue): ${BOLD}$title${RESET}"
      continue
    fi

    # Criação
    if [[ -n "$labels_csv" ]]; then
      gh issue create -R "$repo" --title "$title" --body "$body" --milestone "$milestone" --label "$labels_csv" >/dev/null
    else
      gh issue create -R "$repo" --title "$title" --body "$body" --milestone "$milestone" >/dev/null
    fi

    echo "🆕  issue criada: ${BOLD}$title${RESET} ${DIM}(milestone: $milestone)${RESET}"
  done
}

# ------------------------------------------------------------------------------
# Main
# ------------------------------------------------------------------------------
main() {
  require_tools

  # Repositório destino
  local REPO="${1:-}"
  if [[ -z "${REPO}" ]]; then
    # Tentativa de auto-detecção via gh
    REPO="$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)"
    [[ -z "$REPO" ]] && die "Não foi possível detectar o repositório. Use: $0 <owner/repo>"
  fi

  # Arquivo de dados YAML
  local ROADMAP_FILE="${2:-}"
  if [[ -z "${ROADMAP_FILE}" ]]; then
    # Caminho padrão relativo a este script
    local SCRIPT_DIR
    SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
    ROADMAP_FILE="${SCRIPT_DIR}/roadmap.yml"
  fi

  [[ -f "$ROADMAP_FILE" ]] || die "Arquivo de dados não encontrado: $ROADMAP_FILE"

  log "📦 Repositório alvo: ${BOLD}${REPO}${RESET}"
  log "🗂  Fonte do roadmap: ${BOLD}${ROADMAP_FILE}${RESET}"

  process_labels     "$REPO" "$ROADMAP_FILE"
  process_milestones "$REPO" "$ROADMAP_FILE"
  process_issues     "$REPO" "$ROADMAP_FILE"

  log "✅ Roadmap bootstrap concluído!"
}

main "$@"
