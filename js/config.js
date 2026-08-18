/**
 * PUDÚ GMAIL - GLOBAL CONFIGURATION
 * 
 * Este archivo contiene la configuración oficial de la aplicación.
 * Una vez configurado aquí, NINGÚN usuario final verá jamás configuraciones:
 * solo verán el botón directo "Conectar con Gmail".
 */

window.PUDU_CONFIG = {
  // Pega aquí tu ID de cliente de Google OAuth (terminado en .apps.googleusercontent.com)
  // Origen autorizado en Google Cloud: https://pudugmail.vercel.app
  GOOGLE_CLIENT_ID: "TU_GOOGLE_CLIENT_ID_AQUI.apps.googleusercontent.com",
  
  // Scopes necesarios para ver y mover adjuntos
  OAUTH_SCOPES: "https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.readonly"
};
