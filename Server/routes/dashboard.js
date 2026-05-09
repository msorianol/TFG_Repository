const express = require('express');
const router  = express.Router();
const geoip   = require('geoip-lite');
const { db }  = require('../db');
const { parseFields, parseRules, parseEventDiscounts, parseSeasonalItems, parseDecorations, parseJSON } = require('../helpers');
const { getDebugIp, detectRegion } = require('../geo');

router.get('/dashboard', (req, res) => {
    db.get("SELECT * FROM api_contract WHERE endpoint = 'get-price'", (errContract, contract) => {
        db.get("SELECT name FROM events WHERE id = 1", (errEvent, currentEvent) => {

            const inputs         = parseFields(contract && contract.inputs)  || [{ name: "itemId", active: true }];
            const outputs        = parseFields(contract && contract.outputs) || [{ name: "price",  active: true }];
            const rules          = parseRules(contract && contract.rules);
            const eventDiscounts = parseEventDiscounts(contract && contract.event_discounts);
            const seasonalItems  = parseSeasonalItems(contract && contract.seasonal_items);
            const decorations    = parseDecorations(contract && contract.decorations);
            const activeEventName = currentEvent ? currentEvent.name.toUpperCase() : "UNKNOWN";

            // ── Helpers de renderització ──
            function renderFieldRows(fields, prefix) {
                if (fields.length === 0) return `<p class="empty">No hi ha camps definits.</p>`;
                return fields.map(field => `
                    <div class="field-row ${field.active ? '' : 'field-off'}">
                        <label class="switch">
                            <input type="checkbox" name="active_${prefix}_${field.name}" ${field.active ? 'checked' : ''}>
                            <span class="track"></span>
                        </label>
                        <span class="field-name">${field.name}</span>
                        <span class="pill ${field.active ? 'pill-on' : 'pill-off'}">${field.active ? 'actiu' : 'inactiu'}</span>
                        <a href="/delete-field?fieldName=${field.name}&fieldType=${prefix}"
                           onclick="return confirm('Eliminar ${field.name}?')"
                           class="del-btn" title="Eliminar">×</a>
                    </div>`).join('');
            }

            function renderRules(rules) {
                if (rules.length === 0) return `<p class="empty">Cap regla definida.</p>`;
                return rules.map((rule, i) => {
                    const groupsHtml = rule.groups.map((group, gi) => {
                        const condsHtml = group.conditions.map((c, ci) =>
                            `${ci > 0 ? '<span class="logic-op">∧</span>' : ''}
                             <code>${c.field}</code>
                             <span class="op">${c.operator}</span>
                             <code>${c.value}</code>`
                        ).join('');
                        return `
                            ${gi > 0 ? '<span class="logic-op or-op">∨</span>' : ''}
                            <span class="group-wrap">(${condsHtml})</span>`;
                    }).join('');
                    const prio = rule.priority ?? 0;
                    return `
                    <div class="rule-row">
                        <span class="prio-badge" title="Prioritat">P${prio}</span>
                        <span class="rule-body">
                            ${groupsHtml}
                            <span class="arrow">→</span>
                            <strong>${Math.round(rule.discount * 100)}% de descompte</strong>
                        </span>
                        <a href="/delete-rule?index=${i}"
                           onclick="return confirm('Eliminar aquesta regla?')"
                           class="del-btn" title="Eliminar">×</a>
                    </div>`;
                }).join('');
            }

            function renderDateList(entries, delUrl, badge, globalList) {
                if (entries.length === 0) return '<p class="empty">Cap entrada definida.</p>';
                return entries.map((entry, i) => {
                    const realIndex = globalList ? globalList.indexOf(entry) : i;
                    let dateHtml = '';
                    if (!entry.fixed) {
                        const d = entry.type === 'day'
                            ? String(entry.day).padStart(2, '0') + '/' + String(entry.month).padStart(2, '0')
                            : String(entry.startDay).padStart(2, '0') + '/' + String(entry.startMonth).padStart(2, '0')
                            + ' → ' + String(entry.endDay).padStart(2, '0') + '/' + String(entry.endMonth).padStart(2, '0');
                        const co = (entry.activeRegions && entry.activeRegions.length > 0) ? entry.activeRegions.join(', ') : (entry.country || 'Tots');
                        dateHtml = '<span class="arrow">·</span><code>' + d + '</code>'
                            + '<span class="arrow">·</span><span style="color:var(--text-2);font-size:12px;">' + co + '</span>';
                    }
                    return '<div class="rule-row" style="background:rgba(96,165,250,0.07);border-color:rgba(96,165,250,0.2);">'
                        + '<span class="rule-body">' + badge(entry)
                        + dateHtml
                        + '</span>'
                        + '<a href="' + delUrl + '?index=' + realIndex + '" onclick="return confirm(\'Eliminar?\')" class="del-btn">×</a>'
                        + '</div>';
                }).join('');
            }

            const renderEventDiscounts = eds => renderDateList(eds, '/delete-event-discount',
                e => '<strong style="color:#e2e4e9;">' + e.name + '</strong><span class="prio-badge" style="color:#60a5fa;background:rgba(96,165,250,0.1);border-color:rgba(96,165,250,0.3);">' + Math.round(e.discount * 100) + '%</span>');

            const renderSeasonalItems = items => renderDateList(items, '/delete-items',
                it => {
                    const priceBadges = it.prices
                        ? Object.entries(it.prices).map(([rid, p]) =>
                            '<span class="prio-badge" style="color:#a78bfa;background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.3);">'
                            + rid + ': ' + p.price + ' ' + p.currency + '</span>').join('') : '';
                    const fixedBadge = it.fixed
                        ? '<span class="prio-badge" style="color:#34d399;background:rgba(52,211,153,0.1);border-color:rgba(52,211,153,0.3);">FIXE</span>' : '';
                    const condBadges = (it.conditions && it.conditions[0])
                        ? it.conditions[0].map(c =>
                            '<span class="prio-badge" style="color:#f87171;background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.25);">'
                            + c.field + ' ' + c.operator + ' ' + c.value + '</span>').join('') : '';
                    return fixedBadge
                        + '<code style="color:#a78bfa;">' + it.itemId + '</code>'
                        + '<span style="color:var(--text-2);font-size:12px;">' + it.name + '</span>'
                        + condBadges + priceBadges;
                }, seasonalItems);

            const renderDecorations = decs => renderDateList(decs, '/delete-decoration',
                dc => {
                    const condBadges = (dc.conditions && dc.conditions[0])
                        ? dc.conditions[0].map(c =>
                            '<span class="prio-badge" style="margin-left:8px; color:#f87171;background:rgba(248,113,113,0.08);border-color:rgba(248,113,113,0.25);">'
                            + c.field + ' ' + c.operator + ' ' + c.value + '</span>').join('') : '';
                    return '<code style="color:#34d399;">' + dc.decorationId + '</code>'
                        + '<span style="color:var(--text-2);font-size:12px;">' + dc.name + '</span>'
                        + condBadges;
                });

            const fieldOptions = inputs.map(f =>
                `<option value="${f.name}">${f.name}${f.active ? '' : ' (inactiu)'}</option>`
            ).join('');

            const inputRows      = renderFieldRows(inputs, 'in');
            const outputRows     = renderFieldRows(outputs, 'out');
            const ruleRows       = renderRules(rules);
            const eventDiscRows  = renderEventDiscounts(eventDiscounts);
            const fixedItems     = seasonalItems.filter(it => it.fixed);
            const seasonalOnly   = seasonalItems.filter(it => !it.fixed);
            const fixedItemRows  = renderSeasonalItems(fixedItems);
            const seasonalItemRows = renderSeasonalItems(seasonalOnly);
            const decorationRows = renderDecorations(decorations);

            function buildClientScript(fieldOpts, opOpts) {
                return `<script>
var FIELD_OPTIONS = ${JSON.stringify(fieldOpts)};
var OP_OPTIONS    = ${JSON.stringify(opOpts)};
var groupCount    = 0;

function makeSelect(name, optionsHtml) {
    var s = document.createElement('select');
    s.name = name; s.innerHTML = optionsHtml; return s;
}
function makeInput(name) {
    var i = document.createElement('input');
    i.type = 'text'; i.name = name; i.placeholder = 'valor'; i.style.width = '100px'; return i;
}
function conditionHtml(gi, ci) {
    var row = document.createElement('div');
    row.className = 'cond-row';
    row.id = 'cond-' + gi + '-' + ci;
    row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:5px;';
    if (ci > 0) {
        var andSp = document.createElement('span');
        andSp.style.cssText = 'font-size:11px;font-weight:700;color:#f87171;font-family:monospace;min-width:14px;';
        andSp.textContent = '∧'; row.appendChild(andSp);
    } else {
        var sp = document.createElement('span'); sp.style.minWidth='14px'; row.appendChild(sp);
    }
    row.appendChild(makeSelect('g'+gi+'_field'+ci, FIELD_OPTIONS));
    row.appendChild(makeSelect('g'+gi+'_op'+ci,    OP_OPTIONS));
    row.appendChild(makeInput ('g'+gi+'_val'+ci));
    if (ci > 0) {
        var del = document.createElement('button');
        del.type = 'button'; del.className = 'del-btn'; del.textContent = '×';
        del.setAttribute('onclick', 'removeCond('+gi+','+ci+')'); row.appendChild(del);
    }
    return row;
}
function addGroup() {
    var gi = groupCount++;
    var container = document.getElementById('groups-container');
    var div = document.createElement('div');
    div.id = 'group-' + gi; div.dataset.condCount = 1;
    div.style.cssText = 'margin-bottom:10px;padding:12px;background:var(--surface);border:1px solid var(--border);border-radius:6px;';
    if (gi > 0) {
        var orLbl = document.createElement('span');
        orLbl.style.cssText = 'display:block;font-size:11px;font-weight:700;color:#f87171;font-family:monospace;margin-bottom:6px;';
        orLbl.textContent = '∨ OR'; div.appendChild(orLbl);
    }
    var condsDiv = document.createElement('div');
    condsDiv.id = 'conds-' + gi;
    condsDiv.appendChild(conditionHtml(gi, 0)); div.appendChild(condsDiv);
    var actionsDiv = document.createElement('div');
    actionsDiv.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    var addBtn = document.createElement('button');
    addBtn.type = 'button'; addBtn.textContent = '∧ Afegir condició AND';
    addBtn.style.cssText = 'padding:5px 10px;font-size:11px;background:var(--bg);border:1px dashed var(--border2);color:var(--text-2);border-radius:4px;cursor:pointer;';
    addBtn.setAttribute('onclick', 'addCond('+gi+')'); actionsDiv.appendChild(addBtn);
    if (gi > 0) {
        var rmBtn = document.createElement('button');
        rmBtn.type = 'button'; rmBtn.className = 'del-btn'; rmBtn.textContent = '×';
        rmBtn.style.marginLeft = 'auto';
        rmBtn.setAttribute('onclick', 'removeGroup('+gi+')'); actionsDiv.appendChild(rmBtn);
    }
    div.appendChild(actionsDiv); container.appendChild(div);
}
function addCond(gi) {
    var groupEl = document.getElementById('group-' + gi);
    var ci = parseInt(groupEl.dataset.condCount);
    groupEl.dataset.condCount = ci + 1;
    document.getElementById('conds-' + gi).appendChild(conditionHtml(gi, ci));
}
function removeCond(gi, ci) { document.getElementById('cond-' + gi + '-' + ci).remove(); }
function removeGroup(gi)    { document.getElementById('group-' + gi).remove(); }
addGroup();
<\/script>`;
            }

            const safeFieldOptions = fieldOptions || '<option value="">— afegeix inputs —</option>';
            const safeOpOptions    = '<option value=">=">&gt;=</option>'
                + '<option value="<=">&lt;=</option>'
                + '<option value=">">&gt;</option>'
                + '<option value="<">&lt;</option>'
                + '<option value="==">==</option>'
                + '<option value="!=">!=</option>';
            const clientScript = buildClientScript(safeFieldOptions, safeOpOptions);

            db.all('SELECT * FROM regions ORDER BY is_default ASC, name ASC', (err, regions) => {
                regions = regions || [];
                const debugIp   = getDebugIp();
                const geoSim    = geoip.lookup(debugIp);
                const regionSim = detectRegion(geoSim, regions);
                const regionOptions = '<option value="">Totes les regions</option>'
                    + regions.map(r => `<option value="${r.id}">${r.name} (${r.id})</option>`).join('');

                db.all('SELECT sp.item_id, sp.region, sp.price, sp.currency FROM shop_prices sp ORDER BY sp.item_id, sp.region', (err, basePrices) => {
                    const groupedPrices = {};
                    basePrices.forEach(p => {
                        if (!groupedPrices[p.item_id]) groupedPrices[p.item_id] = [];
                        groupedPrices[p.item_id].push(p);
                    });

                    const basePriceRows = Object.keys(groupedPrices).length === 0
                        ? '<p class="empty">Cap preu base definit. Afegeix preus per als items fixos (sword, shield...).</p>'
                        : Object.keys(groupedPrices).map(itemId => {
                            const regionBadges = groupedPrices[itemId].map(p =>
                                `<span class="prio-badge" style="color:#34d399;background:rgba(52,211,153,0.1);border-color:rgba(52,211,153,0.3); margin-right: 4px;">
                                ${p.region}: ${p.price} ${p.currency}
                                <a href="/delete-base-price?itemId=${encodeURIComponent(p.item_id)}&region=${p.region}"
                                   onclick="return confirm('Eliminar aquest preu?')"
                                   style="color:var(--text-3); text-decoration:none; margin-left:4px; font-size:14px;">×</a>
                            </span>`
                            ).join('');
                            return `
                            <div class="rule-row" style="background:rgba(52,211,153,0.05);border-color:rgba(52,211,153,0.15);margin-bottom:5px;">
                                <span class="rule-body">
                                    <code style="font-size: 14px; font-weight: bold;">${itemId}</code>
                                    <span class="arrow" style="margin: 0 8px;">→</span>
                                    ${regionBadges}
                                </span>
                            </div>`;
                        }).join('');

                    db.all('SELECT * FROM cache_config ORDER BY endpoint', (err, cacheRows) => {
                        cacheRows = cacheRows || [];

                        res.send(`<!DOCTYPE html>
<html lang="ca">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>LiveOps Dashboard</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg:        #111318;
            --surface:   #1a1d24;
            --border:    #272b35;
            --border2:   #323846;
            --text:      #e2e4e9;
            --text-2:    #8b909e;
            --text-3:    #555b6b;
            --accent:    #e2e4e9;
            --green:     #34d399;
            --green-bg:  rgba(52,211,153,0.08);
            --green-bdr: rgba(52,211,153,0.25);
            --red:       #f87171;
            --red-bg:    rgba(248,113,113,0.08);
            --amber:     #fbbf24;
            --amber-bg:  rgba(251,191,36,0.07);
            --amber-bdr: rgba(251,191,36,0.25);
            --mono:      'DM Mono', monospace;
            --sans:      'DM Sans', sans-serif;
            --radius:    8px;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: var(--sans); font-size: 14px; background: var(--bg); color: var(--text); min-height: 100vh; padding: 48px 20px 80px; line-height: 1.5; }
        .page { max-width: 720px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
        .header-left h1 { font-size: 22px; font-weight: 600; letter-spacing: -0.3px; color: var(--text); }
        .header-left p  { font-size: 13px; color: var(--text-2); margin-top: 2px; }
        .status-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-2); }
        .status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); }
        .meta-bar { display: flex; gap: 0; margin-bottom: 32px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
        .meta-item { flex: 1; padding: 14px 18px; border-right: 1px solid var(--border); }
        .meta-item:last-child { border-right: none; }
        .meta-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-3); margin-bottom: 4px; }
        .meta-value { font-size: 14px; font-weight: 600; color: var(--text); font-family: var(--mono); }
        .section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); margin-bottom: 12px; }
        .section-head { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; border-bottom: 1px solid var(--border); }
        .section-title { font-size: 13px; font-weight: 600; letter-spacing: -0.1px; }
        .section-hint { font-size: 12px; color: var(--text-3); }
        .section-body { padding: 16px 20px; }
        .sub-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-3); margin: 20px 0 10px; }
        .sub-label:first-child { margin-top: 0; }
        .field-row { display: flex; align-items: center; gap: 10px; padding: 9px 12px; border-radius: 6px; border: 1px solid var(--border); margin-bottom: 5px; background: var(--surface); transition: border-color 0.15s; }
        .field-row:hover { border-color: var(--border2); }
        .field-off { background: var(--bg); }
        .field-off .field-name { color: var(--text-3); }
        .field-name { flex: 1; font-family: var(--mono); font-size: 13px; font-weight: 500; }
        .switch { position: relative; flex-shrink: 0; cursor: pointer; }
        .switch input { position: absolute; opacity: 0; width: 0; height: 0; }
        .track { display: block; width: 32px; height: 18px; background: var(--border2); border-radius: 9px; position: relative; transition: background 0.2s; }
        .track::after { content: ''; position: absolute; top: 3px; left: 3px; width: 12px; height: 12px; border-radius: 50%; background: white; transition: transform 0.2s; box-shadow: 0 1px 3px rgba(0,0,0,0.15); }
        .switch input:checked + .track { background: var(--green); }
        .switch input:checked + .track::after { transform: translateX(14px); }
        .pill { font-size: 10px; font-weight: 500; letter-spacing: 0.3px; padding: 2px 8px; border-radius: 20px; }
        .pill-on  { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bdr); }
        .pill-off { background: var(--bg); color: var(--text-3); border: 1px solid var(--border); }
        .del-btn { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 4px; color: var(--text-3); text-decoration: none; font-size: 16px; line-height: 1; transition: color 0.15s, background 0.15s; }
        .del-btn:hover { background: var(--red-bg); color: var(--red); }
        .add-row { display: flex; gap: 8px; align-items: center; margin-top: 10px; padding: 10px 12px; border: 1px dashed var(--border2); border-radius: 6px; background: var(--bg); }
        .add-label { font-size: 12px; color: var(--text-3); white-space: nowrap; }
        .rule-row { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--amber-bdr); border-radius: 6px; background: var(--amber-bg); margin-bottom: 5px; }
        .rule-body { flex: 1; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; font-size: 13px; }
        .rule-body code { font-family: var(--mono); font-size: 12px; background: rgba(0,0,0,0.05); padding: 1px 6px; border-radius: 3px; }
        .op { font-family: var(--mono); font-size: 12px; color: #f87171; }
        .arrow { color: #f87171; }
        .rule-body strong { color: var(--green); }
        .group-wrap { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; background: rgba(248,113,113,0.05); border: 1px solid rgba(248,113,113,0.15); border-radius: 4px; padding: 2px 7px; }
        .logic-op { font-family: var(--mono); font-size: 11px; font-weight: 700; color: #f87171; padding: 1px 5px; border: 1px solid rgba(248,113,113,0.3); border-radius: 3px; }
        .or-op { background: rgba(248,113,113,0.1); margin: 0 4px; }
        .prio-badge { font-family: var(--mono); font-size: 10px; font-weight: 700; color: var(--amber); background: var(--amber-bg); border: 1px solid var(--amber-bdr); border-radius: 4px; padding: 2px 6px; flex-shrink: 0; }
        input[type="text"], input[type="number"], select { font-family: var(--mono); font-size: 12px; color: var(--text); background: var(--surface); border: 1px solid var(--border); border-radius: 5px; padding: 6px 10px; outline: none; transition: border-color 0.15s; }
        input[type="text"]:focus, input[type="number"]:focus, select:focus { border-color: var(--accent); }
        input[type="number"] { width: 68px; }
        select { min-width: 110px; }
        button { font-family: var(--sans); font-size: 13px; font-weight: 500; border: none; border-radius: 6px; cursor: pointer; transition: opacity 0.15s; }
        button:hover { opacity: 0.75; }
        .btn-save { width: 100%; margin-top: 16px; padding: 11px; background: #2563eb; color: white; font-size: 13px; letter-spacing: 0.2px; }
        .btn-add  { padding: 7px 14px; background: #7c3aed; color: white; font-size: 12px; }
        .btn-event { width: 100%; padding: 11px; margin-bottom: 6px; text-align: left; font-size: 13px; }
        .btn-event:last-child { margin-bottom: 0; }
        .ip-grid { display: flex; gap: 8px; flex-wrap: wrap; }
        .ip-grid button { padding: 9px 16px; background: var(--bg); color: var(--text); border: 1px solid var(--border); font-size: 12px; }
        .ip-grid button:hover { border-color: var(--border2); opacity: 1; background: #efefed; }
        .empty { font-size: 12px; color: var(--text-3); font-style: italic; padding: 4px 0; }
        .footer { text-align: center; margin-top: 40px; font-size: 12px; color: var(--text-3); }
        .footer a { color: var(--text-2); text-decoration: none; }
        .footer a:hover { color: var(--text); }
        hr.sep { border: none; border-top: 1px solid var(--border); margin: 8px 0 16px; }
        .tab-nav { display: flex; margin-bottom: 24px; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; background: var(--surface); }
        .tab-btn { flex: 1; padding: 13px 6px 11px; font-family: var(--sans); font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: var(--text-3); background: transparent; border: none; border-right: 1px solid var(--border); cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; transition: color 0.15s, background 0.15s; position: relative; }
        .tab-btn:last-child { border-right: none; }
        .tab-btn:hover { color: var(--text-2); background: rgba(255,255,255,0.02); }
        .tab-btn.active { color: var(--text); background: rgba(255,255,255,0.03); }
        .tab-btn .tab-icon { font-size: 17px; opacity: 0.5; }
        .tab-btn.active .tab-icon { opacity: 1; }
        .tab-btn::after { content: ''; position: absolute; bottom: 0; left: 20%; right: 20%; height: 2px; background: #60a5fa; border-radius: 1px 1px 0 0; opacity: 0; transition: opacity 0.15s; }
        .tab-btn.active::after { opacity: 1; }
        .tab-panel { display: none; }
    </style>
</head>
<body>
<div class="page">

    <div class="header">
        <div class="header-left"><h1>LiveOps Dashboard</h1></div>
        <div class="status-badge"><span class="status-dot"></span>Servidor actiu</div>
    </div>

    <div class="meta-bar">
        <div class="meta-item"><div class="meta-label">Servidor</div><div class="meta-value">localhost:3000</div></div>
        <div class="meta-item"><div class="meta-label">Esdeveniment</div><div class="meta-value">${activeEventName}</div></div>
        <div class="meta-item"><div class="meta-label">IP Simulada</div><div class="meta-value">${regionSim} · ${debugIp}</div></div>
    </div>

    <nav class="tab-nav">
        <button class="tab-btn" data-tab="config"><span class="tab-icon">⚙</span>Configuració</button>
        <button class="tab-btn" data-tab="preus"><span class="tab-icon">◈</span>Preus &amp; Regles</button>
        <button class="tab-btn" data-tab="contingut"><span class="tab-icon">◉</span>Contingut</button>
        <button class="tab-btn" data-tab="events"><span class="tab-icon">⊕</span>Esdeveniments</button>
    </nav>

    <!-- ══ TAB: CONFIGURACIÓ ══ -->
    <div class="tab-panel" id="tab-config">
        <div class="section">
            <div class="section-head">
                <span class="section-title">Caché del Client</span>
                <span class="section-hint">Temps que Unity guarda les dades en local sense tornar a preguntar</span>
            </div>
            <div class="section-body">
                <form action="/update-cache-config" method="POST">
                    ${(() => {
                        const endpointsList = ['get-event', 'get-shop', 'get-decorations', 'get-price', 'get-contract'];
                        const labels = {
                            'get-event': "Estat de l'Esdeveniment", 'get-shop': 'Items de la Botiga',
                            'get-decorations': "Decoracions d'Escena", 'get-price': 'Preus', 'get-contract': 'Contracte API',
                        };
                        return endpointsList.map(ep => {
                            const row = cacheRows.find(r => r.endpoint === ep);
                            const ttl = row ? row.ttl_seconds : 300;
                            const display = ttl >= 3600 ? Math.floor(ttl / 3600) + 'h' : Math.floor(ttl / 60) + 'min';
                            return `<div class="field-row" style="margin-bottom:6px;">
                                <span class="field-name" style="min-width:200px;">${labels[ep]}</span>
                                <span class="prio-badge" style="color:#60a5fa;background:rgba(96,165,250,0.1);border-color:rgba(96,165,250,0.3);">${display}</span>
                                <input type="number" name="ttl_${ep}" value="${ttl}" min="10" style="width:80px;">
                                <span class="add-label">s</span>
                            </div>`;
                        }).join('');
                    })()}
                    <div style="margin-top:12px;">
                        <button type="submit" class="btn-save" style="width:auto;padding:9px 24px;font-size:12px;">Guardar TTL</button>
                    </div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:8px;">300=5min · 900=15min · 3600=1h · 86400=1dia</p>
                </form>
                <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--border);">
                    <form action="/force-refresh" method="POST">
                        <span class="section-title" style="color:#f87171;display:block;margin-bottom:8px;">Botó d'Emergència</span>
                        <p style="font-size:12px;color:var(--text-3);margin-bottom:12px;">Força a tots els jugadors actius a netejar la seva memòria i descarregar les dades noves a l'instant (ignorant els TTLs).</p>
                        <button type="submit" class="btn-save" style="background:rgba(248,113,113,0.1);color:#f87171;border:1px solid rgba(248,113,113,0.3);width:auto;padding:9px 24px;">
                            ⚠️ Forçar Refresc Global
                        </button>
                    </form>
                </div>
            </div>
        </div>

        <div class="section">
            <div class="section-head">
                <span class="section-title">Regions</span>
                <span class="section-hint">Defineix regions amb països · Basen tots els filtres de preus</span>
            </div>
            <div class="section-body">
                ${regions.length === 0 ? '<p class="empty">Cap regió definida.</p>' : regions.map((r) => `
                    <div class="rule-row" style="margin-bottom:6px;">
                        <span class="prio-badge">${r.id}</span>
                        <span class="rule-body">
                            <strong style="color:#e2e4e9;">${r.name}</strong>
                            <span class="arrow">·</span>
                            <code style="color:var(--text-2);font-size:11px;">${JSON.parse(r.countries || '[]').join(', ') || '*'}</code>
                            <span class="prio-badge" style="color:#34d399;background:rgba(52,211,153,0.1);border-color:rgba(52,211,153,0.3);">${r.currency}</span>
                            ${r.is_default ? '<span class="prio-badge" style="color:#f87171;background:rgba(248,113,113,0.1);border-color:rgba(248,113,113,0.3);">DEFAULT</span>' : ''}
                        </span>
                        <a href="/delete-region?id=${r.id}" onclick="return confirm('Eliminar ${r.name}?')" class="del-btn">×</a>
                    </div>`).join('')}
                <form action="/add-region" method="POST">
                    <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                        <span class="add-label">ID</span>
                        <input type="text" name="id" placeholder="EU" style="width:55px;" required>
                        <span class="add-label">Nom</span>
                        <input type="text" name="name" placeholder="Europa" style="width:90px;" required>
                        <span class="add-label">Països</span>
                        <input type="text" name="countries" placeholder="ES,FR o ES:CT" style="width:120px;" title="Codis separats per comes. CC=país, CC:RR=subregió, *=tots">
                        <span class="add-label">Moneda</span>
                        <select name="currency">
                            <option value="EUR">EUR</option><option value="USD">USD</option>
                            <option value="JPY">JPY</option><option value="GBP">GBP</option>
                        </select>
                        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--text-2);">
                            <input type="checkbox" name="is_default" value="1"> Per defecte
                        </label>
                        <button type="submit" class="btn-add" style="margin-left:auto;">Afegir regió</button>
                    </div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:8px;"><b>ES</b>=Espanya · <b>ES:CT</b>=Catalunya · <b>FR,DE</b>=múltiples · La regió <b>per defecte</b> rep la resta.</p>
                </form>
            </div>
        </div>

        <div class="section">
            <div class="section-head">
                <span class="section-title">Contracte API</span>
                <span class="section-hint">Toggle = actiu/inactiu · × = eliminar</span>
            </div>
            <div class="section-body">
                <form action="/update-contract" method="POST">
                    <div class="sub-label">Inputs — dades que envia Unity</div>
                    ${inputRows}
                    <div class="add-row">
                        <span class="add-label">Nou input</span>
                        <input type="text" name="new_input_name" placeholder="ex: playerHealth">
                    </div>
                    <hr class="sep" style="margin-top:20px;">
                    <div class="sub-label">Outputs — dades que retorna el servidor</div>
                    ${outputRows}
                    <div class="add-row">
                        <span class="add-label">Nou output</span>
                        <input type="text" name="new_output_name" placeholder="ex: discount">
                    </div>
                    <button type="submit" class="btn-save">Guardar contracte</button>
                </form>
            </div>
        </div>
    </div>

    <!-- ══ TAB: PREUS & REGLES ══ -->
    <div class="tab-panel" id="tab-preus">
        <div class="section">
            <div class="section-head">
                <span class="section-title">Regles de preu</span>
                <span class="section-hint">Guanya el major descompte si en coincideixen diverses</span>
            </div>
            <div class="section-body">
                ${ruleRows}
                <form action="/add-rule" method="POST" id="rule-form">
                    <div id="groups-container"></div>
                    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                        <button type="button" onclick="addGroup()"
                                style="padding:7px 14px;background:var(--surface);border:1px dashed var(--border2);color:var(--text-2);font-size:12px;border-radius:5px;cursor:pointer;">
                            ∨ Afegir grup OR
                        </button>
                        <div style="display:flex;align-items:center;gap:8px;margin-left:auto;flex-wrap:wrap;">
                            <span class="add-label" style="color:var(--amber);">Prioritat</span>
                            <input type="number" name="priority" min="0" max="999" placeholder="0" style="width:60px;">
                            <span class="add-label" style="color:#f87171;">→</span>
                            <input type="number" name="discount" min="1" max="100" placeholder="%">
                            <span class="add-label">%</span>
                            <button type="submit" class="btn-add">Afegir regla</button>
                        </div>
                    </div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:8px;">
                        FND: cada grup és un AND de condicions (∧), entre grups hi ha un OR (∨).
                        Ex: (xp &gt;= 1000 ∧ class == warrior) ∨ (region == CAT) → 20%
                    </p>
                </form>
                ${clientScript}
            </div>
        </div>
        <div class="section">
            <div class="section-head">
                <span class="section-title">Descomptes per Temporada i País</span>
                <span class="section-hint">Rang de dates o dia exacte · País opcional</span>
            </div>
            <div class="section-body">
                ${eventDiscRows}
                <form action="/add-event-discount" method="POST">
                    <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                        <span class="add-label">Nom</span>
                        <input type="text" name="name" placeholder="ex: Nadal" style="width:90px;">
                        <span class="add-label" style="color:#f87171;">→</span>
                        <input type="number" name="discount" min="1" max="100" placeholder="%" style="width:60px;">
                        <span class="add-label">%</span>
                        <select name="type" onchange="toggleType(this,'rngadd-event-discount','dayadd-event-discount')" style="min-width:120px;">
                            <option value="range">Rang de dates</option>
                            <option value="day">Dia exacte</option>
                        </select>
                        <select name="country">${regionOptions}</select>
                    </div>
                    <div id="rngadd-event-discount" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                        <span class="add-label">Inici</span>
                        <input type="number" name="startDay" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                        <span class="add-label" style="margin-left:8px;">Fi</span>
                        <input type="number" name="endDay" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="endMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                    <div id="dayadd-event-discount" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                        <span class="add-label">Dia</span>
                        <input type="number" name="day" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                    <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                        <button type="submit" class="btn-add" style="margin-left:auto;">Afegir descompte</button>
                    </div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:8px;">Ex: Nadal · rang 25/12→07/01 · Tots · 20% &nbsp;·&nbsp; Sant Jordi · dia 23/04 · CAT · 15%</p>
                </form>
            </div>
        </div>
    </div>

    <!-- ══ TAB: CONTINGUT ══ -->
    <div class="tab-panel" id="tab-contingut">
        <div class="section">
            <div class="section-head">
                <span class="section-title">Gestió d'Items</span>
                <span class="section-hint">Afegeix items fixes (sempre visibles) o de temporada (per dates)</span>
            </div>
            <div class="section-body">
                <div class="sub-label">Items Fixos</div>
                ${fixedItemRows.length ? fixedItemRows : '<p class="empty">Cap item fix definit.</p>'}
                <div class="sub-label" style="margin-top:16px;">Items de Temporada</div>
                ${seasonalItemRows.length ? seasonalItemRows : '<p class="empty">Cap item de temporada definit.</p>'}
                <form action="/add-items" method="POST" id="form-add-items">
                    <div class="add-row" style="margin-top:14px;flex-wrap:wrap;gap:8px;align-items:center;">
                        <span class="add-label">ID</span>
                        <input type="text" name="itemId" placeholder="ex: sword" style="width:85px;" required>
                        <span class="add-label">Nom</span>
                        <input type="text" name="name" placeholder="ex: Espasa" style="width:85px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2);cursor:pointer;">
                            <input type="checkbox" name="fixed" value="1" id="chk-fixed" onchange="toggleFixed(this.checked)">
                            Item fix (sempre visible)
                        </label>
                        <div id="type-selector" style="display:flex;gap:8px;align-items:center;">
                            <select name="type" onchange="toggleType(this,'rngadd-items','dayadd-items')">
                                <option value="range">Rang de dates</option>
                                <option value="day">Dia exacte</option>
                            </select>
                        </div>
                    </div>
                    ${regions.map(r => `
                    <div class="add-row" style="margin-top:4px;flex-wrap:wrap;gap:8px;align-items:center;">
                        <span class="prio-badge" style="color:#a78bfa;background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.3);">${r.id}</span>
                        <span class="add-label" style="color:var(--text-2);">Preu (buit=no disponible)</span>
                        <input type="number" step="0.01" name="price_${r.id}" placeholder="9.99" style="width:75px;">
                        <select name="currency_${r.id}">
                            <option value="EUR" ${r.currency === 'EUR' ? 'selected' : ''}>EUR</option>
                            <option value="USD" ${r.currency === 'USD' ? 'selected' : ''}>USD</option>
                            <option value="JPY" ${r.currency === 'JPY' ? 'selected' : ''}>JPY</option>
                            <option value="GBP" ${r.currency === 'GBP' ? 'selected' : ''}>GBP</option>
                        </select>
                    </div>`).join('')}
                    <div id="date-fields">
                        <div id="rngadd-items" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                            <span class="add-label">Inici</span>
                            <input type="number" name="startDay" min="1" max="31" placeholder="DD" style="width:52px;">
                            <span class="add-label">/</span>
                            <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                            <span class="add-label" style="margin-left:8px;">Fi</span>
                            <input type="number" name="endDay" min="1" max="31" placeholder="DD" style="width:52px;">
                            <span class="add-label">/</span>
                            <input type="number" name="endMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                        </div>
                        <div id="dayadd-items" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                            <span class="add-label">Dia</span>
                            <input type="number" name="day" min="1" max="31" placeholder="DD" style="width:52px;">
                            <span class="add-label">/</span>
                            <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                        </div>
                    </div>
                    <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                        <button type="submit" class="btn-add" style="margin-left:auto;">Afegir item</button>
                    </div>
                </form>
                <script>
                function toggleFixed(isFixed) {
                    document.getElementById("date-fields").style.display = isFixed ? "none" : "block";
                    document.getElementById("type-selector").style.display = isFixed ? "none" : "flex";
                }
                </script>
            </div>
        </div>
        <div class="section">
            <div class="section-head">
                <span class="section-title">Objectes d'Escena de Temporada</span>
                <span class="section-hint">Objectes que només apareixen en èpoques concretes</span>
            </div>
            <div class="section-body">
                ${decorationRows}
                <form action="/add-decoration" method="POST">
                    <div class="add-row" style="margin-top:10px;flex-wrap:wrap;gap:8px;align-items:center;">
                        <span class="add-label">ID</span>
                        <input type="text" name="decorationId" placeholder="ex: estelada" style="width:95px;">
                        <span class="add-label">Nom</span>
                        <input type="text" name="name" placeholder="ex: Estelada" style="width:85px;">
                        <select name="type" onchange="toggleType(this,'rngadd-decoration','dayadd-decoration')" style="min-width:120px;">
                            <option value="range">Rang de dates</option>
                            <option value="day">Dia exacte</option>
                        </select>
                        <select name="country">${regionOptions}</select>
                    </div>
                    <div id="rngadd-decoration" class="add-row" style="margin-top:6px;flex-wrap:wrap;gap:8px;">
                        <span class="add-label">Inici</span>
                        <input type="number" name="startDay" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="startMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                        <span class="add-label" style="margin-left:8px;">Fi</span>
                        <input type="number" name="endDay" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="endMonth" min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                    <div id="dayadd-decoration" class="add-row" style="display:none;margin-top:6px;gap:8px;">
                        <span class="add-label">Dia</span>
                        <input type="number" name="day" min="1" max="31" placeholder="DD" style="width:52px;">
                        <span class="add-label">/</span>
                        <input type="number" name="month" min="1" max="12" placeholder="MM" style="width:52px;">
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;margin-top:10px;">
                        <span class="add-label" style="color:var(--text-2);">Condicions del jugador</span>
                        <span class="prio-badge" style="color:var(--text-3);border-color:var(--border);">opcional · AND</span>
                        <button type="button" onclick="addDecCond()"
                                style="padding:4px 10px;font-size:11px;background:var(--surface);border:1px dashed var(--border2);color:var(--text-2);border-radius:4px;cursor:pointer;">
                            + Condició
                        </button>
                    </div>
                    <div id="dec-conds-list"></div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:4px;">Totes les condicions s'han de complir (AND). Deixa buit = apareix sempre.</p>
                    <div class="add-row" style="margin-top:6px;gap:8px;align-items:center;">
                        <button type="submit" class="btn-add" style="margin-left:auto;">Afegir decoració</button>
                    </div>
                    <p style="font-size:11px;color:var(--text-3);margin-top:8px;">Ex: ID <b>estelada</b> · dia 11/09 · CAT &nbsp;·&nbsp; ID <b>neu</b> · rang 25/12→07/01 · Tots</p>
                </form>
                <script>
                var _dc = 0;
                function addDecCond() {
                    var i = _dc++;
                    var row = document.createElement('div');
                    row.className = 'add-row';
                    row.style.cssText = 'margin-top:4px;flex-wrap:wrap;gap:6px;align-items:center;';
                    row.id = 'dc-' + i;
                    row.innerHTML =
                        '<select name="dec_cond_field_'+i+'" style="min-width:110px;">'
                        + '<option value="playerLevel">playerLevel</option>'
                        + '<option value="playerXP">playerXP</option>'
                        + '<option value="playerClass">playerClass</option>'
                        + '<option value="daysPlayed">daysPlayed</option>'
                        + '</select>'
                        + '<select name="dec_cond_op_'+i+'">'
                        + '<option value=">=">&gt;=</option><option value="<=">&lt;=</option>'
                        + '<option value=">">&gt;</option><option value="<">&lt;</option>'
                        + '<option value="==">==</option><option value="!=">!=</option>'
                        + '</select>'
                        + '<input type="text" name="dec_cond_val_'+i+'" placeholder="ex: 10 o warrior" style="width:90px;">'
                        + '<button type="button" onclick="this.parentElement.remove()" class="del-btn">×</button>';
                    document.getElementById('dec-conds-list').appendChild(row);
                }
                </script>
            </div>
        </div>
        <div class="section">
            <div class="section-head">
                <span class="section-title">Preus de la Botiga</span>
                <span class="section-hint">Tots els items · Edita el preu directament sense esborrar</span>
            </div>
            <div class="section-body">
                ${(() => {
                    const allItems = seasonalItems;
                    if (!allItems.length) return '<p class="empty">Cap item definit. Afegeix items a la secció Gestió d\'Items.</p>';
                    const renderGroup = (items, label, color) => {
                        if (!items.length) return '';
                        const rows = items.map(it => {
                            const regionRows = regions.map(r => {
                                const existing = it.prices && it.prices[r.id];
                                const curPrice = existing ? existing.price : '';
                                const curCurr  = existing ? existing.currency : r.currency;
                                return `<form action="/update-item-price" method="POST"
                                     style="display:inline-flex;align-items:center;gap:6px;margin-right:8px;margin-bottom:4px;">
                                    <input type="hidden" name="itemId" value="${it.itemId}">
                                    <input type="hidden" name="region" value="${r.id}">
                                    <span class="prio-badge" style="color:${color};background:rgba(167,139,250,0.1);border-color:rgba(167,139,250,0.25);">${r.id}</span>
                                    <input type="text" inputmode="decimal" name="price" value="${curPrice}" placeholder="buit=eliminar"
                                           style="width:90px;border-color:${existing ? 'var(--border2)' : 'var(--border)'};color:${existing ? 'var(--text)' : 'var(--text-3)'}">
                                    <select name="currency" style="min-width:60px;">
                                        <option value="EUR" ${curCurr === 'EUR' ? 'selected' : ''}>EUR</option>
                                        <option value="USD" ${curCurr === 'USD' ? 'selected' : ''}>USD</option>
                                        <option value="JPY" ${curCurr === 'JPY' ? 'selected' : ''}>JPY</option>
                                        <option value="GBP" ${curCurr === 'GBP' ? 'selected' : ''}>GBP</option>
                                    </select>
                                    <button type="submit" class="btn-add" style="padding:5px 10px;font-size:11px;">✓</button>
                                </form>`;
                            }).join('');
                            return `<div class="rule-row" style="flex-direction:column;align-items:flex-start;gap:8px;margin-bottom:8px;">
                                <div style="display:flex;align-items:center;gap:8px;width:100%;">
                                    <code style="color:${color};font-size:13px;">${it.itemId}</code>
                                    <span style="color:var(--text-2);font-size:12px;">${it.name}</span>
                                    <a href="/delete-items?index=${allItems.indexOf(it)}"
                                       onclick="return confirm('Eliminar ${it.itemId}?')" class="del-btn" style="margin-left:auto;">×</a>
                                </div>
                                <div style="display:flex;flex-wrap:wrap;gap:4px;">${regionRows}</div>
                            </div>`;
                        }).join('');
                        return `<div class="sub-label">${label}</div>${rows}`;
                    };
                    return renderGroup(fixedItems, 'Items Fixos', '#34d399')
                         + renderGroup(seasonalOnly, 'Items de Temporada', '#a78bfa');
                })()}
            </div>
        </div>
    </div>

    <!-- ══ TAB: ESDEVENIMENTS ══ -->
    <div class="tab-panel" id="tab-events">
        <div class="section">
            <div class="section-head"><span class="section-title">Esdeveniments</span></div>
            <div class="section-body">
                <form action="/update-event" method="POST">
                    <button class="btn-event" name="eventName" value="normal"
                            style="background:var(--surface);border:1px solid var(--border);color:var(--text);">Normal</button>
                    <button class="btn-event" name="eventName" value="christmas"
                            style="background:rgba(248,113,113,0.07);border:1px solid rgba(248,113,113,0.25);color:#f87171;">🎄 &nbsp;Nadal</button>
                    <button class="btn-event" name="eventName" value="sant_jordi"
                            style="background:var(--amber-bg);border:1px solid var(--amber-bdr);color:var(--amber);">🌹 &nbsp;Sant Jordi</button>
                </form>
            </div>
        </div>
        <div class="section">
            <div class="section-head"><span class="section-title">Simulador IP</span></div>
            <div class="section-body">
                <form action="/debug/set-ip" method="POST">
                    <div class="ip-grid">
                        <button name="fakeIp" value="84.88.1.1">🇪🇸 &nbsp;Espanya</button>
                        <button name="fakeIp" value="8.8.8.8">🇺🇸 &nbsp;Estats Units</button>
                        <button name="fakeIp" value="1.72.0.0">🇯🇵 &nbsp;Japó</button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <script>
    function toggleType(selectElement, rangeId, dayId) {
        document.getElementById(rangeId).style.display = selectElement.value === 'day' ? 'none' : 'flex';
        document.getElementById(dayId).style.display   = selectElement.value === 'day' ? 'flex' : 'none';
    }
    (function() {
        function showTab(id) {
            document.querySelectorAll('.tab-panel').forEach(function(p) {
                p.style.display = p.id === 'tab-' + id ? 'block' : 'none';
            });
            document.querySelectorAll('.tab-btn').forEach(function(b) {
                b.classList.toggle('active', b.dataset.tab === id);
            });
            try { localStorage.setItem('liveops-tab', id); } catch(e) {}
        }
        document.querySelectorAll('.tab-btn').forEach(function(btn) {
            btn.addEventListener('click', function() { showTab(this.dataset.tab); });
        });
        var saved = '';
        try { saved = localStorage.getItem('liveops-tab') || ''; } catch(e) {}
        showTab(['config','preus','contingut','events'].indexOf(saved) >= 0 ? saved : 'config');
    })();
    </script>

    <div class="footer"><a href="/dashboard">↺ Refrescar</a></div>
</div>
</body>
</html>`);
                    }); // cache_config
                }); // shop_prices
            }); // regions
        }); // events
    }); // api_contract
});

module.exports = router;
