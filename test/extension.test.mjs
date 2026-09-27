/*
 * Pruebas de la extensión, sin navegador: `node --test` (Node 20 o más).
 *
 * Miran lo que se puede romper sin que nada falle a la vista: los enlaces que
 * abre (si la app deja de leer uno, la página se abre y no pasa nada), el
 * manifiesto (un permiso de más es un rechazo en la tienda) y la marca (la 0.1
 * tenía violeta, degradados y emojis). La otra mitad del contrato de los
 * enlaces la prueba la app, en `contratoDeLaExtension.test.ts`.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (...ruta) => readFileSync(join(RAIZ, ...ruta), 'utf8')

function enlaces() {
  const contexto = { self: {} }
  runInNewContext(leer('lib', 'enlaces.js'), contexto)
  return contexto.self.URREAI_ENLACES
}

/** Los ids en un arreglo de este contexto: los del `vm` tienen otro prototipo y `deepEqual` los rechaza. */
const ids = (lista) => Array.from(lista, c => c.id)

/** El código sin comentarios: los comentarios cuentan la historia y pueden nombrar lo que ya no se usa. */
const sinComentarios = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

test('los enlaces llevan el texto codificado y van a la app', () => {
  const E = enlaces()
  assert.equal(E.enlace(E.APP, 'pregunta', '¿Dosis de amoxicilina & ácido?'),
    'https://app.urreai.com/dashboard/chat-evidencia?pregunta=%C2%BFDosis%20de%20amoxicilina%20%26%20%C3%A1cido%3F')
  assert.equal(E.enlace(E.APP, 'flashcard', ''), 'https://app.urreai.com/dashboard/study-queue?nueva=1&frente=')
  assert.equal(E.enlace('http://localhost:3000', 'calculadora', 'curb65'), 'http://localhost:3000/dashboard/calculators?focus=curb65')
  assert.equal(E.enlace(E.APP, 'caso'), 'https://app.urreai.com/dashboard/logbook?nuevo=caso')
  assert.throws(() => E.enlace(E.APP, 'no-existe'))
})

test('solo la app y su dirección de desarrollo cuentan como la app', () => {
  const E = enlaces()
  assert.equal(E.esLaApp('https://app.urreai.com'), true)
  assert.equal(E.esLaApp('http://localhost:3000'), true)
  assert.equal(E.esLaApp('https://app.urreai.com.otro.com'), false)
  assert.equal(E.esLaApp('https://urreai.com'), false)
})

test('buscar una calculadora no distingue tildes ni mayúsculas', () => {
  const E = enlaces()
  assert.deepEqual(ids(E.buscarCalculadoras('GLASGOW')), ['glasgow_coma'])
  assert.deepEqual(ids(E.buscarCalculadoras('presión media')), ['pam'])
  assert.equal(E.buscarCalculadoras('').length, E.CALCULADORAS.length)
  assert.equal(new Set(ids(E.CALCULADORAS)).size, E.CALCULADORAS.length, 'ids repetidos')
})

test('ningún enlace usa los parámetros que la app no lee', () => {
  const codigo = ['background.js', 'popup/popup.js', 'lib/enlaces.js'].map(f => sinComentarios(leer(f))).join('\n')
  for (const viejo of ['new=case', '?new=1', 'tab=hoy']) {
    assert.equal(codigo.includes(viejo), false, `sigue apareciendo «${viejo}»`)
  }
  // Los destinos de la 0.1, como valor que empieza una cadena: «background:» no cuenta.
  assert.equal(/[`'"](?:round|patient):/.test(codigo), false, 'sigue usando los destinos round: o patient:')
})

test('el manifiesto pide lo justo y funciona en Chrome y en Firefox', () => {
  const m = JSON.parse(leer('manifest.json'))
  const paquete = JSON.parse(leer('package.json'))
  assert.equal(m.manifest_version, 3)
  assert.equal(m.version, paquete.version, 'la versión del manifiesto y la del paquete difieren')
  assert.deepEqual([...m.permissions].sort(), ['activeTab', 'clipboardWrite', 'contextMenus', 'scripting', 'storage'])
  assert.equal(m.permissions.includes('clipboardRead'), false)
  assert.deepEqual(m.host_permissions, ['https://app.urreai.com/*', 'http://localhost:3000/*'])
  // Chrome usa el service worker; Firefox, la lista de scripts.
  assert.equal(m.background.service_worker, 'background.js')
  assert.deepEqual(m.background.scripts, ['lib/enlaces.js', 'background.js'])
  // El script de vincular solo corre en la app.
  assert.deepEqual(m.content_scripts.flatMap(c => c.matches), ['https://app.urreai.com/*', 'http://localhost:3000/*'])
  for (const archivo of [...m.content_scripts.flatMap(c => c.js), ...Object.values(m.icons)]) {
    assert.ok(existsSync(join(RAIZ, archivo)), `falta ${archivo}`)
  }
})

test('ya no desbloquea el pegado en páginas ajenas', () => {
  assert.equal(existsSync(join(RAIZ, 'content', 'enable-paste.js')), false)
  const codigo = ['background.js', 'popup/popup.js'].map(f => leer(f)).join('\n')
  assert.equal(/pasteEnabler|stopImmediatePropagation|enable-paste/.test(codigo), false)
})

test('la marca: sin violeta, sin degradados y sin emojis', () => {
  const archivos = ['popup/popup.html', 'popup/popup.css', 'popup/popup.js', 'background.js',
    'content/capture-overlay.css', 'content/capture-overlay.js', 'content/vincular.js']
  const VIOLETAS = /#(7c3aed|8b5cf6|6d28d9|5b21b6|4f46e5|a78bfa|c4b5fd)\b/i
  const EMOJI = /\p{Extended_Pictographic}/u
  for (const archivo of archivos) {
    const texto = leer(archivo)
    assert.equal(VIOLETAS.test(texto), false, `violeta en ${archivo}`)
    assert.equal(/linear-gradient|radial-gradient/.test(texto), false, `degradado en ${archivo}`)
    assert.equal(EMOJI.test(texto), false, `emoji en ${archivo}`)
  }
})

test('el script de vincular solo escucha a la propia página', () => {
  const codigo = leer('content', 'vincular.js')
  assert.match(codigo, /event\.source !== window/)
  assert.match(codigo, /event\.origin !== window\.location\.origin/)
  assert.match(codigo, /window\.postMessage\(mensaje, window\.location\.origin\)/)
})

test('el fondo solo vincula desde la app y comprueba el código antes de guardarlo', () => {
  const codigo = leer('background.js')
  assert.match(codigo, /remitente\.id !== chrome\.runtime\.id/)
  assert.match(codigo, /E\.esLaApp\(origen\)/)
  assert.match(codigo, /\/api\/extension\/context/)
})

test('cada archivo del paquete existe', () => {
  const html = leer('popup', 'popup.html')
  for (const [, src] of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css|png))"/g)) {
    assert.ok(existsSync(join(RAIZ, 'popup', src)), `el popup pide ${src} y no existe`)
  }
  assert.ok(readdirSync(join(RAIZ, 'icons')).includes('icon-128.png'))
})
