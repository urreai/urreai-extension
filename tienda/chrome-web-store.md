# Chrome Web Store: lo que pide el formulario

Textos listos para pegar en <https://chrome.google.com/webstore/devconsole>. El registro de
desarrollador cuesta USD 5 una sola vez. El paquete sale de `npm run build` (carpeta `dist/`).

## Ficha

**Nombre:** UrreAI

**Descripción corta** (132 caracteres como máximo; esta tiene 120):

> Lo que lees en rotación, a UrreAI: pregúntalo al chat de evidencia, hazlo flashcard o captura laboratorios del paciente.

**Categoría:** Educación

**Idioma:** Español (Latinoamérica)

**Descripción:**

> UrreAI es la aplicación de estudio para estudiantes de medicina en Colombia. Esta extensión la
> lleva a cualquier página que estés leyendo, sin copiar y pegar.
>
> Pregunta al chat de evidencia: selecciona un texto, clic derecho, y el chat de UrreAI se abre
> con la pregunta escrita. Tú la envías.
>
> Crea una flashcard: la selección queda de frente de una tarjeta nueva; el dorso lo escribes tú.
>
> Captura laboratorios: arrastra sobre la tabla de resultados y se transcriben con el rango que
> trae el reporte, para un paciente de Mi ronda o de Notas del paciente. También signos vitales
> e informes de imagen.
>
> Calculadoras: escribe «urreai glasgow» en la barra de direcciones y se abre esa calculadora.
>
> Necesitas una cuenta de UrreAI (app.urreai.com). La extensión se vincula con un clic desde la
> página de la extensión en la app.

**Capturas de pantalla** (1280 × 800): el popup vinculado, el clic derecho con «Preguntar al chat
de evidencia», el chat abierto con la pregunta escrita y el recorte sobre una tabla de
laboratorios de ejemplo. Sin datos de pacientes reales.

## Propósito único

> Llevar a la cuenta de UrreAI del estudiante lo que lee en el navegador: como pregunta al chat
> de evidencia, como flashcard o como captura para un paciente.

## Justificación de cada permiso

| Permiso | Justificación |
|---|---|
| `activeTab` | Leer el texto seleccionado y tomar la captura de la pestaña en la que el estudiante pulsa, solo en ese momento. |
| `scripting` | Dibujar en esa pestaña el recorte de la captura y el aviso de resultado. |
| `contextMenus` | Las opciones del clic derecho: preguntar al chat, crear flashcard, guardar la selección y capturar una imagen. |
| `storage` | Guardar el código de vinculación, el paciente elegido y las preferencias. |
| `clipboardWrite` | Copiar el texto de una captura cuando el estudiante elige solo copiar, o cuando el destino no lo guarda. |
| Host `app.urreai.com` | Hablar con UrreAI y vincularse desde su página. |

## Uso de datos

Marcar:

- **Información de salud**: las capturas pueden contener resultados de laboratorio de un paciente.
- **Contenido del sitio web**: el texto seleccionado y la región capturada.

Certificar las tres casillas: no se venden datos a terceros, no se usan para fines ajenos al
propósito único y no se usan para determinar solvencia ni préstamos.

**Política de privacidad:** <https://app.urreai.com/privacy>

## Notas para quien revisa

La extensión necesita una cuenta de UrreAI. Para la revisión, escribir a contacto@urreai.com y se
entrega una cuenta de prueba.
