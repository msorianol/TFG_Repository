const express = require('express');
const router = express.Router();
const { db, getDataVersion } = require('../db');
const { activeNames, getTtl } = require('../helpers');
const { getRegionForReq, isActiveNow } = require('../geo');
const { applyRules, applyEventDiscounts } = require('../rules');
const { getCache } = require('../cache');

// GET /api/version
router.get('/version', (req, res) => {
    res.json({ version: getDataVersion() });
});

// GET /api/get-event
router.get('/get-event', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl(db, 'get-event', (ttl) => {
            res.json({ name: cache.event.name, message: cache.event.message, cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-contract
// Retorna els inputs actius perquè Unity sàpiga quins camps ha d'enviar.
router.get('/get-contract', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl(db, 'get-contract', (ttl) => {
            res.json({ inputs: activeNames(cache.inputs), cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-shop
router.get('/get-shop', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getRegionForReq(req, (region) => {
            const playerData = req.query;
            const active = cache.seasonalItems
                .filter(it => isActiveNow(it, region, new Date(), playerData))
                .map(it => it.itemId);
            getTtl(db, 'get-shop', (ttl) => {
                res.json({ items: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// GET /api/get-decorations
router.get('/get-decorations', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });
        getRegionForReq(req, (region) => {
            const playerData = req.query;
            const active = cache.decorations
                .filter(dc => isActiveNow(dc, region, new Date(), playerData))
                .map(dc => dc.decorationId);
            getTtl(db, 'get-decorations', (ttl) => {
                res.json({ decorations: active, cacheTtlSeconds: ttl });
            });
        });
    });
});

// POST /api/get-price
// Calcula el preu final aplicant geolocalització i les regles actives.
router.post('/get-price', (req, res) => {
    getCache((err, cache) => {
        if (err) return res.status(500).json({ error: err.message });

        const allowedInputs = activeNames(cache.inputs);
        const allowedOutputs = activeNames(cache.outputs);

        let receivedData = {};
        allowedInputs.forEach(field => {
            const val = req.body[field];
            if (val !== undefined && val !== null) receivedData[field] = val;
        });

        const itemId = req.body.itemId || "unknown";

        const applyAndRespond = (row, discount) => {
            let response = {};
            allowedOutputs.forEach(field => {
                if (field === 'price') response.price = parseFloat((row.price * (1 - discount)).toFixed(2));
                else if (field === 'currency') response.currency = row.currency;
                else response[field] = row[field] !== undefined ? row[field] : 0;
            });
            getTtl(db, 'get-price', (ttl) => {
                response.cacheTtlSeconds = ttl;
                res.json(response);
            });
        };

        const resolvePrice = (region, regions) => {
            const rulesDiscount = applyRules(cache.rules, receivedData);
            const eventDiscount = applyEventDiscounts(cache.eventDiscounts, region, new Date());
            const discount = Math.max(rulesDiscount, eventDiscount);
            if (discount > 0) console.log('💰 Descompte: ' + (discount * 100) + '%');

            // El preu final segueix llegint de DB (varia per item+regió, no té sentit cachejat)
            db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region], (err, row) => {
                if (err) return res.status(500).json({ error: 'DB error' });
                if (row) return applyAndRespond(row, discount);

                // Fallback: regió per defecte
                const defRegion = (regions || []).find(r => r.is_default);
                if (defRegion && defRegion.id !== region) {
                    db.get('SELECT * FROM shop_prices WHERE item_id = ? AND region = ?',
                        [itemId, defRegion.id], (err, defRow) => {
                            if (!defRow) return res.json({ error: 'Item not found' });
                            applyAndRespond(defRow, discount);
                        });
                } else {
                    getTtl(db, 'get-price', (ttl) => {
                        res.json({ error: 'Item not found', cacheTtlSeconds: ttl });
                    });
                }
            });
        };

        if (allowedInputs.includes('region') && receivedData.region) {
            getRegionForReq(req, (_, regions) => resolvePrice(receivedData.region, regions));
        } else {
            getRegionForReq(req, resolvePrice);
        }
    });
});

module.exports = router;
