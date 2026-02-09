from __future__ import annotations

import argparse
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from spell_validator import write_report


class AppHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory, **kwargs)

    def do_GET(self) -> None:
        # Fallback para index.html em rotas "virtuais" (ex: /preview)
        # para evitar 404 no ambiente de pré-visualização.
        if self.path not in ("/", "/index.html") and "." not in self.path.rsplit("/", 1)[-1]:
            self.path = "/index.html"
        return super().do_GET()


def main() -> None:
    parser = argparse.ArgumentParser(description="Spell combo validator UI")
    parser.add_argument("--xlsx", default="SpellSystem_v2_ConflictFree (1).xlsx", help="Excel source file")
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--build-only", action="store_true", help="Only build report JSON and exit")
    args = parser.parse_args()

    report_path = write_report(args.xlsx, "web/data/report.json")
    summary = json.loads(report_path.read_text(encoding="utf-8"))["summary"]
    print(f"Report generated: {report_path}")
    print(f"Summary: {summary}")

    if args.build_only:
        return

    web_dir = Path("web").resolve()
    handler = lambda *h_args, **h_kwargs: AppHandler(*h_args, directory=str(web_dir), **h_kwargs)
    server = ThreadingHTTPServer((args.host, args.port), handler)
    print(f"UI running at http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
