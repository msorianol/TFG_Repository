const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database("./game_data.db");

let globalDataVersion = 0;

db.serialize(() => {
    // ── Taules principals ──
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
        message TEXT
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

    db.run(`CREATE TABLE IF NOT EXISTS server_config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    db.run(`INSERT OR IGNORE INTO server_config (key, value) VALUES ('data_version', '1')`);

    // Carreguem la versió persistent des de la DB
    db.get("SELECT value FROM server_config WHERE key = 'data_version'", (err, row) => {
        globalDataVersion = row ? parseInt(row.value) : Date.now();
    });

    // ── Dades base per defecte ──
    db.run(`INSERT OR IGNORE INTO api_contract (endpoint, inputs, outputs)
            VALUES ('get-price',
            '[{"name":"itemId","active":true}]',
            '[{"name":"price","active":true}, {"name":"currency","active":true}]')`);

    db.run(`INSERT OR IGNORE INTO events (id, name, message)
            VALUES (1, 'normal', 'Benvingut')`);

    // ── Migracions ──
    const addColumn = (col) => {
        db.run(`ALTER TABLE api_contract ADD COLUMN ${col} TEXT DEFAULT '[]'`, () => { });
    };
    addColumn('rules');
    addColumn('event_discounts');
    addColumn('seasonal_items');
    addColumn('decorations');
});

function getDataVersion() { return globalDataVersion; }
function setDataVersion(v) { globalDataVersion = v; }

module.exports = { db, getDataVersion, setDataVersion };
