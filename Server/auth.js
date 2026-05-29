/**
 * auth.js — Protecció del dashboard amb HTTP Basic Auth.
 *
 * L'usuari i la contrasenya es llegeixen de variables d'entorn:
 *   DASHBOARD_USER     (per defecte: 'admin')
 *   DASHBOARD_PASSWORD (per defecte: 'changeme')
 *
 * En producció, defineix-les abans d'arrencar:
 *   DASHBOARD_PASSWORD=la_teva_clau node server.js
 */

const basicAuth = require('express-basic-auth');

const user = process.env.DASHBOARD_USER || 'admin';
const password = process.env.DASHBOARD_PASSWORD || 'tfg-marc';

if (password === 'changeme') {
    console.warn('⚠️  Atenció: estàs usant la contrasenya per defecte del dashboard.');
    console.warn('   Defineix DASHBOARD_PASSWORD abans d\'arrencar en producció.');
}

module.exports = basicAuth({
    users: { [user]: password },
    challenge: true,  // fa aparèixer el diàleg del navegador si no hi ha credencials
    unauthorizedResponse: () => 'Accés denegat',
});
