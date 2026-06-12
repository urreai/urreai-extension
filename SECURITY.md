# Política de seguridad

UrreAI maneja datos clínicos sensibles. Tomamos la seguridad en serio.

## Versiones soportadas

| Versión | Soportada |
|---|---|
| 0.1.x | ✅ |

## Reportar una vulnerabilidad

Si encuentras una vulnerabilidad de seguridad, **no abras un issue público**.

Escríbenos a **contacto@urreai.com** con:

- Descripción de la vulnerabilidad y su impacto potencial.
- Pasos para reproducirla.
- Versión de la extensión y navegador.

Procuramos responder en un plazo de 72 horas y mantenerte informado del avance
hasta la resolución. No incluyas datos reales de pacientes en el reporte.

## Alcance

Esta política cubre el código de la extensión de navegador en este repositorio.
Para la plataforma web (`app.urreai.com`) y el backend aplican las mismas vías de contacto.

## Principios de seguridad de la extensión

- Permisos mínimos en `manifest.json` (`activeTab`, `contextMenus`, `storage`, `scripting`).
- Los screenshots no se persisten en el equipo ni en la extensión: se procesan en el backend.
- El token de vinculación es de larga duración pero **revocable** desde
  `app.urreai.com/dashboard/extension`.
- Cumplimiento con la Ley 1581 de 2012 (protección de datos personales, Colombia).
