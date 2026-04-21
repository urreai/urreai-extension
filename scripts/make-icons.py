"""
Genera icon-16.png, icon-48.png y icon-128.png cuadrados para la extensión.

El logo.png de UrreAI es un wordmark horizontal (~520x200). Usado como
ícono cuadrado se deforma feo. Este script dibuja un ícono de marca
limpio: cuadrado con gradiente azul->violeta + la letra "U" en blanco,
estilo Bricolage Grotesque (usa cualquier font bold disponible).

Uso: python scripts/make-icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(OUT_DIR, exist_ok=True)

# Gradiente: esquina superior-izquierda azul UrreAI (#1a3a8f)
# a esquina inferior-derecha violeta (#7c3aed).
def make_gradient(size):
    img = Image.new('RGBA', (size, size))
    top = (0x1a, 0x3a, 0x8f, 255)
    bot = (0x7c, 0x3a, 0xed, 255)
    for y in range(size):
        for x in range(size):
            # Diagonal 0..1
            t = (x + y) / (2 * size - 2)
            r = int(top[0] + (bot[0] - top[0]) * t)
            g = int(top[1] + (bot[1] - top[1]) * t)
            b = int(top[2] + (bot[2] - top[2]) * t)
            img.putpixel((x, y), (r, g, b, 255))
    return img

def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle([(0, 0), (size - 1, size - 1)], radius=radius, fill=255)
    return mask

def find_bold_font(target_size):
    # Intenta varias fuentes bold comunes en Windows
    candidates = [
        'arialbd.ttf',  # Arial Bold
        'seguisb.ttf',  # Segoe UI Semibold
        'segoeuib.ttf', # Segoe UI Bold
        'tahomabd.ttf', # Tahoma Bold
        'impact.ttf',
    ]
    font_dirs = [
        'C:/Windows/Fonts/',
        '/usr/share/fonts/truetype/',
        '/Library/Fonts/',
    ]
    for d in font_dirs:
        for c in candidates:
            p = os.path.join(d, c)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, target_size)
                except Exception:
                    pass
    return ImageFont.load_default()

def make_icon(size):
    # Gradiente fondo (con esquinas redondeadas generosas).
    bg = make_gradient(size)
    # Radio más suave (22% del lado) — moderno, no tan hard-rounded
    mask = rounded_mask(size, radius=max(3, int(size * 0.22)))

    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(bg, (0, 0), mask)

    # Letra "U" blanca centrada — 50% del alto (antes 62%, se veía muy
    # apretada en 16x16). Padding interior más generoso.
    letter = 'U'
    draw = ImageDraw.Draw(out)
    font_size = int(size * 0.50)
    font = find_bold_font(font_size)
    bbox = draw.textbbox((0, 0), letter, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    # Centrar — compensar baseline (el bbox de algunas fonts tiene offset
    # top positivo, lo restamos).
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - max(1, int(size * 0.015))
    draw.text((x, y), letter, font=font, fill=(255, 255, 255, 255))

    return out

for s in (16, 48, 128):
    img = make_icon(s)
    path = os.path.join(OUT_DIR, f'icon-{s}.png')
    img.save(path, 'PNG', optimize=True)
    print(f'OK {path} ({s}x{s})')

print('Listo.')
