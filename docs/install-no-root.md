# 🔐 Instalação Sem Root (Modo Usuário)

> Guia para executar o MapsProve em ambientes onde não se tem acesso root ou sudo.

---

## 📋 Pré-requisitos

| Requisito       | Detalhes                         |
|-----------------|----------------------------------|
| Sistema         | Ubuntu / Debian / WSL / MacOS    |
| Docker          | Instalado no modo usuário        |
| Permissões      | Usuário no grupo `docker`        |
| Git             | Acesso ao repositório            |

---

## 🐳 Passo a Passo

### 1. Clonar o Projeto

```bash
git clone https://github.com/kaled182/mapsprove.git
cd mapsprove
```

---

### 2. Instalar Docker no modo usuário

```bash
curl -fsSL https://get.docker.com | sh
```

> 💡 Caso já tenha o Docker instalado, pule esta etapa.

---

### 3. Adicionar Usuário ao Grupo Docker

```bash
sudo usermod -aG docker $USER
newgrp docker
```

> 🟡 Você pode precisar **reiniciar a sessão** para aplicar.

---

### 4. Copiar e Configurar `.env`

```bash
cp .env.example .env
nano .env
```

⚠️ **Edite os campos obrigatórios:**
- `GOOGLE_MAPS_API_KEY`
- `ZABBIX_API_URL`
- `APP_SECRET` → use `openssl rand -hex 32`

---

### 5. Executar com Docker Compose

```bash
docker-compose -f docker-compose.dev.yml up
```

Isso iniciará os containers `backend`, `frontend` e `postgres`, prontos para uso no ambiente de desenvolvimento.

---

## ✅ Verificação

Após iniciar, acesse no navegador:

```
http://localhost:3000
```

Você deverá ver a interface inicial do MapsProve.

---

## 🔄 Atualizando o Projeto

Sempre que fizer alterações no código:

```bash
# Parar os containers
docker-compose down

# Atualizar código local
git pull origin main

# Subir novamente
docker-compose -f docker-compose.dev.yml up
```

---

## 🔐 Segurança

Apesar de ser uma instalação sem root:

- As credenciais continuam sensíveis no `.env`
- O acesso ao banco de dados ainda requer cuidado
- Evite expor o serviço para fora da máquina

---

## 📦 Dica Extra: Alias para Subida Rápida

Adicione ao seu `.bashrc` ou `.zshrc`:

```bash
alias mapsprove-up='cd ~/mapsprove && docker-compose -f docker-compose.dev.yml up'
```

---

## ❓ Suporte

Em caso de problemas, consulte o [FAQ](docs/faq.md) ou envie dúvidas para:

📧 **Email**: [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br)

---

⬆️ [Voltar ao topo](#instalação-sem-root-modo-usuário)
