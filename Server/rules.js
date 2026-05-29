// ── Motor de regles — FND + prioritat ──

function evalCondition({ field, operator, value }, data) {
    if (!data) return false;
    const rawVal = data[field];
    if (rawVal === undefined || rawVal === null || rawVal === "") return false;
    const isNumeric = !isNaN(rawVal) && !isNaN(value);
    const fv = isNumeric ? parseFloat(rawVal) : String(rawVal).trim().toLowerCase();
    const rv = isNumeric ? parseFloat(value) : String(value).trim().toLowerCase();
    const ops = {
        ">=": () => isNumeric && fv >= rv,
        "<=": () => isNumeric && fv <= rv,
        ">": () => isNumeric && fv > rv,
        "<": () => isNumeric && fv < rv,
        "==": () => fv == rv,
        "!=": () => fv != rv,
    };
    return ops[operator]?.() ?? false;
}

// rules.js - motor d'avaluació FND
function applyRules(rules, data) {
    const matched = rules.filter(r =>
        r.groups && r.groups.some(g => g.conditions && g.conditions.every(c => evalCondition(c, data)))
    );

    if (matched.length === 0) return 0;

    // Ordenem per prioritat i retornem el descompte de la primera regla
    matched.sort((a, b) => {
        const pa = a.priority ?? 0, pb = b.priority ?? 0;
        return pb !== pa ? pb - pa : b.discount - a.discount;
    });
    const w = matched[0];
    const s = w.groups
        .map(g => '(' + g.conditions.map(c => c.field + ' ' + c.operator + ' ' + c.value).join(' ∧ ') + ')')
        .join(' ∨ ');
    console.log('✅ Regla [P' + (w.priority ?? 0) + ']: ' + s + ' → ' + (w.discount * 100) + '%');
    return parseFloat(w.discount) || 0;
}

function applyEventDiscounts(eds, region, now) {
    const { isActiveNow } = require('./geo');
    const matched = eds.filter(ed => isActiveNow(ed, region, now));
    if (matched.length === 0) return 0;
    const best = matched.reduce((a, b) => a.discount > b.discount ? a : b);
    console.log('🎉 Esdeveniment: ' + best.name + ' → ' + (best.discount * 100) + '%');
    return best.discount;
}

module.exports = { evalCondition, applyRules, applyEventDiscounts };
