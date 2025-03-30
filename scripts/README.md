# scripts/

Este diretório contém scripts automatizados para infraestrutura, deploy e manutenção do sistema MapsProve.

## Estrutura do Diretório
scripts/
├── infra/ # Infraestrutura principal
│ ├── setup-server.sh # Provisionamento completo do servidor
│ ├── deploy.sh # Deploy automatizado
│ └── backup/ # Scripts de backup
│ ├── db-backup.sh # Backup do PostgreSQL
│ └── restore-db.sh # Restauração de banco
├── tools/ # Utilitários
│ ├── monitor.sh # Monitoramento de recursos
│ └── cleanup.sh # Limpeza de arquivos temporários
└── LICENSE # Licença de uso

## Script Principal: setup-server.sh

### Visão Geral
Configuração automatizada de um servidor Ubuntu para o MapsProve, incluindo:
- Stack Node.js + PostgreSQL
- Nginx com SSL (via Certbot)
- Docker e Docker Compose
- Segurança básica (UFW, Fail2Ban)

### Pré-requisitos
```bash
# Sistema operacional
- Ubuntu Server 22.04 LTS (recomendado)
- Acesso root/sudo
- Conexão com internet

# Hardware mínimo
- 2 vCPUs
- 4GB RAM
- 20GB de armazenamento

# Modo completo (recomendado para primeira execução)
sudo bash scripts/infra/setup-server.sh --full

# Opções específicas:
--node-only     # Instala apenas Node.js
--db-only       # Configura apenas PostgreSQL
--docker-only   # Instala apenas Docker
--security      # Apenas configurações de segurança

Saída Esperada
Cria estrutura de diretórios:
~/mapsprove
├── backend/
├── frontend/
├── database/
│   ├── .db_credentials  # Arquivo protegido
│   └── backups/
└── logs/setup.log

Relatório final no terminal:
✅ Servidor configurado com sucesso!
- Node.js v18.12.1
- PostgreSQL 14.5
- Docker 20.10.12

Workflow Típico
sudo bash setup-server.sh --full
Deploy diário:
bash deploy.sh --env=production
Backup noturno (via cron):
0 2 * * * /home/user/mapsprove/scripts/backup/db-backup.sh

Boas Práticas
Credenciais:

Nunca faça commit de arquivos .db_credentials

Gere novas credenciais para cada ambiente

Execução:
# Sempre valide o script antes de executar
bash -n setup-server.sh  # Verifica sintaxe

Logs:

Consulte ~/mapsprove/logs/setup.log para troubleshooting

Troubleshooting Comum
Erro: "Package not found"
# Atualize a lista de pacotes primeiro
sudo apt update

Erro: "Permission denied"
# Verifique permissões e execute como sudo
sudo bash script.sh

Erro no PostgreSQL
# Reinicie o serviço e verifique logs
sudo systemctl restart postgresql
journalctl -u postgresql -b

Licença
Este projeto está licenciado sob MIT License.

✉️ Contato: paulo@msimplesinternet.net.br
🐛 Reportar Issues: Issues do GitHub
