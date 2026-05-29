/**
 * cache.js — Caché en memòria per als endpoints de la API de Unity.
 *
 * Dues caches independents amb cicles de vida diferents:
 *
 *  _cache        → contracte, regles, items, decoracions, event
 *  _regionsCache → llista de regions
 *
 * Race condition resolta amb cua de callbacks: si dues peticions arriben
 * mentre la cache es carrega, la segona espera que acabi la primera
 * en lloc de fer una segona lectura a la DB.
 */

const { db } = require('./db');
const { parseFields, parseRules, parseEventDiscounts, parseSeasonalItems, parseDecorations, parseJSON } = require('./helpers');

let _cache = null;
let _cacheLoading = false;
let _cacheQueue = [];

let _regionsCache = null;
let _regionsLoading = false;
let _regionsQueue = [];

// ── Caché principal (contracte + events) ─────────────────────────────────────

function invalidateCache() {
    _cache = null;
    _cacheLoading = false;
    _cacheQueue = [];
    console.log('🗑️  Caché principal invalidada');
}

function getCache(cb) {
    if (_cache !== null) return cb(null, _cache);

    // Si ja s'està carregant, afegim el callback a la cua
    if (_cacheLoading) {
        _cacheQueue.push(cb);
        return;
    }

    _cacheLoading = true;
    _cacheQueue.push(cb);

    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        if (err) {
            const queue = _cacheQueue.splice(0);
            _cacheLoading = false;
            return queue.forEach(fn => fn(err));
        }
        db.get("SELECT name, message FROM events WHERE id = 1", (errEv, event) => {
            const queue = _cacheQueue.splice(0);
            _cacheLoading = false;

            if (errEv) return queue.forEach(fn => fn(errEv));

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
            queue.forEach(fn => fn(null, _cache));
        });
    });
}

// ── Caché de regions ──────────────────────────────────────────────────────────

function invalidateRegionsCache() {
    _regionsCache = null;
    _regionsLoading = false;
    _regionsQueue = [];
    console.log('🗑️  Caché de regions invalidada');
}

function getRegionsCache(cb) {
    if (_regionsCache !== null) return cb(null, _regionsCache);

    if (_regionsLoading) {
        _regionsQueue.push(cb);
        return;
    }

    _regionsLoading = true;
    _regionsQueue.push(cb);

    db.all('SELECT * FROM regions ORDER BY is_default ASC, name ASC', (err, rows) => {
        const queue = _regionsQueue.splice(0);
        _regionsLoading = false;

        if (err) return queue.forEach(fn => fn(err));

        _regionsCache = (rows || []).map(r => ({
            ...r,
            countries: parseJSON(r.countries),
        }));

        console.log('✅ Caché de regions carregada des de DB');
        queue.forEach(fn => fn(null, _regionsCache));
    });
}

module.exports = { getCache, invalidateCache, getRegionsCache, invalidateRegionsCache };
