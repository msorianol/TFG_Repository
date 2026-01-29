// Importem la llibreria SQLite3
//.verbose() serveix perquè, si hi ha errors, la consola ens doni més detalls
const sqlite3 = require("sqlite3").verbose();

// Si l'arxiu 'game_data.db' no existeix, aquesta línia el crea automàticament. Si ja existeix, simplement l'obre per llegir/escriure
const db = new sqlite3.Database("./game_data.db");

// db.serialize() és una "fila índia". Javascript és asíncron (vol fer-ho tot alhora). Dins de serialize(), obliguem Javascript
// a fer les coses en ordre: primer esborra, després crea, després insereix. Sense això, podria intentar inserir dades en una taula que encara no s'ha creat
db.serialize(() => { 
    // DROP TABLE: Esborra la taula antiga si existeix
    // Això és molt important. Si no es fes, cada vegada que executessis l'script tindries errors de "table already exists" o dades duplicades
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
    
    db.run("DROP TABLE IF EXISTS activity_log");

    // Es crea una altre taula on es pugui veure l'activitat del jugador
    db.run("CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_seen TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");

    db.run("DROP TABLE IF EXISTS shop_prices");

    // REAL: Significa número amb decimals (ex: 19.99).
    db.run("CREATE TABLE IF NOT EXISTS shop_prices (item_id TEXT, region TEXT, price REAL)");

    const priceStmt = db.prepare("INSERT INTO shop_prices (item_id, region, price) VALUES (?,?,?)");

    // Aquí es defineixen el items de la botiga i els seus preus depenent de la regió

    // --- ITEM 1: ESPASA ---
    priceStmt.run("sword", "CAT", 2.99); // Catalunya
    priceStmt.run("sword", "US", 1.99);   // Estats Units
    priceStmt.run("sword", "JP", 3.49);   // Japó

    // --- ITEM 2: ESCUT ---
    priceStmt.run("shield", "CAT", 2.49);
    priceStmt.run("shield", "US", 1.49);
    priceStmt.run("shield", "JP", 2.99);
    
    priceStmt.finalize();
});

// Tanca la connexió amb l'arxiu per no deixar-lo bloquejat
db.close();