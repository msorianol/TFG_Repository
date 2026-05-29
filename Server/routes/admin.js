const express = require('express');
const router = express.Router();
const { db, getDataVersion, setDataVersion } = require('../db');
const { parseFields, activeNames, parseRules, parseEventDiscounts, parseSeasonalItems, parseDecorations } = require('../helpers');
const { invalidateCache, invalidateRegionsCache, getRegionsCache } = require('../cache');

// POST /force-refresh
router.post('/force-refresh', (req, res) => {
    const v = Date.now();
    setDataVersion(v);
    db.run("INSERT OR REPLACE INTO server_config (key, value) VALUES ('data_version', ?)", [String(v)]);
    invalidateCache();
    console.log("🚨 S'ha forçat l'actualització de la caché de tots els clients!");
    res.redirect('/dashboard');
});

// POST /update-contract
router.post('/update-contract', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        let allInputs = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);

        allInputs = allInputs.map(f => ({ ...f, active: req.body[`active_in_${f.name}`] === "on" }));
        allOutputs = allOutputs.map(f => ({ ...f, active: req.body[`active_out_${f.name}`] === "on" }));

        const newInput = (req.body.new_input_name || "").trim();
        const newOutput = (req.body.new_output_name || "").trim();
        if (newInput && !allInputs.find(f => f.name === newInput)) allInputs.push({ name: newInput, active: true });
        if (newOutput && !allOutputs.find(f => f.name === newOutput)) allOutputs.push({ name: newOutput, active: true });

        db.run(
            "UPDATE api_contract SET inputs = ?, outputs = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(allInputs), JSON.stringify(allOutputs)],
            (err) => {
                if (err) console.error(err);
                console.log("🔄 Contracte actualitzat | Inputs actius:", activeNames(allInputs));
                invalidateCache();
                res.redirect('/dashboard?ok=1');
            }
        );
    });
});

// GET /delete-field
router.get('/delete-field', (req, res) => {
    const { fieldName, fieldType } = req.query;
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (err, contract) => {
        let allInputs = parseFields(contract && contract.inputs);
        let allOutputs = parseFields(contract && contract.outputs);
        if (fieldType === "in") allInputs = allInputs.filter(f => f.name !== fieldName);
        if (fieldType === "out") allOutputs = allOutputs.filter(f => f.name !== fieldName);
        db.run(
            "UPDATE api_contract SET inputs = ?, outputs = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(allInputs), JSON.stringify(allOutputs)],
            () => { invalidateCache(); res.redirect('/dashboard'); }
        );
    });
});

// POST /add-rule
router.post('/add-rule', (req, res) => {
    const { discount } = req.body;
    if (!discount) return res.redirect('/dashboard');

    const groups = [];
    let gi = 0;
    while (true) {
        const conditions = [];
        let ci = 0;
        while (req.body[`g${gi}_field${ci}`]) {
            const field = req.body[`g${gi}_field${ci}`].trim();
            const op = req.body[`g${gi}_op${ci}`];
            const val = (req.body[`g${gi}_val${ci}`] || "").trim();
            if (field && op && val) conditions.push({ field, operator: op, value: val });
            ci++;
        }
        if (conditions.length === 0) break;
        groups.push({ conditions });
        gi++;
    }

    if (groups.length === 0) return res.redirect('/dashboard');

    db.get("SELECT rules FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const rules = parseRules(row && row.rules);
        const priority = parseInt(req.body.priority) || 0;
        rules.push({ groups, priority, discount: parseFloat(discount) / 100 });
        db.run(
            "UPDATE api_contract SET rules = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(rules)],
            (err) => {
                if (err) console.error(err);
                const fndStr = groups
                    .map(g => '(' + g.conditions.map(c => `${c.field} ${c.operator} ${c.value}`).join(' ∧ ') + ')')
                    .join(' ∨ ');
                console.log(`Nova regla FND: ${fndStr} → ${discount}%`);
                invalidateCache();
                res.redirect('/dashboard?ok=1&tab=preus');
            }
        );
    });
});

// GET /delete-rule
router.get('/delete-rule', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT rules FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let rules = parseRules(row && row.rules);
        if (!isNaN(index) && index >= 0 && index < rules.length) {
            const deleted = rules.splice(index, 1);
            console.log(`🗑️ Regla eliminada: ${JSON.stringify(deleted[0])}`);
        }
        db.run(
            "UPDATE api_contract SET rules = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(rules)],
            () => { invalidateCache(); res.redirect('/dashboard?ok=1&tab=preus'); }
        );
    });
});

// POST /update-event
router.post('/update-event', (req, res) => {
    const eventName = req.body.eventName;
    let message = "Benvingut";
    if (eventName === "christmas") message = "Bon Nadal!";
    if (eventName === "sant_jordi") message = "Feliç Diada!";
    db.run(
        "UPDATE events SET name = ?, message = ? WHERE id = 1",
        [eventName, message],
        () => {
            const v = Date.now();
            setDataVersion(v);
            db.run("INSERT OR REPLACE INTO server_config (key, value) VALUES ('data_version', ?)", [String(v)]);
            invalidateCache();
            res.redirect('/dashboard');
        }
    );
});

// POST /debug/set-ip
router.post('/debug/set-ip', (req, res) => {
    const { setDebugIp } = require('../geo');
    setDebugIp(req.body.fakeIp);
    res.redirect('/dashboard');
});

// POST /add-event-discount
router.post('/add-event-discount', (req, res) => {
    const b = req.body;
    if (!b.name || !b.name.trim() || !b.discount) return res.redirect('/dashboard');
    const entry = Object.assign({}, { name: b.name.trim(), discount: parseFloat(b.discount) / 100 }, { type: b.type, country: b.country || '' });
    if (b.type === 'day') {
        entry.day = parseInt(b.day); entry.month = parseInt(b.month);
    } else {
        entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
        entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
    }
    db.get("SELECT event_discounts FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseEventDiscounts(row && row.event_discounts);
        list.push(entry);
        db.run("UPDATE api_contract SET event_discounts = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (err) => { if (err) console.error(err); invalidateCache(); res.redirect('/dashboard?ok=1&tab=preus'); }
        );
    });
});

// GET /delete-event-discount
router.get('/delete-event-discount', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT event_discounts FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseEventDiscounts(row && row.event_discounts);
        if (!isNaN(index) && index >= 0 && index < list.length) list.splice(index, 1);
        db.run("UPDATE api_contract SET event_discounts = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => { invalidateCache(); res.redirect('/dashboard?ok=1&tab=contingut'); });
    });
});

// POST /add-items
router.post('/add-items', (req, res) => {
    const b = req.body;
    if (!b.itemId || !b.itemId.trim()) return res.redirect('/dashboard');

    const isFixed = b.fixed === '1';
    const entry = { itemId: b.itemId.trim(), name: (b.name || '').trim() };

    if (isFixed) {
        entry.fixed = true;
    } else {
        entry.type = b.type;
        if (b.type === 'day') {
            entry.day = parseInt(b.day); entry.month = parseInt(b.month);
        } else {
            entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
            entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
        }
    }

    const conditionsList = [];
    Object.keys(b).forEach(key => {
        const m = key.match(/^cond_field_(\d+)$/);
        if (!m) return;
        const i = m[1];
        const f = b['cond_field_' + i];
        const op = b['cond_op_' + i];
        const v = (b['cond_val_' + i] || '').trim();
        if (f && op && v) conditionsList.push({ field: f, operator: op, value: v });
    });
    if (conditionsList.length > 0) entry.conditions = [conditionsList];

    getRegionsCache((errReg, regions) => {
        regions = regions || [];
        const activeRegions = [];
        const prices = {};
        regions.forEach(r => {
            const priceVal = parseFloat(b['price_' + r.id]);
            const currVal = b['currency_' + r.id] || r.currency || 'EUR';
            if (!isNaN(priceVal) && priceVal > 0) {
                activeRegions.push(r.id);
                prices[r.id] = { price: priceVal, currency: currVal };
                db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?, ?, ?, ?)',
                    [entry.itemId, r.id, priceVal, currVal],
                    (errDb) => { if (errDb) console.error('[add-items] Error desant preu:', errDb); });
            }
        });
        if (activeRegions.length > 0) { entry.activeRegions = activeRegions; entry.prices = prices; }

        // Tot item (fix o de temporada) ha de tenir preu en almenys una regió
        if (activeRegions.length === 0) {
            console.warn('[add-items] Item sense preu ignorat:', entry.itemId);
            return res.redirect('/dashboard?error=item_no_price&tab=contingut');
        }

        db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (errCon, row) => {
            const list = parseSeasonalItems(row && row.seasonal_items);
            if (list.find(it => it.itemId === entry.itemId)) {
                console.warn(`[add-items] Duplicat ignorat: ${entry.itemId}`);
                return res.redirect('/dashboard?error=duplicate_item');
            }
            list.push(entry);
            db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
                [JSON.stringify(list)],
                (errUpd) => { if (errUpd) console.error('[add-items] Error guardant:', errUpd); invalidateCache(); res.redirect('/dashboard?ok=1&tab=contingut'); });
        });
    });
});

// GET /delete-items
router.get('/delete-items', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseSeasonalItems(row && row.seasonal_items);
        if (!isNaN(index) && index >= 0 && index < list.length) {
            const deletedItem = list.splice(index, 1)[0];
            if (deletedItem && deletedItem.itemId) {
                db.run('DELETE FROM shop_prices WHERE item_id = ?', [deletedItem.itemId]);
            }
        }
        db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => { invalidateCache(); res.redirect('/dashboard'); });
    });
});

// POST /add-decoration
router.post('/add-decoration', (req, res) => {
    const b = req.body;
    if (!b.decorationId || !b.decorationId.trim() || !b.name || !b.name.trim()) return res.redirect('/dashboard');
    const entry = Object.assign({}, { decorationId: b.decorationId.trim(), name: b.name.trim() }, { type: b.type, country: b.country || '' });
    if (b.type === 'day') {
        entry.day = parseInt(b.day); entry.month = parseInt(b.month);
    } else {
        entry.startDay = parseInt(b.startDay); entry.startMonth = parseInt(b.startMonth);
        entry.endDay = parseInt(b.endDay); entry.endMonth = parseInt(b.endMonth);
    }

    const conditions = [];
    Object.keys(b).forEach(key => {
        if (key.startsWith('dec_cond_field_')) {
            const idx = key.split('_').pop();
            const f = b[key];
            const op = b['dec_cond_op_' + idx];
            const v = (b['dec_cond_val_' + idx] || '').trim();
            if (f && op && v) conditions.push({ field: f, operator: op, value: v });
        }
    });
    if (conditions.length > 0) entry.conditions = [conditions];

    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseDecorations(row && row.decorations);
        if (list.find(dc => dc.decorationId === entry.decorationId)) {
            console.warn(`[add-decoration] Duplicat ignorat: ${entry.decorationId}`);
            return res.redirect('/dashboard?error=duplicate_decoration');
        }
        list.push(entry);
        db.run("UPDATE api_contract SET decorations = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (err) => { if (err) console.error(err); invalidateCache(); res.redirect('/dashboard?ok=1&tab=contingut'); }
        );
    });
});

// GET /delete-decoration
router.get('/delete-decoration', (req, res) => {
    const index = parseInt(req.query.index);
    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        let list = parseDecorations(row && row.decorations);
        if (!isNaN(index) && index >= 0 && index < list.length) list.splice(index, 1);
        db.run("UPDATE api_contract SET decorations = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)], () => { invalidateCache(); res.redirect('/dashboard'); });
    });
});

// POST /add-region
router.post('/add-region', (req, res) => {
    const { id, name, countries, currency, is_default } = req.body;
    if (!id || !name) return res.redirect('/dashboard');
    const codes = (countries || '').split(',').map(s => s.trim()).filter(Boolean);
    db.run('INSERT OR REPLACE INTO regions (id, name, countries, currency, is_default) VALUES (?,?,?,?,?)',
        [id.trim().toUpperCase(), name.trim(), JSON.stringify(codes), currency || 'EUR', is_default ? 1 : 0],
        (err) => { if (err) console.error(err); invalidateRegionsCache(); res.redirect('/dashboard?ok=1&tab=config'); });
});

// GET /delete-region
router.get('/delete-region', (req, res) => {
    const { id } = req.query;
    if (!id) return res.redirect('/dashboard');
    db.run('DELETE FROM regions WHERE id = ?', [id], () => { invalidateRegionsCache(); res.redirect('/dashboard'); });
});

// POST /add-base-price
router.post('/add-base-price', (req, res) => {
    const { itemId, region, price, currency } = req.body;
    if (!itemId || !region || !price) return res.redirect('/dashboard');
    db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?,?,?,?)',
        [itemId.trim(), region, parseFloat(price), currency || 'EUR'],
        (err) => { if (err) console.error(err); res.redirect('/dashboard'); });
});

// GET /delete-base-price
router.get('/delete-base-price', (req, res) => {
    const { itemId, region } = req.query;
    db.run('DELETE FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region],
        () => res.redirect('/dashboard'));
});

// POST /update-cache-config
router.post('/update-cache-config', (req, res) => {
    const endpoints = ['get-event', 'get-shop', 'get-decorations', 'get-price', 'get-contract'];
    Promise.all(endpoints.map(ep => {
        const ttl = parseInt(req.body['ttl_' + ep]);
        if (!isNaN(ttl) && ttl >= 10)
            return new Promise(r => db.run(
                'INSERT OR REPLACE INTO cache_config (endpoint, ttl_seconds) VALUES (?,?)',
                [ep, ttl], r));
        return Promise.resolve();
    })).then(() => res.redirect('/dashboard?ok=1&tab=config'));
});

// POST /update-item-price
router.post('/update-item-price', (req, res) => {
    const { itemId, region, price, currency } = req.body;
    if (!itemId || !region) return res.redirect('/dashboard');

    const isEmpty = !price || price.trim() === '';
    const priceVal = isEmpty ? null : parseFloat(price);

    const updateEntry = (add) => {
        db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
            const list = parseSeasonalItems(row && row.seasonal_items);
            const entry = list.find(it => it.itemId === itemId);
            if (!entry) return res.redirect('/dashboard');
            if (!entry.prices) entry.prices = {};
            if (!entry.activeRegions) entry.activeRegions = [];
            if (add) {
                entry.prices[region] = { price: priceVal, currency: currency || 'EUR' };
                if (!entry.activeRegions.includes(region)) entry.activeRegions.push(region);
            } else {
                delete entry.prices[region];
                entry.activeRegions = entry.activeRegions.filter(r => r !== region);
            }
            db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
                [JSON.stringify(list)], () => { invalidateCache(); res.redirect('/dashboard?ok=1&tab=contingut'); });
        });
    };

    if (isEmpty) {
        db.run('DELETE FROM shop_prices WHERE item_id = ? AND region = ?', [itemId, region],
            (err) => { if (err) console.error(err); updateEntry(false); });
    } else {
        db.run('INSERT OR REPLACE INTO shop_prices (item_id, region, price, currency) VALUES (?,?,?,?)',
            [itemId, region, priceVal, currency || 'EUR'],
            (err) => { if (err) console.error(err); updateEntry(true); });
    }
});

module.exports = router;

// POST /update-item-conditions
// Substitueix totes les condicions d'un item existent.
router.post('/update-item-conditions', (req, res) => {
    const b = req.body;
    const itemId = (b.itemId || '').trim();
    if (!itemId) return res.redirect('/dashboard?tab=contingut');

    const conditions = [];
    Object.keys(b).forEach(key => {
        if (key.startsWith('ic_field_')) {
            const idx = key.split('_').pop();
            const f = b[key];
            const op = b['ic_op_' + idx];
            const v = (b['ic_val_' + idx] || '').trim();
            if (f && op && v) conditions.push({ field: f, operator: op, value: v });
        }
    });

    db.get("SELECT seasonal_items FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseSeasonalItems(row && row.seasonal_items);
        const entry = list.find(it => it.itemId === itemId);
        if (!entry) return res.redirect('/dashboard?tab=contingut');

        if (conditions.length > 0) {
            entry.conditions = [conditions];
        } else {
            delete entry.conditions;
        }

        db.run("UPDATE api_contract SET seasonal_items = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (errUpd) => {
                if (errUpd) console.error('[update-item-conditions]', errUpd);
                invalidateCache();
                res.redirect('/dashboard?ok=1&tab=contingut');
            }
        );
    });
});

// POST /update-decoration-conditions
// Substitueix totes les condicions d'una decoració existent.
router.post('/update-decoration-conditions', (req, res) => {
    const b = req.body;
    const decorationId = (b.decorationId || '').trim();
    if (!decorationId) return res.redirect('/dashboard?tab=contingut');

    const conditions = [];
    Object.keys(b).forEach(key => {
        if (key.startsWith('dc_field_')) {
            const idx = key.split('_').pop();
            const f = b[key];
            const op = b['dc_op_' + idx];
            const v = (b['dc_val_' + idx] || '').trim();
            if (f && op && v) conditions.push({ field: f, operator: op, value: v });
        }
    });

    db.get("SELECT decorations FROM api_contract WHERE endpoint = 'get-price'", (err, row) => {
        const list = parseDecorations(row && row.decorations);
        const entry = list.find(dc => dc.decorationId === decorationId);
        if (!entry) return res.redirect('/dashboard?tab=contingut');

        if (conditions.length > 0) {
            entry.conditions = [conditions];
        } else {
            delete entry.conditions;
        }

        db.run("UPDATE api_contract SET decorations = ? WHERE endpoint = 'get-price'",
            [JSON.stringify(list)],
            (errUpd) => {
                if (errUpd) console.error('[update-decoration-conditions]', errUpd);
                invalidateCache();
                res.redirect('/dashboard?ok=1&tab=contingut');
            }
        );
    });
});
