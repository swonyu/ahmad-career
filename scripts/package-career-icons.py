#!/usr/bin/env python3
"""Package the generated artwork; only resize, opaque-pad and format-convert it."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import argparse
import tempfile
import colorsys
import hashlib
import json
import shutil
import xml.etree.ElementTree as ET

# Intended repository location: scripts/package-career-icons.py. No production
# asset is overwritten; the default output is a fresh temporary directory.
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--repository', type=Path, default=Path(__file__).resolve().parents[1],
                    help='Repository root used to find the preserved master and Apple catalog')
parser.add_argument('--source', type=Path,
                    help='Optional alternate opaque square master (at least 1024 pixels)')
parser.add_argument('--output', type=Path,
                    help='Empty or new output directory; defaults to a fresh temporary directory')
options = parser.parse_args()
REPO = options.repository.expanduser().resolve()
SOURCE = (options.source or REPO/'docs/branding/2026-11-17-indigo/source/career-finder-generated-source.png').expanduser().resolve()
if not SOURCE.is_file():
    parser.error('The preserved master does not exist. Supply --repository or --source.')
source_image = Image.open(SOURCE)
if source_image.width != source_image.height or source_image.width < 1024:
    parser.error('The source must be square and at least 1024 pixels.')
if source_image.convert('RGBA').getchannel('A').getextrema() != (255, 255):
    parser.error('The source must already be completely opaque; this script does not alter artwork.')
ROOT = options.output.expanduser().resolve() if options.output else Path(tempfile.mkdtemp(prefix='career-icon-package-'))
if SOURCE.is_relative_to(ROOT):
    parser.error('The output directory must not contain the preserved source.')
if ROOT.exists() and (not ROOT.is_dir() or any(ROOT.iterdir())):
    parser.error('Choose an empty or new output directory; existing work is preserved.')
ROOT.mkdir(parents=True, exist_ok=True)
BG = (19, 21, 43)  # Most frequent generated background pixel; padding only.
RESAMPLE = Image.Resampling.LANCZOS
for folder in ['source', 'qa', 'integration']:
    (ROOT / folder).mkdir(parents=True, exist_ok=True)
raw = ROOT / 'source/career-finder-generated-source.png'
shutil.copyfile(SOURCE, raw)
art = Image.open(raw).convert('RGB')

def save(rel, size, padding=0):
    path = ROOT / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    if padding:
        inner = round(size * (1 - 2 * padding))
        icon = Image.new('RGB', (size, size), BG)
        icon.paste(art.resize((inner, inner), RESAMPLE), ((size-inner)//2, (size-inner)//2))
    else:
        icon = art.resize((size, size), RESAMPLE)
    icon.save(path, optimize=True)
    return icon

save('source/career-finder-icon-1024.png', 1024)
apple = 'integration/apple/AhmadCareer/Assets.xcassets/AppIcon.appiconset'
save(apple + '/AppIcon-iOS-1024.png', 1024)
for size in [16, 32, 64, 128, 256, 512, 1024]:
    save(apple + f'/AppIcon-macOS-{size}.png', size)
web = 'integration/hosted/public'
for name, size, padding in [
    ('phone-icon.png', 512, 0), ('phone-icon-192.png', 192, 0),
    ('phone-icon-maskable.png', 512, .05), ('phone-icon-maskable-192.png', 192, .05),
    ('apple-touch-icon.png', 180, 0), ('favicon-32.png', 32, 0), ('favicon-16.png', 16, 0)
]:
    save(web + '/' + name, size, padding)
art.resize((48, 48), RESAMPLE).save(ROOT/web/'favicon.ico', format='ICO', sizes=[(16,16),(32,32),(48,48)])
android = 'integration/android/app/src/main/res'
for density, size in [('mdpi',48),('hdpi',72),('xhdpi',96),('xxhdpi',144),('xxxhdpi',192)]:
    save(android + f'/mipmap-{density}/ic_launcher.png', size)
save(android + '/drawable-nodpi/career_icon_adaptive.png', 432, .15)
for rel, body in {
    'mipmap-anydpi-v26/ic_launcher.xml': '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@color/career_icon_background" />\n    <foreground android:drawable="@drawable/career_icon_adaptive" />\n</adaptive-icon>\n',
    'values/career_icon_colors.xml': '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="career_icon_background">#13152B</color>\n</resources>\n'
}.items():
    path = ROOT/android/rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body)
    ET.parse(path)
save('integration/docs/store-assets/play-icon-2026-11-17.png', 512)

def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()

def measure(path):
    im = Image.open(path).convert('RGB')
    points = [(x,y) for y in range(im.height) for x in range(im.width)
              if max(im.getpixel((x,y))) > 120 and min(im.getpixel((x,y))) > 70]
    radius = max((((x+.5-im.width/2)/im.width)**2 + ((y+.5-im.height/2)/im.height)**2)**.5 for x,y in points)
    return {'foreground_test':'all RGB channels > 70 and any RGB channel > 120',
            'bounds_pixels':[min(x for x,y in points), min(y for x,y in points), max(x for x,y in points), max(y for x,y in points)],
            'max_radius_fraction_of_canvas':round(radius,6)}

images = []
for path in sorted((ROOT/'integration').rglob('*')):
    if path.suffix not in ['.png','.ico']:
        continue
    im = Image.open(path)
    frames = []
    if path.suffix == '.ico':
        for size in sorted(im.ico.sizes()):
            frame = im.ico.getimage(size).convert('RGBA')
            frames.append({'size':size,'alpha_extrema':frame.getchannel('A').getextrema()})
    images.append({'path':str(path.relative_to(ROOT)), 'size':im.size, 'mode':im.mode,
                   'opaque':all(f['alpha_extrema'] == (255,255) for f in frames) if frames else 'A' not in im.getbands() or im.getchannel('A').getextrema()==(255,255),
                   'bytes':path.stat().st_size, 'sha256':digest(path), **({'frames':frames} if frames else {})})
normal = measure(ROOT/web/'phone-icon.png')
maskable = measure(ROOT/web/'phone-icon-maskable.png')
adaptive = measure(ROOT/android/'drawable-nodpi/career_icon_adaptive.png')
maskable['safe_radius_limit'] = .4
maskable['pass'] = maskable['max_radius_fraction_of_canvas'] <= .4
adaptive['safe_radius_limit'] = 33/108
adaptive['pass'] = adaptive['max_radius_fraction_of_canvas'] <= 33/108

green_count = 0
for r,g,b in (art.get_flattened_data() if hasattr(art, 'get_flattened_data') else art.getdata()):
    h,s,v = colorsys.rgb_to_hsv(r/255,g/255,b/255)
    if 75 <= h*360 <= 185 and s > .15 and v > .1:
        green_count += 1

catalog = json.loads((REPO/'apple/AhmadCareer/Assets.xcassets/AppIcon.appiconset/Contents.json').read_text())
catalog_images = sorted(set(entry['filename'] for entry in catalog['images'] if 'filename' in entry))
verification = {
 'status':'isolated unpublished asset candidate; static file verification only',
 'source':{'path':str(raw.relative_to(ROOT)), 'size':art.size,'mode':art.mode,'sha256':digest(raw)},
 'derived_image_count':len(images), 'all_derived_images_opaque':all(i['opaque'] for i in images),
 'all_pngs_rgb':all(i['mode']=='RGB' for i in images if i['path'].endswith('.png')),
 'palette_check':{'method':'count pixels with HSV hue 75 through 185 degrees, saturation > 0.15, value > 0.1',
                  'green_teal_pixels':green_count,'source_pixels':art.width*art.height, 'pass':green_count==0,
                  'padding_background':'#13152B', 'note':'Artwork is a generated bitmap with slight tonal variation, not an exact three-color vector.'},
 'apple_catalog':{'unique_expected_filenames':catalog_images,'all_files_present':all((ROOT/apple/f).exists() for f in catalog_images)},
 'normal':normal,'pwa_maskable':maskable,'android_adaptive':adaptive,
 'xml_parsing':'2/2 prepared Android resource XML files parsed',
 'images':images,
 'not_verified':['native compilation','physical-device launcher rendering','installed web-app icon refresh','store upload acceptance','release branch integration']
}
assert verification['all_derived_images_opaque'] and verification['all_pngs_rgb']
assert green_count == 0 and maskable['pass'] and adaptive['pass']
assert verification['apple_catalog']['all_files_present']
(ROOT/'qa/asset-verification.json').write_text(json.dumps(verification,indent=2)+'\n')

# QA-only platform masks and display surfaces; production artwork stays square and opaque.
sheet = Image.new('RGB',(1400,900),'#F2F3F7')
d = ImageDraw.Draw(sheet)
fontpath = next((p for p in [Path('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'),
    Path('/System/Library/Fonts/Supplemental/Arial.ttf')] if p.is_file()), None)
def font(size):
    if fontpath:
        return ImageFont.truetype(str(fontpath), size)
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()
ink='#202338'
def label(x,y,text,size=15,color=ink):
    d.text((x,y),text,font=font(size),fill=color)
label(36,24,'Career Finder · Midnight / Periwinkle',28)
label(36,66,'Opaque generated artwork • Static asset review • Unpublished candidate',15)
sheet.paste(art.resize((512,512),RESAMPLE),(36,112))
label(36,642,'512 px square — platform supplies outer corners',15)
label(594,112,'Actual pixel sizes',19)
start=594
for size in [16,24,32,48,64,96,128]:
    sheet.paste(art.resize((size,size),RESAMPLE),(start,176+(128-size)//2))
    label(start,320,str(size),13)
    start += max(size+20,53)

label(594,365,'Mask simulations',19)
for idx,(name,shape,source) in enumerate([
    ('Rounded square','round',art),('Circle','circle',art),
    ('PWA maskable','circle',Image.open(ROOT/web/'phone-icon-maskable.png')),
    ('Android adaptive','circle',Image.open(ROOT/android/'drawable-nodpi/career_icon_adaptive.png').crop((72,72,360,360)))
]):
    x=594+idx*192; y=402
    resized=source.resize((152,152),RESAMPLE).convert('RGB')
    mask=Image.new('L',(152,152)); md=ImageDraw.Draw(mask)
    if shape=='round': md.rounded_rectangle((0,0,151,151),radius=34,fill=255)
    else: md.ellipse((0,0,151,151),fill=255)
    sheet.paste(resized,(x,y),mask)
    label(x,y+169,name,13)
label(594,620,'Light and dark surfaces',19)
for x,back in [(594,'#FFFFFF'),(910,'#111525')]:
    d.rounded_rectangle((x,662,x+288,809),radius=18,fill=back)
    sheet.paste(art.resize((112,112),RESAMPLE),(x+18,680))
    label(x+146,706,'Career',17,'#25283C' if back=='#FFFFFF' else '#F2F2F7')
    label(x+146,733,'Finder',17,'#25283C' if back=='#FFFFFF' else '#F2F2F7')
label(36,840,'QA sheet: size and mask simulations only; no device, build, release or store acceptance is implied.',14)
sheet.save(ROOT/'qa/contact-sheet.png',optimize=True)
print(json.dumps({k:verification[k] for k in ['source','derived_image_count','all_derived_images_opaque','all_pngs_rgb','palette_check','pwa_maskable','android_adaptive','apple_catalog']},indent=2))

manifest = [{'path':str(path.relative_to(ROOT)), 'bytes':path.stat().st_size, 'sha256':digest(path)}
            for path in sorted(ROOT.rglob('*')) if path.is_file() and path.name != 'file-manifest.json']
(ROOT/'file-manifest.json').write_text(json.dumps({'source_sha256':digest(SOURCE), 'files':manifest}, indent=2)+'\n')
print('Packaged assets (production files unchanged): ' + str(ROOT))
