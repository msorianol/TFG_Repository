const express = require('express');
const router  = express.Router();
const { db, getDataVersion, setDataVersion } = require('../db');
const { parseFields, activeNames, parseRules, parseEventDiscounts, parseSeasonalItems, parseDecorations, getTtl } = require('../helpers');
const { getRegionForReq, isActiveNow } = require('../geo');
const { applyRules, applyEventDiscounts } = require('../rules');

// GET /api/version
router.get('/version', (req, res) => {
    res.json({ version: getDataVersion() });
});

// GET /api/get-event
router.get('/get-event', (req, res) => {
    db.get("SELECT name, message FROM events WHERE id = 1", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl(db, 'get-event', (ttl) => {
            res.json({ name: row.name, message: row.message, cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-contract
// Retorna els inputs actius perquè Unity sàpiga quins camps ha d'enviar.
router.get('/get-contract', (req, res) => {
    db.get("SELECT inputs FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        getTtl(db, 'get-contract', (ttl) => {
            const activeInputs = row ? activeNames(parseFields(row.inputs)) : [];
            res.json({ inputs: activeInputs, cacheTtlSeconds: ttl });
        });
    });
});

// GET /api/get-shop
router.get('/get-shop', (req, res) => {
    db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const all = parseSeasonalItems(row && row.seasonal_items);
        getRegionForReq(req, (region) => {
            const playerData = req.query;
            const active = all
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
    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        const all = parseDecorations(row && row.decorations);
        getRegionForReq(req, (region) => {
            const playerData = req.query;
            const active = all
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
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        const allowedInputs  = activeNames(parseFields(contract && contract.inputs));
        const allowedOutputs = activeNames(parseFields(contract && contract.outputs));
        const rules          = parseRules(contract && contract.rules);
        const eventDiscounts = parseEventDiscounts(contract && contract.event_discounts);

        let receivedData = {};
        allowedInputs.forEach(field => {
            const val = req.body[field];
            if (val !== undefined && val !== null) receivedData[field] = val;
        });

        const itemId = req.body.itemId || "unknown";

        const applyAndRespond = (row, discount) => {
            let response = {};
            allowedOutputs.forEach(field => {
                if (field === 'price')    response.price    = parseFloat((row.price * (1 - discount)).toFixed(2));
                else if (field === 'currency') response.currency = row.currency;
                else response[field] = row[field] !== undefined ? row[field] : 0;
            });
            getTtl(db, 'get-price', (ttl) => {
                response.cacheTtlSeconds = ttl;
                res.json(response);
            });
        };

        const resolvePrice = (region, regions) => {
            const rulesDiscount = applyRules(rules, receivedData);
            const eventDiscount = applyEventDiscounts(eventDiscounts, region, new Date());
            const discount = Math.max(rulesDiscount, eventDiscount);
            if (discount > 0) console.log('💰 Descompte: ' + (discount * 100) + '%');

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
