# 🗺️ Roadmap do MapsProve

> Plano de evolução do sistema de monitoramento georreferenciado

[![Status BETA](https://img.shields.io/badge/status-beta-ff69b4)](https://github.com/kaled182/mapsprove/releases)  
[![Última Atualização](https://img.shields.io/badge/última_atualização-março_2025-blue)]()  
[![Issues Abertas](https://img.shields.io/github/issues/kaled182/mapsprove/feature-request?color=blue)](https://github.com/kaled182/mapsprove/issues?q=is%3Aopen+is%3Aissue+label%3Afeature-request)  
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

---

## 🌟 Visão 2025-2026
**Objetivo**: Tornar-se a solução open-source mais completa para monitoramento de fibra óptica no Brasil.

---

## 🚦 Status Atual (BETA 1)

✅ **Funcionalidades Consolidadas**  
- Provisionamento automático via `setup-server.sh`  
- Integração Zabbix + [Google Maps API v3](https://developers.google.com/maps/documentation/javascript/v3)  
- Dashboard com:  
  - Status UP/DOWN em tempo real  
  - Backup automatizado do PostgreSQL  
- Documentação completa (README + `.env.example`)  

🔋 **Próxima Atualização Prevista**: 15/04/2025  

---

## 🔧 Em Desenvolvimento (BETA 1.1)

### 📊 Progresso BETA 1.1

| Funcionalidade  | Progresso | Responsável      |
|------------------|-----------|------------------|
| Editor Visual    | 65%       | @frontend-team   |
| Histórico        | 80%       | @backend-team    |
| SMTP / Alertas   | 45%       | @backend-team    |

**Funcionalidades em andamento:**

- Editor visual de rotas — com funcionalidade de arrastar e soltar  
- Histórico de status — visualização por 24h, 7d e 30d  
- Filtros avançados — por status, criticidade e tags  

```
graph LR
  A[Status] --> B(UP)
  A --> C(DOWN)
  D[Criticidade] --> E(Urgente)
  D --> F(Planejamento)
```

- Notificações via SMTP — com suporte a SendGrid e Mailgun

---

## 📅 Próximos Marcos

### BETA 2 (Q2 2025)

- Autenticação JWT com níveis de permissão
- Upload de imagens e croquis técnicos
- Integração com Telegram para alertas

### BETA 3 (Q3 2025)

- Minimapa hierárquico por camadas (backbone, acesso)
- Página pública com status resumido
- Diagnóstico automatizado de falhas (via triggers Zabbix)

---

## 💡 Ideias Futuras

| Área     | Proposta                                     | Complexidade |
|----------|----------------------------------------------|--------------|
| Mobile   | App para técnicos com GPS e modo offline     | ⭐⭐⭐⭐         |
| GIS      | Exportação de rotas para QGIS/ArcGIS         | ⭐⭐           |
| API      | REST/GraphQL para integrações externas       | ⭐⭐⭐          |
| Campo    | Captura de fotos georreferenciadas via app   | ⭐⭐⭐⭐         |
| Diagnóstico | Linha do tempo e sugestão de causa provável | ⭐⭐⭐⭐       |

---

## 📌 Histórico de Versões

| Versão      | Data         | Descrição               |
|-------------|--------------|-------------------------|
| v1.0-BETA   | 05/03/2025   | Lançamento inicial      |
| v0.5-Alpha  | 20/02/2025   | Primeiros testes internos |

---

## 🤝 Como Contribuir

- Vote em funcionalidades na aba [Discussões](https://github.com/kaled182/mapsprove/discussions)  
- Crie uma branch e implemente melhorias:

```bash
git checkout -b feat/nova-funcionalidade
```

- Envie sugestões via [Issues](https://github.com/kaled182/mapsprove/issues)

---

## 📜 Histórico de Alterações

📜 [Ver changelog completo](docs/CHANGELOG.md)

---

⬆️ [Voltar ao topo](#roadmap-do-mapsprove)
