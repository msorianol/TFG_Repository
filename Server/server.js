const express  = require("express");
const sqlite3  = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const geoip    = require('geoip-lite');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = new sqlite3.Database("./game_data.db");

let debugSimulatedIp = "84.88.1.1";

// ------------------------------------
// INIT DB: Afegim la columna 'rules' si no existeix.
// Permet que el servidor arrenqui sense errors encara
// que la DB sigui antiga i no tingui aquesta columna.
// ------------------------------------
db.run("ALTER TABLE api_contract ADD COLUMN rules TEXT DEFAULT '[]'", () => {
    // Si ja existia, SQLite llança un error que ignoram silenciosament.
    // Si no existia, l'acaba de crear amb array buit per defecte.
});


// ------------------------------------
//  HELPERS
// ------------------------------------

// Normalitza sempre al format [{name, active}]
// Retrocompatible amb l'antic format (array de strings).
function parseFields(raw) {
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map(item =>
        typeof item === "string" ? { name: item, active: true } : item
    );
}

// Retorna només els noms dels camps actius
function activeNames(fields) {
    return fields.filter(f => f.active).map(f => f.name);
}

// Llegeix les regles de la DB
function parseRules(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
}

// ------------------------------------
// MOTOR DE REGLES
// Avalua totes les regles contra les dades rebudes.
// Operadors suportats: >= <= == > < !=
// Si múltiples regles apliquen, s'aplica el MAJOR descompte.
// ------------------------------------
function applyRules(rules, data) {
    let bestDiscount = 0;

    for (const rule of rules) {
        const rawVal = data[rule.field];
        if (rawVal === undefined || rawVal === null || rawVal === "") continue;

        // Tractem com a número si és possible; si no, comparem com a string
        const isNumeric = !isNaN(rawVal) && !isNaN(rule.value);
        const fieldVal  = isNumeric ? parseFloat(rawVal)     : String(rawVal).trim().toLowerCase();
        const ruleVal   = isNumeric ? parseFloat(rule.value) : String(rule.value).trim().toLowerCase();

        let match = false;
        switch (rule.operator) {
            case ">=": match = isNumeric && fieldVal >= ruleVal; break;
            case "<=": match = isNumeric && fieldVal <= ruleVal; break;
            case ">":  match = isNumeric && fieldVal >  ruleVal; break;
            case "<":  match = isNumeric && fieldVal <  ruleVal; break;
            case "==": match = fieldVal == ruleVal;              break;
            case "!=": match = fieldVal != ruleVal;              break;
        }

        if (match) {
            const d = parseFloat(rule.discount) || 0;
            if (d > bestDiscount) bestDiscount = d;
            console.log(`✅ Regla aplicada: ${rule.field} ${rule.operator} ${rule.value} → ${d*100}% de descompte`);
        }
    }
    return bestDiscount;
}


// ------------------------------------
//  API ENDPOINTS (cridats per Unity)
// ------------------------------------

// GET /api/get-event
app.get('/api/get-event', (req, res) => {
    db.get("SELECT name, message, color FROM events WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row);
    });
});

// GET /api/get-contract
// Retorna els inputs actius perquè Unity sàpiga quins camps ha d'enviar.
app.get('/api/get-contract', (req, res) => {
    db.get("SELECT inputs FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!row) return res.json({ inputs: [] });
        res.json({ inputs: activeNames(parseFields(row.inputs)) });
    });
});

// POST /api/get-price
// Calcula el preu final aplicant geolocalització i les regles actives.
app.post('/api/get-price', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {

        const allowedInputs  = activeNames(parseFields(contract && contract.inputs));
        const allowedOutputs = activeNames(parseFields(contract && contract.outputs));
        const rules          = parseRules(contract && contract.rules);

        // 1. Recollim tots els inputs que Unity ha enviat i el contracte permet
        let receivedData = {};
        allowedInputs.forEach(field => {
            const val = req.body[field];
            if (val !== undefined && val !== null) receivedData[field] = val;
        });

        const itemId = req.body.itemId || "unknown";

        // 2. Detecció de regió
        let region = "US";
        if (allowedInputs.includes("region") && receivedData.region) {
            region = receivedData.region;
        } else {
            let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
            if (ip.includes('127.0.0.1') || ip.includes('::1')) ip = debugSimulatedIp;
            const geo = geoip.lookup(ip);
            if (geo) {
                if      (geo.country === "ES" && geo.region === "CT") region = "CAT";
                else if (geo.country === "JP") region = "JP";
                else    region = "US";
            }
        }

        // 3. Apliquem el motor de regles
        const discount = applyRules(rules, receivedData);
        if (discount > 0) console.log(`💰 Descompte total aplicat: ${discount * 100}%`);

        // 4. Consulta a la DB i resposta
        db.get("SELECT * FROM shop_prices WHERE item_id = ? AND region = ?", [itemId, region], (err, row) => {
            if (err) return res.status(500).json({ error: "DB error" });
            if (!row) return res.json({ error: "Item not found" });

            let response = {};
            allowedOutputs.forEach(field => {
                if      (field === "price")    response.price    = parseFloat((row.price * (1 - discount)).toFixed(2));
                else if (field === "currency") response.currency = row.currency;
                else    response[field] = row[field] !== undefined ? row[field] : 0;
            });

            res.json(response);
        });
    });
});


// ------------------------------------
//  DASHBOARD
// ------------------------------------

app.get('/dashboard', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        db.get("SELECT name FROM events WHERE id = 1", (err, currentEvent) => {

            const inputs  = parseFields(contract && contract.inputs)  || [{ name: "itemId", active: true }];
            const outputs = parseFields(contract && contract.outputs) || [{ name: "price",  active: true }];
            const rules   = parseRules(contract && contract.rules);
            const activeEventName = currentEvent ? currentEvent.name.toUpperCase() : "UNKNOWN";

            const geoSim    = geoip.lookup(debugSimulatedIp);
            const regionSim = geoSim ? geoSim.country : "UNKNOWN";

            // ── Renderitza una fila de camp (inputs/outputs) ──
            function renderFieldRows(fields, prefix) {
                if (fields.length === 0) return `<p class="empty">No hi ha camps definits.</p>`;
                return fields.map(field => `
                    <div class="field-row ${field.active ? '' : 'field-off'}">
                        <label class="switch">
                            <input type="checkbox" name="active_${prefix}_${field.name}" ${field.active ? 'checked' : ''}>
                            <span class="track"></span>
                        </label>
                        <span class="field-name">${field.name}</span>
                        <span class="pill ${field.active ? 'pill-on' : 'pill-off'}">${field.active ? 'actiu' : 'inactiu'}</span>
                        <a href="/delete-field?fieldName=${field.name}&fieldType=${prefix}"
                           onclick="return confirm('Eliminar ${field.name}?')"
                           class="del-btn" title="Eliminar">×</a>
                    </div>`).join('');
            }

            // ── Renderitza les regles actuals ──
            function renderRules(rules) {
                if (rules.length === 0) return `<p class="empty">Cap regla definida.</p>`;
                return rules.map((rule, i) => `
                    <div class="rule-row">
                        <span class="rule-body">
                            <code>${rule.field}</code>
                            <span class="op">${rule.operator}</span>
                            <code>${rule.value}</code>
                            <span class="arrow">→</span>
                            <strong>${Math.round(rule.discount * 100)}% de descompte</strong>
                        </span>
                        <a href="/delete-rule?index=${i}"
                           onclick="return confirm('Eliminar aquesta regla?')"
                           class="del-btn" title="Eliminar">×</a>
                    </div>`).join('');
            }

            const fieldOptions = inputs.map(f =>
                `<option value="${f.name}">${f.name}${f.active ? '' : ' (inactiu)'}</option>`
            ).join('');

            const inputRows  = renderFieldRows(inputs,  'in');
            const outputRows = renderFieldRows(outputs, 'out');
            const ruleRows   = renderRules(rules);

            res.send(`<!DOCTYPE html>
<html lang="ca">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LiveOps Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg:        #111318;
            --surface:   #1a1d24;
            --border:    #272b35;
            --border2:   #323846;
            --text:      #e2e4e9;
            --text-2:    #8b909e;
            --text-3:    #555b6b;
            --accent:    #e2e4e9;
            --green:     #34d399;
            --green-bg:  rgba(52,211,153,0.08);
            --green-bdr: rgba(52,211,153,0.25);
            --red:       #f87171;
            --red-bg:    rgba(248,113,113,0.08);
            --amber:     #fbbf24;
            --amber-bg:  rgba(251,191,36,0.07);
            --amber-bdr: rgba(251,191,36,0.25);
            --mono:      'DM Mono', monospace;
            --sans:      'DM Sans', sans-serif;
            --radius:    8px;
        }

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--sans);
            font-size: 14px;
            background: var(--bg);
            color: var(--text);
            min-height: 100vh;
            padding: 48px 20px 80px;
            line-height: 1.5;
        }

        /* ── LAYOUT ── */
        .page { max-width: 720px; margin: 0 auto; }

        /* ── HEADER ── */
        .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
            margin-bottom: 32px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border);
        }
        .header-left h1 {
            font-size: 22px;
            font-weight: 600;
            letter-spacing: -0.3px;
            color: var(--text);
        }
        .header-left p {
            font-size: 13px;
            color: var(--text-2);
            margin-top: 2px;
        }
        .status-badge {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 12px;
            color: var(--text-2);
        }
        .status-dot {
            width: 7px; height: 7px;
            border-radius: 50%;
            background: var(--green);
        }

        /* ── META BAR ── */
        .meta-bar {
            display: flex;
            gap: 0;
            margin-bottom: 32px;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            background: var(--surface);
            overflow: hidden;
        }
        .meta-item {
            flex: 1;
            padding: 14px 18px;
            border-right: 1px solid var(--border);
        }
        .meta-item:last-child { border-right: none; }
        .meta-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: var(--text-3);
            margin-bottom: 4px;
        }
        .meta-value {
            font-size: 14px;
            font-weight: 600;
            color: var(--text);
            font-family: var(--mono);
        }

        /* ── SECTION ── */
        .section {
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            margin-bottom: 12px;
        }
        .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 20px;
            border-bottom: 1px solid var(--border);
        }
        .section-title {
            font-size: 13px;
            font-weight: 600;
            letter-spacing: -0.1px;
        }
        .section-hint {
            font-size: 12px;
            color: var(--text-3);
        }
        .section-body { padding: 16px 20px; }

        /* ── SUBSECTION LABEL ── */
        .sub-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.6px;
            color: var(--text-3);
            margin: 20px 0 10px;
        }
        .sub-label:first-child { margin-top: 0; }

        /* ── FIELD ROW ── */
        .field-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 9px 12px;
            border-radius: 6px;
            border: 1px solid var(--border);
            margin-bottom: 5px;
            background: var(--surface);
            transition: border-color 0.15s;
        }
        .field-row:hover { border-color: var(--border2); }
        .field-off { background: var(--bg); }
        .field-off .field-name { color: var(--text-3); }

        .field-name {
            flex: 1;
            font-family: var(--mono);
            font-size: 13px;
            font-weight: 500;
        }

        /* Toggle */
        .switch { position: relative; flex-shrink: 0; cursor: pointer; }
        .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
        .track {
            display: block;
            width: 32px; height: 18px;
            background: var(--border2);
            border-radius: 9px;
            position: relative;
            transition: background 0.2s;
        }
        .track::after {
            content: '';
            position: absolute;
            top: 3px; left: 3px;
            width: 12px; height: 12px;
            border-radius: 50%;
            background: white;
            transition: transform 0.2s;
            box-shadow: 0 1px 3px rgba(0,0,0,0.15);
        }
        .switch input:checked + .track { background: var(--green); }
        .switch input:checked + .track::after { transform: translateX(14px); }

        /* Pills */
        .pill {
            font-size: 10px;
            font-weight: 500;
            letter-spacing: 0.3px;
            padding: 2px 8px;
            border-radius: 20px;
        }
        .pill-on  { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bdr); }
        .pill-off { background: var(--bg); color: var(--text-3); border: 1px solid var(--border); }

        /* Delete */
        .del-btn {
            display: inline-flex; align-items: center; justify-content: center;
            width: 22px; height: 22px;
            border-radius: 4px;
            color: var(--text-3);
            text-decoration: none;
            font-size: 16px; line-height: 1;
            transition: color 0.15s, background 0.15s;
        }
        .del-btn:hover { background: var(--red-bg); color: var(--red); }

        /* Add row */
        .add-row {
            display: flex;
            gap: 8px;
            align-items: center;
            margin-top: 10px;
            padding: 10px 12px;
            border: 1px dashed var(--border2);
            border-radius: 6px;
            background: var(--bg);
        }
        .add-label {
            font-size: 12px;
            color: var(--text-3);
            white-space: nowrap;
        }

        /* ── RULE ROW ── */
        .rule-row {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 12px;
            border: 1px solid var(--amber-bdr);
            border-radius: 6px;
            background: var(--amber-bg);
            margin-bottom: 5px;
        }
        .rule-body {
            flex: 1;
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
            font-size: 13px;
        }
        .rule-body code {
            font-family: var(--mono);
            font-size: 12px;
            background: rgba(0,0,0,0.05);
            padding: 1px 6px;
            border-radius: 3px;
        }
        .op {
            font-family: var(--mono);
            font-size: 12px;
            color: #f87171;
        }
        .arrow { color: #f87171; }
        .rule-body strong { color: var(--green); }

        /* ── INPUTS / SELECTS ── */
        input[type="text"], input[type="number"], select {
            font-family: var(--mono);
            font-size: 12px;
            color: var(--text);
            background: var(--surface);
            border: 1px solid var(--border);
            border-radius: 5px;
            padding: 6px 10px;
            outline: none;
            transition: border-color 0.15s;
        }
        input[type="text"]:focus,
        input[type="number"]:focus,
        select:focus { border-color: var(--accent); }
        input[type="number"] { width: 68px; }
        select { min-width: 110px; }

        /* ── BUTTONS ── */
        button {
            font-family: var(--sans);
            font-size: 13px;
            font-weight: 500;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            transition: opacity 0.15s;
        }
        button:hover { opacity: 0.75; }

        .btn-save {
            width: 100%;
            margin-top: 16px;
            padding: 11px;
            background: #2563eb;
            color: white;
            font-size: 13px;
            letter-spacing: 0.2px;
        }

        .btn-add {
            padding: 7px 14px;
            background: #7c3aed;
            color: white;
            font-size: 12px;
        }

        .btn-event {
            width: 100%;
            padding: 11px;
            margin-bottom: 6px;
            text-align: left;
            font-size: 13px;
        }
        .btn-event:last-child { margin-bottom: 0; }

        /* ── IP GRID ── */
        .ip-grid { display: flex; gap: 8px; flex-wrap: wrap; }
        .ip-grid button {
            padding: 9px 16px;
            background: var(--bg);
            color: var(--text);
            border: 1px solid var(--border);
            font-size: 12px;
        }
        .ip-grid button:hover { border-color: var(--border2); opacity: 1; background: #efefed; }

        /* ── EMPTY ── */
        .empty { font-size: 12px; color: var(--text-3); font-style: italic; padding: 4px 0; }

        /* ── FOOTER ── */
        .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: var(--text-3);
        }
        .footer a { color: var(--text-2); text-decoration: none; }
        .footer a:hover { color: var(--text); }

        hr.sep { border: none; border-top: 1px solid var(--border); margin: 8px 0 16px; }
    </style>
</head>
<body>
<div class="page">

    <!-- HEADER -->
    <div class="header">
        <div class="header-left">
            <h1>LiveOps Dashboard</h1>
            <p>Gestió de preus, regles i esdeveniments en temps real</p>
        </div>
        <div class="status-badge">
            <span class="status-dot"></span>
            Servidor actiu
        </div>
    </div>

    <!-- META -->
    <div class="meta-bar">
        <div class="meta-item">
            <div class="meta-label">Servidor</div>
            <div class="meta-value">localhost:3000</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">Esdeveniment</div>
            <div class="meta-value">${activeEventName}</div>
        </div>
        <div class="meta-item">
            <div class="meta-label">IP Simulada</div>
            <div class="meta-value">${regionSim} · ${debugSimulatedIp}</div>
        </div>
    </div>

    <!-- ══ CONTRACTE ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Contracte API</span>
            <span class="section-hint">Toggle = actiu/inactiu · × = eliminar</span>
        </div>
        <div class="section-body">
            <form action="/update-contract" method="POST">

                <div class="sub-label">Inputs — dades que envia Unity</div>
                ${inputRows}
                <div class="add-row">
                    <span class="add-label">Nou input</span>
                    <input type="text" name="new_input_name" placeholder="ex: playerHealth">
                </div>

                <hr class="sep" style="margin-top:20px;">

                <div class="sub-label">Outputs — dades que retorna el servidor</div>
                ${outputRows}
                <div class="add-row">
                    <span class="add-label">Nou output</span>
                    <input type="text" name="new_output_name" placeholder="ex: discount">
                </div>

                <button type="submit" class="btn-save">Guardar contracte</button>
            </form>
        </div>
    </div>

    <!-- ══ REGLES ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Regles de preu</span>
            <span class="section-hint">Guanya el major descompte si en coincideixen diverses</span>
        </div>
        <div class="section-body">
            ${ruleRows}
            <form action="/add-rule" method="POST">
                <div class="add-row" style="margin-top:10px; flex-wrap:wrap; gap:8px;">
                    <span class="add-label">Si</span>
                    <select name="field">
                        ${fieldOptions || '<option value="">— afegeix inputs —</option>'}
                    </select>
                    <select name="operator">
                        <option value=">=">&gt;=</option>
                        <option value="<=">&lt;=</option>
                        <option value=">">&gt;</option>
                        <option value="<">&lt;</option>
                        <option value="==">==</option>
                        <option value="!=">!=</option>
                    </select>
                    <input type="text" name="value" placeholder="valor" style="width:110px;">
                    <span class="add-label">→</span>
                    <input type="number" name="discount" min="1" max="100" placeholder="%">
                    <span class="add-label">%</span>
                    <button type="submit" class="btn-add">Afegir regla</button>
                </div>
                <p style="font-size:11px; color:var(--text-3); margin-top:8px;">
                    Exemple: playerClass == warrior → 15% · playerXP >= 1000 → 20%
                </p>
            </form>
        </div>
    </div>

    <!-- ══ ESDEVENIMENTS ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Esdeveniments</span>
        </div>
        <div class="section-body">
            <form action="/update-event" method="POST">
                <button class="btn-event" name="eventName" value="normal"
                        style="background:var(--surface); border:1px solid var(--border); color:var(--text);">
                    Normal
                </button>
                <button class="btn-event" name="eventName" value="christmas"
                        style="background:rgba(248,113,113,0.07); border:1px solid rgba(248,113,113,0.25); color:#f87171;">
                    🎄 &nbsp;Nadal
                </button>
                <button class="btn-event" name="eventName" value="sant_jordi"
                        style="background:var(--amber-bg); border:1px solid var(--amber-bdr); color:var(--amber);">
                    🌹 &nbsp;Sant Jordi
                </button>
            </form>
        </div>
    </div>

    <!-- ══ SIMULADOR IP ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Simulador IP</span>
        </div>
        <div class="section-body">
            <form action="/debug/set-ip" method="POST">
                <div class="ip-grid">
                    <button name="fakeIp" value="84.88.1.1">🇪🇸 &nbsp;Espanya</button>
                    <button name="fakeIp" value="8.8.8.8">🇺🇸 &nbsp;Estats Units</button>
                    <button name="fakeIp" value="1.72.0.0">🇯🇵 &nbsp;Japó</button>
                </div>
            </form>
        </div>
    </div>

    <div class="footer">
        <a href="/dashboard">↺ Refrescar</a>
    </div>

</div>
</body>
</html>`);
        });
    });
});


// ------------------------------------
//  ACCIONS DEL DASHBOARD
// ------------------------------------

// POST /update-contract
app.post('/update-contract', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        let allInputs  = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);

        allInputs  = allInputs.map(f  => ({ ...f, active: req.body[`active_in_${f.name}`]  === "on" }));
        allOutputs = allOutputs.map(f => ({ ...f, active: req.body[`active_out_${f.name}`] === "on" }));

        const newInput  = (req.body.new_input_name  || "").trim();
        const newOutput = (req.body.new_output_name || "").trim();
        if (newInput  && !allInputs.find(f  => f.name === newInput))  allInputs.push({ name: newInput,  active: true });
        if (newOutput && !allOutputs.find(f => f.name === newOutput)) allOutputs.push({ name: newOutput, active: true });

        db.run(
            "UPDATE api_contract SET inputs = ?, outputs = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(allInputs), JSON.stringify(allOutputs)],
            (err) => {
                if (err) console.error(err);
                console.log("🔄 Contracte actualitzat | Inputs actius:", activeNames(allInputs));
                res.redirect('/dashboard');
            }
        );
    });
});

// GET /delete-field
app.get('/delete-field', (req, res) => {
    const { fieldName, fieldType } = req.query;
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        let allInputs  = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);
        if (fieldType === "in")  allInputs  = allInputs.filter(f  => f.name !== fieldName);
        if (fieldType === "out") allOutputs = allOutputs.filter(f => f.name !== fieldName);
        db.run(
            "UPDATE api_contract SET inputs = ?, outputs = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(allInputs), JSON.stringify(allOutputs)],
            () => res.redirect('/dashboard')
        );
    });
});

// POST /add-rule
app.post('/add-rule', (req, res) => {
    const { field, operator, value, discount } = req.body;
    if (!field || !operator || value === undefined || !discount) return res.redirect('/dashboard');

    db.get("SELECT rules FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const rules = parseRules(row && row.rules);
        rules.push({
            field:    field.trim(),
            operator: operator,
            value:    value.trim(),
            discount: parseFloat(discount) / 100   // 15 → 0.15
        });
        db.run(
            "UPDATE api_contract SET rules = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(rules)],
            (err) => {
                if (err) console.error(err);
                console.log(`Nova regla: si ${field} ${operator} ${value} → ${discount}% descompte`);
                res.redirect('/dashboard');
            }
        );
    });
});

// GET /delete-rule
app.get('/delete-rule', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT rules FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let rules = parseRules(row && row.rules);
        if (!isNaN(index) && index >= 0 && index < rules.length) {
            const deleted = rules.splice(index, 1);
            console.log(`🗑️ Regla eliminada: ${JSON.stringify(deleted[0])}`);
        }
        db.run(
            "UPDATE api_contract SET rules = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(rules)],
            () => res.redirect('/dashboard')
        );
    });
});

// POST /update-event
app.post('/update-event', (req, res) => {
    const eventName = req.body.eventName;
    let message = "Benvingut", color = "#FFFFFF";
    if (eventName === "christmas")  { message = "Bon Nadal!";   color = "#FF0000"; }
    if (eventName === "sant_jordi") { message = "Feliç Diada!"; color = "#FFD700"; }
    db.run(
        "UPDATE events SET name = ?, message = ?, color = ? WHERE id = 1",
        [eventName, message, color],
        () => res.redirect('/dashboard')
    );
});

// POST /debug/set-ip
app.post('/debug/set-ip', (req, res) => {
    debugSimulatedIp = req.body.fakeIp;
    res.redirect('/dashboard');
});


// ------------------------------------
//  INICI
// ------------------------------------
app.listen(3000, () => {
    console.log("🚀 Servidor CRM llest a http://localhost:3000/dashboard");
});