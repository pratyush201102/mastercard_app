#!/usr/bin/env python3
import csv
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
BASE_DIR = Path(__file__).resolve().parent
DEFAULT_CSV = BASE_DIR / "davidson_county_ranked_shap_data.csv"


def load_rows(csv_path: Path):
  if not csv_path.exists():
    raise FileNotFoundError(f"CSV not found: {csv_path}")

  rows = []
  with csv_path.open("r", encoding="utf-8", newline="") as handle:
    reader = csv.DictReader(handle)
    for row in reader:
      if not row:
        continue
      tract = (row.get("Tract") or "").strip()
      insured = row.get("Health Insurance Coverage Tract, %")
      if not tract or insured is None:
        continue
      rows.append(row)

  return rows


class AppHandler(SimpleHTTPRequestHandler):
  def __init__(self, *args, **kwargs):
    super().__init__(*args, directory=str(BASE_DIR), **kwargs)

  def do_GET(self):
    parsed = urlparse(self.path)
    if parsed.path == "/api/tract-data":
      self._handle_tract_data()
      return

    if parsed.path == "/api/health":
      self._send_json({"ok": True})
      return

    super().do_GET()

  def _handle_tract_data(self):
    try:
      rows = load_rows(DEFAULT_CSV)
      self._send_json({"rows": rows, "count": len(rows)})
    except Exception as error:
      self.send_response(500)
      self.send_header("Content-Type", "application/json; charset=utf-8")
      self.end_headers()
      payload = {"error": str(error)}
      self.wfile.write(json.dumps(payload).encode("utf-8"))

  def _send_json(self, payload):
    data = json.dumps(payload).encode("utf-8")
    self.send_response(200)
    self.send_header("Content-Type", "application/json; charset=utf-8")
    self.send_header("Content-Length", str(len(data)))
    self.end_headers()
    self.wfile.write(data)


def main():
  os.chdir(BASE_DIR)
  server = HTTPServer((HOST, PORT), AppHandler)
  print(f"Serving app on http://{HOST}:{PORT}")
  server.serve_forever()


if __name__ == "__main__":
  main()
