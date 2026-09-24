"""Exercise the upgrade/rollback controller without a live Docker host."""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('update', Path(__file__).parents[1] / 'deploy/update-timeweb.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def scenario(failure=None):
    with tempfile.TemporaryDirectory() as folder:
        root = Path(folder)
        app, data = root / 'app', root / 'data'
        app.mkdir(); data.mkdir(); (app / '.git').mkdir()
        (app / '.env').write_text('private local fixture')
        (app / 'compose.yaml').write_text('fixture')
        (app / 'compose.override.yaml').write_text('fixture override')
        (data / 'facadepro.sqlite').write_bytes(b'existing leads')
        (data / 'secret').write_bytes(b'existing secret')
        (data / 'uploads').mkdir(); (data / 'uploads/file').write_bytes(b'existing attachment')
        (data / 'render-old').mkdir(); (data / 'render-old/page').write_text('reproducible')
        old, target = 'a' * 40, 'b' * 40
        state = {'head': old, 'running': True, 'tag': 'old-image', 'calls': []}
        def command(*args, **kwargs):
            state['calls'].append(args)
            if args[0] == 'git':
                sub = args[3:]
                if sub[:2] == ('remote', 'get-url'): return module.REPO
                if sub[0] == 'symbolic-ref': return 'main'
                if sub[0] == 'status': return ''
                if sub[0] == 'rev-parse': return state['head']
                if sub[0] == 'show': return json.dumps({'name': 'facadepro-website', 'version': '6.0.0'})
                if sub[0] == 'merge': state['head'] = target
                if sub[0] == 'reset': state['head'] = old
            if args[:3] == ('docker', 'image', 'tag'): state['tag'] = args[3]
            if args[0] == 'curl': return '{"ok":true,"version":"6.0.0"}'
            return ''
        def compose(*args, **kwargs):
            state['calls'].append(('compose', *args))
            if args[0] == 'ps': return 'app-container'
            if args[0] == 'build':
                if failure == 'build': raise RuntimeError('test build failure')
                state['tag'] = 'new-image'
            if args[0] == 'stop': state['running'] = False
            if args[0] == 'up': state['running'] = True
            return ''
        def inspect(_):
            return {'State': {'Running': state['running']}, 'Config': {'Labels': {'com.docker.compose.project': 'facadepro'}, 'Image': 'facadepro-app'}, 'Image': state['tag'], 'Mounts': [{'Destination': '/data', 'Type': 'volume', 'Name': 'facadepro_facadepro_data', 'Source': str(data)}]}
        def health(version=None):
            if failure == 'health' and version: raise RuntimeError('test health failure')
        real_tar_open = tarfile.open
        def archive(*args, **kwargs):
            assert not state['running'], 'backup must be quiescent'
            if failure == 'backup': raise OSError('test disk failure')
            return real_tar_open(*args, **kwargs)
        def paths(value):
            return root / 'backups' if value == '/root/facadepro-backups' else Path(value)
        def local_open(*args, **kwargs):
            return open(root / 'install.lock', 'w')
        with patch.object(module, 'APP', app), patch.object(module, 'command', command), patch.object(module, 'compose', compose), patch.object(module, 'inspect', inspect), patch.object(module, 'health', health), patch.object(module, 'Path', paths), patch.object(module, 'open', local_open, create=True), patch.object(module.tarfile, 'open', archive), patch.object(module.os, 'geteuid', lambda: 0), patch.object(module.sys, 'argv', ['update', target]), contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            try:
                module.main()
                assert failure is None
            except SystemExit as e:
                assert failure and e.code == 1
        assert state['running']
        assert state['head'] == (old if failure else target)
        assert state['tag'] == ('old-image' if failure else 'new-image')
        assert (data / 'facadepro.sqlite').read_bytes() == b'existing leads'
        assert (data / 'uploads/file').read_bytes() == b'existing attachment'
        assert all('caddy' not in str(c) and 'gateway' not in str(c) for c in state['calls'])
        if failure not in ('build', 'backup'):
            saved = next((root / 'backups').rglob('data.tar.gz'))
            with real_tar_open(saved) as stream:
                assert set(stream.getnames()) == {'facadepro.sqlite', 'secret', 'uploads', 'uploads/file'}
        print('PASS update controller:', failure or 'success')

for failure in (None, 'build', 'backup', 'health'):
    scenario(failure)
