"""Regression checks for corrupted responsive resources and public share cards."""
import json
import sys
import tempfile
import unittest
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from media_validation import validate_media


class Head(HTMLParser):
    def __init__(self):
        super().__init__()
        self.meta = {}
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'meta':
            self.meta[attrs.get('property') or attrs.get('name')] = attrs.get('content')


class MediaRelease(unittest.TestCase):
    def test_damaged_and_missing_responsive_images_block_release(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / 'site/assets').mkdir(parents=True)
            (root / 'source').mkdir()
            manifest = root / 'source/image-sizes.json'
            manifest.write_text(json.dumps({'photo-1280': [1280, 960]}))
            image = root / 'site/assets/photo-1280.webp'
            for broken in (b'', b'RIFFbrokenWEBP'):
                image.write_bytes(broken)
                with self.assertRaises(ValueError):
                    validate_media(root)
            image.unlink()
            with self.assertRaises(ValueError):
                validate_media(root)
            Image.new('RGB', (1280, 960)).save(image)
            self.assertEqual(validate_media(root), 1)
            manifest.write_text(json.dumps({'photo-1280': [600, 450]}))
            with self.assertRaisesRegex(ValueError, 'actual'):
                validate_media(root)

    def test_public_cards_reference_decodable_assets(self):
        self.assertGreater(validate_media(ROOT), 80)
        cards = {}
        for page in (ROOT / 'site').rglob('*.html'):
            if 'admin' in page.parts:
                continue
            parser = Head()
            parser.feed(page.read_text())
            if page.name == 'followup.html':
                self.assertIn('noindex', parser.meta.get('robots', ''))
                self.assertEqual(parser.meta.get('referrer'), 'no-referrer')
                continue
            url = parser.meta.get('og:image')
            self.assertTrue(url, str(page))
            self.assertEqual(urlparse(url).netloc, 'facadepro.ru')
            asset = ROOT / 'site' / urlparse(url).path.lstrip('/')
            with Image.open(asset) as image:
                image.load()
                self.assertGreater(image.width, 0)
            self.assertTrue(parser.meta.get('og:image:alt'), str(page))
            cards[page.relative_to(ROOT / 'site').as_posix()] = url
        self.assertNotEqual(cards['projects/burny.html'], cards['projects/golden-horn.html'])
        self.assertTrue(cards['contacts.html'].endswith('company-social.png'))


if __name__ == '__main__':
    unittest.main()
