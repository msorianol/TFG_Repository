// Importem Express, el framework web que gestiona les peticions HTTP.
// Express simplifica enormement la creació d'un servidor web amb Node:
// sense ell hauríem de gestionar manualment el parsing de les peticions,
// el routing, les capçaleres de resposta, etc.
const express = require('express');

// Importem body-parser, un middleware que llegeix el cos (body) de les
// peticions HTTP i el converteix a un objecte JavaScript accessible
// via req.body. Sense ell, req.body seria undefined.
const bodyParser = require('body-parser');

// Importem el middleware d'autenticació que hem definit a auth.js.
// Recordem que auth.js exporta directament el middleware configurat,
// no una funció que el crea: per això l'importem i l'usem directament.
const auth = require('./auth');

// Creem l'aplicació Express. "app" és l'objecte central que gestiona
// totes les peticions i respostes del servidor.
const app = express();

// Registrem el middleware de body-parser per llegir cossos en format JSON.
// Això permet que els endpoints rebin dades de Unity en format JSON
// (ex: {itemId: "sword", playerXP: 1200}).
app.use(bodyParser.json());

// Registrem el middleware de body-parser per llegir cossos en format
// URL-encoded. Aquest format és el que usen els formularis HTML
// (ex: quan el dashboard envia un formulari amb method="POST").
// "extended: true" permet valors complexos com arrays i objectes
// dins del cos del formulari.
app.use(bodyParser.urlencoded({ extended: true }));

// --- Rutes publiques (Unity) ---
// Importem el router amb els endpoints que crida Unity.
const apiRoutes = require('./routes/api');

// Registrem les rutes de la API sota el prefix /api.
// Això significa que totes les rutes definides a api.js
// (ex: /version, /get-price) seran accessibles com a
// /api/version, /api/get-price, etc.
// Aquestes rutes NO tenen el middleware d'auth perquè Unity
// les ha de poder cridar sense credencials.
app.use('/api', apiRoutes);

// --- Rutes protegides (dashboard + admin) ---
// Importem els dos routers del dashboard.
// admin.js gestiona les accions (POST/GET que modifiquen dades).
// dashboard.js gestiona la visualització (GET /dashboard que genera l'HTML).
const adminRoutes = require('./routes/admin');
const dashboardRoutes = require('./routes/dashboard');

// Registrem les rutes protegides passant "auth" com a segon argument.
// Express permet passar múltiples middlewares encadenats: primer s'executa
// "auth" (comprova les credencials) i, si passa, s'executa el router.
// Si les credencials són incorrectes, "auth" atura la petició i el router
// mai s'executa. Totes les rutes d'admin i dashboard queden protegides
// amb una sola línia cadascuna.
app.use('/', auth, adminRoutes);
app.use('/', auth, dashboardRoutes);

// Arranquem el servidor al port 3000 i mostrem un missatge al terminal per confirmar que tot ha arrencat correctament.
// El callback s'executa una sola vegada quan el servidor està llest per acceptar connexions.
app.listen(3000, () => {
    console.log("Servidor CRM llest a http://localhost:3000/dashboard");
});
