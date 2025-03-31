# ❓ FAQ — Perguntas Frequentes  

[![Atualizado](https://img.shields.io/badge/última_atualização-março_2025-blue)]()  

---

## 🔧 Instalação  

### 1. Posso usar outro sistema além do Ubuntu?  
> **Não recomendado**. O script `setup-server.sh` foi testado apenas em:  
> - Ubuntu 22.04 LTS  
> - Debian 11 (com ajustes manual no Docker)  

---

### 2. Como instalar sem root?  
```bash
# Passo a passo:
1. Instale Docker em modo usuário:
   curl -fsSL https://get.docker.com | sh

2. Adicione seu usuário ao grupo docker:
   sudo usermod -aG docker $USER

3. Siga o tutorial em [docs/install-no-root.md](docs/install-no-root.md)
```

---

## ⚙️ Configuração  

### 3. O que é o arquivo `.env`?  
> Contém configurações sensíveis do sistema (API Keys, senhas, URL do banco).  
> Use o `.env.example` como base e renomeie para `.env`.

---

### 4. Como obtenho minha chave do Google Maps?  
1. Acesse: [Google Cloud Console](https://console.cloud.google.com/)  
2. Crie um projeto  
3. Ative a **Maps JavaScript API**  
4. Gere uma nova chave e copie para `GOOGLE_MAPS_API_KEY`

---

### 5. Quais permissões mínimas no Zabbix?  
> O usuário precisa ter acesso às APIs:  
- `host.get`  
- `item.get`  
- `trigger.get`  

```json
// Exemplo de role no Zabbix:
{
  "name": "mapsprove_monitor",
  "type": "3", 
  "rules": {
    "hosts": ["read"]
  }
}
```

> Consulte a [documentação oficial do Zabbix](https://www.zabbix.com/documentation/current/en/manual/api) para detalhes das APIs.

---

## 🗺️ Uso do Sistema  

### 6. Posso desenhar rotas manualmente?  
> Sim. A plataforma permite desenhar rotas no mapa com clique ponto a ponto.

---

### 7. Onde vejo o status das rotas?  
> No dashboard principal: `http://seu-ip/dashboard`

![Exemplo Dashboard](docs/screenshots/dashboard.png)

---

### 8. O sistema muda a cor das rotas automaticamente?  
> Sim. Baseado no status:  
- 🟢 Verde = UP  
- 🔴 Vermelho = DOWN  

---

## 📦 Backup e Deploy

### 9. Como agendar backups automáticos?  
```bash
# Adicionar ao crontab (backup diário às 2AM)
0 2 * * * /caminho/para/mapsprove/scripts/infra/backup/db-backup.sh
```

---

### 10. Onde os backups são armazenados?  
> Por padrão em:  
`/var/backups/mapsprove/db/`  

```bash
# Listar backups recentes:
ls -lh /var/backups/mapsprove/db/
```

---

## 🚨 Solução de Problemas  

### 11. Erro "API Key Invalid" no Google Maps  
1. Verifique:  
   - Se a API está habilitada no Google Cloud  
   - Se a chave foi copiada corretamente (sem espaços)  

2. Reinicie o container frontend:  
```bash
docker-compose restart frontend
```

---

## 📬 Suporte  

### 12. Quem posso contactar?  
> Responsável técnico:

📧 **Email**: [paulo@msimplesinternet.net.br](mailto:paulo@msimplesinternet.net.br)  
🕗 Segunda à Sexta, 08h–18h (GMT-3)

---

⬆️ [Voltar ao topo](#faq)
