# 📂 scripts/

Este diretório contém scripts automatizados para infraestrutura, deploy e manutenção do sistema **MapsProve**.

---

## 📁 Estrutura do Diretório

```
scripts/
├── infra/              # Infraestrutura principal
│   ├── setup-server.sh     # Provisionamento completo do servidor
│   ├── deploy.sh           # Deploy automatizado
│   └── backup/
│       ├── db-backup.sh    # Backup do PostgreSQL
│       └── restore-db.sh   # Restauração de banco
├── tools/              # Utilitários diversos
│   ├── monitor.sh          # Monitoramento de recursos
│   └── cleanup.sh          # Limpeza de arquivos temporários
└── LICENSE             # Licença de uso
```

---

## 🚀 Script Principal: `setup-server.sh`

### 🔎 Visão Geral

Configuração automatizada de um servidor Ubuntu para o MapsProve, incluindo:

- Stack Node.js + PostgreSQL
- Nginx com SSL (via Certbot)
- Docker e Docker Compose
- Segurança básica: UFW + Fail2Ban

---

## 📦 Pré-requisitos

### Sistema Operacional
- Ubuntu Server 22.04 LTS (recomendado)
- Acesso `root` ou `sudo`
- Conexão com a internet

### Requisitos de Hardware
- 2 vCPUs
- 4GB de RAM
- 20GB de armazenamento (mínimo)

---

## ▶️ Modo de Execução

### 🟢 Execução Completa (recomendada para primeira vez)

```bash
sudo bash scripts/infra/setup-server.sh --full
```

### ⚙️ Modos Específicos (execução parcial)

```bash
--node-only     # Instala apenas Node.js
--db-only       # Configura apenas PostgreSQL
--docker-only   # Instala apenas Docker
--security      # Apenas configurações de segurança (firewall, Fail2Ban)
```

---

## 📂 Saída Esperada

Criação da seguinte estrutura:

```
~/mapsprove/
├── backend/
├── frontend/
├── database/
│   ├── .db_credentials   # Arquivo protegido com senha do PostgreSQL
│   └── backups/
└── logs/
    └── setup.log         # Log completo da instalação
```

---

## 🧭 Workflow Típico

### 🛠️ Primeira configuração
```bash
sudo bash setup-server.sh --full
```

### 🚀 Deploy diário
```bash
bash deploy.sh --env=production
```

### 🔁 Backup noturno (exemplo via `cron`)
```cron
0 2 * * * /home/user/mapsprove/scripts/infra/backup/db-backup.sh
```

---

## ✅ Boas Práticas

### 🔐 Credenciais
- **Nunca** faça commit de `.db_credentials`
- Gere novas credenciais para cada ambiente (produção, staging, etc)

### 🧪 Execução segura
```bash
bash -n setup-server.sh  # Validação de sintaxe
```

### 📝 Logs
- Consulte `~/mapsprove/logs/setup.log` para depuração

---

## 🧯 Troubleshooting Comum

| Problema                        | Solução                                                                 |
|--------------------------------|-------------------------------------------------------------------------|
| `Package not found`            | Execute `sudo apt update` antes de instalar                            |
| `Permission denied`            | Verifique permissões. Execute como `sudo`                              |
| Erro no PostgreSQL             | Reinicie o serviço com `sudo systemctl restart postgresql`             |
| Ver logs do PostgreSQL         | `journalctl -u postgresql -b`                                          |

---

## 📄 Licença

Este projeto está licenciado sob os termos da **MIT License**.

---

## 📬 Contato

- ✉️ **Responsável Técnico**: [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br)
- 🐛 **Reportar bugs/sugestões**: [GitHub Issues](https://github.com/kaled182/mapsprove/issues)
