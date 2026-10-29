// Vercel: GET /api/config  ->  configuración pública de Firebase (desde las variables de entorno)
// La config web de Firebase NO es secreta (la protegen las reglas de la base de datos).
module.exports = (req, res) => {
  const e = process.env;
  const firebase = e.FIREBASE_DATABASE_URL ? {
    apiKey: e.FIREBASE_API_KEY,
    authDomain: e.FIREBASE_AUTH_DOMAIN,
    databaseURL: e.FIREBASE_DATABASE_URL,
    projectId: e.FIREBASE_PROJECT_ID,
    appId: e.FIREBASE_APP_ID,
  } : null;
  // Servidor TURN opcional (para redes muy cerradas donde la conexión directa falla)
  const iceServers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  if (e.TURN_URLS) iceServers.push({ urls: e.TURN_URLS.split(','), username: e.TURN_USERNAME, credential: e.TURN_CREDENTIAL });
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ firebase, iceServers }));
};
