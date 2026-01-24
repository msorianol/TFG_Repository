// setup_db.js
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./game_data.db');

db.serialize(() => {
    // Taula de configuració (la que ja tenies)
    db.run("DROP TABLE IF EXISTS events");
    db.run("CREATE TABLE events (id INTEGER PRIMARY KEY, name TEXT, message TEXT, color TEXT)");
    const stmt = db.prepare("INSERT INTO events (id, name, message, color) VALUES (?,?,?,?)");
    stmt.run(1, "normal", "Benvingut", "#FFFFFF");
    stmt.finalize();

    // --- NOVETAT CRM: Taula d'Activitat ---
    // Aquí guardarem cada vegada que algú obre el joc
    db.run("DROP TABLE IF EXISTS activity_log");
    db.run("CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, event_seen TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP)");

    console.log("Base de dades actualitzada amb taula de LOGS!");
});
db.close();