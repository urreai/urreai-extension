/*
 * Pruebas del cliente de la app (`lib/cliente.js`), sin navegador ni red: un
 * `chrome.storage` y un `fetch` de mentira dentro de un contexto de `vm`.
 *
 * Fijan lo que el estudiante notaría sin ver ningún error: que la extensión
 * se dé por desvinculada cuando la app rechaza el código, que el catálogo no
 * se descargue cada vez que se abre el popup, y que sin red siga habiendo
 * calculadoras que buscar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (...ruta) => readFileSync(join(RAIZ, ...ruta), 'utf8')

const CODIGO = `urreai_ext_${'a'.repeat(40)}`

/** El cliente con un almacenamiento y unas respuestas dadas. Devuelve también lo que se pidió. */
function cliente({ guardado = {}, respuestas = {} } = {}) {
  const almacen = { ...guardado }
  const pedidos = []
  const chrome = {
    storage: {
      local: {
        get: (claves, cb) => cb(Object.fromEntries(claves.filter(c => c in almacen).map(c => [c, almacen[c]]))),
        set: (datos, cb) => { Object.assign(almacen, datos); cb() },
        remove: (claves, cb) => { for (const c of claves) delete almacen[c]; cb() },
      },
    },
  }
  const fetch = async (url, opciones = {}) => {
    pedidos.push({ url, opciones })
    const ruta = new URL(url).pathname
    const r = respuestas[ruta]
    if (!r) throw new Error('sin red')
    return { ok: r.status < 400, status: r.status, json: async () => r.cuerpo }
  }
  const contexto = { self: {}, chrome, fetch, URL, Date, Promise, Error, JSON, Array, Object, Boolean }
  runInNewContext(leer('lib', 'enlaces.js'), contexto)
  runInNewContext(leer('lib', 'cliente.js'), contexto)
  return { C: contexto.self.URREAI_CLIENTE, almacen, pedidos }
}

test('sin código no llama a la app, y dice que hay que vincular', async () => {
  const { C, pedidos } = cliente()
  await assert.rejects(C.resumen(), (err) => err.codigo === 'SIN_VINCULAR')
  assert.equal(pedidos.length, 0)
})

test('si la app rechaza el código, lo borra: la extensión queda desvinculada', async () => {
  const { C, almacen } = cliente({
    guardado: { urreai_token: CODIGO },
    respuestas: { '/api/extension/resumen': { status: 401, cuerpo: { success: false, error: 'Código inválido' } } },
  })
  await assert.rejects(C.resumen(), (err) => err.codigo === 'SIN_VINCULAR')
  assert.equal('urreai_token' in almacen, false)
})

test('guarda una flashcard con el código, en la app con la que se vinculó', async () => {
  const { C, pedidos } = cliente({
    guardado: { urreai_token: CODIGO, urreai_api: 'http://localhost:3000' },
    respuestas: { '/api/extension/flashcard': { status: 201, cuerpo: { success: true, data: { id: 't1' } } } },
  })
  const datos = await C.guardarTarjeta({ pregunta: 'Frente', respuesta: 'Dorso', rotacion: '' })
  assert.equal(datos.id, 't1')
  const [{ url, opciones }] = pedidos
  assert.equal(url, 'http://localhost:3000/api/extension/flashcard')
  assert.equal(opciones.method, 'POST')
  assert.equal(opciones.headers.Authorization, `Bearer ${CODIGO}`)
  assert.deepEqual(JSON.parse(opciones.body), { pregunta: 'Frente', respuesta: 'Dorso', rotacion: null })
})

test('un error de la app llega con el mensaje de la app', async () => {
  const { C } = cliente({
    guardado: { urreai_token: CODIGO },
    respuestas: { '/api/extension/flashcard': { status: 403, cuerpo: { success: false, error: 'Tu prueba gratuita terminó.' } } },
  })
  await assert.rejects(C.guardarTarjeta({ pregunta: 'F', respuesta: 'D' }), /Tu prueba gratuita terminó\./)
})

test('el catálogo se descarga una vez al día, no cada vez que se abre el popup', async () => {
  const catalogo = [{ id: 'curb65', nombre: 'CURB-65', descripcion: '', categoria: 'Neumología', palabras: '' }]
  const { C, pedidos, almacen } = cliente({
    respuestas: { '/api/extension/calculadoras': { status: 200, cuerpo: { success: true, data: { total: 1, calculadoras: catalogo } } } },
  })
  assert.equal((await C.catalogo()).length, 1)
  assert.equal((await C.catalogo()).length, 1)
  assert.equal(pedidos.length, 1, 'lo pidió dos veces')
  assert.equal(almacen.urreai_catalogo.lista.length, 1)

  // Pasado el día, vuelve a pedirlo.
  almacen.urreai_catalogo.cuando -= 25 * 60 * 60 * 1000
  await C.catalogo()
  assert.equal(pedidos.length, 2)
})

test('sin red, la última copia; y sin copia, las dieciséis de fábrica', async () => {
  const vieja = { lista: [{ id: 'pam', nombre: 'PAM' }], cuando: Date.now() - 3 * 24 * 60 * 60 * 1000 }
  const conCopia = cliente({ guardado: { urreai_catalogo: vieja } })
  assert.deepEqual(Array.from(await conCopia.C.catalogo(), c => c.id), ['pam'])

  const sinCopia = cliente()
  assert.equal((await sinCopia.C.catalogo()).length, 16)
})
