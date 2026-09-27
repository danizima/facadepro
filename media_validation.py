"""Fail a release when a public raster or declared responsive size is invalid."""
from pathlib import Path
import json
from PIL import Image


def validate_media(root):
    root = Path(root)
    assets = root / 'site/assets'
    errors, decoded = [], {}
    for file in sorted(assets.rglob('*')):
        if file.suffix.lower() not in ('.webp', '.png', '.jpg', '.jpeg'):
            continue
        try:
            if not file.stat().st_size:
                raise ValueError('empty file')
            with Image.open(file) as image:
                image.load()
                if min(image.size) <= 0:
                    raise ValueError('invalid dimensions')
                decoded[file.relative_to(assets).as_posix()] = list(image.size)
        except Exception as error:
            errors.append(f'{file.relative_to(root)}: {error}')
    for key, size in json.loads((root / 'source/image-sizes.json').read_text()).items():
        name = key + '.webp'
        if name not in decoded:
            errors.append(f'image-sizes: {name} is missing or undecodable')
        elif decoded[name] != size:
            errors.append(f'image-sizes: {name} says {size}, actual {decoded[name]}')
    if errors:
        raise ValueError('Public media validation failed:\n' + '\n'.join(errors))
    return len(decoded)


if __name__ == '__main__':
    root = Path(__file__).resolve().parent
    print(f'Validated {validate_media(root)} public images and responsive dimensions')
