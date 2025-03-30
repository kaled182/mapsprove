# 📂 Pasta: scripts/

Este diretório contém scripts automatizados utilizados para provisionamento, manutenção e configuração da infraestrutura do sistema **MapsProve**.

---

## 📜 setup-server.sh

Script de instalação completo e automatizado para preparar um servidor Ubuntu para rodar o MapsProve.

### O que ele faz:

- Atualiza o sistema e instala pacotes essenciais
- Instala e configura:
  - Node.js e npm
  - PostgreSQL com usuário e banco dedicados
  - Nginx + Certbot (com suporte a SSL)
  - Docker e Docker Compose
  - Fail2Ban e UFW (segurança)
- Cria a estrutura inicial do projeto:
  - backend/
  - frontend/
  - database/ (com backup e credenciais protegidas)
  - scripts/
  - nginx/
  - logs/
- Salva logs detalhados da execução e as credenciais do banco em arquivos separados

---

### 📦 Requisitos:

- Ubuntu Server (recomendado: 22.04 LTS)
- Conexão com a internet
- Acesso root ou sudo

---

### ▶️ Execução:

```bash
cd scripts
sudo bash setup-server.sh
