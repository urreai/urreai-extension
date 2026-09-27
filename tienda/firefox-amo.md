# Firefox Add-ons (AMO): lo que pide el formulario

Se publica en <https://addons.mozilla.org/developers/>, sin costo. El paquete sale de
`npm run build`. La revisión suele tardar uno o dos días.

## Ficha

**Nombre:** UrreAI

**Resumen** (250 caracteres como máximo):

> Lo que lees en rotación, a UrreAI: pregúntalo al chat de evidencia, hazlo flashcard o captura
> los laboratorios de un paciente de tu ronda. Para estudiantes de medicina con cuenta de UrreAI.

**Descripción:** la misma de `chrome-web-store.md`.

**Categorías:** Productividad; Búsqueda.

**Política de privacidad:** <https://app.urreai.com/privacy>

## Recolección de datos

El manifiesto declara en `browser_specific_settings.gecko.data_collection_permissions`:

| Categoría | Por qué |
|---|---|
| `websiteContent` | El texto seleccionado y la región capturada se envían a UrreAI cuando el estudiante lo pide. |
| `healthInfo` | Esas capturas pueden llevar resultados de laboratorio de un paciente. |

Firefox las enseña al instalar y pide el consentimiento.

## Notas para quien revisa

- Sin código minificado ni generado: el paquete es el código fuente tal cual.
- `background.service_worker` es para Chrome; Firefox usa `background.scripts`. El aviso de
  `web-ext lint` sobre el service worker es esperado.
- Se necesita una cuenta de UrreAI: escribir a contacto@urreai.com y se entrega una de prueba.
