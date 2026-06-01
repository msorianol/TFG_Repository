const express = require('express');
const router = express.Router();
const { db, getDataVersion } = require('../db');
const { activeNames, getTtl } = require('../helpers');
const { getRegionForReq, isActiveNow } = require('../geo');
const { applyRules, applyEventDiscounts } = require('../rules');
const { getCache } = require('../cache');

// GET /api/version
// Unity crida aquest endpoint periòdicament (cada X segons) per saber si hi ha canvis nous al servidor. Si el número ha canviat respecte 
// l'última vegada que Unity el va veure, Unity descarta la seva caché local i torna a demanar totes les dades des de zero
router.get('/version', (req, res) => {
    // Simplement retornem el número de versió actual en format JSON
    // No cal caché ni DB: getDataVersion() llegeix una variable en memòria
    res.json({ version: getDataVersion() });
});

// GET /api/get-event
// Retorna l'esdeveniment actiu del joc (nom i missatge)
// Unity ho pot usar per mostrar una pantalla especial de Nadal, canviar la música, mostrar decoracions especials, etc
router.get('/get-event', (req, res) => {
    getCache((err, cache) => {
        // Si hi ha error llegint la caché (o la DB), retornem 500
        // Unity haurà de gestionar aquest cas (reintentar, usar valors per defecte...)
        if (err) return res.status(500).json({ error: err.message });

        // Llegim el TTL configurat per aquest endpoint.
        // La resposta inclou "cacheTtlSeconds" perquè Unity sàpiga quant de temps pot guardar aquesta resposta sense tornar a preguntar
        getTtl(db, 'get-event', (ttl) => {
            res.json({
                name: cache.event.name, // ex: "christmas"
                message: cache.event.message, // ex: "Bon Nadal!"
                cacheTtlSeconds: ttl // ex: 300 (5 minuts)
            });
        });
    });
});

// GET /api/get-contract
/* Retorna la llista de camps que Unity ha d'enviar quan demana un preu
 Unity crida aquest endpoint primer, i després usa la resposta per saber exactament quins camps incloure a /api/get-price
 Això permet afegir o treure camps des del dashboard sense tocar el codi de Unity */
router.get('/get-contract', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl(db, 'get-contract', (ttl) => {
            // "activeNames" filtra els inputs i retorna només els noms dels actius
            // Ex: [{name:"itemId",active:true},{name:"playerLevel",active:false}] --> ["itemId"]
            res.json({ inputs: activeNames(cache.inputs), cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-shop
// Retorna la llista d'itemIds que han d'aparèixer a la botiga ara mateix per a aquest jugador concret. Unity rep la llista i mostra els items corresponents
router.get('/get-shop', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });

        // Detectem la regió del jugador a partir de la seva IP
        getRegionForReq(req, (region) => {
            // Les dades del jugador arriben com a paràmetres de la URL (query string). Ex: /api/get-shop?playerLevel=10&class=warrior
            // req.query és l'objecte {playerLevel:"10", class:"warrior"}
            const playerData = req.query;

            // Filtrem els items de la caché per quedar-nos només amb els que estan actius ara per a aquest jugador i regió
            // isActiveNow comprova: regió, condicions del jugador i dates
            const active = cache.seasonalItems
                .filter(it => isActiveNow(it, region, new Date(), playerData))
                // Retornem només els IDs, no l'objecte complet
                // Unity ja sap com mostrar cada item pel seu ID
                .map(it => it.itemId);
            getTtl(db, 'get-shop', (ttl) => {
                // Ex: { items: ["sword", "rose"], cacheTtlSeconds: 300 }
                res.json({ items: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// GET /api/get-decorations
// Exactament el mateix patró que get-shop però per a les decoracions d'escena
// Unity rep la llista i activa els GameObjects corresponents al joc
router.get('/get-decorations', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getRegionForReq(req, (region) => {
            const playerData = req.query;
            const active = cache.decorations
                .filter(dc => isActiveNow(dc, region, new Date(), playerData))
                .map(dc => dc.decorationId);
            getTtl(db, 'get-decorations', (ttl) => {
                // Ex: { decorations: ["christmas_tree", "snow"], cacheTtlSeconds: 300 }
                res.json({ decorations: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// POST /api/get-price
// L'endpoint més complex. Calcula el preu final d'un item per a un jugador concret, aplicant geolocalització, regles de descompte i descomptes de temporada
// És POST (no GET) perquè envia dades del jugador al cos de la petició, no a la URL, per privacitat (les dades del jugador no queden als logs del servidor)
router.post('/get-price', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });

        // Obtenim la llista de camps que aquest endpoint accepta i retorna, filtrant pels que estan actius al contracte
        const allowedInputs = activeNames(cache.inputs);
        const allowedOutputs = activeNames(cache.outputs);

        // Construïm l'objecte "receivedData" amb les dades del jugador, però NOMÉS els camps que estan al contracte actiu
        // Ignorem qualsevol camp extra que Unity hagi enviat però que no estigui al contracte. Això fa el sistema robust davant canvis al contracte sense actualitzar Unity
        let receivedData = {};
        allowedInputs.forEach(field => {
            const val = req.body[field];
            // Només afegim el camp si Unity l'ha enviat (no undefined ni null)
            if (val !== undefined && val !== null) receivedData[field] = val;
        });

        // L'itemId sempre és necessari per buscar el preu a shop_prices, independentment de si està al contracte actiu o no
        // Si Unity no l'ha enviat, usem "unknown" per evitar crashes
        const itemId = req.body.itemId || "unknown";


        /* Funció auxiliar que construeix i envia la resposta final un cop tenim el preu base i el descompte calculat
         "row" és la fila de shop_prices (amb price i currency)
         "discount" és el descompte a aplicar (0.0 a 1.0) */
        const applyAndRespond = (row, discount) => {
            let response = {};

            // Construïm la resposta incluint només els camps de l'output actiu
            allowedOutputs.forEach(field => {
                if (field === 'price') {
                    // Apliquem el descompte al preu base i arrodonimm a 2 decimals. Ex: preu 10€, descompte 20% → 10 * (1 - 0.20) = 8.00€
                    // parseFloat elimina zeros innecessaris (8.00 → 8)
                    response.price = parseFloat((row.price * (1 - discount)).toFixed(2));
                } else if (field === 'currency') {
                    // La moneda no canvia amb el descompte, la copiem directament
                    response.currency = row.currency;
                } else {
                    // Per a qualsevol altre camp de l'output (ex: "originalPrice"), l'agafem directament de la fila de DB si existeix, o 0
                    response[field] = row[field] !== undefined ? row[field] : 0;
                }
            });

            getTtl(db, 'get-price', (ttl) => {
                response.cacheTtlSeconds = ttl;
                // Ex: { price: 8.00, currency: "EUR", cacheTtlSeconds: 300 }
                res.json(response);
            });
        };

        // Funció que busca el preu a la DB i aplica els descomptes
        // Rep la regió detectada i la llista completa de regions (necessària per al fallback)
        const resolvePrice = (region, regions) => {

            // --- Pas 1: Calcular descomptes ---
            // Apliquem les regles de descompte basades en dades del jugador. Ex: si playerXP >= 1000, 20% de descompte
            const rulesDiscount = applyRules(cache.rules, receivedData);

            // Apliquem els descomptes de temporada actius per a aquesta regió
            // Ex: si és Nadal i el jugador és d'Europa, 15% de descompte
            const eventDiscount = applyEventDiscounts(cache.eventDiscounts, region, new Date());

            // Guanya el descompte més gran dels dos. No s'acumulen: si tens 20% per regla i 15% per temporada, el descompte final és 20%
            const discount = Math.max(rulesDiscount, eventDiscount);
            if (discount > 0) console.log('💰 Descompte: ' + (discount * 100) + '%');

            // --- Pas 2: Buscar el preu base ---
            // Busquem el preu a shop_prices per a l'item i la regió del jugador
            // Aquesta és l'única consulta a la DB que fem a cada petició de preu: els preus varien per item+regió i no té sentit cachejar-los tots
            db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region], (err, row) => {
                if (err) return res.status(500).json({ error: 'DB error' });

                // Si hem trobat el preu per a la regió del jugador, perfecte
                if (row) return applyAndRespond(row, discount);

                // --- Pas 3: Fallback a la regió per defecte ---
                // Si no hi ha preu per a la regió del jugador (ex: el jugador és de Japó però no has configurat preus per a JP), intentem usar el preu de la regió per defecte
                const defRegion = (regions || []).find(r => r.is_default);

                // Només fem fallback si la regió per defecte existeix i és diferent de la regió actual (evitem buscar dues vegades)
                if (defRegion && defRegion.id !== region) {
                    db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?',
                        [itemId, defRegion.id], (err, defRow) => {
                            // Si tampoc hi ha preu a la regió per defecte, retornem error. Unity haurà de gestionar-ho
                            if (!defRow) return res.json({ error: 'Item not found' });
                            // Si hi ha preu a la regió per defecte, l'usem
                            applyAndRespond(defRow, discount);
                        });
                } else {
                    // Si no hi ha regió per defecte o ja estem a ella, retornem error directament
                    getTtl(db, 'get-price', (ttl) => {
                        res.json({ error: 'Item not found', cacheTtlSeconds: ttl });
                    });
                }
            });
        };

        // --- Pas 0: Detectar la regió ---
        /* Comprovem si Unity ha enviat un camp "region" explícit al contracte
         Si és així, usem aquella regió directament en lloc de detectar-la per IP
         Això permet que Unity sobreescrigui la geolocalització (útil per a proves o per a jugadors amb VPN) */
        if (allowedInputs.includes('region') && receivedData.region) {
            // Passem una funció buida com a primer argument de getRegionForReq perquè necessitem la llista de regions per al fallback, però ignorem la regió detectada per IP (usem la de Unity)
            getRegionForReq(req, (_, regions) => resolvePrice(receivedData.region, regions));
        } else {
            // Cas normal: detectem la regió per IP
            getRegionForReq(req, resolvePrice);
        }
    });
});

// Exportem el router perquè server.js el pugui muntar sota /api
module.exports = router;
