import importlib.util
from pathlib import Path
import tempfile
import subprocess
import json
import unittest
from unittest.mock import patch, MagicMock

spec = importlib.util.spec_from_file_location('studio_worker', Path(__file__).with_name('studio-worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class CommandFailureTests(unittest.TestCase):
    def test_suno_stderr_captcha_is_actionable_without_leaking_provider_output(self):
        failure = subprocess.CompletedProcess(['suno'], 2, '', json.dumps({'status': 'error', 'error': {'code': 'captcha_required', 'message': 'private-provider-data'}}))
        with patch.object(worker.subprocess, 'run', return_value=failure):
            with self.assertRaises(worker.Blocked) as caught:
                worker.command(['suno', '--no-browser', 'generate'])
        self.assertEqual(caught.exception.code, 'captcha_required')
        self.assertIn('人机验证', str(caught.exception))
        self.assertNotIn('private-provider-data', str(caught.exception))

    def test_unknown_failure_does_not_enable_browser_submission(self):
        failure = subprocess.CompletedProcess(['suno'], 1, '', 'network failure secret-value')
        with patch.object(worker.subprocess, 'run', return_value=failure):
            with self.assertRaises(worker.Blocked) as caught:
                worker.command(['suno'])
        self.assertEqual(caught.exception.code, '')
        self.assertNotIn('secret-value', str(caught.exception))


class BrowserResultTests(unittest.TestCase):
    def test_native_ego_stderr_results_continue_download(self):
        instance = worker.Worker.__new__(worker.Worker)
        instance.progress = MagicMock()
        ids = ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222']
        result = subprocess.CompletedProcess(['ego-browser'], 0, '', '[ego-browser:notice] fixture\nQM_BROWSER_RESULT=' + json.dumps({'ids': ids}) + '\n')
        with patch.object(worker.shutil, 'which', return_value='/fixture/ego-browser'), patch.object(worker.subprocess, 'run', return_value=result):
            actual = instance.browser_submit({'id': 'fixture', 'lease': 'lease'}, Path('/fixture/job'), check=True)
        self.assertEqual(actual, ids)
        self.assertFalse(instance.progress.call_args.kwargs['browserPending'])

    def test_native_ego_handoff_message_is_preserved(self):
        instance = worker.Worker.__new__(worker.Worker)
        instance.progress = MagicMock()
        result = subprocess.CompletedProcess(['ego-browser'], 0, '', 'QM_BROWSER_RESULT=' + json.dumps({'pending': True, 'message': '发现多组同名结果，请关联候选链接'}) + '\n')
        with patch.object(worker.shutil, 'which', return_value='/fixture/ego-browser'), patch.object(worker.subprocess, 'run', return_value=result):
            with self.assertRaises(worker.Blocked) as caught:
                instance.browser_submit({'id': 'fixture', 'lease': 'lease'}, Path('/fixture/job'), check=True)
        self.assertIn('多组同名结果', str(caught.exception))
        self.assertEqual(caught.exception.code, 'browser_action_required')


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
