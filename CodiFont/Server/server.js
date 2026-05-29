const express = require('express');
const bodyParser = require('body-parser');
const auth = require('./auth');

const app = express();
app.use(bodyParser.json());

// server.js - configuració del middleware de Express
app.use(bodyParser.urlencoded({ extended: true }));

// Rutes publiques (Unity) — sense auth
const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Rutes protegides (dashboard + admin) — requereixen usuari i contrasenya
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');
app.use('/', auth, adminRoutes);
app.use('/', auth, dashboardRoutes);

app.listen(3000, () => {
    console.log("Servidor CRM llest a http://localhost:3000/dashboard");
});
