"""
Les visuels de partage : carte de lien et image de publication.

Deux formats, deux usages qui ne se confondent pas.

La carte de lien (1200 × 630) est ce que Facebook, LinkedIn ou une messagerie
affichent quand on colle l'adresse. Elle ne doit rien dire que la page ne dise
déjà : le titre et la description sont posés par-dessus par le réseau, et les
répéter dans l'image donne un doublon. Elle porte donc l'identité, et c'est
tout.

L'image carrée (1080 × 1080) est publiée telle quelle, sans texte autour dans
un fil Instagram. C'est elle qui porte la nouvelle — « de retour » — parce
qu'elle sera vue par des gens qui n'ont rien demandé et qui défilent.
"""

from PIL import Image, ImageDraw, ImageFilter

F = '/mnt/skills/examples/canvas-design/canvas-fonts/'
ANTHRACITE = (27, 27, 29)
ORANGE = (245, 132, 60)
BLANC = (255, 255, 255)
GRIS = (176, 176, 182)
GRIS_PALE = (138, 138, 146)


def police(nom, taille):
    from PIL import ImageFont
    return ImageFont.truetype(F + nom, taille)


def fond(largeur, hauteur, halo_x, halo_y, rayon):
    """Anthracite, avec un halo chaud pour que le fond ne soit pas plat."""
    img = Image.new('RGB', (largeur, hauteur), ANTHRACITE)
    halo = Image.new('RGB', (largeur, hauteur), ANTHRACITE)
    ImageDraw.Draw(halo).ellipse(
        [halo_x - rayon, halo_y - rayon, halo_x + rayon, halo_y + rayon],
        fill=(58, 40, 30),
    )
    return Image.blend(img, halo.filter(ImageFilter.GaussianBlur(rayon // 3)), 0.9)


def emblème(hauteur):
    im = Image.open('assets/brand/emblem-dark.png').convert('RGBA')
    return im.resize((round(im.width * hauteur / im.height), hauteur), Image.LANCZOS)


def centrer(d, texte, y, font, couleur, largeur):
    l = d.textbbox((0, 0), texte, font=font)[2]
    d.text(((largeur - l) / 2, y), texte, font=font, fill=couleur)
    return l


# ---------------------------------------------------------------------------
# Carte de lien : 1200 × 630
# ---------------------------------------------------------------------------
L, H = 1200, 630
img = fond(L, H, 330, 315, 380)
emb = emblème(250)
img.paste(emb, (110, (H - 250) // 2), emb)

d = ImageDraw.Draw(img)
x = 110 + emb.width + 70
d.text((x, 205), 'Archers', font=police('InstrumentSans-Bold.ttf', 72), fill=BLANC)
d.text((x, 273), 'Market', font=police('InstrumentSans-Bold.ttf', 72), fill=ORANGE)
d.rectangle([x, 362, x + 52, 366], fill=ORANGE)
d.text((x, 388), 'Le marché d’occasion entre archers',
       font=police('InstrumentSans-Regular.ttf', 25), fill=GRIS)
img.save('store/social/partage-lien-1200x630.png')

# ---------------------------------------------------------------------------
# Publication carrée : 1080 × 1080
# ---------------------------------------------------------------------------
C = 1080
img = fond(C, C, 540, 420, 520)
emb = emblème(320)
img.paste(emb, ((C - emb.width) // 2, 130), emb)

d = ImageDraw.Draw(img)
centrer(d, 'ARCHERS MARKET', 505, police('InstrumentSans-Bold.ttf', 46), BLANC, C)
l = centrer(d, 'est de retour', 572, police('InstrumentSans-Bold.ttf', 62), ORANGE, C)
d.rectangle([(C - 70) / 2, 672, (C + 70) / 2, 677], fill=ORANGE)

for i, ligne in enumerate([
    'Le marché d’occasion entre archers,',
    'entièrement reconstruit.',
]):
    centrer(d, ligne, 712 + i * 44, police('InstrumentSans-Regular.ttf', 31), GRIS, C)

for i, ligne in enumerate([
    'Paiement protégé · Envoi accompagné',
    'iPhone et Android',
]):
    centrer(d, ligne, 848 + i * 40, police('InstrumentSans-Regular.ttf', 27), GRIS_PALE, C)

centrer(d, 'archersmarket.fr', 960, police('InstrumentSans-Bold.ttf', 30), ORANGE, C)
img.save('store/social/partage-carre-1080.png')

for f in ['store/social/partage-lien-1200x630.png', 'store/social/partage-carre-1080.png']:
    im = Image.open(f)
    print(f.split('/')[-1], im.size, im.mode)
