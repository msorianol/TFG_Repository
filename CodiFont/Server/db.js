// Importem la llibreria sqlite3 en mode "verbose": això fa que els errors mostrin més informació al terminal
const sqlite3 = require("sqlite3").verbose();

// Obrim (o creem si no existeix) el fitxer de base de dades "game_data.db" a la mateixa carpeta on s'executa el servidor
const db = new sqlite3.Database("./game_data.db");

/* Variable global que guarda el número de versió de les dades
Unity la consulta periòdicament: si ha canviat, descarta la seva caché local
Comença a 0 i es sobreescriu just després amb el valor real de la DB */
let globalDataVersion = 0;

// db.serialize() garanteix que tot el que hi ha dins s'executa en ordre, una instrucció darrere l'altra. Sense això, Node (que és asíncron) podria
// intentar inserir dades a una taula que encara no ha acabat de crear-se
db.serialize(() => {

    // --- Taula api_contract ---
    /* Guarda la configuració de l'endpoint "get-price": quins camps accepta (inputs), quins retorna (outputs), les regles de descompte, els descomptes per temporada,
    els items de la botiga i les decoracions d'escena
    Tots aquests camps són TEXT perquè guarden JSON serialitzat
    "IF NOT EXISTS" evita error si la taula ja existia d'una execució anterior */
    db.run(`CREATE TABLE IF NOT EXISTS api_contract (
        endpoint TEXT PRIMARY KEY,
        inputs TEXT DEFAULT '[]',
        outputs TEXT DEFAULT '[]',
        rules TEXT DEFAULT '[]',
        event_discounts TEXT DEFAULT '[]',
        seasonal_items TEXT DEFAULT '[]',
        decorations TEXT DEFAULT '[]'
    )`);

    // --- Taula events ---
    // Guarda l'esdeveniment actiu del joc (normal, Nadal, Sant Jordi...)
    // Sempre tindrà una sola fila amb id=1
    db.run(`CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY,
        name TEXT,
        message TEXT
    )`);

    // --- Taula shop_prices ---
    // Guarda el preu de cada item per cada regió
    // La clau primària és la combinació (item_id, region): no pot existir el mateix item dues vegades per la mateixa regió
    db.run(`CREATE TABLE IF NOT EXISTS shop_prices (
        item_id TEXT,
        region TEXT,
        price REAL,
        currency TEXT,
        PRIMARY KEY (item_id, region)
    )`);

    // --- Taula regions ---
    // Cada fila és una regió geogràfica (EU, US, CAT...)
    // "countries" guarda un array JSON de codis de país (ex: ["ES","FR"])
    // "is_default" indica si és la regió que s'usa quan cap país coincideix
    db.run(`CREATE TABLE IF NOT EXISTS regions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        countries TEXT DEFAULT '[]',
        currency TEXT DEFAULT 'EUR',
        is_default INTEGER DEFAULT 0
    )`);

    // --- Taula cache_config ---
    // Guarda el TTL (Time To Live) de cada endpoint en segons
    // El TTL indica a Unity quant de temps pot guardar una resposta sense tornar a preguntar al servidor
    db.run(`CREATE TABLE IF NOT EXISTS cache_config (
        endpoint TEXT PRIMARY KEY,
        ttl_seconds INTEGER DEFAULT 300
    )`);

    // --- Taula server_config ---
    // Taula de configuració general clau-valor
    // Ara mateix només guarda "data_version"
    db.run(`CREATE TABLE IF NOT EXISTS server_config (
        key TEXT PRIMARY KEY,
        value TEXT
    )`);

    // Inserim el valor inicial de data_version (1) si no existeix
    // "INSERT OR IGNORE" evita sobreescriure el valor si ja hi era
    db.run(`INSERT OR IGNORE INTO server_config (key, value) VALUES ('data_version', '1')`);

    // Llegim el valor de data_version de la DB i el posem a la variable global
    // Això és necessari perquè si el servidor es reinicia, no perdi la versió actual
    db.get("SELECT value FROM server_config WHERE key = 'data_version'", (err, row) => {
        // Si existeix el row, convertim el valor a número enter
        // Si no existeix (no hauria de passar), usem el timestamp actual com a versió
        globalDataVersion = row ? parseInt(row.value) : Date.now();
    });

    // --- Dades per defecte ---
    // Inserim la fila base del contracte de "get-price" si no existeix
    // Per defecte, Unity envia "itemId" i rep "price" i "currency"
    // "INSERT OR IGNORE" evita sobreescriure la configuració existent
    db.run(`INSERT OR IGNORE INTO api_contract (endpoint, inputs, outputs)
            VALUES ('get-price',
            '[{"name":"itemId","active":true}]',
            '[{"name":"price","active":true}, {"name":"currency","active":true}]')`);

    // Inserim l'esdeveniment per defecte (normal) si no existeix
    db.run(`INSERT OR IGNORE INTO events (id, name, message)
            VALUES (1, 'normal', 'Benvingut')`);

    // --- Migracions ---
    /* Funció auxiliar per afegir una columna nova a api_contract
    Si la columna ja existeix, SQLite llança un error, però el callback buit "() => {}" l'ignora expressament. Això permet que el codi funcioni tant amb una DB nova com amb una antiga que no tingui
    aquestes columnes (creades en versions posteriors del servidor) */
    const addColumn = (col) => {
        db.run(`ALTER TABLE api_contract ADD COLUMN ${col} TEXT DEFAULT '[]'`, () => {});
    };
    addColumn('rules');
    addColumn('event_discounts');
    addColumn('seasonal_items');
    addColumn('decorations');
});

// Getter de la versió: retorna el valor actual de globalDataVersion
// S'usa a /api/version perquè Unity sàpiga si hi ha canvis nous
function getDataVersion() { return globalDataVersion; }

// Setter de la versió: s'usa des d'admin.js quan el dashboard fa un canvi important (com forçar refresc global o canviar l'esdeveniment actiu)
function setDataVersion(v) { globalDataVersion = v; }

// Exportem la connexió a la DB i les dues funcions perquè els altres mòduls puguin usar-les amb require('./db')
module.exports = { db, getDataVersion, setDataVersion };