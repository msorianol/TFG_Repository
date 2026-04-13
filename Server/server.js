const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const bodyParser = require("body-parser");
const geoip = require('geoip-lite');

const app = express();
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const db = new sqlite3.Database("./game_data.db");

let debugSimulatedIp = "84.88.1.1";
let globalDataVersion = Date.now();

// ------------------------------------
// INIT DB: Creació i migració de taules
// ------------------------------------
db.serialize(() => {
    // 1. Creem les taules principals si és el primer cop que s'engega el servidor
    db.run(`CREATE TABLE IF NOT EXISTS api_contract (
        endpoint TEXT PRIMARY KEY,
        inputs TEXT DEFAULT '[]',
        outputs TEXT DEFAULT '[]',
        rules TEXT DEFAULT '[]',
        event_discounts TEXT DEFAULT '[]',
        seasonal_items TEXT DEFAULT '[]',
        decorations TEXT DEFAULT '[]'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        name TEXT,
        message TEXT,
        color TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS shop_prices (
        item_id TEXT,
        region TEXT,
        price REAL,
        currency TEXT,
        PRIMARY KEY (item_id, region)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS regions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        countries TEXT DEFAULT '[]',
        currency TEXT DEFAULT 'EUR',
        is_default INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS cache_config (
        endpoint TEXT PRIMARY KEY,
        ttl_seconds INTEGER DEFAULT 300
    )`);

    // 2. Inserim la configuració base per defecte perquè el Dashboard no falli
    db.run(`INSERT OR IGNORE INTO api_contract (endpoint, inputs, outputs)
            VALUES ('get-price', 
            '[{"name":"itemId","active":true}]', 
            '[{"name":"price","active":true}, {"name":"currency","active":true}]')`);

    db.run(`INSERT OR IGNORE INTO events (id, name, message, color)
            VALUES (1, 'normal', 'Benvingut', '#FFFFFF')`);

    // 3. Migracions (per si la base de dades ja existia en una versió antiga)
    const addColumn = (col) => {
        db.run(`ALTER TABLE api_contract ADD COLUMN ${col} TEXT DEFAULT '[]'`, () => { /* Silenci si ja existeix */ });
    };
    addColumn('rules');
    addColumn('event_discounts');
    addColumn('seasonal_items');
    addColumn('decorations');
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

// Parser genèric per a totes les llistes JSON de la DB
function parseJSON(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
}
const parseRules = parseJSON;
const parseEventDiscounts = parseJSON;
const parseSeasonalItems = parseJSON;
const parseDecorations = parseJSON;

// ------------------------------------
// HELPER DE DATES — reutilitzat pels tres sistemes de temporada
// ------------------------------------

function geoMatchesCountry(geo, code) {
    if (code === '*') return true;
    const parts = code.split(':');
    if (parts.length === 2) return geo.country === parts[0] && geo.region === parts[1];
    return geo.country === code;
}

function detectRegion(geo, regions) {
    if (!geo || !regions || !regions.length) return 'US';
    for (const r of regions.filter(r => !r.is_default)) {
        const codes = parseJSON(r.countries);
        if (codes.some(c => geoMatchesCountry(geo, c))) return r.id;
    }
    const def = regions.find(r => r.is_default);
    return def ? def.id : (regions[0] ? regions[0].id : 'US');
}

function getRegionForReq(req, cb) {
    db.all('SELECT * FROM regions', (err, regions) => {
        regions = regions || [];
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip.includes('127.0.0.1') || ip.includes('::1')) ip = debugSimulatedIp;
        const geo = geoip.lookup(ip);
        cb(detectRegion(geo, regions), regions);
    });
}

function isActiveNow(entry, region, now) {
    if (entry.activeRegions && entry.activeRegions.length > 0) {
        if (!entry.activeRegions.includes(region)) return false;
    } else if (entry.country && entry.country !== region) {
        return false;
    }

    if (entry.fixed) return true;

    const cur = (now.getMonth() + 1) * 100 + now.getDate();
    if (entry.type === 'day') return cur === entry.month * 100 + entry.day;
    const s = entry.startMonth * 100 + entry.startDay;
    const e = entry.endMonth * 100 + entry.endDay;
    return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
}

// ------------------------------------
// MOTOR DE REGLES — FND + prioritat
// ------------------------------------
function evalCondition({ field, operator, value }, data) {
    const rawVal = data[field];
    if (rawVal === undefined || rawVal === null || rawVal === "") return false;
    const isNumeric = !isNaN(rawVal) && !isNaN(value);
    const fv = isNumeric ? parseFloat(rawVal) : String(rawVal).trim().toLowerCase();
    const rv = isNumeric ? parseFloat(value) : String(value).trim().toLowerCase();
    const ops = {
        ">=": () => isNumeric && fv >= rv,
        "<=": () => isNumeric && fv <= rv,
        ">": () => isNumeric && fv > rv,
        "<": () => isNumeric && fv < rv,
        "==": () => fv == rv,
        "!=": () => fv != rv,
    };
    return ops[operator]?.() ?? false;
}

function applyRules(rules, data) {
    const matched = rules.filter(r =>
        r.groups.some(g => g.conditions.every(c => evalCondition(c, data)))
    );
    if (matched.length === 0) return 0;
    matched.sort((a, b) => {
        const pa = a.priority ?? 0, pb = b.priority ?? 0;
        return pb !== pa ? pb - pa : b.discount - a.discount;
    });
    const w = matched[0];
    const s = w.groups.map(g => '(' + g.conditions.map(c => c.field + ' ' + c.operator + ' ' + c.value).join(' ∧ ') + ')').join(' ∨ ');
    console.log('✅ Regla [P' + (w.priority ?? 0) + ']: ' + s + ' → ' + (w.discount * 100) + '%');
    return parseFloat(w.discount) || 0;
}

function applyEventDiscounts(eds, region, now) {
    const matched = eds.filter(ed => isActiveNow(ed, region, now));
    if (matched.length === 0) return 0;
    const best = matched.reduce((a, b) => a.discount > b.discount ? a : b);
    console.log('🎉 Esdeveniment: ' + best.name + ' → ' + (best.discount * 100) + '%');
    return best.discount;
}


// ------------------------------------
//  API ENDPOINTS (cridats per Unity)
// ------------------------------------

// Helper per llegir el TTL de la base de dades
function getTtl(endpoint, cb) {
    db.get("SELECT ttl_seconds FROM cache_config WHERE endpoint = ?", [endpoint], (err, row) => {
        cb(row ? row.ttl_seconds : 300);
    });
}

// GET /api/version
app.get('/api/version', (req, res) => {
    res.json({ version: globalDataVersion });
});

// POST /force-refresh
app.post('/force-refresh', (req, res) => {
    globalDataVersion = Date.now(); // Actualitzem la versió a l'instant actual
    console.log("🚨 S'ha forçat l'actualització de la caché de tots els clients!");
    res.redirect('/dashboard');
});

// GET /api/get-event
app.get('/api/get-event', (req, res) => {
    db.get("SELECT name, message FROM events WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl('get-event', (ttl) => {
            res.json({ name: row.name, message: row.message, cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-contract
// Retorna els inputs actius perquè Unity sàpiga quins camps ha d'enviar.
app.get('/api/get-contract', (req, res) => {
    db.get("SELECT inputs FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl('get-contract', (ttl) => {
            const activeInputs = row ? activeNames(parseFields(row.inputs)) : [];
            res.json({ inputs: activeInputs, cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-shop
app.get('/api/get-shop', (req, res) => {
    db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const all = parseSeasonalItems(row && row.seasonal_items);
        getRegionForReq(req, (region) => {
            const active = all.filter(it => isActiveNow(it, region, new Date())).map(it => it.itemId);
            getTtl('get-shop', (ttl) => {
                res.json({ items: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// GET /api/get-decorations
app.get('/api/get-decorations', (req, res) => {
    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const all = parseDecorations(row && row.decorations);
        getRegionForReq(req, (region) => {
            const active = all.filter(dc => isActiveNow(dc, region, new Date())).map(dc => dc.decorationId);
            getTtl('get-decorations', (ttl) => {
                res.json({ decorations: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// POST /api/get-price
// Calcula el preu final aplicant geolocalització i les regles actives.
app.post('/api/get-price', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {

        const allowedInputs = activeNames(parseFields(contract && contract.inputs));
        const allowedOutputs = activeNames(parseFields(contract && contract.outputs));
        const rules = parseRules(contract && contract.rules);
        const eventDiscounts = parseEventDiscounts(contract && contract.event_discounts);

        // 1. Recollim tots els inputs que Unity ha enviat i el contracte permet
        let receivedData = {};
        allowedInputs.forEach(field => {
            const val = req.body[field];
            if (val !== undefined && val !== null) receivedData[field] = val;
        });

        const itemId = req.body.itemId || "unknown";

        // 2+3+4. Detecció dinàmica de regió + motor + resposta
        const applyAndRespond = (row, discount) => {
            let response = {};
            allowedOutputs.forEach(field => {
                if (field === 'price') response.price = parseFloat((row.price * (1 - discount)).toFixed(2));
                else if (field === 'currency') response.currency = row.currency;
                else response[field] = row[field] !== undefined ? row[field] : 0;
            });

            getTtl('get-price', (ttl) => {
                response.cacheTtlSeconds = ttl;
                res.json(response);
            });
        };

        const resolvePrice = (region, regions) => {
            const rulesDiscount = applyRules(rules, receivedData);
            const eventDiscount = applyEventDiscounts(eventDiscounts, region, new Date());
            const discount = Math.max(rulesDiscount, eventDiscount);
            if (discount > 0) console.log('💰 Descompte: ' + (discount * 100) + '%');
            db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region], (err, row) => {
                if (err) return res.status(500).json({ error: 'DB error' });
                if (row) return applyAndRespond(row, discount);
                // Fallback: regió per defecte
                const defRegion = (regions || []).find(r => r.is_default);
                if (defRegion && defRegion.id !== region) {
                    db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, defRegion.id], (err, defRow) => {
                        if (!defRow) return res.json({ error: 'Item not found' });
                        applyAndRespond(defRow, discount);
                    });
                } else {
                    getTtl('get-price', (ttl) => { res.json({ error: 'Item not found', cacheTtlSeconds: ttl }); });
                }
            });
        };

        if (allowedInputs.includes('region') && receivedData.region) {
            getRegionForReq(req, (_, regions) => resolvePrice(receivedData.region, regions));
        } else {
            getRegionForReq(req, resolvePrice);
        }
    });
});


// ------------------------------------
//  DASHBOARD
// ------------------------------------

app.get('/dashboard', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        db.get("SELECT name FROM events WHERE id = 1", (err, currentEvent) => {

            const inputs = parseFields(contract && contract.inputs) || [{ name: "itemId", active: true }];
            const outputs = parseFields(contract && contract.outputs) || [{ name: "price", active: true }];
            const rules = parseRules(contract && contract.rules);
            const eventDiscounts = parseEventDiscounts(contract && contract.event_discounts);
            const seasonalItems = parseSeasonalItems(contract && contract.seasonal_items);
            const decorations = parseDecorations(contract && contract.decorations);
            const activeEventName = currentEvent ? currentEvent.name.toUpperCase() : "UNKNOWN";


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
                return rules.map((rule, i) => {
                    // Renderitza cada grup com un AND de condicions
                    const groupsHtml = rule.groups.map((group, gi) => {
                        const condsHtml = group.conditions.map((c, ci) =>
                            `${ci > 0 ? '<span class="logic-op">∧</span>' : ''}
                             <code>${c.field}</code>
                             <span class="op">${c.operator}</span>
                             <code>${c.value}</code>`
                        ).join('');
                        return `
                            ${gi > 0 ? '<span class="logic-op or-op">∨</span>' : ''}
                            <span class="group-wrap">(${condsHtml})</span>`;
                    }).join('');

                    const prio = rule.priority ?? 0;
                    return `
                    <div class="rule-row">
                        <span class="prio-badge" title="Prioritat">P${prio}</span>
                        <span class="rule-body">
                            ${groupsHtml}
                            <span class="arrow">→</span>
                            <strong>${Math.round(rule.discount * 100)}% de descompte</strong>
                        </span>
                        <a href="/delete-rule?index=${i}"
                           onclick="return confirm('Eliminar aquesta regla?')"
                           class="del-btn" title="Eliminar">×</a>
                    </div>`;
                }).join('');
            }

            function renderDateList(entries, delUrl, badge) {
                if (entries.length === 0) return '<p class="empty">Cap entrada definida.</p>';
                return entries.map((entry, i) => {
                    let dateHtml = '';

                    if (!entry.fixed) {
                        const d = entry.type === 'day'
                            ? String(entry.day).padStart(2, '0') + '/' + String(entry.month).padStart(2, '0')
                            : String(entry.startDay).padStart(2, '0') + '/' + String(entry.startMonth).padStart(2, '0')
                            + ' → ' + String(entry.endDay).padStart(2, '0') + '/' + String(entry.endMonth).padStart(2, '0');
                        const co = (entry.activeRegions && entry.activeRegions.length > 0) ? entry.activeRegions.join(', ') : (entry.country || 'Tots');
                        
                        dateHtml = '<span class="arrow">·</span><code>' + d + '</code>'
                            + '<span class="arrow">·</span><span style="color:var(--text-2);font-size:12px;">' + co + '</span>';
                    }

                    return '<div class="rule-row" style="background:rgba(96,165,250,0.07);border-color:rgba(96,165,250,0.2);">'
                        + '<span class="rule-body">' + badge(entry)
                        + dateHtml
                        + '</span>'
                        + '<a href="' + delUrl + '?index=' + i + '" onclick="return confirm(\'Eliminar?\')" class="del-btn">×</a>'
                        + '</div>';
                }).join('');
            }
            const renderEventDiscounts = eds => renderDateList(eds, '/delete-event-discount',
                e => '<strong style="color:#e2e4e9;">' + e.name + '</strong><span class="prio-badge" style="color:#60a5fa;background:rgba(96,165,250,0.1);border-color:rgba(96,165,250,0.3);">' + Math.round(e.discount * 100) + '%</span>');
            const renderSeasonalItems = items => renderDateList(items, '/delete-items',
                it => {
                    const badges = it.prices
                        ? Object.entries(it.prices).map(([rid, p]) =>
                            '<span class="prio-badge" style="color:#a78bfa;background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.3);">'
                            + rid + ': ' + p.price + ' ' + p.currency + '</span>').join('')
                        : '';
                    return '<code style="color:#a78bfa;">' + it.itemId + '</code>'
                        + '<span style="color:var(--text-2);font-size:12px;">' + it.name + '</span>'
                        + badges;
                });
            const renderDecorations = decs => renderDateList(decs, '/delete-decoration',
                dc => '<code style="color:#34d399;">' + dc.decorationId + '</code><span style="color:var(--text-2);font-size:12px;">' + dc.name + '</span>');

            const fieldOptions = inputs.map(f =>
                `<option value="${f.name}">${f.name}${f.active ? '' : ' (inactiu)'}</option>`
            ).join('');

            const inputRows = renderFieldRows(inputs, 'in');
            const outputRows = renderFieldRows(outputs, 'out');
            const ruleRows = renderRules(rules);
            const eventDiscRows = renderEventDiscounts(eventDiscounts);
            const fixedItems = seasonalItems.filter(it => it.fixed);
            const seasonalOnly = seasonalItems.filter(it => !it.fixed);
            const fixedItemRows = renderSeasonalItems(fixedItems);
            const seasonalItemRows = renderSeasonalItems(seasonalOnly);
            const decorationRows = renderDecorations(decorations);

            // clientScript: s'injecta directament al HTML.
            // El codi del client usa createElement per evitar template literals
            // niats dins del res.send() de Node.
            function buildClientScript(fieldOpts, opOpts) {
                return `<script>
var FIELD_OPTIONS = ${JSON.stringify(fieldOpts)};
var OP_OPTIONS    = ${JSON.stringify(opOpts)};
var groupCount    = 0;

function makeSelect(name, optionsHtml) {
    var s = document.createElement('select');
    s.name = name;
    s.innerHTML = optionsHtml;
    return s;
}
function makeInput(name) {
    var i = document.createElement('input');
    i.type = 'text'; i.name = name; i.placeholder = 'valor'; i.style.width = '100px';
    return i;
}
function conditionHtml(gi, ci) {
    var row = document.createElement('div');
    row.className = 'cond-row';
    row.id = 'cond-' + gi + '-' + ci;
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:5px;';
    if (ci > 0) {
        var andSp = document.createElement('span');
        andSp.style.cssText = 'font-size:11px;font-weight:700;color:#f87171;font-family:monospace;min-width:14px;';
        andSp.textContent = '\\u2227';
        row.appendChild(andSp);
    } else {
        var sp = document.createElement('span'); sp.style.minWidth='14px'; row.appendChild(sp);
    }
    row.appendChild(makeSelect('g'+gi+'_field'+ci, FIELD_OPTIONS));
    row.appendChild(makeSelect('g'+gi+'_op'+ci,    OP_OPTIONS));
    row.appendChild(makeInput ('g'+gi+'_val'+ci));
    if (ci > 0) {
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'del-btn'; del.textContent = '\\u00d7';
        del.setAttribute('onclick', 'removeCond('+gi+','+ci+')');
        row.appendChild(del);
    }
    return row;
}
function addGroup() {
    var gi = groupCount++;
    var container = document.getElementById('groups-container');
    var div = document.createElement('div');
    div.id = 'group-' + gi;
    div.dataset.condCount = 1;
    div.style.cssText = 'margin-bottom:10px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;';
    if (gi > 0) {
        var orLbl = document.createElement('span');
        orLbl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#f87171;font-family:monospace;margin-bottom:6px;';
        orLbl.textContent = '\\u2228 OR';
        div.appendChild(orLbl);
    }
    var condsDiv = document.createElement('div');
    condsDiv.id = 'conds-' + gi;
    condsDiv.appendChild(conditionHtml(gi, 0));
    div.appendChild(condsDiv);
    var actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.textContent = '\\u2227 Afegir condici\\u00f3 AND';
    addBtn.style.cssText = 'padding:5px 10px;font-size:11px;background:var(--bg);border:1px dashed var(--border2);color:var(--text-2);border-radius:4px;cursor:pointer;';
    addBtn.setAttribute('onclick', 'addCond('+gi+')');
    actionsDiv.appendChild(addBtn);
    if (gi > 0) {
        var rmBtn = document.createElement('button');
        rmBtn.type = 'button'; rmBtn.className = 'del-btn'; rmBtn.textContent = '\\u00d7';
        rmBtn.style.marginLeft = 'auto';
        rmBtn.setAttribute('onclick', 'removeGroup('+gi+')');
        actionsDiv.appendChild(rmBtn);
    }
    div.appendChild(actionsDiv);
    container.appendChild(div);
}
function addCond(gi) {
    var groupEl = document.getElementById('group-' + gi);
    var ci = parseInt(groupEl.dataset.condCount);
    groupEl.dataset.condCount = ci + 1;
    document.getElementById('conds-' + gi).appendChild(conditionHtml(gi, ci));
}
function removeCond(gi, ci) { document.getElementById('cond-' + gi + '-' + ci).remove(); }
function removeGroup(gi)    { document.getElementById('group-' + gi).remove(); }
addGroup();
<\/script>`;
            }

            const safeFieldOptions = fieldOptions || '<option value="">— afegeix inputs —</option>';
            const safeOpOptions = '<option value=">=">&gt;=</option>'
                + '<option value="<=">&lt;=</option>'
                + '<option value=">">&gt;</option>'
                + '<option value="<">&lt;</option>'
                + '<option value="==">==</option>'
                + '<option value="!=">!=</option>';
            const clientScript = buildClientScript(safeFieldOptions, safeOpOptions);

            // Carreguem regions i preus base de forma encadenada per tenir-los disponibles al template
            db.all('SELECT * FROM regions ORDER BY is_default ASC, name ASC', (err, regions) => {
                regions = regions || [];
                const geoSim = geoip.lookup(debugSimulatedIp);
                const regionSim = detectRegion(geoSim, regions);
                const regionOptions = '<option value="">Totes les regions</option>'
                    + regions.map(r => `<option value="${r.id}">${r.name} (${r.id})</option>`).join('');

                db.all('SELECT sp.item_id, sp.region, sp.price, sp.currency FROM shop_prices sp ORDER BY sp.item_id, sp.region', (err, basePrices) => {
                    // 1. Agrupem els preus per item_id
                    const groupedPrices = {};
                    basePrices.forEach(p => {
                        if (!groupedPrices[p.item_id]) groupedPrices[p.item_id] = [];
                        groupedPrices[p.item_id].push(p);
                    });

                    // 2. Generem les files agrupades
                    const basePriceRows = Object.keys(groupedPrices).length === 0
                        ? '<p class="empty">Cap preu base definit. Afegeix preus per als items fixos (sword, shield...).</p>'
                        : Object.keys(groupedPrices).map(itemId => {
                            const regionBadges = groupedPrices[itemId].map(p =>
                                `<span class="prio-badge" style="color:#34d399;background:rgba(52,211,153,0.1);border-color:rgba(52,211,153,0.3); margin-right: 4px;">
                            ${p.region}: ${p.price} ${p.currency} 
                            <a href="/delete-base-price?itemId=${encodeURIComponent(p.item_id)}&region=${p.region}" 
                               onclick="return confirm('Eliminar aquest preu?')" 
                               style="color:var(--text-3); text-decoration:none; margin-left:4px; font-size:14px;">×</a>
                        </span>`
                            ).join('');

                            return `
                    <div class="rule-row" style="background:rgba(52,211,153,0.05);border-color:rgba(52,211,153,0.15);margin-bottom:5px;">
                        <span class="rule-body">
                            <code style="font-size: 14px; font-weight: bold;">${itemId}</code>
                            <span class="arrow" style="margin: 0 8px;">→</span>
                            ${regionBadges}
                        </span>
                    </div>`;
                        }).join('');

                    db.all('SELECT * FROM cache_config ORDER BY endpoint', (err, cacheRows) => {
                        cacheRows = cacheRows || [];

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
        .group-wrap {
            display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap;
            background: rgba(248,113,113,0.05);
            border: 1px solid rgba(248,113,113,0.15);
            border-radius: 4px;
            padding: 2px 7px;
        }
        .logic-op {
            font-family: var(--mono); font-size: 11px; font-weight: 700;
            color: #f87171;
            padding: 1px 5px;
            border: 1px solid rgba(248,113,113,0.3);
            border-radius: 3px;
        }
        .or-op { background: rgba(248,113,113,0.1); margin: 0 4px; }
        .prio-badge {
            font-family: var(--mono); font-size: 10px; font-weight: 700;
            color: var(--amber); background: var(--amber-bg);
            border: 1px solid var(--amber-bdr);
            border-radius: 4px; padding: 2px 6px; flex-shrink: 0;
        }

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

        /* ── TABS ── */
        .tab-nav {
            display: flex;
            margin-bottom: 24px;
            border: 1px solid var(--border);
            border-radius: 10px;
            overflow: hidden;
            background: var(--surface);
        }
        .tab-btn {
            flex: 1;
            padding: 13px 6px 11px;
            font-family: var(--sans);
            font-size: 11px;
            font-weight: 600;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            color: var(--text-3);
            background: transparent;
            border: none;
            border-right: 1px solid var(--border);
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
            transition: color 0.15s, background 0.15s;
            position: relative;
        }
        .tab-btn:last-child { border-right: none; }
        .tab-btn:hover { color: var(--text-2); background: rgba(255,255,255,0.02); }
        .tab-btn.active { color: var(--text); background: rgba(255,255,255,0.03); }
        .tab-btn .tab-icon { font-size: 17px; opacity: 0.5; }
        .tab-btn.active .tab-icon { opacity: 1; }
        .tab-btn::after {
            content: '';
            position: absolute;
            bottom: 0; left: 20%; right: 20%;
            height: 2px;
            background: #60a5fa;
            border-radius: 1px 1px 0 0;
            opacity: 0;
            transition: opacity 0.15s;
        }
        .tab-btn.active::after { opacity: 1; }
        .tab-panel { display: none; }
    </style>
</head>
<body>
<div class="page">

    <!-- HEADER -->
    <div class="header">
        <div class="header-left">
            <h1>LiveOps Dashboard</h1>
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



    <nav class="tab-nav">
        <button class="tab-btn" data-tab="config">
            <span class="tab-icon">⚙</span>
            Configuració
        </button>
        <button class="tab-btn" data-tab="preus">
            <span class="tab-icon">◈</span>
            Preus &amp; Regles
        </button>
        <button class="tab-btn" data-tab="contingut">
            <span class="tab-icon">◉</span>
            Contingut
        </button>
        <button class="tab-btn" data-tab="events">
            <span class="tab-icon">⊕</span>
            Esdeveniments
        </button>
    </nav>

    <div class="tab-panel" id="tab-config">
    <div class="section">
        <div class="section-head">
            <span class="section-title">Caché del Client</span>
            <span class="section-hint">Temps que Unity guarda les dades en local sense tornar a preguntar</span>
        </div>
        <div class="section-body">
            <form action="/update-cache-config" method="POST">
                ${(() => {
                                const endpointsList = ['get-event', 'get-shop', 'get-decorations', 'get-price', 'get-contract'];
                                const labels = {
                                    'get-event': "Estat de l'Esdeveniment",
                                    'get-shop': 'Items de la Botiga',
                                    'get-decorations': "Decoracions d'Escena",
                                    'get-price': 'Preus',
                                    'get-contract': 'Contracte API',
                                };

                                return endpointsList.map(ep => {
                                    const row = cacheRows.find(r => r.endpoint === ep);
                                    const ttl = row ? row.ttl_seconds : 300;
                                    const display = ttl >= 3600 ? Math.floor(ttl / 3600) + 'h' : Math.floor(ttl / 60) + 'min';

                                    return `<div class="field-row" style="margin-bottom:6px;">
                            <span class="field-name" style="min-width:200px;">${labels[ep]}</span>
                            <span class="prio-badge" style="color:#60a5fa;background:rgba(96,165,250,0.1);border-color:rgba(96,165,250,0.3);">${display}</span>
                            <input type="number" name="ttl_${ep}" value="${ttl}" min="10" style="width:80px;">
                            <span class="add-label">s</span>
                        </div>`;
                                }).join('');
                            })()}
                <div style="margin-top:12px;">
                    <button type="submit" class="btn-save" style="width:auto;padding:9px 24px;font-size:12px;">Guardar TTL</button>
                </div>
                <p style="font-size:11px;color:var(--text-3);margin-top:8px;">300=5min · 900=15min · 3600=1h · 86400=1dia</p>
            </form>

            <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border);">
                <form action="/force-refresh" method="POST">
                    <span class="section-title" style="color: #f87171; display:block; margin-bottom: 8px;">Botó d'Emergència</span>
                    <p style="font-size:12px; color:var(--text-3); margin-bottom: 12px;">Força a tots els jugadors actius a netejar la seva memòria i descarregar les dades noves a l'instant (ignorant els TTLs).</p>
                    <button type="submit" class="btn-save" style="background: rgba(248,113,113,0.1); color: #f87171; border: 1px solid rgba(248,113,113,0.3); width: auto; padding: 9px 24px;">
                    ⚠️ Forçar Refresc Global
                    </button>
                </form>
            </div>
        </div>
    </div>
    <!-- ══ REGIONS ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Regions</span>
            <span class="section-hint">Defineix regions amb països · Basen tots els filtres de preus</span>
        </div>
        <div class="section-body">
            ${regions.length === 0 ? '<p class="empty">Cap regió definida.</p>' : regions.map((r, i) => `
                <div class="rule-row" style="margin-bottom:6px;">
                    <span class="prio-badge">${r.id}</span>
                    <span class="rule-body">
                        <strong style="color:#e2e4e9;">${r.name}</strong>
                        <span class="arrow">·</span>
                        <code style="color:var(--text-2);font-size:11px;">${JSON.parse(r.countries || '[]').join(', ') || '*'}</code>
                        <span class="prio-badge" style="color:#34d399;background:rgba(52,211,153,0.1);border-color:rgba(52,211,153,0.3);">${r.currency}</span>
                        ${r.is_default ? '<span class="prio-badge" style="color:#f87171;background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.3);">DEFAULT</span>' : ''}
                    </span>
                    <a href="/delete-region?id=${r.id}" onclick="return confirm('Eliminar ${r.name}?')" class="del-btn">×</a>
                </div>`).join('')}
            <form action="/add-region" method="POST">
                <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span class="add-label">ID</span>
                    <input type="text" name="id" placeholder="EU" style="width:55px;" required>
                    <span class="add-label">Nom</span>
                    <input type="text" name="name" placeholder="Europa" style="width:90px;" required>
                    <span class="add-label">Països</span>
                    <input type="text" name="countries" placeholder="ES,FR o ES:CT" style="width:120px;"
                           title="Codis separats per comes. CC=país, CC:RR=subregió, *=tots">
                    <span class="add-label">Moneda</span>
                    <select name="currency">
                        <option value="EUR">EUR</option>
                        <option value="USD">USD</option>
                        <option value="JPY">JPY</option>
                        <option value="GBP">GBP</option>
                    </select>
                    <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-2);">
                        <input type="checkbox" name="is_default" value="1"> Per defecte
                    </label>
                    <button type="submit" class="btn-add" style="margin-left:auto;">Afegir regió</button>
                </div>
                <p style="font-size:11px;color:var(--text-3);margin-top:8px;">
                    <b>ES</b>=Espanya · <b>ES:CT</b>=Catalunya · <b>FR,DE</b>=múltiples · La regió <b>per defecte</b> rep la resta.
                </p>
            </form>
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
    </div>
    <div class="tab-panel" id="tab-preus">
    <!-- ══ REGLES ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Regles de preu</span>
            <span class="section-hint">Guanya el major descompte si en coincideixen diverses</span>
        </div>
        <div class="section-body">
            ${ruleRows}
            <form action="/add-rule" method="POST" id="rule-form">
                <div id="groups-container"></div>

                <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                    <button type="button" onclick="addGroup()"
                            style="padding:7px 14px; background:var(--surface); border:1px dashed var(--border2);
                                   color:var(--text-2); font-size:12px; border-radius:5px; cursor:pointer;">
                        ∨ Afegir grup OR
                    </button>
                    <div style="display:flex; align-items:center; gap:8px; margin-left:auto; flex-wrap:wrap;">
                        <span class="add-label" style="color:var(--amber);">Prioritat</span>
                        <input type="number" name="priority" min="0" max="999" placeholder="0" style="width:60px;">
                        <span class="add-label" style="color:#f87171;">→</span>
                        <input type="number" name="discount" min="1" max="100" placeholder="%">
                        <span class="add-label">%</span>
                        <button type="submit" class="btn-add">Afegir regla</button>
                    </div>
                </div>
                <p style="font-size:11px; color:var(--text-3); margin-top:8px;">
                    FND: cada grup és un AND de condicions (∧), entre grups hi ha un OR (∨).
                    Ex: (xp &gt;= 1000 ∧ class == warrior) ∨ (region == CAT) → 20%
                </p>
            </form>

            ${clientScript}
        </div>
    </div>
    <div class="section">
        <div class="section-head">
            <span class="section-title">Descomptes per Temporada i País</span>
            <span class="section-hint">Rang de dates o dia exacte · País opcional</span>
        </div>
        <div class="section-body">
            ${eventDiscRows}
            <form action="/add-event-discount" method="POST">
                <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span class="add-label">Nom</span>
                    <input type="text" name="name" placeholder="ex: Nadal" style="width:90px;">
                    <span class="add-label" style="color:#f87171;">→</span>
                    <input type="number" name="discount" min="1" max="100" placeholder="%" style="width:60px;">
                    <span class="add-label">%</span>
                    <select name="type" onchange="toggleType(this,'rngadd-event-discount','dayadd-event-discount')" style="min-width:120px;">
                        <option value="range">Rang de dates</option>
                        <option value="day">Dia exacte</option>
                    </select>
                    <select name="country">${regionOptions}</select>
                </div>
                <div id="rngadd-event-discount" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                    <span class="add-label">Inici</span>
                    <input type="number" name="startDay"   min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                    <span class="add-label" style="margin-left:8px;">Fi</span>
                    <input type="number" name="endDay"     min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="endMonth"   min="1" max="12" placeholder="MM" style="width:52px;">
                </div>
                <div id="dayadd-event-discount" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                    <span class="add-label">Dia</span>
                    <input type="number" name="day"   min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                </div>
                <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                    <button type="submit" class="btn-add" style="margin-left:auto;">Afegir descompte</button>
                </div>
                <p style="font-size:11px;color:var(--text-3);margin-top:8px;">Ex: Nadal · rang 25/12→07/01 · Tots · 20% &nbsp;·&nbsp; Sant Jordi · dia 23/04 · CAT · 15%</p>
            </form>
        </div>
    </div>
    </div>
    <div class="tab-panel" id="tab-contingut">
    <div class="section">
        <div class="section-head">
            <span class="section-title">Gestió d'Items</span>
            <span class="section-hint">Afegeix items fixes (sempre visibles) o de temporada (per dates)</span>
        </div>
        <div class="section-body">
            <!-- Items fixos -->
            <div class="sub-label">Items Fixos</div>
            ${fixedItemRows.length ? fixedItemRows : '<p class="empty">Cap item fix definit.</p>'}
            <!-- Items de temporada -->
            <div class="sub-label" style="margin-top:16px;">Items de Temporada</div>
            ${seasonalItemRows.length ? seasonalItemRows : '<p class="empty">Cap item de temporada definit.</p>'}
            <!-- Formulari d'afegir -->
            <form action="/add-items" method="POST" id="form-add-items">
                <div class="add-row" style="margin-top:14px;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span class="add-label">ID</span>
                    <input type="text" name="itemId" placeholder="ex: sword" style="width:85px;" required>
                    <span class="add-label">Nom</span>
                    <input type="text" name="name" placeholder="ex: Espasa" style="width:85px;">
                    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);cursor:pointer;">
                        <input type="checkbox" name="fixed" value="1" id="chk-fixed"
                               onchange="toggleFixed(this.checked)">
                        Item fix (sempre visible)
                    </label>
                    <div id="type-selector" style="display:flex;gap:8px;align-items:center;">
                        <select name="type" onchange="toggleType(this,'rngadd-items','dayadd-items')">
                            <option value="range">Rang de dates</option>
                            <option value="day">Dia exacte</option>
                        </select>
                    </div>
                </div>
                <!-- Preus per regió -->
                ${regions.map(r => `
                <div class="add-row" style="margin-top:4px;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span class="prio-badge" style="color:#a78bfa;background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.3);">${r.id}</span>
                    <span class="add-label" style="color:var(--text-2);">Preu (buit=no disponible)</span>
                    <input type="number" step="0.01" name="price_${r.id}" placeholder="9.99" style="width:75px;">
                    <select name="currency_${r.id}">
                        <option value="EUR" ${r.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                        <option value="USD" ${r.currency === 'USD' ? 'selected' : ''}>USD</option>
                        <option value="JPY" ${r.currency === 'JPY' ? 'selected' : ''}>JPY</option>
                        <option value="GBP" ${r.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                    </select>
                </div>`).join('')}
                <!-- Dates (ocultes si és fix) -->
                <div id="date-fields">
                    <div id="rngadd-items" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                        <span class="add-label">Inici</span>
                        <input type="number" name="startDay"   min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                        <span class="add-label" style="margin-left:8px;">Fi</span>
                        <input type="number" name="endDay"     min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="endMonth"   min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                    <div id="dayadd-items" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                        <span class="add-label">Dia</span>
                        <input type="number" name="day"   min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                </div>
                <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                    <button type="submit" class="btn-add" style="margin-left:auto;">Afegir item</button>
                </div>
            </form>
            <script>
            function toggleFixed(isFixed) {
                document.getElementById("date-fields").style.display = isFixed ? "none" : "block";
                document.getElementById("type-selector").style.display = isFixed ? "none" : "flex";
            }
            </script>
        </div>
    </div>
    <div class="section">
        <div class="section-head">
            <span class="section-title">Objectes d'Escena de Temporada</span>
            <span class="section-hint">Objectes que només apareixen en èpoques concretes</span>
        </div>
        <div class="section-body">
            ${decorationRows}
            <form action="/add-decoration" method="POST">
                <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                    <span class="add-label">ID</span>
                    <input type="text" name="decorationId" placeholder="ex: estelada" style="width:95px;">
                    <span class="add-label">Nom</span>
                    <input type="text" name="name" placeholder="ex: Estelada" style="width:85px;">
                    <select name="type" onchange="toggleType(this,'rngadd-decoration','dayadd-decoration')" style="min-width:120px;">
                        <option value="range">Rang de dates</option>
                        <option value="day">Dia exacte</option>
                    </select>
                    <select name="country">${regionOptions}</select>
                </div>
                <div id="rngadd-decoration" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                    <span class="add-label">Inici</span>
                    <input type="number" name="startDay"   min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                    <span class="add-label" style="margin-left:8px;">Fi</span>
                    <input type="number" name="endDay"     min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="endMonth"   min="1" max="12" placeholder="MM" style="width:52px;">
                </div>
                <div id="dayadd-decoration" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                    <span class="add-label">Dia</span>
                    <input type="number" name="day"   min="1" max="31" placeholder="DD" style="width:52px;">
                    <span class="add-label">/</span>
                    <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                </div>
                <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                    <button type="submit" class="btn-add" style="margin-left:auto;">Afegir decoració</button>
                </div>
                <p style="font-size:11px;color:var(--text-3);margin-top:8px;">Ex: ID <b>estelada</b> · dia 11/09 · CAT &nbsp;·&nbsp; ID <b>neu</b> · rang 25/12→07/01 · Tots</p>
            </form>
        </div>
    </div>
    <!-- ══ PREUS BASE ══ -->
    <div class="section">
        <div class="section-head">
            <span class="section-title">Preus de la Botiga</span>
            <span class="section-hint">Tots els items · Edita el preu directament sense esborrar</span>
        </div>
        <div class="section-body">
            ${(() => {
                                // Separem items fixos i de temporada per mostrar-los en grups
                                const allItems = seasonalItems;
                                if (!allItems.length) return '<p class="empty">Cap item definit. Afegeix items a la secció Gestió d\'Items.</p>';

                                const renderGroup = (items, label, color) => {
                                    if (!items.length) return '';
                                    const rows = items.map(it => {
                                        const regionRows = regions.map(r => {
                                            const existing = it.prices && it.prices[r.id];
                                            const curPrice = existing ? existing.price : '';
                                            const curCurr = existing ? existing.currency : r.currency;
                                            return `<form action="/update-item-price" method="POST"
                                         style="display:inline-flex;align-items:center;gap:6px;margin-right:8px;margin-bottom:4px;">
                                <input type="hidden" name="itemId" value="${it.itemId}">
                                <input type="hidden" name="region" value="${r.id}">
                                <span class="prio-badge" style="color:${color};background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.25);">${r.id}</span>
                                <input type="number" step="0.01" name="price"
                                       value="${curPrice}" placeholder="—"
                                       style="width:72px;border-color:${existing ? 'var(--border2)' : 'var(--border)'};">
                                <select name="currency" style="min-width:60px;">
                                    <option value="EUR" ${curCurr === 'EUR' ? 'selected' : ''}>EUR</option>
                                    <option value="USD" ${curCurr === 'USD' ? 'selected' : ''}>USD</option>
                                    <option value="JPY" ${curCurr === 'JPY' ? 'selected' : ''}>JPY</option>
                                    <option value="GBP" ${curCurr === 'GBP' ? 'selected' : ''}>GBP</option>
                                </select>
                                <button type="submit" class="btn-add" style="padding:5px 10px;font-size:11px;">✓</button>
                            </form>`;
                                        }).join('');
                                        return `<div class="rule-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:8px;">
                            <div style="display:flex;align-items:center;gap:8px;width:100%;">
                                <code style="color:${color};font-size:13px;">${it.itemId}</code>
                                <span style="color:var(--text-2);font-size:12px;">${it.name}</span>
                                <a href="/delete-items?index=${allItems.indexOf(it)}"
                                   onclick="return confirm('Eliminar ${it.itemId}?')" class="del-btn" style="margin-left:auto;">×</a>
                            </div>
                            <div style="display:flex;flex-wrap:wrap;gap:4px;">${regionRows}</div>
                        </div>`;
                                    }).join('');
                                    return `<div class="sub-label">${label}</div>${rows}`;
                                };

                                return renderGroup(fixedItems, 'Items Fixos', '#34d399')
                                    + renderGroup(seasonalOnly, 'Items de Temporada', '#a78bfa');
                            })()}
        </div>
    </div>
    </div>
    <div class="tab-panel" id="tab-events">
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
    </div>

    <script>
    function toggleType(selectElement, rangeId, dayId) {
        var rangeDiv = document.getElementById(rangeId);
        var dayDiv = document.getElementById(dayId);
        
        if (selectElement.value === 'day') {
            rangeDiv.style.display = 'none';
            dayDiv.style.display = 'flex';
        } else {
            rangeDiv.style.display = 'flex';
            dayDiv.style.display = 'none';
        }
    }

    (function() {
        function showTab(id) {
            document.querySelectorAll('.tab-panel').forEach(function(p) {
                p.style.display = p.id === 'tab-' + id ? 'block' : 'none';
            });
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.tab === id);
            });
            try { localStorage.setItem('liveops-tab', id); } catch(e) {}
        }
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { showTab(this.dataset.tab); });
        });
        var saved = '';
        try { saved = localStorage.getItem('liveops-tab') || ''; } catch(e) {}
        showTab(['config','preus','contingut','events'].indexOf(saved) >= 0 ? saved : 'config');
    })();
    </script>

    <div class="footer">
        <a href="/dashboard">↺ Refrescar</a>
    </div>

</div>
</body>
</html>`);
                    });
                });
            });
        });
    });
});


// ------------------------------------
//  ACCIONS DEL DASHBOARD
// ------------------------------------

// POST /update-contract
app.post('/update-contract', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        let allInputs = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);

        allInputs = allInputs.map(f => ({ ...f, active: req.body[`active_in_${f.name}`] === "on" }));
        allOutputs = allOutputs.map(f => ({ ...f, active: req.body[`active_out_${f.name}`] === "on" }));

        const newInput = (req.body.new_input_name || "").trim();
        const newOutput = (req.body.new_output_name || "").trim();
        if (newInput && !allInputs.find(f => f.name === newInput)) allInputs.push({ name: newInput, active: true });
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
        let allInputs = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);
        if (fieldType === "in") allInputs = allInputs.filter(f => f.name !== fieldName);
        if (fieldType === "out") allOutputs = allOutputs.filter(f => f.name !== fieldName);
        db.run(
            "UPDATE api_contract SET inputs = ?, outputs = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(allInputs), JSON.stringify(allOutputs)],
            () => res.redirect('/dashboard')
        );
    });
});

// POST /add-rule
// El formulari envia els camps amb prefix: g{gi}_field{ci}, g{gi}_op{ci}, g{gi}_val{ci}
// El servidor reconstrueix l'estructura FND: { groups: [{conditions:[...]}, ...], discount }
app.post('/add-rule', (req, res) => {
    const { discount } = req.body;
    if (!discount) return res.redirect('/dashboard');

    // Reconstruïm els grups llegint totes les claus del body amb prefix g{gi}_
    const groups = [];
    let gi = 0;
    while (true) {
        const conditions = [];
        let ci = 0;
        while (req.body[`g${gi}_field${ci}`]) {
            const field = req.body[`g${gi}_field${ci}`].trim();
            const op = req.body[`g${gi}_op${ci}`];
            const val = (req.body[`g${gi}_val${ci}`] || "").trim();
            if (field && op && val) conditions.push({ field, operator: op, value: val });
            ci++;
        }
        if (conditions.length === 0) break;  // No hi ha més grups
        groups.push({ conditions });
        gi++;
    }

    if (groups.length === 0) return res.redirect('/dashboard');

    db.get("SELECT rules FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const rules = parseRules(row && row.rules);
        const priority = parseInt(req.body.priority) || 0;
        rules.push({ groups, priority, discount: parseFloat(discount) / 100 });
        db.run(
            "UPDATE api_contract SET rules = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(rules)],
            (err) => {
                if (err) console.error(err);
                const fndStr = groups
                    .map(g => '(' + g.conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(' ∧ ') + ')')
                    .join(' ∨ ');
                console.log(`Nova regla FND: ${fndStr} → ${discount}%`);
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
    if (eventName === "christmas") { message = "Bon Nadal!"; color = "#FF0000"; }
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


// POST /add-event-discount
app.post('/add-event-discount', (req, res) => {
    const b = req.body;
    const entry = Object.assign({}, { name: b.name.trim(), discount: parseFloat(b.discount) / 100 }, { type: b.type, country: b.country || '' });
    if (b.type === 'day') {
        entry.day = parseInt(b.day); entry.month = parseInt(b.month);
    } else {
        entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
        entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
    }
    db.get("SELECT event_discounts FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseEventDiscounts(row && row.event_discounts);
        list.push(entry);
        db.run("UPDATE api_contract SET event_discounts = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (err) => { if (err) console.error(err); res.redirect('/dashboard'); }
        );
    });
});

// GET /delete-event-discount
app.get('/delete-event-discount', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT event_discounts FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseEventDiscounts(row && row.event_discounts);
        if (!isNaN(index) && index >= 0 && index < list.length) list.splice(index, 1);
        db.run("UPDATE api_contract SET event_discounts = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => res.redirect('/dashboard'));
    });
});

// POST /add-items
app.post('/add-items', (req, res) => {
    const b = req.body;
    if (!b.itemId) return res.redirect('/dashboard');
    const isFixed = b.fixed === '1';
    const entry = { itemId: b.itemId.trim(), name: (b.name || '').trim() };
    if (isFixed) {
        entry.fixed = true;
    } else {
        entry.type = b.type;
        if (b.type === 'day') {
            entry.day = parseInt(b.day); entry.month = parseInt(b.month);
        } else {
            entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
            entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
        }
    }
    db.all('SELECT * FROM regions', (err, regions) => {
        regions = regions || [];
        const activeRegions = [];
        const prices = {};
        regions.forEach(r => {
            const priceVal = parseFloat(b['price_' + r.id]);
            const currVal = b['currency_' + r.id] || r.currency || 'EUR';
            if (!isNaN(priceVal) && priceVal > 0) {
                activeRegions.push(r.id);
                prices[r.id] = { price: priceVal, currency: currVal };
                db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?, ?, ?, ?)',
                    [entry.itemId, r.id, priceVal, currVal],
                    (err) => { if (err) console.error(err); });
            }
        });
        if (activeRegions.length > 0) { entry.activeRegions = activeRegions; entry.prices = prices; }
        db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
            const list = parseSeasonalItems(row && row.seasonal_items);
            list.push(entry);
            db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
                [JSON.stringify(list)], (err) => { if (err) console.error(err); res.redirect('/dashboard'); });
        });
    });
});

// GET /delete-items
app.get('/delete-items', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseSeasonalItems(row && row.seasonal_items);

        if (!isNaN(index) && index >= 0 && index < list.length) {
            // 1. Agafem l'ítem que estem a punt d'esborrar
            const deletedItem = list.splice(index, 1)[0];

            // 2. Netejem TOTS els seus preus de la taula shop_prices
            if (deletedItem && deletedItem.itemId) {
                db.run('DELETE FROM shop_prices WHERE item_id = ?', [deletedItem.itemId]);
            }
        }

        // 3. Guardem la llista actualitzada sense l'ítem
        db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => res.redirect('/dashboard'));
    });
});

// GET /fix-db (Botó d'emergència per arreglar la taula)
app.get('/fix-db', (req, res) => {
    db.run('DROP TABLE IF EXISTS shop_prices', () => {
        db.run(`CREATE TABLE shop_prices (
            item_id TEXT,
            region TEXT,
            price REAL,
            currency TEXT,
            PRIMARY KEY (item_id, region)
        )`, () => {
            res.send("<h1>Taula arreglada!</h1><p>Ja pots tornar al <a href='/dashboard'>Dashboard</a> i tornar a guardar els preus. Ara es sobreescriuran correctament!</p>");
        });
    });
});

// POST /add-decoration
app.post('/add-decoration', (req, res) => {
    const b = req.body;
    const entry = Object.assign({}, { decorationId: b.decorationId.trim(), name: b.name.trim() }, { type: b.type, country: b.country || '' });
    if (b.type === 'day') {
        entry.day = parseInt(b.day); entry.month = parseInt(b.month);
    } else {
        entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
        entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
    }
    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseDecorations(row && row.decorations);
        list.push(entry);
        db.run("UPDATE api_contract SET decorations = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (err) => { if (err) console.error(err); res.redirect('/dashboard'); }
        );
    });
});

// GET /delete-decoration
app.get('/delete-decoration', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseDecorations(row && row.decorations);
        if (!isNaN(index) && index >= 0 && index < list.length) list.splice(index, 1);
        db.run("UPDATE api_contract SET decorations = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => res.redirect('/dashboard'));
    });
});

// POST /add-region
app.post('/add-region', (req, res) => {
    const { id, name, countries, currency, is_default } = req.body;
    if (!id || !name) return res.redirect('/dashboard');
    const codes = (countries || '').split(',').map(s => s.trim()).filter(Boolean);
    db.run('INSERT OR REPLACE INTO regions (id, name, countries, currency, is_default) VALUES (?,?,?,?,?)',
        [id.trim().toUpperCase(), name.trim(), JSON.stringify(codes), currency || 'EUR', is_default ? 1 : 0],
        (err) => { if (err) console.error(err); res.redirect('/dashboard'); });
});

// GET /delete-region
app.get('/delete-region', (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect('/dashboard');
    db.run('DELETE FROM regions WHERE id = ?', [id], () => res.redirect('/dashboard'));
});

// POST /add-base-price
app.post('/add-base-price', (req, res) => {
    const { itemId, region, price, currency } = req.body;
    if (!itemId || !region || !price) return res.redirect('/dashboard');
    db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?,?,?,?)',
        [itemId.trim(), region, parseFloat(price), currency || 'EUR'],
        (err) => { if (err) console.error(err); res.redirect('/dashboard'); });
});

// GET /delete-base-price
app.get('/delete-base-price', (req, res) => {
    const { itemId, region } = req.query;
    db.run('DELETE FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region],
        () => res.redirect('/dashboard'));
});

// POST /update-cache-config
app.post('/update-cache-config', (req, res) => {
    const endpoints = ['get-event', 'get-shop', 'get-decorations', 'get-price', 'get-contract'];
    Promise.all(endpoints.map(ep => {
        const ttl = parseInt(req.body['ttl_' + ep]);
        if (!isNaN(ttl) && ttl >= 10)
            return new Promise(r => db.run(
                'INSERT OR REPLACE INTO cache_config (endpoint, ttl_seconds) VALUES (?,?)',
                [ep, ttl], r));
        return Promise.resolve();
    })).then(() => res.redirect('/dashboard'));
});

// POST /update-item-price — edita preu d'un item+regió sense esborrar-lo
app.post('/update-item-price', (req, res) => {
    const { itemId, region, price, currency } = req.body;
    if (!itemId || !region || !price) return res.redirect('/dashboard');
    const priceVal = parseFloat(price);
    db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?,?,?,?)',
        [itemId, region, priceVal, currency || 'EUR'], (err) => {
            if (err) return console.error(err);
            // Actualitzem també el camp prices dins de l'entry
            db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
                const list = parseSeasonalItems(row && row.seasonal_items);
                const entry = list.find(it => it.itemId === itemId);
                if (entry) {
                    if (!entry.prices) entry.prices = {};
                    entry.prices[region] = { price: priceVal, currency: currency || 'EUR' };
                    if (!entry.activeRegions) entry.activeRegions = [];
                    if (!entry.activeRegions.includes(region)) entry.activeRegions.push(region);
                    db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
                        [JSON.stringify(list)], () => res.redirect('/dashboard'));
                } else { res.redirect('/dashboard'); }
            });
        });
});

// ------------------------------------
//  INICI
// ------------------------------------
app.listen(3000, () => {
    console.log("🚀 Servidor CRM llest a http://localhost:3000/dashboard");
});