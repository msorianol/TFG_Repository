const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware per entendre JSON i permetre connexions externes
app.use(cors());
app.use(express.json());

// Endpoint: Unity cridara aqui
app.post('/api/button-action', (req, res) => {
    console.log("Data recieved from Unity:", req.body);

    // Resposta que enviem a Unity
    const response = {
        message: "Connexion done!",
        status: "OK",
        toDo: "Reward"
    };

    res.json(response);
});

// Obrir servidor
app.listen(PORT, () => {
    console.log("Servidor active at http://localhost:${PORT}");
});