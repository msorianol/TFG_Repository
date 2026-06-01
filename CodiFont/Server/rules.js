// --- Motor de regles — FND + prioritat ---

/* FND = Forma Normal Disjuntiva. Funciona de la següent manera:
    - Dins d'un grup, totes les condicions s'han de complir (AND)
    - Entre grups, n'hi ha prou amb que un es compleixi (OR)
Exemple: (playerXP >= 1000 AND class == warrior) OR (region == CAT) */

// Avalua una sola condició (ex: playerXP >= 1000) contra les dades d'un jugador concret
// Rep un objecte amb {field, operator, value} i l'objecte "data" que conté les dades que ha enviat Unity (ex: {playerXP: "1200", class: "warrior"})
function evalCondition({ field, operator, value }, data) {
    // Si no hi ha dades del jugador, la condició no es pot avaluar: fals
    if (!data) return false;

    // Agafem el valor del camp corresponent de les dades del jugador
    // Ex: si field és "playerXP", agafem data["playerXP"]
    const rawVal = data[field];

    // Si el jugador no ha enviat aquest camp (o és buit), la condició no es pot complir i retornem fals en lloc de petar
    if (rawVal === undefined || rawVal === null || rawVal === "") return false;

    // Detectem si els dos valors (el del jugador i el de la condició) són numèrics. isNaN retorna true si NO és un número, per tant !isNaN vol dir "és un número vàlid"
    // Comprovem els dos perquè no té sentit comparar numèricament si un és text i l'altre és número
    const isNumeric = !isNaN(rawVal) && !isNaN(value);

    /* Preparem els valors finals per comparar:
    Si són numèrics, els convertim a float (número decimal)
    Si són text, els posem en minúscules i treiem espais dels extrems per evitar errors per majúscules o espais accidentals */
    const fv = isNumeric ? parseFloat(rawVal) : String(rawVal).trim().toLowerCase();
    const rv = isNumeric ? parseFloat(value) : String(value).trim().toLowerCase();

    /* Definim els sis operadors suportats com a funcions
    Usem un objecte per poder accedir a l'operador pel seu nom (ex: ops[">="])
    Els operadors numèrics (>=, <=, >, <) retornen false si els valors no són numèrics, per evitar comparacions sense sentit */
    const ops = {
        ">=": () => isNumeric && fv >= rv,
        "<=": () => isNumeric && fv <= rv,
        ">": () => isNumeric && fv > rv,
        "<": () => isNumeric && fv < rv,

        // == i != funcionen tant per a números com per a text
        // Usem == (no ===) per permetre comparacions entre "10" i 10
        "==": () => fv == rv,
        "!=": () => fv != rv,
    };
    return ops[operator]?.() ?? false;
}

// el descompte que ha de rebre (com a decimal: 0.20 = 20%).function applyRules(rules, data) {
function applyRules(rules, data) {
    // Filtrem les regles que es compleixen per a aquest jugador
    // Una regla es compleix si ALGUN dels seus grups (OR) té TOTES les seves condicions complides (AND)
    // El guard "r.groups &&" i "g.conditions &&" evita crashes si la DB té dades corruptes
    const matched = rules.filter(r =>
        r.groups && r.groups.some(g => g.conditions && g.conditions.every(c => evalCondition(c, data)))
    );

    // Si no coincideix cap regla, retornem 0 (sense descompte)
    if (matched.length === 0) return 0;

    /* Ordenem les regles coincidents per prioritat (de major a menor)
    Si dues regles tenen la mateixa prioritat, guanya la de major descompte
    "?? 0" tracta les regles sense prioritat definida com si tinguessin prioritat 0 */
    matched.sort((a, b) => {
        const pa = a.priority ?? 0, pb = b.priority ?? 0;
        return pb !== pa ? pb - pa : b.discount - a.discount;
    });

    // Agafem la regla guanyadora (la primera després d'ordenar)
    const w = matched[0];

    // ∧ = AND, ∨ = OR, útil per debugar i per entendre quina regla ha guanyat
    const s = w.groups
        .map(g => '(' + g.conditions.map(c => c.field + ' ' + c.operator + ' ' + c.value).join(' ∧ ') + ')')
        .join(' ∨ ');
    console.log('✅ Regla [P' + (w.priority ?? 0) + ']: ' + s + ' --> ' + (w.discount * 100) + '%');

    // Retornem el descompte com a float. parseFloat evita problemes si el valor s'ha guardat com a string a la DB
    //  "|| 0" retorna 0 si parseFloat falla (NaN és falsy)
    return parseFloat(w.discount) || 0;
}

// Comprova si hi ha algun descompte de temporada actiu ara mateix per a la regió del jugador, i retorna el major
function applyEventDiscounts(eds, region, now) {
    // Importem isActiveNow aquí dins i no a dalt de l'arxiu per evitar una dependència circular: geo.js importa rules.js i rules.js importaria geo.js --> bucle infinit.
    // Node gestiona bé els requires tardans: si el mòdul ja està carregat, simplement el retorna de la caché de mòduls sense tornar a executar-lo
    const { isActiveNow } = require('./geo');

    // Filtrem els descomptes d'esdeveniments que estan actius ara mateix per a la regió d'aquest jugador (comprova dates i regió)
    const matched = eds.filter(ed => isActiveNow(ed, region, now));

    // Si no n'hi ha cap d'actiu, retornem 0 (sense descompte)
    if (matched.length === 0) return 0;

    // Si n'hi ha més d'un actiu simultàniament (ex: Nadal i Cap d'Any se solapen), guanya el de major descompte. reduce compara cada element amb l'acumulador i es queda el major
    const best = matched.reduce((a, b) => a.discount > b.discount ? a : b);
    console.log('🎉 Esdeveniment: ' + best.name + ' --> ' + (best.discount * 100) + '%');
    return best.discount;
}

// Exportem les tres funcions. evalCondition s'exporta per separat perquè geo.js també la necessita per avaluar condicions de jugadoren items i decoracions
module.exports = { evalCondition, applyRules, applyEventDiscounts };
