# UrreAI · extensión de navegador

![Manifest V3](https://img.shields.io/badge/Manifest-V3-047857)
![License: MIT](https://img.shields.io/badge/License-MIT-047857)
![Chrome 121+](https://img.shields.io/badge/Chrome-121%2B-047857)
![Firefox 121+](https://img.shields.io/badge/Firefox-121%2B-047857)

> **EN:** Browser extension (Manifest V3, Chrome & Firefox) for UrreAI, the study app for
> medical students in Colombia. Turn what you are reading into a flashcard without leaving the
> page, search the 185 clinical calculators, ask the evidence chat, or capture lab results for
> a patient of your ward round.

Lo que lees en rotación, a UrreAI sin copiar y pegar.

## Qué hace

| Acción | Cómo | Adónde va |
|---|---|---|
| **Crear una flashcard** | Selecciona un texto: clic derecho o `Alt+Mayús+F` | Se abre el panel lateral de UrreAI con ese texto de frente. Escribes el dorso, eliges la rotación y la guardas **sin salir de la página**; entra hoy mismo a tu repaso, y el panel se queda abierto para la siguiente |
| **Lo de hoy** | Abre el ícono | Cuántas flashcards tocan hoy, el mismo número de Flashcards, con **Repasar** |
| **Calculadoras** | El buscador del ícono, o `urreai glasgow` en la barra de direcciones | Cualquiera de las 185, por nombre, sigla, etiqueta o especialidad, con tus favoritas a mano |
| **Preguntar al chat de evidencia** | Selecciona un texto: clic derecho o `Alt+Mayús+E` | Se abre el chat con la pregunta escrita. La envías tú |
| **Capturar laboratorios** | Botón del popup o `Alt+Mayús+L`, y arrastras sobre la tabla | Se transcriben con el rango que trae el reporte. Van a los laboratorios del paciente en **Mi ronda**, o a su nota de hoy en **Notas del paciente** |
| **Capturar signos vitales o un informe de imagen** | Botón del popup (el atajo se asigna en `chrome://extensions/shortcuts`) | A la nota de hoy en **Notas del paciente**. Mi ronda no los guarda: se copian para pegarlos en la nota del día |
| **Guardar la selección** | Clic derecho, «Guardar en la nota del paciente» | A la nota de hoy del paciente |

Cada captura dice al final lo que pasó de verdad: dónde se guardó, o que se copió.

## Instalar

Todavía no está en las tiendas, así que se instala a mano.

**Chrome, Edge o Brave**

1. Descarga el [ZIP](https://github.com/urreai/urreai-extension/archive/refs/heads/main.zip) y descomprímelo.
2. Abre `chrome://extensions`, activa **Modo de desarrollador** y pulsa **Cargar extensión sin empaquetar** sobre la carpeta.

**Firefox**

1. Abre `about:debugging#/runtime/this-firefox`.
2. **Cargar complemento temporal…** y elige el `manifest.json` de la carpeta. Firefox la quita al cerrarse.

## Vincular tu cuenta

Al instalarla se abre la página de la extensión en UrreAI: pulsa **Vincular esta extensión** y listo. La página y la extensión se pasan el código entre ellas, sin portapapeles.

Si no la detecta (por ejemplo, con la versión 0.1), en esa misma página hay **Vincular con un código**: se genera uno y se pega en el popup, en «¿Tienes un código?».

Cada vinculación vale seis meses. En la página se ven todas las del estudiante, con **Desvincular**; el botón **Desvincular** del popup también la desvincula en la cuenta, no solo en el navegador.

## Privacidad y permisos

- Nada se envía solo: cada captura la empieza el estudiante con un clic o un atajo.
- Las capturas se envían a UrreAI para transcribirlas. Captura solo los resultados, **sin el nombre ni el documento del paciente**.
- En el modo «solo copiar» la imagen no se guarda: se transcribe y vuelve como texto.
- Del código de vinculación la app guarda solo su huella (SHA-256), nunca el código.

| Permiso | Para qué |
|---|---|
| `activeTab` | Leer la selección y tomar la captura de la pestaña en la que pulsas, y solo en ese momento |
| `scripting` | Dibujar el recorte y los avisos en esa pestaña |
| `contextMenus` | El menú del clic derecho |
| `storage` | Guardar el código de vinculación, el paciente elegido, tus preferencias y el catálogo de calculadoras de un día |
| `sidePanel` | Abrir el panel lateral de UrreAI, donde se escribe la flashcard sin salir de la página. Firefox usa `sidebar_action`, que no pide permiso |
| `clipboardWrite` | Copiar lo capturado cuando no se guarda |
| `app.urreai.com` | Hablar con UrreAI y vincularse desde su página |

Ya no pide `clipboardRead`: la 0.1 leía el portapapeles para buscar el código, y con la vinculación de un clic sobra.

## Qué cambió en la 0.3.0

- **La flashcard se escribe sin salir de la página.** En la 0.2 el clic derecho abría Flashcards en otra pestaña: para escribir el dorso había que dejar lo que se estaba leyendo. Ahora se abre el panel lateral con el frente puesto, la rotación de la última vez ya elegida, y se guarda ahí (`/api/extension/flashcard`). En el popup, la tarjeta a medio escribir se guarda como borrador, porque el popup se cierra al hacer clic fuera.
- **Las 185 calculadoras, no dieciséis.** El popup y el omnibox buscan en el catálogo de la app (`/api/extension/calculadoras`), guardado un día; primero las que empiezan por lo escrito, así que «sofa» da SOFA antes que qSOFA. Sin red, las dieciséis de fábrica.
- **Lo de hoy al abrir el ícono**: las flashcards para hoy, con la misma regla que Flashcards (`/api/extension/resumen`), y tus calculadoras favoritas.
- **Lo que tenías seleccionado** aparece arriba del popup, con «Hacer flashcard» y «Preguntar al chat».
- **Atajos que no pisan los del navegador.** Los de la 0.2 eran `Ctrl+Shift+I`, que abre las herramientas de desarrollo, y `Ctrl+Shift+R`, que recarga sin caché. Ahora son `Alt+Mayús+U`, `F`, `E` y `L` (en Mac, `Ctrl+Mayús`), y las preferencias enseñan los que de verdad tiene tu navegador.
- **Un solo cliente de la app** (`lib/cliente.js`) para el fondo, el popup y el panel. Antes cada uno tenía su copia, y solo una borraba el código cuando la app lo rechazaba.

## Qué cambió en la 0.2.0

- **Las capturas por fin aparecen en la app.** La 0.1 guardaba en una ronda antigua y en colecciones que ninguna pantalla lee. Ahora el destino es un paciente de Mi ronda o de Notas del paciente.
- **Vincular es un clic**, y **desvincular** llega a la cuenta.
- **Preguntar al chat de evidencia** y **crear una flashcard** desde el clic derecho.
- **Los atajos del popup abren lo que dicen.** `?new=case`, `?new=1` y `?tab=hoy` no los leía la app; ahora los enlaces son los que la app prueba (`urreai-app/src/lib/extension/enlaces.ts`, con su prueba de contrato).
- **Las calculadoras se abren por id**, no con un texto de búsqueda que a veces daba una lista vacía.
- **Avisos en la página.** Antes, si algo fallaba desde el clic derecho, solo quedaba en la consola.
- **Sin el desbloqueo de pegado.** La 0.1 anulaba el bloqueo de copiar y pegar de cualquier página, incluidos los sistemas de historia clínica de los hospitales. Esos bloqueos son una decisión de la institución, y una herramienta para estudiantes no debe saltárselos.
- **Sin formatos personalizados.** Complicaban las preferencias, y en los 58 días registrados no hubo ni una captura.
- **La marca de UrreAI**: el isotipo como ícono, el verde de la app, sin violeta, degradados ni emojis.

## Desarrollo

```bash
npm test          # node --test: enlaces, cliente de la app, manifiesto, atajos, marca, vinculación
npm run lint      # web-ext lint
npm run build     # el ZIP para las tiendas, en dist/
py scripts/make-icons.py   # los íconos, desde scripts/isotipo-420.png
```

Sin paso de compilación: JavaScript, HTML y CSS tal cual. En Chrome se recarga desde `chrome://extensions`; en Firefox, desde `about:debugging`.

Los enlaces que abre la extensión viven en `lib/enlaces.js`, y la app tiene una prueba que carga ese archivo y exige las mismas rutas y calculadoras: si cambias uno, cambia el otro.

Los textos para publicar en las tiendas están en [`tienda/`](tienda/).

## Contribuir

Para cambios grandes, abre primero un *issue*. Ver [`CONTRIBUTING.md`](CONTRIBUTING.md). Reportes de seguridad: [`SECURITY.md`](SECURITY.md).

## Licencia

MIT. Ver [`LICENSE`](LICENSE).
