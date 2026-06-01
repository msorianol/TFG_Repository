/* Importem la llibreria que implementa el middleware d'HTTP Basic Auth per a Express
És el mecanisme d'autenticació més simple d'HTTP:
quan accedeixes a una ruta protegida sense credencials, el navegador mostra un diàleg natiu demanant usuari i contrasenya */
const basicAuth = require('express-basic-auth'); 

/* Llegim l'usuari de la variable d'entorn DASHBOARD_USER
Si no està definida, usem 'admin' com a valor per defecte
process.env és l'objecte de Node que conté totes les variables d'entorn del sistema operatiu. Es poden definir abans d'arrencar el servidor: DASHBOARD_USER = marc node server.js */
const user = process.env.DASHBOARD_USER || 'admin';

// El mateix, però amb la contrasenya
const password = process.env.DASHBOARD_PASSWORD || 'tfg-marc';


/* Creem i exportem el middleware d'autenticació basicAuth, el qual rep un objecte de configuració:
"users": un objecte on les claus són usuaris i els valors són contrasenyes
Usem [user] (notació de claudàtors) per crear la clau dinàmicament amb el valor de la variable "user". Sense claudàtors, la clau seria literalment la paraula "user" en lloc del valor de la variable
Exemple: si user = "admin", { [user]: password } --> { "admin": password } 

"challenge: true": fa que quan les credencials falten o són incorrectes, el servidor retorni la capçalera WWW-Authenticate que fa aparèixer el diàleg natiu del navegador demanant usuari i contrasenya
Sense aquesta opció, simplement retornaria 401 sense diàleg

"unauthorizedResponse": el missatge que es retorna quan les credencials són incorrectes */
module.exports = basicAuth({
    users: { [user]: password },
    challenge: true,
    unauthorizedResponse: () => 'Accés denegat',
});