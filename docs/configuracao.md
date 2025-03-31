# ⚙️ Configuração Avançada do MapsProve

> Guia completo para personalizar e otimizar o sistema

[![Atualizado](https://img.shields.io/badge/versão-1.1-blue)]()  
[![Requisitos](https://img.shields.io/badge/docker-20.10%2B-green)]()  

---

## 📌 Arquivo .env

### Estrutura Básica

```env
# ======================
# 🚀 PERFORMANCE
# ======================
PG_POOL_SIZE=20
NODE_ENV=production
```

```env
# ======================
# 🗺️ GOOGLE MAPS
# ======================
GOOGLE_MAPS_API_KEY=sua_chave_aqui
GOOGLE_MAPS_MAP_ID=opcional

# ======================
# 📡 ZABBIX
# ======================
ZABBIX_API_URL=http://seu_servidor/api_jsonrpc.php
ZABBIX_USER=usuario
ZABBIX_PASSWORD=senha_segura
```

---

## 🔧 Configurações Principais

### 1. Google Maps
- **API Key**: Veja como obter [aqui](https://developers.google.com/maps/documentation/javascript/get-api-key)
- **Map ID**: Opcional, para mapas personalizados com cores, labels e estilos.

### 2. Zabbix
- **URL da API**: Geralmente `http://[IP_DO_ZABBIX]/api_jsonrpc.php`
- **Permissões mínimas recomendadas**:

```json
{
  "host.get": "read",
  "item.get": "read"
}
```

---

## 🐳 Docker Compose

### Personalizando Serviços

```yaml
# docker-compose.override.yml (opcional)
version: '3.8'

services:
  frontend:
    ports:
      - "3000:3000" # Altere a porta se necessário

  postgres:
    volumes:
      - ./database:/var/lib/postgresql/data # Persistência de dados
```

---

## 🔐 Segurança

### Melhores Práticas

- `APP_SECRET`: Sempre gere uma nova chave:

```bash
openssl rand -hex 32
```

- **PostgreSQL**: Altere a senha padrão no `.env`
- **Firewall**: Restrinja o acesso às portas:
  - 3000 (frontend)
  - 5432 (postgres)

---

## 🛠️ Troubleshooting

### Erro: "Zabbix API Unreachable"

Verifique com o comando:

```bash
curl -X POST $ZABBIX_API_URL -d '{"jsonrpc":"2.0","method":"apiinfo.version","id":1,"auth":null,"params":{}}'
```

Se falhar, confira:
- Firewall
- URL correta
- Se o serviço Zabbix está rodando

---

## 📊 Otimizações

### Banco de Dados

```sql
-- Exemplo: Ajuste de performance
ALTER SYSTEM SET shared_buffers = '1GB';
```

### Frontend

Configure cache estático no Nginx:

```nginx
location /static {
  expires 1y;
}
```

---

## 📚 Documentação Relacionada

- [FAQ](docs/faq.md)
- [Instalação sem Root](docs/install-no-root.md)
- [Roadmap](docs/roadmap.md)

---

⬆️ [Voltar ao topo](#configuração-avançada-do-mapsprove)


---

## 🛠️ Solução de Problemas Comuns (Extras)

### Erro: "Porta 3000 em uso"

```bash
# Verifique processos usando a porta:
sudo lsof -i :3000

# Ou altere a porta no docker-compose.override.yml
```

---

## ❤️ Health Checks (Boa Prática)

Adicione no seu `docker-compose.override.yml`:

```yaml
services:
  backend:
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

---

