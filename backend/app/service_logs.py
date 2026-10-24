"""Bounded private JSONL service diagnostics, independent of the business audit."""
from datetime import datetime, timezone
import copy
import json
import logging
from logging.handlers import RotatingFileHandler
import math
import os
from pathlib import Path
import re
import secrets
import threading
import time
from zoneinfo import ZoneInfo

from .logging_security import SecretFilter

MAX_MESSAGE = 12000
LAYOUT = {'application.jsonl': (2 * 1024 * 1024, 2), 'webhook.jsonl': (1024 * 1024, 1)}
ID_PATTERN = r'[0-9]{20}-[0-9a-f]{16}'


def event_id():
    return f'{time.time_ns():020d}-{secrets.token_hex(8)}'


class PrivateJSONHandler(RotatingFileHandler):
    def __init__(self, path, redactor, *, max_bytes, backups):
        self.redactor = redactor
        self.failed = False
        super().__init__(path, maxBytes=max_bytes, backupCount=backups, encoding='utf-8', delay=True)
        self.setLevel(logging.INFO)

    def _open(self):
        fd = os.open(self.baseFilename, os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, 'O_NOFOLLOW', 0), 0o600)
        os.fchmod(fd, 0o600)
        return os.fdopen(fd, 'a', encoding='utf-8')

    def format(self, record):
        # Work on a copy: the console handler may need the original access-log tuple.
        record = copy.copy(record)
        text = record.getMessage()
        if record.exc_info:
            text += '\n' + logging.Formatter().formatException(record.exc_info)
        elif record.exc_text:
            text += '\n' + record.exc_text
        text = self.redactor.redact(text)[:MAX_MESSAGE]
        request_id = str(getattr(record, 'request_id', ''))
        if not re.fullmatch(r'[0-9a-f]{12}', request_id): request_id = ''
        return json.dumps({'id': event_id(), 'timestamp': datetime.fromtimestamp(record.created, timezone.utc).isoformat(),
                           'level': record.levelname, 'source': self.redactor.redact(record.name)[:128], 'message': text,
                           'process': record.process, 'request_id': request_id}, ensure_ascii=True)

    def emit(self, record):
        if record.name == 'uvicorn.access':
            return  # RequestLogMiddleware records paths without queries, headers or bodies.
        seen = getattr(record, '_invoice_log_files', set())
        if self.baseFilename in seen:
            return
        record._invoice_log_files = seen | {self.baseFilename}
        self.failed = False
        super().emit(record)

    def handleError(self, record):
        # Logging must not take down the service or print the original secret-bearing record.
        self.failed = True


class ServiceLogs:
    def __init__(self, directory, values=(), *, filename='application.jsonl', max_bytes=None, backups=None):
        self.directory = Path(directory)
        self.redactor = SecretFilter()
        self.redactor.add(values)
        size, count = LAYOUT[filename]
        self.filename = filename
        self.max_bytes = max_bytes if max_bytes is not None else size
        self.backups = backups if backups is not None else count
        self.handler = None
        self.references = 0
        self.lock = threading.RLock()
        self.previous_level = None

    def start(self):
        with self.lock:
            self.references += 1
            if self.references > 1:
                return
            if self.directory.is_symlink():
                self.references = 0
                raise RuntimeError('Каталог системных логов не должен быть ссылкой')
            self.directory.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
            self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
            self.directory.chmod(0o700)
            for name, (_, backups) in LAYOUT.items():
                for suffix in ['', *[f'.{i}' for i in range(1, backups + 1)]]:
                    path = self.directory / (name + suffix)
                    if path.is_symlink():
                        self.references = 0
                        raise RuntimeError('Файл системных логов не должен быть ссылкой')
                    if path.exists():
                        path.chmod(0o600)
            self.handler = PrivateJSONHandler(self.directory / self.filename, self.redactor,
                                              max_bytes=self.max_bytes, backups=self.backups)
            self.previous_level = logging.getLogger('invoice_keeper').level
            logging.getLogger('invoice_keeper').setLevel(logging.INFO)
            for name in ('', 'uvicorn', 'uvicorn.error'):
                logging.getLogger(name).addHandler(self.handler)

    def stop(self):
        with self.lock:
            self.references = max(0, self.references - 1)
            if self.references or not self.handler:
                return
            for name in ('', 'uvicorn', 'uvicorn.error'):
                logging.getLogger(name).removeHandler(self.handler)
            self.handler.close()
            self.handler = None
            logging.getLogger('invoice_keeper').setLevel(self.previous_level)

    def read_page(self, *, timezone_name, page=1, page_size=50, level=None, source=None, search=None,
                  from_date=None, to_date=None, snapshot_id=None):
        entries = {}
        unreadable = bool(self.handler and self.handler.failed)
        if self.directory.is_symlink():
            return self._page([], page, page_size, snapshot_id or event_id(), [], timezone_name, True)
        # Only fixed filenames are read. Neither API filters nor request paths select a file.
        for name, (max_bytes, backups) in LAYOUT.items():
            for suffix in ['', *[f'.{i}' for i in range(1, backups + 1)]]:
                path = self.directory / (name + suffix)
                try:
                    if path.is_symlink():
                        unreadable = True
                        continue
                    fd = os.open(path, os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0))
                    with os.fdopen(fd, 'rb') as stream:
                        payload = stream.read(max_bytes + 128 * 1024)
                except FileNotFoundError:
                    continue  # A rotation may move the file between directory entries.
                except OSError:
                    unreadable = True
                    continue
                for line in payload.splitlines():
                    try:
                        item = json.loads(line)
                        if not isinstance(item, dict) or not re.fullmatch(ID_PATTERN, str(item.get('id', ''))):
                            continue
                        timestamp = datetime.fromisoformat(item['timestamp'])
                        timestamp.astimezone(ZoneInfo(timezone_name))
                        if timestamp.tzinfo is None or item['level'] not in ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL'):
                            continue
                        # Redact again on read, including files retained after credential rotation.
                        item = {key: item.get(key, '') for key in ('id','timestamp','level','source','message','process','request_id')}
                        item['source'] = self.redactor.redact(item['source'])[:128]
                        item['message'] = self.redactor.redact(item['message'])[:MAX_MESSAGE]
                        if not isinstance(item['process'], int): item['process'] = 0
                        item['request_id'] = str(item['request_id'])
                        if not re.fullmatch(r'[0-9a-f]{12}', item['request_id']): item['request_id'] = ''
                        entries[item['id']] = item
                    except (ValueError, KeyError, TypeError, OverflowError):
                        continue  # A partial trailing write or damaged line cannot break the view.
        snapshot_id = snapshot_id or event_id()
        rows = [r for r in entries.values() if r['id'] <= snapshot_id]
        sources = sorted({r['source'] for r in rows})
        zone = ZoneInfo(timezone_name)
        def matches(row):
            local = datetime.fromisoformat(row['timestamp']).astimezone(zone).date()
            return (not level or row['level'] == level) and (not source or row['source'] == source) and \
                   (not from_date or local >= from_date) and (not to_date or local <= to_date) and \
                   (not search or search.casefold() in (row['source'] + ' ' + row['message'] + ' ' + row['request_id']).casefold())
        return self._page(sorted((r for r in rows if matches(r)), key=lambda r:r['id'], reverse=True),
                          page, page_size, snapshot_id, sources, timezone_name, unreadable)

    @staticmethod
    def _page(rows, page, size, snapshot, sources, zone, unavailable):
        pages = max(1, math.ceil(len(rows) / size))
        page = min(page, pages)
        return {'items': rows[(page-1)*size:page*size], 'total': len(rows), 'page': page, 'pages': pages,
                'page_size': size, 'snapshot_id': snapshot, 'sources': sources, 'timezone': zone,
                'unavailable': unavailable, 'retention_bytes': 8*1024*1024}


class RequestLogMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http':
            return await self.app(scope, receive, send)
        path = scope.get('path', '')
        quiet = path.startswith(('/assets/', '/swagger-assets/')) or path in ('/healthz', '/api/v1/system-logs')
        started = time.perf_counter()
        status = 500
        request_id = secrets.token_hex(6)
        logger = logging.getLogger('invoice_keeper.http')
        async def observed_send(message):
            nonlocal status
            if message['type'] == 'http.response.start':
                status = message['status']
            await send(message)
        try:
            await self.app(scope, receive, observed_send)
        except Exception:
            logger.exception('Необработанная ошибка запроса %s %s', scope['method'], path[:200], extra={'request_id': request_id})
            raise
        finally:
            if not quiet or status >= 400:
                logger.log(logging.ERROR if status >= 500 else logging.WARNING if status >= 400 else logging.INFO,
                           '%s %s → %s · %.1f мс', scope['method'], path[:200], status,
                           (time.perf_counter()-started)*1000, extra={'request_id': request_id})
