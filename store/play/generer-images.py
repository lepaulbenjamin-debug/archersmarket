from PIL import Image, ImageDraw, ImageFont, ImageFilter

F = '/mnt/skills/examples/canvas-design/canvas-fonts/'
ANTHRACITE = (27, 27, 29)
ORANGE = (245, 132, 60)
BLANC = (255, 255, 255)
GRIS = (176, 176, 182)

Image.open('assets/icon.png').convert('RGBA').resize((512, 512), Image.LANCZOS) \
     .save('store/play/icone-512.png')

L, H = 1024, 500
img = Image.new('RGB', (L, H), ANTHRACITE)

halo = Image.new('RGB', (L, H), ANTHRACITE)
ImageDraw.Draw(halo).ellipse([10, 20, 450, 480], fill=(58, 40, 30))
img = Image.blend(img, halo.filter(ImageFilter.GaussianBlur(70)), 0.85)

emb = Image.open('assets/brand/emblem-dark.png').convert('RGBA')
h_emb = 288
w_emb = round(emb.width * h_emb / emb.height)
emb = emb.resize((w_emb, h_emb), Image.LANCZOS)
x_emb, y_emb = 62, (H - h_emb) // 2
img.paste(emb, (x_emb, y_emb), emb)

d = ImageDraw.Draw(img)
x = x_emb + w_emb + 54

titre = ImageFont.truetype(F + 'InstrumentSans-Bold.ttf', 74)
sous = ImageFont.truetype(F + 'InstrumentSans-Regular.ttf', 26)

d.text((x, 150), 'Archers', font=titre, fill=BLANC)
d.text((x, 220), 'Market', font=titre, fill=ORANGE)
d.rectangle([x, 308, x + 52, 312], fill=ORANGE)
d.text((x, 332), "Le marché d’occasion entre archers", font=sous, fill=GRIS)

img.save('store/play/presentation-1024x500.png')

fin = d.textbbox((x, 332), "Le marché d’occasion entre archers", font=sous)[2]
print('fin du texte à', fin, '— marge droite', L - fin, 'px')
