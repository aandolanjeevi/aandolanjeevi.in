#!/usr/bin/env python3
"""Capture a resource into a durable package: WARC + primary file + manifest.

Part of PLAN.md M8 — the self-hosted backup copy that survives even if the
Internet Archive item is taken down. Produces, in --out:

    capture.warc.gz   the page and its assets as a WARC/1.1 record set
    <primary file>    the raw page (page.html) or the file itself (PDF/binary)
    manifest.json     per-file size + SHA-256, plus capture metadata

Prints a JSON result to stdout: captured_at, title, manifest_sha256, files.

Dependencies: warcio, requests (pip install). Portable (no wget/yt-dlp).

Usage:
  python3 scripts/capture.py --url URL --out DIR [--title T]
                             [--max-assets N] [--max-bytes B]
"""
import argparse
import hashlib
import io
import json
import mimetypes
import os
import sys
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse

import requests
from warcio.statusandheaders import StatusAndHeaders
from warcio.warcwriter import WARCWriter

UA = ("Mozilla/5.0 (compatible; aandolanjeevi-archiver/1.0; "
      "+https://aandolanjeevi.in)")


class AssetCollector(HTMLParser):
    """Collect asset URLs referenced by a page (img/script/link/source)."""

    def __init__(self):
        super().__init__()
        self.assets = []

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("img", "script", "source") and a.get("src"):
            self.assets.append(a["src"])
        elif tag == "link" and a.get("href") and (
            "stylesheet" in (a.get("rel") or "") or a.get("as") == "style"
        ):
            self.assets.append(a["href"])


def sanitized_headers(resp):
    """HTTP headers for the WARC, minus ones that fight the decoded body."""
    drop = {"content-encoding", "transfer-encoding", "content-length"}
    headers = [(k, v) for k, v in resp.headers.items() if k.lower() not in drop]
    headers.append(("Content-Length", str(len(resp.content))))
    return headers


def write_response_record(writer, resp):
    status_line = f"{resp.status_code} {resp.reason}"
    http_headers = StatusAndHeaders(status_line, sanitized_headers(resp),
                                    protocol="HTTP/1.1")
    record = writer.create_warc_record(
        resp.url, "response",
        payload=io.BytesIO(resp.content),
        http_headers=http_headers,
    )
    writer.write_record(record)


def primary_filename(url, content_type):
    path = urlparse(url).path
    base = os.path.basename(path)
    if "html" in content_type or not base or "." not in base:
        return "page.html"
    return base


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--max-assets", type=int, default=25)
    ap.add_argument("--max-bytes", type=int, default=25_000_000)
    ap.add_argument("--asset-budget", type=int, default=60,
                    help="wall-clock seconds for fetching assets before stopping")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    session = requests.Session()
    session.headers["User-Agent"] = UA

    # Fetch the main resource first so a failure leaves no half-written WARC.
    try:
        main_resp = session.get(args.url, timeout=(10, 30), allow_redirects=True)
    except requests.RequestException as e:
        print(f"capture failed: {args.url}: {e}", file=sys.stderr)
        sys.exit(2)
    if main_resp.status_code >= 400:
        print(f"capture refused: {args.url} returned HTTP {main_resp.status_code}",
              file=sys.stderr)
        sys.exit(3)

    warc_path = os.path.join(args.out, "capture.warc.gz")
    files = []  # (filename, bytes) for the manifest

    with open(warc_path, "wb") as fh:
        writer = WARCWriter(fh, gzip=True)
        write_response_record(writer, main_resp)

        content_type = main_resp.headers.get("Content-Type", "")
        primary = primary_filename(main_resp.url, content_type)
        with open(os.path.join(args.out, primary), "wb") as pf:
            pf.write(main_resp.content)
        files.append((primary, main_resp.content))

        if "html" in content_type:
            collector = AssetCollector()
            try:
                collector.feed(main_resp.text)
            except Exception:
                pass
            seen, count = set(), 0
            deadline = time.monotonic() + args.asset_budget
            for ref in collector.assets:
                if count >= args.max_assets or time.monotonic() > deadline:
                    break
                asset_url = urljoin(main_resp.url, ref)
                if asset_url in seen or urlparse(asset_url).scheme not in ("http", "https"):
                    continue
                seen.add(asset_url)
                try:
                    # (connect, read) timeouts bound each fetch; the deadline
                    # above bounds the whole asset phase.
                    ar = session.get(asset_url, timeout=(5, 8))
                    if len(ar.content) > args.max_bytes:
                        continue
                    write_response_record(writer, ar)
                    count += 1
                except requests.RequestException:
                    continue

    # Manifest with per-file hashes (WARC included).
    with open(warc_path, "rb") as wf:
        warc_bytes = wf.read()
    manifest_files = []
    for name, data in [("capture.warc.gz", warc_bytes)] + files:
        guessed = mimetypes.guess_type(name)[0] or "application/octet-stream"
        manifest_files.append({
            "path": name,
            "size": len(data),
            "sha256": sha256_bytes(data),
            "media_type": guessed,
        })

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "source_url": args.url,
        "final_url": main_resp.url,
        "http_status": main_resp.status_code,
        "title": args.title,
        "captured_at": captured_at,
        "files": manifest_files,
    }
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode()
    with open(os.path.join(args.out, "manifest.json"), "wb") as mf:
        mf.write(manifest_bytes)

    # The package hash commits to every file via the manifest.
    manifest_sha256 = sha256_bytes(manifest_bytes)

    json.dump({
        "captured_at": captured_at,
        "title": args.title,
        "primary_file": primary,
        "manifest_sha256": manifest_sha256,
        "file_count": len(manifest_files) + 1,  # + manifest.json
        "out_dir": args.out,
    }, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
