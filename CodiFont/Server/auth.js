// Importem la llibreria que implementa el middleware d'HTTP Basic Auth per a Express.
// Un middleware és una funció que s'executa entre que arriba la petició
// i que arriba a la ruta final. Si les credencials són incorrectes,
// el middleware atura la petició i retorna 401 sense arribar mai a la ruta.

// HTTP Basic Auth és el mecanisme d'autenticació més simple d'HTTP:
// quan accedeixes a una ruta protegida sense credencials, el navegador
// mostra un diàleg natiu demanant usuari i contrasenya. Les credencials
// es codifiquen en Base64 i s'envien a cada petició a la capçalera
// "Authorization". És suficient per a un TFG en local, però en producció
// real caldria HTTPS per evitar que les credencials viatgin en clar.
const basicAuth = require('express-basic-auth');

// Llegim l'usuari de la variable d'entorn DASHBOARD_USER.
// Si no està definida, usem 'admin' com a valor per defecte.
// process.env és l'objecte de Node que conté totes les variables d'entorn
// del sistema operatiu. Es poden definir abans d'arrencar el servidor:
// DASHBOARD_USER = marc node server.js
const user = process.env.DASHBOARD_USER || 'admin';

// Llegim la contrasenya de la variable d'entorn DASHBOARD_PASSWORD.
// Si no està definida, usem 'changeme' com a valor per defecte.
// En el nostre cas, hem canviat 'changeme' per la contrasenya real
// directament en aquest fitxer per simplicitat (vàlid per a un TFG local).
const password = process.env.DASHBOARD_PASSWORD || 'tfg-marc';

// Si s'està usant la contrasenya per defecte, mostrem un avís al terminal.
// Això és important per recordar-ho si mai es desplega el servidor
// en un entorn accessible des de fora.
if (password === 'changeme') {
    console.warn('⚠️  Atenció: estàs usant la contrasenya per defecte del dashboard.');
    console.warn('   Defineix DASHBOARD_PASSWORD abans d\'arrencar en producció.');
}

// Creem i exportem el middleware d'autenticació directament.
// basicAuth rep un objecte de configuració:

// "users": un objecte on les claus són usuaris i els valors són contrasenyes.
// Usem [user] (notació de claudàtors) per crear la clau dinàmicament
// amb el valor de la variable "user". Sense claudàtors, la clau seria
// literalment la paraula "user" en lloc del valor de la variable.
// Exemple: si user = "admin", { [user]: password } --> { "admin": password }

// "challenge: true": fa que quan les credencials falten o són incorrectes,
// el servidor retorni la capçalera WWW-Authenticate que fa aparèixer
// el diàleg natiu del navegador demanant usuari i contrasenya.
// Sense aquesta opció, simplement retornaria 401 sense diàleg.

// "unauthorizedResponse": el missatge que es retorna quan les credencials
// són incorrectes. En aquest cas, un string simple.
module.exports = basicAuth({
    users: { [user]: password },
    challenge: true,
    unauthorizedResponse: () => 'Accés denegat',
});