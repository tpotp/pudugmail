# 🦌✉️ Pudu Gmail (`pudugmail.vercel.app`)

**Pudu Gmail** es un explorador visual de adjuntos de Gmail 100% Client-Side (sin backend, ideal para el plan gratuito de Vercel), con estética postal chilena y la compañía de un tierno **Pudu bebé cartero**.

![Pudu Cartero](assets/pudu_mascot.jpg)

---

## ✨ Características Principales

- 🚀 **100% Procesamiento en el Navegador (Zero Backend)**:
  - Desplegable directamente en **Vercel Free** (`pudugmail.vercel.app`).
  - Todo el procesamiento, generación de miniaturas y compresión ZIP ocurren de forma privada en el dispositivo del usuario.
- ⚖️ **Orden por Tamaño (Mayor a Menor)**:
  - Encuentra al instante qué videos, fotos o archivos están copando los 15 GB de tu cuenta de Gmail.
- 📥➡️🗑️ **"Mover al Dispositivo" (Descargar + Liberar Espacio)**:
  - Con un solo clic, descarga el archivo a tu computador y envía automáticamente el correo original a la papelera de Gmail para recuperar espacio.
- 📦 **Selección Múltiple y Descarga en ZIP**:
  - Selecciona varios archivos mediante casillas y descárgalos empaquetados en un `.zip` generado localmente con `JSZip`.
- 🗑️ **Borrado Directo de Gmail**:
  - Envía correos pesados a la papelera de Gmail de forma individual o en lote.
- 🖼️ **Vistas de Galería y Tabla Estilo Explorador**:
  - **Galería (Grid)**: Tarjetas con vistas previas grandes, badges de peso por color y botones rápidos.
  - **Lista (Table)**: Columnas ordenables (Nombre, Tamaño, Tipo, Emisor, Fecha, Acciones).
- 🎬 **Visor Multimedia Integrado**:
  - Previsualización en alta definición de imágenes con zoom.
  - Reproductor HTML5 integrado para ver clips de video y escuchar notas de voz sin salir de la app.
- 🌿 **Estética Postal del Sur de Chile**:
  - Ilustraciones de Pudues bebés chilenos, sellos postales de la Patagonia y contador de espacio liberado.
- ⚡ **Modo Demostración Inmediato**:
  - Permite probar todas las funciones, descargas y vistas previas sin necesidad de iniciar sesión previamente.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend**: HTML5 Semántico, Vanilla CSS Moderno (Design System Postal Pudu), JavaScript ES6+.
- **Almacenamiento Local**: `IndexedDB` para indexación y caché local de adjuntos.
- **Compresión**: `JSZip` (100% cliente).
- **Autenticación**: `Google Identity Services (GIS)` y `Gmail REST API`.
- **Despliegue**: `Vercel` (`pudugmail.vercel.app`).

---

## 🚀 Despliegue en Vercel

1. El repositorio está en GitHub: `tpotp/pudugmail`.
2. En tu panel de [Vercel](https://vercel.com/new), importa el repositorio `tpotp/pudugmail`.
3. Asigna el dominio deseado (ej: `pudugmail.vercel.app`).
4. ¡Listo! Al ser un proyecto 100% estático, Vercel lo desplegará en segundos con costo $0.
