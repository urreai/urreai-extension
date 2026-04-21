# UrreAI — Extensión Chrome / Firefox

Extensión de navegador que trae las acciones clínicas clave de UrreAI a **cualquier pestaña** — sistema del hospital, laboratorios, UpToDate, etc. — sin cambiar de ventana.

## Qué hace

| Acción | Flujo |
|---|---|
| **Capturar laboratorios** | Seleccionas una región de la pantalla (tabla de labs) → IA la estructura → queda en el paciente activo |
| **Capturar signos vitales** | Igual pero para TA / FC / FR / T° / SatO2 |
| **Guardar selección como nota** | Seleccionas texto en cualquier web → click derecho o botón → queda como nota del paciente |
| **Calculadoras** | Atajo a las 205 calculadoras de UrreAI |

Funciona con el mismo paciente activo tanto en **ronda hospitalaria** (estudiantes) como en **consulta** (médicos con consultorio).

## Instalar en Chrome (modo desarrollador)

1. Descarga esta carpeta completa (`urreai-extension/`).
2. Abre `chrome://extensions/`.
3. Activa el toggle **"Modo de desarrollador"** (arriba a la derecha).
4. Click **"Cargar extensión sin empaquetar"** → selecciona la carpeta `urreai-extension/`.
5. El ícono de UrreAI aparece en la barra de extensiones.

## Instalar en Firefox (temporal)

1. Abre `about:debugging#/runtime/this-firefox`.
2. Click **"Cargar complemento temporal…"**.
3. Selecciona cualquier archivo dentro de `urreai-extension/` (por ejemplo `manifest.json`).
4. Válido hasta cerrar Firefox — perfecto para probar.

## Conectar tu cuenta

1. Click en el ícono de la extensión.
2. Click **"Conectar mi cuenta"** → se abre la página de vinculación en `app.urreai.com/dashboard/extension`.
3. Click **"Generar código"** en esa página → copia el código `urreai_ext_...`.
4. Vuelve al popup de la extensión → pega el código → "Vincular extensión".

## Cómo se usa en la ronda

1. Click al ícono → selecciona el paciente activo (de la ronda o consulta).
2. **Capturar laboratorios**: click en la acción → aparece un overlay sobre la pestaña actual → arrastra un rectángulo sobre la tabla de labs → la IA procesa y guarda.
3. **Guardar selección**: selecciona texto en cualquier web → click derecho → **"UrreAI: Guardar selección como nota"**.
4. Ve a UrreAI y encuentra los datos en el paciente.

## Stack

- **Manifest v3** — compatible con Chrome 109+ y Firefox 109+.
- Sin build step — JavaScript/HTML/CSS vanilla. La extensión se carga directamente desde esta carpeta.
- Auth: token de larga duración generado desde la app (formato `urreai_ext_<40chars>`, revocable desde `/dashboard/extension`).
- Permissions mínimos: `activeTab`, `contextMenus`, `storage`, `scripting`. No se pide permiso "all_urls" ni "tabs" amplio.

## Privacidad

- Los screenshots **nunca se guardan en tu equipo ni en la extensión** — se suben directo al backend de UrreAI y se procesan con IA.
- El usuario debe hacer click explícito en "Capturar" — nada automático.
- Los datos terminan bajo tu cuenta de UrreAI, cifrados en Firestore, cumpliendo Ley 1581 de Colombia.
- El token de la extensión es revocable desde la web en cualquier momento.

## Publicación en stores

### Chrome Web Store
- Registro one-time: **USD $5**.
- Zip de esta carpeta → upload en `chrome.google.com/webstore/devconsole/`.
- Review: 1-3 semanas la primera vez, luego ~1-2 días por update.

### Firefox Add-ons (AMO)
- Registro: gratis.
- Upload del zip en `addons.mozilla.org/developers/`.
- Review: 1-2 días promedio.

## Desarrollo

Edita los archivos directamente. En Chrome, recarga la extensión desde `chrome://extensions/` (botón de refresh en el card). En Firefox, recarga desde `about:debugging`.

El popup abre en la ventana del ícono; puedes inspeccionarlo con click derecho → "Inspeccionar popup". El background service worker se inspecciona desde `chrome://extensions/` → "vista de fondo".

---

**Versión 0.1.0** · Lanzamiento experimental con cuenta de UrreAI.
