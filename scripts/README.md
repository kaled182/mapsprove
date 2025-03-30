# 📂 scripts/

Este diretório contém scripts automatizados para infraestrutura, deploy e manutenção do sistema **MapsProve**.

---

## 📁 Estrutura do Diretório

```
scripts/
├── infra/                 # Infraestrutura principal
│   ├── setup-server.sh        # Provisionamento completo do servidor
│   ├── deploy.sh              # Deploy automatizado
│   └── backup/
│       ├── db-backup.sh       # Backup do PostgreSQL
│       └── restore-db.sh      # Restauração de banco
├── tools/                 # Utilitários diversos
│   ├── monitor.sh             # Monitoramento de recursos
│   └── cleanup.sh             # Limpeza de arquivos temporários
└── LICENSE                # Licença de uso
```

---

## 🚀 Script Principal: `setup-server.sh`

### 🔎 Visão Geral

Configuração automatizada de um servidor Ubuntu para o MapsProve, incluindo:

- 🟢 Stack Node.js + PostgreSQL  
- 🔒 Nginx com SSL (via Certbot)  
- 🐳 Docker e Docker Compose  
- 🛡️ Segurança básica: UFW + Fail2Ban  

---

## 📦 Pré-requisitos

### Sistema Operacional
- Ubuntu Server 22.04 LTS (recomendado)
- Acesso `root` ou `sudo`
- Conexão com internet

### Hardware Mínimo

| Componente    | Especificação |
|---------------|---------------|
| CPU           | 2 vCPUs       |
| RAM           | 4GB           |
| Armazenamento | 20GB          |

---

## ▶️ Modos de Execução

```bash
# Execução completa (recomendado para primeira vez)
sudo bash scripts/infra/setup-server.sh --full

# Modos específicos:
--node-only     # Instala apenas Node.js
--db-only       # Configura apenas PostgreSQL
--docker-only   # Instala apenas Docker
--security      # Apenas configurações de segurança
```

---

## 📂 Saída Esperada

```
~/mapsprove/
├── backend/
├── frontend/
├── database/
│   ├── .db_credentials   # Arquivo protegido
│   └── backups/
└── logs/
    └── setup.log         # Log completo
```

---

## 🛠️ Workflow Recomendado

### Configuração Inicial

```bash
sudo bash setup-server.sh --full
```

### Deploy Diário

```bash
bash deploy.sh --env=production
```

### Backup Automatizado (cron)

```cron
0 2 * * * /home/user/mapsprove/scripts/infra/backup/db-backup.sh
```

---

## 🔐 Boas Práticas

| Prática                  | Comando/Exemplo                       |
|--------------------------|---------------------------------------|
| Validação de scripts     | `bash -n setup-server.sh`             |
| Proteger credenciais     | `chmod 600 .db_credentials`           |
| Verificação de logs      | `tail -f ~/mapsprove/logs/setup.log` |

---

## 🚨 Troubleshooting

### Problemas Comuns

#### 📦 Pacotes não encontrados:

```bash
sudo apt update && sudo apt upgrade
```

#### 🐘 Erros no PostgreSQL:

```bash
sudo systemctl restart postgresql
journalctl -u postgresql -b | tail -n 20
```

#### 🔐 Problemas de permissão:

```bash
sudo chown -R $USER:$USER ~/mapsprove
```

---

## 📜 Licença

MIT License — veja o arquivo `LICENSE`.

---

## 📬 Contato

- Responsável Técnico: [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br)  
- Reporte problemas via: [GitHub Issues](https://github.com/kaled182/mapsprove/issues)

---
⬆️ [Voltar ao topo](#scripts)
