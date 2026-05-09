const express = require('express');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Rutes
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

app.use('/api', apiRoutes);
app.use('/', adminRoutes);
app.use('/', dashboardRoutes);

app.listen(3000, () => {
    console.log("🚀 Servidor CRM llest a http://localhost:3000/dashboard");
});
