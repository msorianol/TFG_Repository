const express = require('express');
const cors = require('cors');
const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
// Necessari per llegir les dades dels formularis HTML (botons)
app.use(express.urlencoded({ extended: true }));

// --- GAME STATE (MEMORY) ---
// Per defecte, l'esdeveniment és 'normal'
let gameState = {
    activeEvent: "normal",        // abans 'esdeveniment'
    welcomeMessage: "Welcome!"    // abans 'missatgeBenvinguda'
};

// --- UNITY ENDPOINTS ---

// 1. Unity preguntarà la configuració (GET)
app.get('/api/config', (req, res) => {
    console.log("Unity requested config.");
    // Enviem l'objecte amb les claus en anglès
    res.json(gameState);
});

// 2. Unity enviarà dades
app.post('/api/button-action', (req, res) => {
    console.log("Data received:", req.body);
    res.json({ status: "OK", received: true });
});

app.get('/api/check-user', (req, res) => {
    let userType = req.query.type; // Rebem el tipus d'usuari
    let currentEvent = gameState.activeEvent;
    
    let responseData = {
        event: currentEvent,
        color: ""
    };

    // Lògica CRM: Diferent contingut segons l'usuari
    // Lògica si és VIP
    if (userType === "VIP") {
        responseData.message = "Hola VIP! Gràcies pel teu suport.";
        responseData.color = "Gold";
        
        // Bonus extra si a més és Nadal
        if (currentEvent === "christmas") {
            gameState.welcomeMessage = "Bon Nadal VIP! Tens un regal doble!";
        }
    } 
    // Lògica si NO és VIP
    else {
        if (currentEvent === "christmas") {
            gameState.welcomeMessage = "Bon Nadal!";
            responseData.color = "Red";
        }
    }

    res.json(responseData);
});

// --- WEB DASHBOARD ENDPOINTS ---

// 1. Veure el panell de control
app.get('/', (req, res) => {
    let html = `
    <html>
        <head><style>body{font-family:sans-serif; padding:20px;} button{padding:10px; margin:5px; cursor:pointer;}</style></head>
        <body>
            <h1>LiveOps Admin Console</h1>
            <div style="border: 1px solid #ccc; padding: 20px; background: #646464ff;">
                <h2>Current State: <span style="color:blue">${gameState.activeEvent.toUpperCase()}</span></h2>
                <p>Select the active event for players:</p>
                
                <form action="/change-event" method="POST">
                    <button name="event" value="normal" style="background:#eee;">Normal Mode</button>
                    <button name="event" value="christmas" style="background:#ffcccc;">Christmas Mode 🎄</button>
                    <button name="event" value="sant_jordi" style="background:#ffffcc;">Sant Jordi Mode 🌹</button>
                </form>
            </div>
        </body>
    </html>
    `;
    res.send(html);
});

// 2. Rebre l'ordre de canvi des de la web
app.post('/change-event', (req, res) => {
    // Actualitzem l'estat global
    gameState.activeEvent = req.body.event;

    // Personalitzem missatges segons l'event
    if (req.body.event === 'christmas') {
        gameState.welcomeMessage = "Merry Christmas, Player!";
    }
    else if (req.body.event === 'sant_jordi') {
        gameState.welcomeMessage = "Happy Sant Jordi Day!";
    }
    else {
        gameState.welcomeMessage = "Welcome to the game.";
    }

    console.log("CRM: Event changed to -> " + req.body.event);
    res.redirect('/'); // Tornem a carregar la pàgina
});

app.listen(PORT, () => {
    console.log("CRM active at http://localhost:${PORT}");
});