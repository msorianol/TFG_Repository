//Normalitza el camp "inputs" o "outputs" que ve de la DB sempre al format [{name: "nomCamp", active: true/false}]
//per poder activar/desactivar camps des del dashboard. Aquesta funció és retrocompatible amb els dos
function parseFields(raw) {
    // Si no hi ha res (null, undefined, string buit), retornem array buit
    if (!raw) return [];
    try {
        // Parsejem el JSON que ve de la DB (a la DB els camps s'emmagatzemen com a text JSON serialitzat)
        const parsed = JSON.parse(raw);
        return parsed.map(item =>
            // Si l'element és un string (format antic), el convertim a objecte amb active:true per defecte
            // Si ja és un objecte (format nou), el deixem tal qual
            typeof item === "string" ? { name: item, active: true } : item
        );
    } catch (e) {
        // Si el JSON és invàlid per qualsevol motiu, mostrem l'error al terminal i retornem array buit en lloc de fer petar el servidor
        console.error('parseFields: JSON invàlid', e.message);
        return [];
    }
}

// Rep la llista completa de camps (actius i inactius) i retorna només els noms dels que estan actius Exemple: [{name:"itemId", active:true}, {name:"playerLevel", active:false}] --> ["itemId"]
// S'usa per saber exactament quins camps Unity ha d'enviar i quins camps ha d'incloure la resposta del servidor
function activeNames(fields) {
    return fields.filter(f => f.active).map(f => f.name);
}

/* Parser genèric i defensiu per a qualsevol camp JSON de la DB. La diferència amb parseFields és que aquest no fa cap transformació de format: 
simplement parseja i retorna. Si falla, retorna array buit
S'usa per a regles, descomptes, items, decoracions... qualsevol camp ue a la DB sigui TEXT però contingui un array JSON */
function parseJSON(raw) {
    if (!raw) return [];
    try { return JSON.parse(raw); } catch (e) { return []; }
}

// Els quatre parsers següents són simplement àlies de parseJSON.
// Existeixen per fer el codi més llegible: quan veus "parseRules(row.rules)" és més clar que no pas "parseJSON(row.rules)", perquè indica explícitament quin tipus de dades estàs parsejant
const parseRules = parseJSON;
const parseEventDiscounts = parseJSON;
const parseSeasonalItems = parseJSON;
const parseDecorations = parseJSON;

/* Llegeix de la taula cache_config quants segons hauria de cachear Unity les respostes d'un endpoint concret
El paràmetre "db" és la connexió a la base de dades
El paràmetre "endpoint" és el nom de l'endpoint (ex: "get-price")
El paràmetre "cb" és el callback que rep el TTL resultant
Si no hi ha configuració per aquell endpoint a la DB retorna 300 per defecte (5 minuts) */
function getTtl(db, endpoint, cb) {
    db.get("SELECT ttl_seconds FROM cache_config WHERE endpoint = ?", [endpoint], (err, row) => {
        // El "?" de la query fa que SQLite substitueixi el "?" pel valor d'[endpoint] de manera segura, evitant SQL injection. Si existeix la fila, retornem el TTL configurat
        // si no, retornem 300 com a valor per defecte
        cb(row ? row.ttl_seconds : 300);
    });
}

// Exportem totes les funcions perquè els altres mòduls puguin importar només el que necessiten
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
