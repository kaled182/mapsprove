# 📜 CHANGELOG — MapsProve

[![Version](https://img.shields.io/badge/version-1.0.0--beta-blue)]()  
[![Convenção](https://img.shields.io/badge/keep--a--changelog-1.0.0-brightgreen)](https://keepachangelog.com/)  
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)  

> Registro oficial de alterações  
> 📅 Início: Março 2025 | 🧪 Status: **BETA 1**

---

## [1.0.0-beta] - 2025-03-30  
### 🚀 Adicionado  
- **Infraestrutura**:  
  - Script `setup-server.sh` com UFW/Fail2Ban (#12) [@devops]  
  - Docker Compose para desenvolvimento (#18) [@backend]  
- **Integrações**:  
  - Google Maps API - visualização básica (#23) [@frontend]  
  - Zabbix API - coleta SNMP inicial (#27) [@backend]  
- **Documentação**:  
  - `README.md` com badges e screenshots (#5)  
  - `docs/faq.md`, `docs/roadmap.md`, `docs/configuracao.md` (#9)  

[🔍 Comparação com v0.5.0](https://github.com/kaled182/mapsprove/compare/v0.5.0-alpha...v1.0.0-beta)  

---

## [0.5.0-alpha] - 2025-02-20  
### 🔧 Adicionado  
- Protótipo inicial do backend Node.js (#1)  
- Mapa estático com marcadores (#3)  
- Testes manuais com `zabbix_get` (#7)  

---

## 📌 Próximas Versões  
Consulte o [Roadmap](docs/roadmap.md) para detalhes das próximas atualizações.  

### ⚠️ Breaking Changes Planejadas  
- Migração para PostgreSQL 15 (#34)  
- Nova estrutura de autenticação JWT (#41)  

---

## 🔁 Como Contribuir  
Siga o padrão:  
```markdown
### [Tipo]  
- Descrição (#Issue) [@Responsável]  
```

Tipos válidos: Adicionado, Corrigido, Alterado, Removido.

⬆️ Voltar ao topo
