"""
judge0_exporter.py

Judge0 has no official Prometheus exporter. This polls Judge0's own
/workers endpoint (queue name, size, available/busy workers per queue -
this is the endpoint Judge0's own admin tooling uses internally) and
re-exposes it in Prometheus text format.

This is the metric that matters most for you: queue depth and busy-worker
count are the leading indicator of sandbox saturation, ahead of host CPU.

Env vars:
  JUDGE0_URL      - default http://judge0-server:2358 (use the container's
                     DNS name if running inside the same docker network as
                     this exporter; use localhost:2358 if running outside)
  POLL_INTERVAL_S - default 5
  PORT            - default 9235
"""

import os
import time
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import urlopen
from urllib.error import URLError

JUDGE0_URL = os.environ.get('JUDGE0_URL', 'http://judge0-server:2358')
POLL_INTERVAL_S = float(os.environ.get('POLL_INTERVAL_S', '5'))
PORT = int(os.environ.get('PORT', '9235'))

_latest_metrics_text = "# no data yet\n"
_lock = threading.Lock()


def fetch_and_render():
    global _latest_metrics_text
    lines = [
        '# HELP judge0_queue_size Number of submissions waiting in this queue',
        '# TYPE judge0_queue_size gauge',
        '# HELP judge0_workers_available Idle workers able to pick up a submission',
        '# TYPE judge0_workers_available gauge',
        '# HELP judge0_workers_busy Workers currently executing a submission (i.e. sandboxes spun up)',
        '# TYPE judge0_workers_busy gauge',
        '# HELP judge0_exporter_up Whether the last poll of Judge0 succeeded',
        '# TYPE judge0_exporter_up gauge',
    ]
    try:
        with urlopen(f'{JUDGE0_URL}/workers', timeout=5) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        # Judge0's /workers response is a list of {queue, size, available, idle...}
        # objects, one per queue (languages can have dedicated queues).
        for entry in data:
            queue = entry.get('queue', 'default')
            size = entry.get('size', 0)
            available = entry.get('available', 0)
            # busy = configured workers - available idle workers, when Judge0
            # reports a total; fall back to 0 if not present in your version.
            busy = entry.get('busy', max(0, entry.get('workers', 0) - available))
            lines.append(f'judge0_queue_size{{queue="{queue}"}} {size}')
            lines.append(f'judge0_workers_available{{queue="{queue}"}} {available}')
            lines.append(f'judge0_workers_busy{{queue="{queue}"}} {busy}')
        lines.append('judge0_exporter_up 1')
    except (URLError, TimeoutError, ValueError) as e:
        lines.append('judge0_exporter_up 0')
        lines.append(f'# error: {e}')

    with _lock:
        _latest_metrics_text = '\n'.join(lines) + '\n'


def poll_loop():
    while True:
        fetch_and_render()
        time.sleep(POLL_INTERVAL_S)


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/metrics':
            with _lock:
                body = _latest_metrics_text.encode('utf-8')
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; version=0.0.4')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format, *args):
        pass  # keep container logs quiet


if __name__ == '__main__':
    threading.Thread(target=poll_loop, daemon=True).start()
    print(f'judge0_exporter listening on :{PORT}, polling {JUDGE0_URL} every {POLL_INTERVAL_S}s')
    HTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
