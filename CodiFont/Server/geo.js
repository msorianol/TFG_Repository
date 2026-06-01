// Llibreria que mapeja IPs a localitzacions geogràfiques (país i subregió)
// Funciona offline: té la base de dades de IPs inclosa al paquet, sense necessitat de fer cap petició a una API externa
const geoip = require('geoip-lite');

// Importem parseJSON per poder parsejar el camp "countries" d'una regió tant si ve com a string JSON de la DB com si ja ve parsejat de la caché
const { parseJSON } = require('./helpers');

// IP que s'usa quan el jugador es connecta des de local (127.0.0.1)
// Permet simular que el jugador és d'un país concret sense sortir de l'ordinador. Es pot canviar des del dashboard (Simulador IP)
// 84.88.1.1 és una IP real d'Espanya
let debugSimulatedIp = "84.88.1.1";

// Getter i setter de la IP simulada. S'usen des de la ruta
// POST /debug/set-ip del dashboard per canviar la simulació
function getDebugIp() { return debugSimulatedIp; }
function setDebugIp(ip) { debugSimulatedIp = ip; }

/* Comprova si un objecte geo (resultat de geoip.lookup) correspon a un codi de país o subregió concret
Suporta tres formats de codi:
   "*"     --> qualsevol país (sempre retorna true)
   "ES"    --> país sencer (Espanya)
   "ES:CT" --> subregió concreta (Catalunya dins d'Espanya) */
function geoMatchesCountry(geo, code) {
    if (code === '*') return true;

    // Separem el codi per ":" per detectar si és subregió o país
    const parts = code.split(':');

    // Si té dues parts (ex: ["ES", "CT"]), comprovem tant el país com la subregió. geo.country és el codi ISO del país (ex: "ES"), geo.region és el codi de la subregió (ex: "CT" per Catalunya)
    if (parts.length === 2) return geo.country === parts[0] && geo.region === parts[1];

    // Si només té una part, comprovem només el país
    return geo.country === code;
}

// Determina a quina de les regions definides al dashboard pertany un jugador, basant-se en el seu objecte geo
function detectRegion(geo, regions) {
    // Si no tenim dades geo (IP no reconeguda) o no hi ha regions definides, retornem 'US' com a valor de seguretat
    if (!geo || !regions || !regions.length) return 'US';

    // Provem totes les regions que NO són la per defecte, en ordre
    // La primera que coincideix guanya. Per això l'ordre de les regions al dashboard importa: si un jugador és de Catalunya i tens tant "CAT" (ES:CT) com "EU" (ES), la que estigui primer guanya
    for (const r of regions.filter(r => !r.is_default)) {
        // "countries" pot ser array (si ve de la caché, ja parsejat) o string JSON (si ve directament de la DB sense parsejar)
        // Gestionem els dos casos per robustesa
        const codes = Array.isArray(r.countries) ? r.countries : parseJSON(r.countries);

        // Si algun dels codis de la regió coincideix amb la geo del jugador, retornem l'ID d'aquesta regió (ex: "EU", "CAT", "US")
        if (codes.some(c => geoMatchesCountry(geo, c))) return r.id;
    }

    // Si cap regió no-per-defecte ha coincideix, usem la regió per defecte
    const def = regions.find(r => r.is_default);

    // Si no hi ha cap regió per defecte definida, usem la primera de la llista
    // Si la llista és buida, retornem 'US' com a últim recurs
    return def ? def.id : (regions[0] ? regions[0].id : 'US');
}

/* Funció principal de geolocalització: detecta la regió d'una petició HTTP.
 S'usa a cada endpoint de la API que necessita saber d'on és el jugador.
 "req" és l'objecte de petició d'Express, "cb" és el callback que rep (region, regions) on region és l'ID detectat i regions és la llista completa 
 (necessària per al fallback de preus a /api/get-price) */
function getRegionForReq(req, cb) {
    // Importem getRegionsCache aquí dins (require tardà) per evitar dependència circular entre geo.js i cache.js
    const { getRegionsCache } = require('./cache');

    getRegionsCache((err, regions) => {
        regions = regions || [];

        // Llegim la IP de la petició. "x-forwarded-for" és la capçalera que usen els proxies i balancejadors de càrrega per passar la IP real del client. Si no existeix, usem la IP directa del socket
        // Pot contenir múltiples IPs separades per comes si hi ha diversos proxies en cadena (ex: "1.2.3.4, 5.6.7.8"), per això agafem només la primera amb split(',')[0].trim()
        let ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();

        // Si la IP és local (connexió des del mateix ordinador), la substituïm per la IP simulada del dashboard
        // "::1" és l'equivalent IPv6 de 127.0.0.1
        if (ip.includes('127.0.0.1') || ip.includes('::1')) ip = debugSimulatedIp;

        // Convertim la IP a dades geogràfiques amb geoip-lite
        // Retorna null si la IP no es troba a la base de dades, o un objecte {country, region, ...} si la troba
        const geo = geoip.lookup(ip);

        // Cridem el callback amb la regió detectada i la llista completa
        cb(detectRegion(geo, regions), regions);
    });
}

// Determina si un item, decoració o descompte de temporada ha d'estar actiu en un moment concret per a un jugador concret
// "entry" és l'objecte (item/decoració/descompte), "region" és la regió del jugador, "now" és la data actual, "playerData" són les dades del jugador
function isActiveNow(entry, region, now, playerData = {}) {
    // --- Comprovació 1: Regió ---
    // Si l'entry té regions específiques definides (activeRegions), el jugador ha de ser d'una d'elles
    if (entry.activeRegions && entry.activeRegions.length > 0) {
        if (!entry.activeRegions.includes(region)) return false;
    } else if (entry.country && entry.country !== region) {
        // Format antic: "country" en lloc d'"activeRegions"
        // Si el jugador no és de la regió indicada, no és actiu
        return false;
    }

    // --- Comprovació 2: Condicions del jugador ---
    // Si l'entry té condicions (ex: playerLevel >= 10), el jugador les ha de complir 
    // Usem la mateixa lògica FND que les regles: "some" és OR entre grups, "every" és AND dins de cada grup
    if (entry.conditions && entry.conditions.length > 0) {
        const { evalCondition } = require('./rules');
        const conditionsMatch = entry.conditions.some(group =>
            group.every(cond => evalCondition(cond, playerData))
        );
        if (!conditionsMatch) return false;
    }

    // --- Comprovació 3: Dates ---
    // Els items fixos no tenen dates: si han passat les comprovacions anteriors, sempre són actius
    if (entry.fixed) return true;

    // Calculem un número que representa la data d'avui com a MMDD. Ex: 23 d'abril --> (4) * 100 + 23 = 423
    // getMonth() retorna 0-11, per això sumem 1. Aquest truc permet comparar dates com a simples números enters
    const cur = (now.getMonth() + 1) * 100 + now.getDate();

    // Si és un dia exacte (ex: Sant Jordi = 23/04): calculem el número del dia de l'entry i el comparem amb avui
    if (entry.type === 'day') return cur === entry.month * 100 + entry.day;

    // Si és un rang de dates (ex: Nadal = 25/12 --> 07/01): calculem els números d'inici i fi del rang
    const s = entry.startMonth * 100 + entry.startDay;
    const e = entry.endMonth * 100 + entry.endDay;

    // Si s <= e, el rang NO creua l'any nou (ex: 01/06 --> 30/08): simplement comprovem que avui és entre inici i fi
    // Si s > e, el rang SÍ creua l'any nou (ex: 25/12 --> 07/01): comprovem que avui és després de l'inici O abans del fi
    return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
}

// Exportem totes les funcions públiques del mòdul
module.exports = { getDebugIp, setDebugIp, detectRegion, getRegionForReq, isActiveNow };