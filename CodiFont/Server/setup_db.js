// Importem la llibreria SQLite3
//.verbose() serveix perquè, si hi ha errors, la consola ens doni més detalls
const sqlite3 = require("sqlite3").verbose();

// Si l'arxiu 'game_data.db' no existeix, aquesta línia el crea automàticament. Si ja existeix, simplement l'obre per llegir/escriure
const db = new sqlite3.Database("./game_data.db");

// db.serialize() és una "fila índia". Javascript és asíncron (vol fer-ho tot alhora). Dins de serialize(), obliguem Javascript
// a fer les coses en ordre: primer esborra, després crea, després insereix. Sense això, podria intentar inserir dades en una taula que encara no s'ha creat
db.serialize(() => {

    // --- ESDEVENIMENTS ---
    // DROP TABLE: Esborra la taula antiga si existeix
    // Això és molt important. Si no es fes, cada vegada que s'executa l'script apareixerien errors de "table already exists" o dades duplicades
    db.run("DROP TABLE IF EXISTS events");

    // CREATE TABLE: Defineix l'estructura (l'esquelet)
    // id INTEGER PRIMARY KEY: Un número únic (1, 2, 3...)
    // name TEXT: El text (ex: "nadal")
    db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, message TEXT, color TEXT)");

    // PREPARE: En lloc de posar les dades directament, es prepara un "motlle" amb interrogants (?)
    // Això evita injeccions SQL i fa que inserir sigui més ràpid si tens moltes dades
    const stmt = db.prepare("INSERT INTO events (id, name, message, color) VALUES (?,?,?,?)");

    // RUN: Omple els interrogants del motlle amb les dades reals
    stmt.run(1, "normal", "Benvingut", "#FFFFFF");

    stmt.finalize();

    // --- PREUS I MONEDES ---
    db.run("DROP TABLE IF EXISTS shop_prices");
    // REAL: Significa número amb decimals (ex: 19.99).
    db.run("CREATE TABLE IF NOT EXISTS shop_prices (item_id TEXT, region TEXT, price REAL, currency TEXT)");

    const priceStmt = db.prepare("INSERT INTO shop_prices (item_id, region, price, currency) VALUES (?,?,?,?)");

    // Aquí es defineixen el items de la botiga i els seus preus depenent de la regió
    // ITEM 1: ESPASA
    priceStmt.run("sword", "CAT", 2.99, "EUR"); // Catalunya --> Euros
    priceStmt.run("sword", "US", 3.49, "USD"); // Estats Units --> Dòlars
    priceStmt.run("sword", "JP", 560, "JPY"); // Japó --> Yens

    // ITEM 2: ESCUT
    priceStmt.run("shield", "CAT", 2.49, "EUR");
    priceStmt.run("shield", "US", 2.99, "USD");
    priceStmt.run("shield", "JP", 460, "JPY");

    priceStmt.finalize();

    // --- API CONTRACT ---
    // Aquí es guarden quins camps d'entrada i sortida estan actius
    db.run("DROP TABLE IF EXISTS api_contract");
    db.run("CREATE TABLE api_contract (endpoint TEXT PRIMARY KEY, inputs TEXT, outputs TEXT)");

    // Configuració inicial: guardem llistes en format JSON
    const contractStmt = db.prepare("INSERT INTO api_contract (endpoint, inputs, outputs) VALUES (?,?,?)");
    contractStmt.run(
        "get-price",
        JSON.stringify(["itemId"]), // Inputs per defecte
        JSON.stringify(["price", "currency"]) // Outputs per defecte
    );

    contractStmt.finalize();
});

// Tanca la connexió amb l'arxiu per no deixar-lo bloquejat
db.close();