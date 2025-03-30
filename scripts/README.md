markdown
Copy
# 📂 scripts/

Este diretório contém scripts automatizados para infraestrutura, deploy e manutenção do sistema **MapsProve**.

---

## 📁 Estrutura do Diretório

```plaintext
scripts/
├── infra/                  # Infraestrutura principal
│   ├── setup-server.sh     # Provisionamento completo do servidor
│   ├── deploy.sh           # Deploy automatizado
│   └── backup/
│       ├── db-backup.sh    # Backup do PostgreSQL
│       └── restore-db.sh   # Restauração de banco
├── tools/                  # Utilitários
│   ├── monitor.sh          # Monitoramento de recursos
│   └── cleanup.sh          # Limpeza de arquivos temporários
└── LICENSE                 # Licença MIT
🚀 Script Principal: setup-server.sh
🔍 Visão Geral
Configuração automatizada de servidor Ubuntu para o MapsProve incluindo:

🟢 Runtime: Node.js + npm

🗃️ Banco de Dados: PostgreSQL

🌐 Web Server: Nginx + Certbot (SSL)

🐳 Containerização: Docker + Docker Compose

🛡️ Segurança: UFW + Fail2Ban

📋 Pré-requisitos
Sistema Operacional
plaintext
Copy
- Ubuntu Server 22.04 LTS (recomendado)
- Acesso root/sudo
- Conexão com internet
Hardware Mínimo
Componente	Especificação
CPU	2 vCPUs
Memória RAM	4GB
Armazenamento	20GB SSD
⚡ Modos de Execução
bash
Copy
# Execução completa (recomendado para primeira instalação)
sudo bash scripts/infra/setup-server.sh --full

# Modos específicos:
--node-only     # Instala apenas Node.js
--db-only       # Configura apenas PostgreSQL
--docker-only   # Instala apenas Docker
--security      # Configura apenas segurança (UFW + Fail2Ban)
📂 Estrutura Gerada
plaintext
Copy
~/mapsprove/
├── backend/              # Código backend
├── frontend/             # Código frontend
├── database/
│   ├── .db_credentials   # Arquivo protegido (chmod 600)
│   └── backups/          # Backups automáticos
└── logs/
    └── setup.log         # Log detalhado
🔄 Fluxo de Trabalho
Configuração Inicial:

bash
Copy
sudo bash scripts/infra/setup-server.sh --full
Deploy Diário:

bash
Copy
bash scripts/infra/deploy.sh --env=production
Backup Automático (via cron):

bash
Copy
0 2 * * * bash ~/mapsprove/scripts/infra/backup/db-backup.sh
🔐 Melhores Práticas
Prática	Comando
Validar sintaxe	bash -n setup-server.sh
Proteger credenciais	chmod 600 *.credentials
Monitorar recursos	bash scripts/tools/monitor.sh
🛠️ Troubleshooting
Problemas Comuns
1. Pacotes não encontrados
bash
Copy
sudo apt update && sudo apt --fix-broken install
2. Erros no PostgreSQL
bash
Copy
sudo systemctl status postgresql
sudo journalctl -u postgresql --since "1 hour ago"
3. Problemas de Permissão
bash
Copy
sudo chown -R $USER:$USER ~/mapsprove
sudo chmod -R 755 ~/mapsprove/logs
📜 Licença
Este projeto está licenciado sob a MIT License.

📞 Contato
Tipo	Detalhes
Responsável Técnico	paulo@msimplesinternet.net.br
Reportar Bugs	GitHub Issues
⬆️ Voltar ao topo
