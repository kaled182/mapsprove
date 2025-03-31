# <img src="docs/logo.png" width="40"> MapsProve

> Sistema de monitoramento georreferenciado de infraestrutura de fibra óptica

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)  
[![GitHub Release](https://img.shields.io/github/v/release/kaled182/mapsprove)](https://github.com/kaled182/mapsprove/releases)  
[![CI/CD](https://github.com/kaled182/mapsprove/actions/workflows/main.yml/badge.svg)](https://github.com/kaled182/mapsprove/actions)

---

## ✨ Visão Geral

O **MapsProve** é uma plataforma web para visualização e monitoramento de rotas de fibra óptica, integrando:  
- 🗺️ Mapa interativo com status em tempo real (🟢 UP / 🔴 DOWN)  
- 📡 Coleta automática de dados via **SNMP** (Zabbix)  
- 📊 Dashboard com métricas de desempenho  
- 🔔 Alertas e histórico de incidentes  

![Screenshot da Interface](docs/screenshot.png)  
![Demo Interativa](docs/demo.gif) *Navegação no mapa e alertas em tempo real*

---

## 🚀 Primeiros Passos

### ✅ Requisitos

- **Sistema Operacional**: Ubuntu Server 22.04 LTS  
- **Docker**: 20.10+  
- **Acesso**: Permissões root/sudo  
- **Conexão**: Internet para dependências

---

## 📦 Instalação

### Opção 1 – Instalação Completa (Recomendada)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
sudo bash scripts/setup-server.sh --full
```

### Opção 2 – Modo Desenvolvimento (Docker)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
cp .env.example .env
# Gerar chave secreta segura:
openssl rand -hex 32 >> .env
docker-compose -f docker-compose.dev.yml up
```

💡 Nota: Configure o arquivo `.env` conforme seu ambiente. [[Documentação detalhada](docs/configuracao.md)](docs/configuracao.md)

---

## ⚙️ Configuração do Ambiente

### 📋 Variáveis Obrigatórias (.env)

```env
GOOGLE_MAPS_API_KEY=sua_chave_aqui  # [Como obter](https://developers.google.com/maps/documentation/javascript/get-api-key)
ZABBIX_API_URL=http://seu_servidor_zabbix/api_jsonrpc.php
APP_SECRET=seu_valor_hexadecimal_32_chars
```

📌 [Modelo completo do `.env.example`](.env.example)

⚠️ **Importante**:  
- Nunca compartilhe o arquivo `.env` com dados reais  
- Use o `.env.example` como base e renomeie após configurar

---

## 🧩 Funcionalidades

| Módulo        | Descrição                             | Status     |
|---------------|-----------------------------------------|------------|
| Mapa          | Visualização geográfica das rotas       | ✅ Estável |
| Monitoramento | Integração com API do Zabbix            | 🚧 Beta    |
| Alertas       | Notificações por e-mail e registro      | ✅ Estável |

---

## 🏗️ Estrutura do Projeto

```text
mapsprove/
├── backend/      # Node.js + Express
├── frontend/     # React + Google Maps
├── scripts/      # Automação de infraestrutura
├── database/     # Backups e migrações
├── docs/         # Documentação e roadmap
└── docker-compose.yml
```

---

## 🤝 Como Contribuir

1. Faça um fork do projeto  
2. Crie uma branch:  
```bash
git checkout -b feat/nova-funcionalidade
```
3. Envie um Pull Request  
4. Reporte bugs em [Issues](https://github.com/kaled182/mapsprove/issues)

### 📌 Diretrizes

- Siga o padrão de commits **Conventional Commits**
- Documente novas funcionalidades na pasta `/docs`

---

## 📞 Suporte

| Tipo       | Contato                                                              |
|------------|----------------------------------------------------------------------|
| Técnico    | [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br) |
| Comercial  | Seg a Sex, 8h às 18h (GMT-3)                                         |

---

## 📌 Próximos Passos

- Consulte nosso [📍 Roadmap](docs/roadmap.md) para atualizações futuras  
- Dúvidas? Veja nosso [FAQ](docs/faq.md)

---

## 📜 [Changelog](docs/CHANGELOG.md)

📜 Licença

Distribuído sob a **MIT License** — veja [`LICENSE`](LICENSE) para detalhes.

---

⬆️ [Voltar ao topo](#mapsprove)
