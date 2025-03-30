# 🌐 MapsProve

**Sistema Web de Monitoramento de Rotas de Fibra Óptica**  
Visualize, controle e acompanhe rotas e equipamentos com base em dados do Zabbix e Google Maps.

---

## 🚀 Visão Geral

MapsProve é uma aplicação web moderna e responsiva que permite o mapeamento visual de rotas de fibra, com status de conectividade em tempo real via integração com o Zabbix.

🧭 **Funcionalidades principais:**
- 🗺️ Visualização interativa de rotas no mapa
- 🔄 Integração com Zabbix via API para status SNMP
- 🟥 Alteração de cor da rota conforme status (UP/DOWN)
- 🛠️ Cadastro manual de rotas (desenho no mapa ou via KML)
- 📊 Histórico de disponibilidade
- 📡 Marcação de equipamentos
- 🔔 Alertas e notificações

---

## 🧰 Tecnologias Utilizadas

| Camada        | Tecnologia                          |
|---------------|--------------------------------------|
| Frontend      | React.js + Tailwind CSS              |
| Mapas         | Google Maps JavaScript API           |
| Backend       | Node.js + Express.js + Axios         |
| Banco de Dados| PostgreSQL                           |
| Monitoramento | Zabbix (SNMP via API)                |
| Infraestrutura| Docker, Nginx, Certbot, UFW, Fail2Ban|

---

## ⚙️ Instalação (modo automatizado)

1. Clone o repositório:

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
```

2. Execute o script de provisionamento:

```bash
sudo bash scripts/infra/setup-server.sh --full
```

> 💡 Para modos específicos, veja [scripts/README.md](scripts/README.md)

---

## 📁 Estrutura do Projeto

```plaintext
mapsprove/
├── backend/              # API Node.js
├── frontend/             # Interface React
├── database/             # Backups e credenciais protegidas
├── scripts/              # Infraestrutura e manutenção
├── nginx/                # Configurações web
├── logs/                 # Logs do sistema
├── docs/                 # Documentação técnica (em construção)
├── .gitignore
├── LICENSE
└── README.md
```

---

## 📌 Status

🔧 Em desenvolvimento — Versão **BETA 1**  
🛤️ Próximo passo: Implementação do painel de controle, cadastro de rotas manuais e integração com SNMP

---

## 📜 Licença

Distribuído sob a **MIT License** — veja o arquivo [LICENSE](LICENSE)

---

## 📬 Contato

- ✉️ Responsável Técnico: [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br)
- 🐛 Reporte bugs ou sugestões via [GitHub Issues](https://github.com/kaled182/mapsprove/issues)

---

⬆️ [Voltar ao topo](#mapsprove)
