import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('studio_worker', Path(__file__).with_name('studio-worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class CoverRecoveryTests(unittest.TestCase):
    def test_inspected_local_cover_wins_without_network(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(worker.urllib.request, 'urlopen') as network:
            folder = Path(directory)
            approved = folder / 'cover-approved.png'
            approved.write_bytes(b'inspected fixture')
            self.assertEqual(worker.candidate_cover({}, folder), approved)
            network.assert_not_called()

    def test_unknown_source_is_rejected_before_fetching(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(worker.urllib.request, 'urlopen') as network:
            with self.assertRaises(worker.Blocked):
                worker.candidate_cover({'image_url': 'https://cdn2.suno.ai.evil.invalid/cover.jpg'}, Path(directory))
            network.assert_not_called()

    def test_suno_png_is_saved_and_reused_and_html_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(worker.urllib.request, 'urlopen') as network:
            folder = Path(directory)
            response = MagicMock()
            response.url = 'https://cdn2.suno.ai/image_fixture.png'
            response.read.return_value = b'<html>upstream error</html>'
            network.return_value.__enter__.return_value = response
            with self.assertRaises(worker.Blocked):
                worker.candidate_cover({'image_url': response.url}, folder)
            response.read.return_value = b'\x89PNG\r\n\x1a\nfixture'
            cover = worker.candidate_cover({'image_url': response.url}, folder)
            self.assertEqual(cover.suffix, '.png')
            self.assertEqual(cover.read_bytes(), response.read.return_value)
            network.reset_mock()
            self.assertEqual(worker.candidate_cover({}, folder), cover)
            network.assert_not_called()


if __name__ == '__main__':
    unittest.main()
