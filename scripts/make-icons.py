"""
Genera los íconos de la extensión (16, 32, 48 y 128 px) desde el isotipo.

Hasta la 0.2.0 el ícono era una «U» blanca sobre un degradado azul a violeta,
dibujada aquí: no era la marca, y el violeta no está en su paleta. Ahora es el
isotipo del manual de marca (la cruz con el circuito), copiado de
`urreai/marketing/logo-urreai/urreai-isotipo-420x420.png` a `isotipo-420.png`
para que este repositorio no dependa de otro.

La barra del navegador pinta el ícono sobre su propio fondo, claro u oscuro, así
que va sin fondo y con poco margen: a 16 px cada píxel cuenta.

Uso: py scripts/make-icons.py
"""
import os

from PIL import Image

AQUI = os.path.dirname(os.path.abspath(__file__))
FUENTE = os.path.join(AQUI, 'isotipo-420.png')
SALIDA = os.path.join(AQUI, '..', 'icons')
TAMANOS = (16, 32, 48, 128)
MARGEN = 0.04  # por lado, como fracción del lado

isotipo = Image.open(FUENTE).convert('RGBA')
isotipo = isotipo.crop(isotipo.getbbox())

os.makedirs(SALIDA, exist_ok=True)
for lado in TAMANOS:
    util = round(lado * (1 - 2 * MARGEN))
    escala = util / max(isotipo.size)
    dibujo = isotipo.resize((max(1, round(isotipo.width * escala)), max(1, round(isotipo.height * escala))), Image.LANCZOS)
    lienzo = Image.new('RGBA', (lado, lado), (0, 0, 0, 0))
    lienzo.paste(dibujo, ((lado - dibujo.width) // 2, (lado - dibujo.height) // 2), dibujo)
    lienzo.save(os.path.join(SALIDA, f'icon-{lado}.png'))
    print(f'icon-{lado}.png')
