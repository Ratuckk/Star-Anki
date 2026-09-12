#!/usr/bin/env python3
# Servidor estático igual ao "python -m http.server", só que sem cache nenhum. O
# SimpleHTTPRequestHandler padrao nao manda Cache-Control, so Last-Modified — navegadores podem
# aplicar cache heuristico e continuar servindo uma versao antiga do JS por bastante tempo mesmo
# depois de editar o arquivo e reiniciar o servidor. Usado por .claude/launch.json.
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8420
    HTTPServer(('', port), NoCacheHandler).serve_forever()
