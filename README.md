# <img src="docs/logo.png" width="40"> MapsProve

> Sistema de monitoramento georreferenciado de infraestrutura de fibra óptica

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![GitHub Release](https://img.shields.io/github/v/release/kaled182/mapsprove)](https://github.com/kaled182/mapsprove/releases)

---

## ✨ Overview

**MapsProve** is a web-based platform for visualization and monitoring of fiber optic routes, integrating:

- 🗺️ Interactive map with real-time status (🟢 UP / 🔴 DOWN)
- 📡 Automatic SNMP data collection via Zabbix
- 📊 Dashboard with performance metrics
- 🔔 Alerts and incident history

![Screenshot da Interface](docs/screenshot.png)

<!-- Optional GIF preview -->
<!-- ![Demo GIF](docs/demo.gif) -->

---

## 🚀 Getting Started

### Requirements

- Ubuntu Server 22.04 LTS
- Docker 20.10+
- sudo/root access
- Internet connection

### 📦 Installation

#### Option 1 – Full Setup (Recommended)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
sudo bash scripts/setup-server.sh --full
```

#### Option 2 – Development Mode (Docker)

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
cp .env.example .env
docker-compose -f docker-compose.dev.yml up
```

💡 **Note**: Customize the `.env` file with your environment details. See [docs/configuracao.md](docs/configuracao.md) for more info.

---

## ⚙️ Environment Variables

Create your `.env` file based on the template:

```bash
cp .env.example .env
```

Example variables:

```
GOOGLE_MAPS_API_KEY=your_api_key
ZABBIX_API_URL=http://localhost/zabbix/api_jsonrpc.php
ZABBIX_USER=Admin
ZABBIX_PASSWORD=zabbix
```

---

## 🧩 Features

| Module         | Description                                 | Status     |
|----------------|---------------------------------------------|------------|
| Interactive Map| Geographic route visualization              | ✅ Stable  |
| Monitoring     | Zabbix API integration                      | 🚧 Beta    |
| Configuration  | Device and API credential management        | ✅ Stable  |

---

## 🏗️ Project Structure

```text
mapsprove/
├── backend/      # Node.js + Express
├── frontend/     # React + Google Maps
├── scripts/      # Infrastructure automation
├── database/     # Backups and sensitive data
├── nginx/        # Web server config
├── docs/         # Documentation
├── .env.example  # Environment template
└── docker-compose.yml
```

---

## 🤝 Contributing

- Fork the project
- Create a feature branch:
  ```bash
  git checkout -b feat/your-feature
  ```
- Submit a Pull Request
- Report issues via [GitHub Issues](https://github.com/kaled182/mapsprove/issues)

---

## 📞 Support

| Type               | Details                                  |
|--------------------|-------------------------------------------|
| Technical Contact  | [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br) |
| Business Hours     | Mon–Fri, 8am–6pm (GMT-3)                 |

---

## 📌 Note

This project is under active development. See our [📍 Roadmap](docs/roadmap.md) for planned releases and features.

---

## 📜 License

Distributed under the **MIT License** — see [`LICENSE`](LICENSE) for details.

---

⬆️ [Back to top](#mapsprove)
