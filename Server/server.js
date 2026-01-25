const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = new sqlite3.Database('./game_data.db');

// 1. ASSEGUREM QUE LA TAULA DE LOGS EXISTEIX (Per si no has passat el setup)
db.run("CREATE TABLE IF NOT EXISTS activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_seen TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");


// --- CAMINET 1: Unity demana informació (GET) ---
app.get('/api/get-event', (req, res) => {
    db.get("SELECT name, message, color FROM events WHERE id = 1", (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message });
            return;
        }

        // --- NOVETAT CRM: Guardem que Unity ha fet una petició ---
        // Això omple la base de dades amb dades reals d'ús
        db.run("INSERT INTO activity_log (event_seen) VALUES (?)", [row.name]);
        console.log(`📊 Log guardat: L'usuari ha consultat l'estat '${row.name}'`);

        res.json(row);
    });
});


// --- CAMINET 2: El Dashboard (Amb Gràfiques d'Analítica) ---
app.get('/dashboard', (req, res) => {
    // Primer consultem les estadístiques a la Base de Dades
    db.all("SELECT event_seen, COUNT(*) as count FROM activity_log GROUP BY event_seen", (err, rows) => {

        // Preparem la llista d'estadístiques per pintar-la al HTML
        let statsHtml = "";
        if (rows) {
            rows.forEach(r => {
                statsHtml += `<li>Esdeveniment <b>${r.event_seen.toUpperCase()}</b>: mostrat ${r.count} vegades.</li>`;
            });
        }

        // Enviem la pàgina web
        res.send(`
            <html>
            <head>
                <style>
                    body { font-family: sans-serif; padding: 30px; background: #f0f0f0; }
                   .container { background: white; padding: 20px; border-radius: 8px; max-width: 600px; margin: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                    button { padding: 15px; width: 100%; margin: 5px 0; cursor: pointer; border: none; font-size: 16px; }
                   .stats { background: #e8f4f8; padding: 15px; border-radius: 5px; margin-top: 20px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>🎛️ LiveOps Dashboard</h1>
                    <p>Controla l'estat del joc en temps real:</p>
                    
                    <form action="/update-event" method="POST">
                        <button name="eventName" value="normal" style="background:#eee;">⚪ Mode Normal</button>
                        <button name="eventName" value="christmas" style="background:#ffcccc;">🎄 Mode Nadal</button>
                        <button name="eventName" value="sant_jordi" style="background:#ffffcc;">🌹 Mode Sant Jordi</button>
                    </form>

                    <div class="stats">
                        <h3>📈 Analítica de Connexions</h3>
                        <p>Quantes vegades s'ha carregat cada esdeveniment?</p>
                        <ul>
                            ${statsHtml || "<li>Encara no hi ha dades. Connecta Unity!</li>"}
                        </ul>
                        <br>
                        <small><i>Nota: Si Unity fa polling cada 5s, aquests números pujaran ràpid!</i></small>
                    </div>
                </div>
            </body>
            </html>
        `);
    });
});

// --- CAMINET 3: PREUS DINÀMICS PER REGIÓ ---
app.post('/api/get-price', (req, res) => {
    const { itemId, region } = req.body;

    db.get(
        "SELECT price FROM shop_prices WHERE item_id = ? AND region = ?",
        [itemId, region],
        (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message });
            }

            // Log CRM (opcional però molt bé)
            db.run(
                "INSERT INTO activity_log (event_seen) VALUES (?)",
                [`price_request_${itemId}_${region}`]
            );

            if (!row) {
                return res.json({ price: 2.99 }); // fallback
            }

            res.json({ price: row.price });
        }
    );
});

app.post('/update-event', (req, res) => {
    const eventName = req.body.eventName;
    let message = "Benvingut";
    let color = "#FFFFFF";

    if (eventName === "christmas") { message = "Bon Nadal!"; color = "#FF0000"; }
    if (eventName === "sant_jordi") { message = "Feliç Diada!"; color = "#FFD700"; }

    db.run(
        "UPDATE events SET name =?, message =?, color =? WHERE id = 1",
        [eventName, message, color],
        (err) => {
            if (err) return console.error(err.message);
            console.log(`LiveOps Update: Canviat a ${eventName}`);
            res.redirect('/dashboard');
        }
    );
});

app.listen(3000, () => {
    console.log("🚀 Servidor CRM llest a http://localhost:3000/dashboard");
});