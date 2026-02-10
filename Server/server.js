// S'importen les llibreries necessàries:
// express: El framework que permet crear un servidor web fàcilment
const express = require("express");
const sqlite3 = require("sqlite3").verbose();

// body-parser: Un traductor per quan Unity ens envia dades (JSON)
// Aquesta eina les converteix en objectes de JavaScript, perquè es pugui llegir fàcilment
const bodyParser = require("body-parser");

// geoip-lite: Llibreria de geolocalització
const geoip = require('geoip-lite');

const app = express(); // S'inicia l'aplicació
app.use(bodyParser.json()); // Es prepara l'app per entendre JSON
app.use(bodyParser.urlencoded({ extended: true })); // Es prepara l'app per entendre formularis web

// Es connecta amb el fitxer físic de la base de dades
const db = new sqlite3.Database("./game_data.db");

let debugSimulatedIp = "84.88.1.1";

// db.get: Es demana una sola fila a la base de dades
// WHERE id = 1: Sempre es busca la fila 1, que actua com a configuració global
app.get('/api/get-event', (req, res) => {
    db.get("SELECT name, message, color FROM events WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message }); // Si la base de dades falla, avisem a Unity amb un error 500

        // Finalment, s'envia la resposta a Unity en format JSON: { "name": "christmas", "message": "Bon Nadal", "color": "#FF0000" }
        res.json(row);
    });
});

// El Dashboard 
app.get('/dashboard', (req, res) => {
    // Fem dues consultes per pintar la web: 
    // 1. L'estat de l'API | 2. L'estat de l'esdeveniment actual
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        db.get("SELECT name FROM events WHERE id = 1", (err, currentEvent) => {

            const inputs = (contract && contract.inputs) ? JSON.parse(contract.inputs) : [];
            const outputs = (contract && contract.outputs) ? JSON.parse(contract.outputs) : [];
            const activeEventName = currentEvent ? currentEvent.name.toUpperCase() : "DESCONEGUT";

            const geoSim = geoip.lookup(debugSimulatedIp);
            const regionSim = geoSim ? geoSim.country : "DESCONEGUT";

            res.send(`
                <html>
                <head>
                    <style>
                        body { font-family: 'Segoe UI', sans-serif; padding: 40px; background: #f0f2f5; }
                       .card { background: white; padding: 25px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0.1); max-width: 650px; margin: auto; }
                        h1 { text-align: center; color: #333; }
                        h2 { color: #1a73e8; border-bottom: 2px solid #eee; padding-bottom: 5px; margin-top: 25px; }
                       .section { margin-bottom: 15px; padding: 15px; background: #fafafa; border-radius: 5px; border-left: 5px solid #1a73e8; }
                       .event-section { border-left-color: #d32f2f; }
                       .status-bar { background: #333; color: white; padding: 10px; text-align: center; border-radius: 5px; margin-bottom: 20px; font-weight: bold; }
                        label { display: block; margin: 8px 0; cursor: pointer; }
                        button { background: #1a73e8; color: white; border: none; padding: 12px; border-radius: 5px; cursor: pointer; width: 100%; font-size: 16px; margin-top: 5px; transition: 0.2s; }
                        button:hover { opacity: 0.8; }
                       .btn-event { margin-bottom: 10px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    <div class="card">
                        <h1>Dashboard</h1>
                        
                        <div class="status-bar">
                            ESDEVENIMENT: <span style="color: #ffeb3b">${activeEventName}</span>
                            <br>
                            <br>
                            SIMULACIÓ IP: <span style="color: #ffeb3b">${regionSim} (${debugSimulatedIp})</span>
                        </div>

                        <form action="/update-contract" method="POST">
                            <h2>API Config (Contracte)</h2>
                            <div class="section">
                                <b>Inputs actius (Client → Servidor):</b>
                                <label><input type="checkbox" name="in_itemId" ${inputs.includes('itemId') ? 'checked' : ''}> Item ID</label>
                                <label><input type="checkbox" name="in_region" ${inputs.includes('region') ? 'checked' : ''}> Region</label>
                            </div>
                            <div class="section">
                                <b>Outputs actius (Servidor → Client):</b>
                                <label><input type="checkbox" name="out_price" ${outputs.includes('price') ? 'checked' : ''}> Price</label>
                                <label><input type="checkbox" name="out_currency" ${outputs.includes('currency') ? 'checked' : ''}> Currency</label>
                            </div>
                            <button type="submit">Actualitzar API</button>
                        </form>

                        <hr style="margin: 30px 0;">

                        <h2>Gestió d'Esdeveniments</h2>
                        <div class="section event-section">
                            <form action="/update-event" method="POST">
                                <button class="btn-event" name="eventName" value="normal" style="background: #607d8b;">⚪ Normal</button>
                                <button class="btn-event" name="eventName" value="christmas" style="background: #d32f2f;">🎄 Activar Nadal</button>
                                <button class="btn-event" name="eventName" value="sant_jordi" style="background: #fbc02d; color: black;">🌹 Activar Sant Jordi</button>
                            </form>
                        </div>

                        <h2>Simulador IP</h2>
                        <div class="section debug-section">
                            <form action="/debug/set-ip" method="POST" style="display:flex; gap:10px;">
                                <button class="btn-cat" name="fakeIp" value="84.88.1.1">🇪🇸 Simular ESP</button>
                                <button class="btn-us" name="fakeIp" value="8.8.8.8">🇺🇸 Simular USA</button>
                                <button class="btn-jp" name="fakeIp" value="1.72.0.0">🇯🇵 Simular JPN</button>
                            </form>
                        </div>

                    </div>
                </body>
                </html>
            `);
        });
    });
});

app.post('/debug/set-ip', (req, res) => {
    debugSimulatedIp = req.body.fakeIp;
    res.redirect('/dashboard');
});

app.post('/update-contract', (req, res) => {
    const newIn = [];
    if (req.body.in_itemId) newIn.push("itemId");
    if (req.body.in_region) newIn.push("region");

    const newOut = [];
    if (req.body.out_price) newOut.push("price");
    if (req.body.out_currency) newOut.push("currency");

    db.run(
        "UPDATE api_contract SET inputs =?, outputs =? WHERE endpoint = 'get-price'",
        [JSON.stringify(newIn), JSON.stringify(newOut)],
        (err) => {
            if (err) return console.error(err.message);

            res.redirect('/dashboard');
        }
    );
});


app.post('/api/get-price', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {

        const allowedInputs = (contract && contract.inputs) ? JSON.parse(contract.inputs) : [];
        const allowedOutputs = (contract && contract.outputs) ? JSON.parse(contract.outputs) : [];

        const itemId = allowedInputs.includes("itemId") ? req.body.itemId : null;
        let region = "CAT";

        // Es mira si l'API permet que Unity "forci" la regió manualment
        if (allowedInputs.includes("region") && req.body.region) {
            region = req.body.region;
            console.log("Regió forçada pel client:", region);
        }
        else {
            // Si no, es detecta la IP automàticament
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

            // Simulació per a Localhost
            if (ip.includes('127.0.0.1') || ip.includes('::1')) {
                ip = debugSimulatedIp;
            }

            const geo = geoip.lookup(ip);
            if (geo) {
                if (geo.country === "ES" && geo.region === "CT") region = "CAT"; // Catalunya
                else if (geo.country === "JP") region = "JP"; // Japó
                else region = "US"; // Resta del món (Dòlars)
            }
        }

        db.get(
            "SELECT price, currency FROM shop_prices WHERE item_id =? AND region =?",
            [itemId, region],
            (err, row) => {

                if (err) return res.status(500).json({ error: "DB error" });
                if (!row) return res.json({ error: "No data found" });

                let response = {};
                if (allowedOutputs.includes("price")) response.price = row.price;
                if (allowedOutputs.includes("currency")) response.currency = row.currency;

                res.json(response);
            }
        );
    });
});

app.post('/update-event', (req, res) => {
    const eventName = req.body.eventName;
    let message = "Benvingut";
    let color = "#FFFFFF";

    if (eventName === "christmas") { message = "Bon Nadal!"; color = "#FF0000"; }
    if (eventName === "sant_jordi") { message = "Feliç Diada!"; color = "#FFD700"; }

    db.run("UPDATE events SET name =?, message =?, color =? WHERE id = 1", [eventName, message, color], () => {
        res.redirect('/dashboard');
    });
});

app.listen(3000, () => {
    console.log("Servidor CRM llest a http://localhost:3000/dashboard");
});