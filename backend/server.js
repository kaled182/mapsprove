require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Conexão PostgreSQL
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: 5432
});

// Rotas
app.get('/api/test', (req, res) => {
  res.json({ message: "MapsProve API Online!" });
});

app.post('/api/zabbix/status', async (req, res) => {
  try {
    const response = await axios.post(process.env.ZABBIX_URL, {
      jsonrpc: "2.0",
      method: "item.get",
      params: {
        output: ["lastvalue"],
        hostids: req.body.hostids,
        search: { key_: "net.if.status" }
      },
      auth: process.env.ZABBIX_AUTH_TOKEN,
      id: 1
    });
    res.json(response.data.result);
  } catch (error) {
    res.status(500).json({ error: "Erro ao consultar Zabbix" });
  }
});

app.listen(3001, () => console.log('Backend rodando na porta 3001'));
