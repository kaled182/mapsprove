ROADMAP

Objetivo: levar o MapsProve de protótipo a MVP em produção em 6 semanas, com Zabbix → backend → frontend funcionando em tempo real, segurança básica e deploy reproduzível.

✳️ Visão de alto nível
	•	Trilhas Paralelas: Backend, Frontend, Infra/DevOps.
	•	Cadência: 6 sprints semanais, com demo toda sexta.
	•	Critério final: Deploy prod reproduzível < 15min, UI recebendo dados reais e stream ao vivo.

⸻

🗓️ Cronograma por Semana (marcos + critérios de aceite)

Semana 1 — Fundação & Contratos

Backend
	•	Rotas básicas: GET /livez, GET /readyz, GET /version.
	•	Logger estruturado (pino) + validação de env (Zod).
	•	Migrations nodes, links (schema mínimo) + repositório (upsert/list).
	•	Endpoints stub: GET /api/topology, GET /api/topology/nodes/:id, GET /api/topology/links/:id.
	•	SSE esqueleto: GET /api/stream com heartbeat.

Frontend
	•	Conectar TopologyLayout a GET /api/topology (seed/fake).
	•	useStatusStream consumindo heartbeat do /api/stream.
	•	TopologySidebar refinado (acessibilidade das tabs, badges).

Infra/DevOps
	•	docker-compose.prod.yml (multi-stage) + HEALTHCHECK.
	•	Definição de licença (MIT vs GPLv3) + harmonizar LICENSE e README.

Critérios de aceite
	•	App sobe em dev/prod (compose).
	•	UI carrega topologia fake sem erros.
	•	SSE envia heartbeat e o frontend exibe status “conectado”.

⸻

Semana 2 — Integração Zabbix (MVP: Nodes)

Backend
	•	ZabbixClient (login, host.get, problem.get).
	•	TopologyService.refreshSnapshot() mapeando hosts → nodes (status + geoloc de inventário).
	•	Persistir nodes; links ainda manuais (seed ou CRUD).
	•	Emitir topology full snapshot (versionado) no event bus.

Frontend
	•	Trocar dados fake por hosts reais.
	•	Indicador “dados reais” no header.

Infra/DevOps
	•	Secrets Zabbix no compose (prod + staging).
	•	Documentar onboarding (como apontar p/ Zabbix de teste).

Critérios de aceite
	•	/api/topology retorna hosts reais.
	•	UI exibe nós reais no mapa coerentes com o Zabbix.

⸻

Semana 3 — Stream em Tempo Real + Delta

Backend
	•	SSE robusto: Last-Event-ID, replayFromVersion, heartbeat.
	•	Publicar eventos: topology (full/patch), alert, metrics.
	•	Healthcheck do emissor; backoff exponencial nos conectores.

Frontend
	•	useStatusStream com retomada por Last-Event-ID + cache offline básico (alertas).
	•	Indicadores de conexão: open/paused/error; contadores de críticos.

Infra/DevOps
	•	Métricas prom-client (reconexões, eventos/min, latência).
	•	Alertas operacionais do próprio stream.

Critérios de aceite
	•	Problema no Zabbix ⇒ alerta aparece na UI ao vivo (sem refresh).
	•	Queda de conexão ⇒ reconecta e retoma sem perder eventos.

⸻

Semana 4 — Diagnósticos + Links + UX

Backend
	•	Rotas de diagnóstico (stubs úteis):
POST /api/diag/ping, POST /api/diag/traceroute, POST /api/diag/ssh (deep-link).
	•	CRUD mínimo de links + exposição em /api/topology.
	•	(Opcional) Enriquecimento de links por LLD/inventário.

Frontend
	•	NodeInfoCard/LinkInfoCard chamando diag (com feedback/loader).
	•	Métricas de link (latência/perda/utilização) em tempo real.
	•	NetworkMap em modo performance para >500 nós (badge “⚡”).

Infra/DevOps
	•	Permissões/ACL nas rotas de diag; rate limit.

Critérios de aceite
	•	Botões de Ping/Traceroute retornam resultado na UI.
	•	Links com alta utilização aparecem realçados.

⸻

Semana 5 — Segurança, RBAC, Setup e Polimento

Backend
	•	requireAuth + RBAC (admin/user) nas rotas sensíveis.
	•	Revisar /api/auth/seed/admin (proteger/remover).
	•	Persistir credenciais Zabbix com criptografia.

Frontend
	•	Página Setup finalizada e validando conexão Zabbix.
	•	Toasters/erros consistentes; acessibilidade revisada.

Infra/DevOps
	•	Backup + Restore testado (scripts finalizados).
	•	Política de logs (evitar PII), retenção.

Critérios de aceite
	•	Usuário comum não acessa rotas admin.
	•	Setup conclui e valida integração Zabbix.
	•	Restore funciona end-to-end.

⸻

Semana 6 — Release 1.0 + Observabilidade

Backend
	•	Tuning: índices SQL, payloads do stream, circuit breaker Zabbix.
	•	Filtros no stream (por severidade, host, tag).

Frontend
	•	Perf check (Lighthouse), lazy-loading quando fizer sentido.
	•	Estados vazios e mensagens de erro caprichadas.
	•	Flags para “nice-to-haves”.

Infra/DevOps
	•	Compose prod final + doc de deploy (staging/prod).
	•	Dashboards Grafana (stream, eventos, CPU/mem).
	•	Runbook: incidentes e ações.

Critérios de aceite
	•	Tag v1.0.0 + CHANGELOG.
	•	Deploy reproduzível < 15min.

⸻

🧩 Contratos (mínimos) de API/Eventos

REST: Topologia

GET /api/topology
200
{
  "version": "string|number",
  "nodes": [Node],
  "links": [Link]
}

type Node = {
  id: string;
  name?: string;
  status?: 'up'|'down'|'degraded'|'unknown';
  type?: string;
  lat?: number;
  lon?: number;
  tags?: string[];
  meta?: Record<string, any>;
};

type Link = {
  id: string;
  source: string; // node id
  target: string; // node id
  status?: 'up'|'down'|'degraded'|'unknown';
  type?: 'fiber'|'copper'|'wireless'|'backbone'|'unknown';
  fiber?: boolean;
  bandwidth?: number;   // Mbps
  utilization?: number; // 0..1
  latency?: number;     // ms
  packetLoss?: number;  // 0..1
  distanceKm?: number;
  tags?: string[];
  meta?: Record<string, any>;
};

SSE: Stream

GET /api/stream
event: heartbeat          data: {"ts": 1712345678901}
event: topology           data: {"version":"...","nodes":[...],"links":[...]}
event: topology-patch     data: {"version":"...","ops":[...]} // opcional
event: alert              data: {"id":"...","level":"critical|warn|info","message":"...","host":"...","createdAt":...}
event: metrics            data: {"host":"...","cpu":0..100,"mem":0..100,"disks":[...],"ts":...}

🏷️ Labels, Milestones & Project

Labels
	•	backend, frontend, infra, zabbix, stream,
	•	security, diagnostics, ux,
	•	good-first-issue, help-wanted, blocked.

Milestones
	•	M1 Fundacao
	•	M2 Zabbix MVP
	•	M3 Stream
	•	M4 Diag+Links
	•	M5 Segurança+Setup
	•	M6 Release 1.0

Project (GitHub Projects)
	•	Columns: Backlog → In Progress → Review → Done.
	•	Automation: close issue ⇒ move para Done.

⸻

📋 Backlog Inicial (issues sugeridas)

Dica: copie os títulos abaixo direto como issues; atribua label/milestone.

Semana 1
	•	Backend: /livez, /readyz, /version (backend, M1)
	•	Backend: Migrations nodes,links + repo básico (backend, M1)
	•	Backend: Stub /api/topology + detalhes (backend, M1)
	•	Backend: SSE esqueleto /api/stream (heartbeat) (backend, M1, stream)
	•	Frontend: conectar TopologyLayout a /api/topology (seed) (frontend, M1)
	•	Frontend: useStatusStream c/ heartbeat (frontend, M1, stream)
	•	DevOps: docker-compose.prod.yml + HEALTHCHECK (infra, M1)
	•	Legal: harmonizar LICENSE (MIT vs GPLv3) (infra, M1)

Semana 2
	•	Backend: ZabbixClient (auth + host.get + problem.get) (backend, zabbix, M2)
	•	Backend: TopologyService.refreshSnapshot() hosts→nodes (backend, zabbix, M2)
	•	Backend: emitir snapshot no bus/SSE (backend, stream, M2)
	•	Frontend: consumir nodes reais (frontend, M2)
	•	Docs: onboarding Zabbix de teste (infra, M2)

Semana 3
	•	Backend: SSE robusto (Last-Event-ID, replay, health) (backend, stream, M3)
	•	Frontend: retomada por Last-Event-ID + cache offline alertas (frontend, stream, M3)
	•	Observabilidade: métricas prom-client do stream (infra, M3)

Semana 4
	•	Backend: rotas diag (/api/diag/ping|traceroute|ssh) (backend, diagnostics, M4)
	•	Backend: CRUD mínimo links (backend, M4)
	•	Frontend: acionar diag pelos cards (frontend, diagnostics, M4)
	•	Frontend: métricas em tempo real nos links (frontend, stream, M4)
	•	Frontend: badge “⚡ Modo performance” (frontend, M4)

Semana 5
	•	Backend: requireAuth + RBAC (backend, security, M5)
	•	Backend: proteger/remover /api/auth/seed/admin (backend, security, M5)
	•	Backend: persistir credenciais Zabbix criptografadas (backend, security, M5)
	•	Frontend: página Setup finalizada (frontend, M5)
	•	DevOps: Backup + Restore testados (infra, M5)

Semana 6
	•	Backend: tuning (índices, circuit breaker, payload) (backend, M6)
	•	Frontend: perf audit + lazy-loading (frontend, M6)
	•	DevOps: compose prod final + doc de deploy (infra, M6)
	•	DevOps: dashboards Grafana + runbook (infra, M6)
	•	Release: tag v1.0.0 + CHANGELOG (infra, M6)

⸻

✅ Definition of Ready / Definition of Done

DoR
	•	Escopo claro, contrato definido, dependências mapeadas.
	•	Critérios de aceite escritos.

DoD
	•	ESLint/Prettier OK, testes básicos, logs úteis.
	•	Docs atualizadas (README/Endpoints/Env).
	•	Critérios de aceite cumpridos + demo realizada.

⸻

⚠️ Riscos & Mitigações (resumo)
	•	Zabbix instável/latente: retries, timeouts, circuit breaker.
	•	SSE em escala: fallback polling, limitar filtros/payload.
	•	Coordenadas ausentes: placeholder + aviso na UI.
	•	Tempo: priorizar MVP (nodes/alertas/diag básico), “nice-to-haves” via feature flags.

⸻

🔜 Pós-MVP (nice-to-haves)
	•	Descoberta automática de links (LLD/NetFlow).
	•	Multi-fonte (Zabbix + Prometheus).
	•	RBAC avançado por times/domínios.
	•	Heatmaps, busca por host/tag, filtros salvos.

⸻

Anexos rápidos (para quem vai implementar)
	•	Status de Link: up|down|degraded|unknown
	•	Métricas: latency(ms), packetLoss(0..1), utilization(0..1)
	•	Bandwith: bandwidth(Mbps); throughput calculado utilization * bandwidth
