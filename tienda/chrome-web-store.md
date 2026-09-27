# Chrome Web Store: lo que pide el formulario

Textos listos para pegar en <https://chrome.google.com/webstore/devconsole>. El registro de
desarrollador cuesta USD 5 una sola vez. El paquete sale de `npm run build` (carpeta `dist/`).

## Ficha

**Nombre:** UrreAI

**Descripción corta** (132 caracteres como máximo; esta tiene 112, y es la misma del manifiesto):

> Haz flashcards sin salir de la página, busca entre 185 calculadoras y pregúntale al chat de evidencia de UrreAI.

**Categoría:** Educación

**Idioma:** Español (Latinoamérica)

**Descripción:**

> UrreAI es la aplicación de estudio para estudiantes de medicina en Colombia. Esta extensión la
> lleva a cualquier página que estés leyendo, sin copiar y pegar.
>
> Flashcards sin salir de la página: selecciona un texto y usa el clic derecho. Se abre el panel
> lateral de UrreAI con ese texto de frente; escribes el dorso y la guardas. Entra hoy mismo a tu
> repaso, y el panel se queda abierto para la siguiente.
>
> Lo de hoy: al abrir la extensión ves cuántas flashcards te tocan hoy y las repasas con un clic.
>
> Calculadoras: busca entre las 185 de UrreAI por nombre, sigla o especialidad, con tus favoritas
> a mano, o escribe «urreai glasgow» en la barra de direcciones.
>
> Pregunta al chat de evidencia: selecciona un texto, clic derecho, y el chat de UrreAI se abre
> con la pregunta escrita. Tú la envías.
>
> Captura laboratorios: arrastra sobre la tabla de resultados y se transcriben con el rango que
> trae el reporte, para un paciente de Mi ronda o de Notas del paciente. También signos vitales
> e informes de imagen.
>
> Necesitas una cuenta de UrreAI (app.urreai.com). La extensión se vincula con un clic desde la
> página de la extensión en la app.

**Capturas de pantalla** (1280 × 800): el panel lateral con una flashcard a medio escribir junto
a un artículo, el popup con lo de hoy y la búsqueda de una calculadora, el clic derecho con sus
opciones y el recorte sobre una tabla de laboratorios de ejemplo. Sin datos de pacientes reales.

## Propósito único

> Llevar a la cuenta de UrreAI del estudiante lo que lee en el navegador: como flashcard, como
> pregunta al chat de evidencia o como captura para un paciente, y tener a mano sus calculadoras
> y su repaso del día.

## Justificación de cada permiso

| Permiso | Justificación |
|---|---|
| `activeTab` | Leer el texto seleccionado y tomar la captura de la pestaña en la que el estudiante pulsa, solo en ese momento. |
| `scripting` | Dibujar en esa pestaña el recorte de la captura y el aviso de resultado. |
| `contextMenus` | Las opciones del clic derecho: preguntar al chat, crear flashcard, guardar la selección y capturar una imagen. |
| `storage` | Guardar el código de vinculación, el paciente elegido, las preferencias y el catálogo de calculadoras de un día. |
| `sidePanel` | Abrir el panel lateral de UrreAI, donde el estudiante escribe la flashcard junto a la página que está leyendo. |
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
