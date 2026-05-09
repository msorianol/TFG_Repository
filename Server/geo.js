const geoip = require('geoip-lite');
const { db } = require('./db');
const { parseJSON } = require('./helpers');

let debugSimulatedIp = "84.88.1.1";

function getDebugIp() { return debugSimulatedIp; }
function setDebugIp(ip) { debugSimulatedIp = ip; }

function geoMatchesCountry(geo, code) {
    if (code === '*') return true;
    const parts = code.split(':');
    if (parts.length === 2) return geo.country === parts[0] && geo.region === parts[1];
    return geo.country === code;
}

function detectRegion(geo, regions) {
    if (!geo || !regions || !regions.length) return 'US';
    for (const r of regions.filter(r => !r.is_default)) {
        const codes = parseJSON(r.countries);
        if (codes.some(c => geoMatchesCountry(geo, c))) return r.id;
    }
    const def = regions.find(r => r.is_default);
    return def ? def.id : (regions[0] ? regions[0].id : 'US');
}

function getRegionForReq(req, cb) {
    db.all('SELECT * FROM regions', (err, regions) => {
        regions = regions || [];
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        if (ip.includes('127.0.0.1') || ip.includes('::1')) ip = debugSimulatedIp;
        const geo = geoip.lookup(ip);
        cb(detectRegion(geo, regions), regions);
    });
}

function isActiveNow(entry, region, now, playerData = {}) {
    if (entry.activeRegions && entry.activeRegions.length > 0) {
        if (!entry.activeRegions.includes(region)) return false;
    } else if (entry.country && entry.country !== region) {
        return false;
    }

    if (entry.conditions && entry.conditions.length > 0) {
        const { evalCondition } = require('./rules');
        const conditionsMatch = entry.conditions.some(group =>
            group.every(cond => evalCondition(cond, playerData))
        );
        if (!conditionsMatch) return false;
    }

    if (entry.fixed) return true;

    const cur = (now.getMonth() + 1) * 100 + now.getDate();
    if (entry.type === 'day') return cur === entry.month * 100 + entry.day;
    const s = entry.startMonth * 100 + entry.startDay;
    const e = entry.endMonth * 100 + entry.endDay;
    return s <= e ? cur >= s && cur <= e : cur >= s || cur <= e;
}

module.exports = { getDebugIp, setDebugIp, detectRegion, getRegionForReq, isActiveNow };
