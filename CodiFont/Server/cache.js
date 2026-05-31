// Importem la connexió a la DB per poder llegir les dades quan la caché
// és buida o ha estat invalidada.
const { db } = require('./db');

// Importem tots els parsers que necessitem per convertir els camps TEXT
// de la DB als objectes JavaScript que usa la resta del codi.
const { parseFields, parseRules, parseEventDiscounts, parseSeasonalItems, parseDecorations, parseJSON } = require('./helpers');

// --- Variables d'estat de la caché principal ---
// L'objecte que conté les dades cachejades. Null significa "caché buida,
// cal llegir de la DB". Quan té valor, és l'objecte amb tots els camps parsejats.
let _cache = null;

// Flag que indica si hi ha una lectura de la DB en curs ara mateix.
// S'usa per resoldre la race condition (explicat més avall).
let _cacheLoading = false;

// Llista de callbacks que estan esperant que la caché es carregui.
// Quan la càrrega acaba, notifiquem tots els que estaven esperant.
let _cacheQueue = [];

// Exactament el mateix patró que la caché principal, però independent
// perquè les regions canvien amb menys freqüència i per motius diferents.
let _regionsCache = null;
let _regionsLoading = false;
let _regionsQueue = [];

// --- Caché principal (contracte + events) ---
// Invalida la caché principal. S'ha de cridar des de qualsevol ruta
// d'admin que modifiqui api_contract o events.
function invalidateCache() {
    // Posem _cache a null perquè la propera petició torni a llegir la DB.
    _cache = null;
    
    // Resetegem els flags per si hi havia una càrrega en curs quan
    // s'ha invalidat (cas rar però possible).
    _cacheLoading = false;
    _cacheQueue = [];
    console.log('🗑️  Caché principal invalidada');
}

// Retorna les dades cachejades via callback.
// Si la caché és vàlida, retorna immediatament sense tocar la DB.
// Si no, fa una sola lectura a la DB i notifica tots els que esperen.
function getCache(cb) {
    // Cas 1: La caché ja té dades. Retornem immediatament.
    // Totes les peticions (2, 3, 4... 1000) passaran per aquí
    // un cop la caché estigui carregada. Zero accesos a disc.
    if (_cache !== null) return cb(null, _cache);

    // Cas 2: La caché és buida però ja hi ha una càrrega en curs.
    // Afegim el callback a la cua i sortim. Quan la càrrega acabi,
    // aquest callback serà notificat juntament amb els altres.
    // Això és la solució a la race condition: si 1000 peticions arriben
    // al mateix moment amb la caché buida, només la PRIMERA inicia
    // la lectura a la DB. Les altres 999 s'afegeixen a la cua i esperen.
    if (_cacheLoading) {
        _cacheQueue.push(cb);
        return;
    }

    // Cas 3: La caché és buida i no hi ha cap càrrega en curs.
    // Aquesta és la primera petició que troba la caché buida.
    // Activem el flag i afegim el nostre callback a la cua.
    _cacheLoading = true;
    _cacheQueue.push(cb);

    // Llegim el contracte de la DB. El "?" és un paràmetre preparat
    // per evitar SQL injection (igual que a helpers.js).
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        if (err) {
            // Si hi ha error de DB, agafem tots els callbacks de la cua
            // (splice(0) buida l'array i retorna tots els elements),
            // resetegem el flag, i notifiquem l'error a tots els que esperaven.
            const queue = _cacheQueue.splice(0);
            _cacheLoading = false;
            return queue.forEach(fn => fn(err));
        }

        // Ara llegim l'esdeveniment actiu. Fem les dues lectures
        // seqüencialment (una dins el callback de l'altra) perquè
        // SQLite és single-threaded i no suporta lectures paral·leles.
        db.get("SELECT name, message FROM events WHERE id = 1", (errEv, event) => {
            // Agafem tots els callbacks acumulats a la cua durant
            // el temps que ha trigat la lectura a la DB.
            const queue = _cacheQueue.splice(0);

            // Resetegem el flag: la propera invalidació podrà iniciar
            // una nova càrrega.
            _cacheLoading = false;

            if (errEv) return queue.forEach(fn => fn(errEv));

            // Construïm l'objecte de caché parsejant tots els camps.
            // A partir d'aquí, tots els camps estan en format JavaScript
            // usable (arrays d'objectes), no com a strings JSON de la DB.
            _cache = {
                inputs: parseFields(contract && contract.inputs),
                outputs: parseFields(contract && contract.outputs),
                rules: parseRules(contract && contract.rules),
                eventDiscounts: parseEventDiscounts(contract && contract.event_discounts),
                seasonalItems: parseSeasonalItems(contract && contract.seasonal_items),
                decorations: parseDecorations(contract && contract.decorations),
                event: event || { name: 'normal', message: 'Benvingut' },
            };

            console.log('✅ Caché principal carregada des de DB');

            // Notifiquem tots els callbacks que estaven esperant,
            // passant-los null com a error (tot ha anat bé) i la caché.
            // Tots reben exactament les mateixes dades del mateix objecte.
            queue.forEach(fn => fn(null, _cache));
        });
    });
}

// --- Caché de regions ---
// Exactament el mateix patró que la caché principal.
// Separada perquè les regions s'invaliden per motius diferents
// (add-region, delete-region) i amb menys freqüència.
function invalidateRegionsCache() {
    _regionsCache = null;
    _regionsLoading = false;
    _regionsQueue = [];
    console.log('🗑️  Caché de regions invalidada');
}

function getRegionsCache(cb) {
    // Cas 1: Caché vàlida --> retornem immediatament.
    if (_regionsCache !== null) return cb(null, _regionsCache);

    // Cas 2: Càrrega en curs --> afegim a la cua i esperem.
    if (_regionsLoading) {
        _regionsQueue.push(cb);
        return;
    }

    // Cas 3: Primera petició amb caché buida --> iniciem la càrrega.
    _regionsLoading = true;
    _regionsQueue.push(cb);

    // Llegim totes les regions ordenades: primer les no-per-defecte
    // (ASC fa que is_default=0 vagi primer), després per nom alfabètic.
    // Aquest ordre és important perquè detectRegion a geo.js les
    // recorre en ordre i la primera que coincideix guanya.
    db.all('SELECT * FROM regions ORDER BY is_default ASC, name ASC', (err, rows) => {
        const queue = _regionsQueue.splice(0);
        _regionsLoading = false;

        if (err) return queue.forEach(fn => fn(err));

        // Parsegem el camp "countries" de cada regió una sola vegada
        // i el guardem ja com a array JavaScript.
        // Així geo.js no ha de parsejar JSON a cada petició.
        // L'spread operator {...r} copia tots els camps de la fila
        // i sobreescrivim "countries" amb la versió parsejada.
        _regionsCache = (rows || []).map(r => ({
            ...r,
            countries: parseJSON(r.countries),
        }));

        console.log('✅ Caché de regions carregada des de DB');
        queue.forEach(fn => fn(null, _regionsCache));
    });
}

// Exportem les quatre funcions públiques.
// getCache i getRegionsCache s'usen a api.js i dashboard.js per llegir dades.
// invalidateCache i invalidateRegionsCache s'usen a admin.js després de cada canvi.
module.exports = { getCache, invalidateCache, getRegionsCache, invalidateRegionsCache };