const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const simulationRoutes = require('./routes/simulation');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(cors());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.use('/api/auth', authRoutes);
app.use('/api/simulation', simulationRoutes);

app.use(express.static('public'));

// O servidor irá usar a porta definida pela hospedagem ou a porta 3000 como padrão
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});