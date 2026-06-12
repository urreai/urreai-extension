# Contribuir a UrreAI Extension

¡Gracias por tu interés! Esta extensión es parte del ecosistema [UrreAI](https://urreai.com),
una plataforma para profesionales de la salud en Colombia.

## Cómo contribuir

1. Haz un *fork* del repositorio y crea una rama desde `main`:
   ```bash
   git checkout -b fix/mi-mejora
   ```
2. Haz tus cambios. La extensión es JavaScript/HTML/CSS vanilla, sin paso de build —
   cárgala sin empaquetar desde `chrome://extensions/` para probar.
3. Verifica que funcione en Chrome 109+ y, si puedes, en Firefox 109+
   (`about:debugging#/runtime/this-firefox`).
4. Abre un *Pull Request* describiendo qué cambia y por qué.

Para cambios grandes o que toquen permisos del `manifest.json`, abre primero un *issue*
para discutirlo.

## Convención de commits

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nueva acción de captura
fix(paste): corregir intercepción de Ctrl+V
chore(security): reducir permisos de host
docs: actualizar README
```

## Estilo de código

- Mantén los módulos pequeños y enfocados.
- No introduzcas dependencias externas sin discutirlo — la extensión es deliberadamente *vanilla*.
- Pide siempre los permisos mínimos necesarios en `manifest.json`.

## Reportar bugs

Abre un *issue* con: navegador y versión, pasos para reproducir, comportamiento esperado vs. real,
y capturas si aplica (**sin datos reales de pacientes**).

## Seguridad

Las vulnerabilidades **no** se reportan en issues públicos. Ver [`SECURITY.md`](SECURITY.md).
