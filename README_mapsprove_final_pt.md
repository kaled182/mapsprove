# <img src="docs/logo.png" width="40"> MapsProve

> Sistema de monitoramento georreferenciado de infraestrutura de fibra óptica

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/kaled182/mapsprove)](https://github.com/kaled182/mapsprove/releases)

---

## ✨ Visão Geral

O **MapsProve** é uma plataforma web para visualização e monitoramento de rotas de fibra óptica, integrando:

- 🗺️ Mapa interativo com status em tempo real (🟢 UP / 🔴 DOWN)
- 📡 Coleta automática de dados via SNMP (Zabbix)
- 📊 Dashboard com métricas de desempenho
- 🔔 Alertas e histórico de incidentes

![Screenshot da Interface](docs/screenshot.png)

<!-- GIF opcional -->
<!-- ![Demo GIF](docs/demo.gif) -->

---

## 🚀 Primeiros Passos

### Requisitos

- Ubuntu Server 22.04 LTS
- Docker 20.10+
- Acesso root/sudo
- Conexão com a internet

---

## 📦 Instalação

### Opção 1 – Instalação Completa (Recomendada)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
sudo bash scripts/setup-server.sh --full
```

### Opção 2 – Ambiente de Desenvolvimento (Docker)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
cp .env.example .env
docker-compose -f docker-compose.dev.yml up
```

💡 **Nota**: Personalize o arquivo `.env` com os dados do seu ambiente. Consulte [docs/configuracao.md](docs/configuracao.md) para mais informações.

---

## ⚙️ Variáveis de Ambiente

Crie seu arquivo `.env` com base no template:

```bash
cp .env.example .env
```

Exemplo de variáveis:

```
GOOGLE_MAPS_API_KEY=sua_chave_google
ZABBIX_API_URL=http://localhost/zabbix/api_jsonrpc.php
ZABBIX_USER=Admin
ZABBIX_PASSWORD=zabbix
```

---

## 🧩 Funcionalidades

| Módulo          | Descrição                                 | Status     |
|------------------|---------------------------------------------|------------|
| Mapa Interativo  | Visualização geográfica das rotas          | ✅ Estável  |
| Monitoramento    | Integração com API do Zabbix               | 🚧 Beta     |
| Configuração     | Gerenciamento de credenciais e dispositivos| ✅ Estável  |

---

## 🏗️ Estrutura do Projeto

```text
mapsprove/
├── backend/      # Node.js + Express
├── frontend/     # React + Google Maps
├── scripts/      # Automação de infraestrutura
├── database/     # Backups e dados sensíveis
├── nginx/        # Configurações de web server
├── docs/         # Documentação
├── .env.example  # Template de variáveis de ambiente
└── docker-compose.yml
```

---

## 🤝 Como Contribuir

1. Faça um fork do projeto
2. Crie uma branch para sua funcionalidade:
   ```bash
   git checkout -b feat/sua-funcionalidade
   ```
3. Envie um Pull Request
4. Reporte bugs via [GitHub Issues](https://github.com/kaled182/mapsprove/issues)

---

## 📞 Suporte

| Tipo               | Detalhes                                  |
|--------------------|--------------------------------------------|
| Contato Técnico    | [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br) |
| Horário Comercial  | Seg a Sex, das 8h às 18h (GMT-3)           |

---

## 📌 Nota

Este projeto está em desenvolvimento ativo. Consulte nosso [📍 Roadmap](docs/roadmap.md) para os próximos lançamentos.

---

## 📜 Licença

Distribuído sob a **MIT License** — veja o arquivo [`LICENSE`](LICENSE) para detalhes.

---

⬆️ [Voltar ao topo](#mapsprove)
