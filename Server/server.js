// S'importen les llibreries necessàries:
// express: El framework que permet crear un servidor web fàcilment
const express = require("express");

const sqlite3 = require("sqlite3").verbose();

// body-parser: Un traductor per quan Unity ens envia dades (JSON)
// Aquesta eina les converteix en objectes de JavaScript, perquè es pugui llegir fàcilment
const bodyParser = require("body-parser");

const app = express(); // S'inicia l'aplicació
app.use(bodyParser.json()); // Es prepara l'app per entendre JSON
app.use(bodyParser.urlencoded({ extended: true })); // Es prepara l'app per entendre formularis web

// Es connecta amb el fitxer físic de la base de dades
const db = new sqlite3.Database("./game_data.db");

// db.get: Es demana una sola fila a la base de dades
// WHERE id = 1: Sempre es busca la fila 1, que actua com a configuració global
app.get('/api/get-event', (req, res) => {
    db.get("SELECT name, message, color FROM events WHERE id = 1", (err, row) => {
        if (err) {
            res.status(500).json({ error: err.message }); // Si la base de dades falla, avisem a Unity amb un error 500
            return;
        }

        // S'omple la base de dades amb dades reals d'ús
        db.run("INSERT INTO activity_log (event_seen) VALUES (?)", [row.name]);

        // Finalment, s'envia la resposta a Unity en format JSON: { "name": "christmas", "message": "Bon Nadal", "color": "#FF0000" }
        res.json(row);
    });
});

// El Dashboard 
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

        // Enviem tot el codi HTML al navegador
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
                    <h1>Dashboard</h1>
                    <p>Controla l'estat del joc en temps real:</p>
                    
                    <form action="/update-event" method="POST">
                        <button name="eventName" value="normal" style="background:#eee;">Mode Normal</button>
                        <button name="eventName" value="christmas" style="background:#ffcccc;">Mode Nadal</button>
                        <button name="eventName" value="sant_jordi" style="background:#ffffcc;">Mode Sant Jordi</button>
                    </form>
                </div>
            </body>
            </html>
        `);
    });
});


app.post('/api/get-price', (req, res) => {
    const { itemId, region } = req.body;

    db.get("SELECT price FROM shop_prices WHERE item_id = ? AND region = ?", [itemId, region], (err, row) => {
            if (err) {
                return res.status(500).json({ error: err.message }); // Si la base de dades falla, avisem a Unity amb un error 500
            }

            db.run(
                "INSERT INTO activity_log (event_seen) VALUES (?)",
                [`price_request_${itemId}_${region}`]
            );

            if (!row) {
                return res.json({ price: 3.99 }); // fallback
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
    console.log("Servidor CRM llest a http://localhost:3000/dashboard");
});