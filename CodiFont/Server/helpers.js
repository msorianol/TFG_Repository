// Normalitza sempre al format [{name, active}]
// Retrocompatible amb l'antic format (array de strings).
function parseFields(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return parsed.map(item =>
            typeof item === "string" ? { name: item, active: true } : item
        );
    } catch (e) {
        console.error('parseFields: JSON invàlid', e.message);
        return [];
    }
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

// Helper per llegir el TTL de la base de dades
function getTtl(db, endpoint, cb) {
    db.get("SELECT ttl_seconds FROM cache_config WHERE endpoint = ?", [endpoint], (err, row) => {
        cb(row ? row.ttl_seconds : 300);
    });
}

module.exports = {
    parseFields,
    activeNames,
    parseJSON,
    parseRules,
    parseEventDiscounts,
    parseSeasonalItems,
    parseDecorations,
    getTtl,
};
