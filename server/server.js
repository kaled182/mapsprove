const express = require('express');
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  res.send('MapsProve API');
});

app.listen(3001, () => {
  console.log('Servidor rodando na porta 3001');
});
