#!/usr/bin/env python3
"""Browser-based capture for client-side-rendered pages (PLAN.md M12).

Runs browsertrix-crawler (headless Chrome, Docker) against a single page and
normalizes the result into the same package contract as capture.py:

    capture.warc.gz   full browser traffic incl. runtime requests, WARC/1.1
    page.html         the rendered primary page
    manifest.json     per-file size + SHA-256, plus capture metadata

Prints the same JSON result to stdout as capture.py, so the orchestrator
(archive-packages.js) can treat both capture paths identically.

Used for entries with `render: true` or `kind: post` — pages whose content
only exists after JavaScript runs (SPAs, social posts, CryptPad pads: the
browser gets the full URL including the #fragment, which static capture and
Wayback never see).

Requires Docker. Exit codes: 2 crawl failure, 3 page answered HTTP >= 400.

Usage:
  python3 scripts/capture_render.py --url URL --out DIR [--title T]
                                    [--timeout SECONDS]
"""
import argparse
import glob
import json
import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture import sha256_bytes  # noqa: E402

from warcio.archiveiterator import ArchiveIterator  # noqa: E402

CRAWLER_IMAGE = "webrecorder/browsertrix-crawler:1.5.4"


def run_crawl(url, workdir, timeout):
    cmd = [
        "docker", "run", "--rm",
        "--shm-size=1g",
        "-v", f"{workdir}:/crawls",
        CRAWLER_IMAGE,
        "crawl",
        "--url", url,
        "--scopeType", "page",
        "--allowHashUrls",
        "--collection", "cap",
        "--behaviors", "autoscroll,autoplay,autofetch,siteSpecific",
        "--pageExtraDelay", "5",
        "--timeout", str(timeout),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=timeout + 300)
    if proc.returncode != 0 or os.environ.get("RENDER_DEBUG"):
        sys.stderr.write(proc.stdout[-3000:] + proc.stderr[-3000:])
    if proc.returncode != 0:
        print(f"render capture failed: {url}: crawler exit {proc.returncode}",
              file=sys.stderr)
        sys.exit(2)


def concat_warcs(warc_paths, dest):
    """gzip members concatenate legally; browsertrix WARCs are per-worker."""
    with open(dest, "wb") as out:
        for p in sorted(warc_paths):
            with open(p, "rb") as f:
                shutil.copyfileobj(f, out)


def extract_primary(warc_path, url):
    """Return (html_bytes, http_status) for the primary page response."""
    best = None
    with open(warc_path, "rb") as fh:
        for record in ArchiveIterator(fh):
            if record.rec_type != "response":
                continue
            target = record.rec_headers.get_header("WARC-Target-URI") or ""
            ctype = (record.http_headers.get_header("Content-Type") or "") \
                if record.http_headers else ""
            if "html" not in ctype:
                continue
            status = int(record.http_headers.get_statuscode() or 0)
            body = record.content_stream().read()
            # Exact URL match wins (fragments never reach the server, so
            # compare without them); otherwise keep the first HTML response.
            if target.split("#")[0] == url.split("#")[0]:
                return body, status
            if best is None:
                best = (body, status)
    if best is None:
        print("render capture failed: no HTML response in WARC",
              file=sys.stderr)
        sys.exit(2)
    return best


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--timeout", type=int, default=180,
                    help="per-page crawl budget in seconds")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    workdir = tempfile.mkdtemp(prefix="aj-render-")
    try:
        run_crawl(args.url, workdir, args.timeout)
        warcs = glob.glob(
            os.path.join(workdir, "collections", "cap", "archive", "*.warc.gz"))
        if not warcs:
            for root, _dirs, files in os.walk(workdir):
                for f in files:
                    p = os.path.join(root, f)
                    print("workdir file:", p, file=sys.stderr)
                    if f.endswith(".log"):
                        lines = open(p, errors="replace").readlines()
                        sys.stderr.writelines(lines[-40:])
            print("render capture failed: crawler produced no WARCs",
                  file=sys.stderr)
            sys.exit(2)

        warc_dest = os.path.join(args.out, "capture.warc.gz")
        concat_warcs(warcs, warc_dest)

        html, status = extract_primary(warc_dest, args.url)
        if status >= 400:
            print(f"capture refused: {args.url} returned HTTP {status}",
                  file=sys.stderr)
            sys.exit(3)
        with open(os.path.join(args.out, "page.html"), "wb") as f:
            f.write(html)

        with open(warc_dest, "rb") as f:
            warc_bytes = f.read()
        manifest_files = [
            {"path": "capture.warc.gz", "size": len(warc_bytes),
             "sha256": sha256_bytes(warc_bytes),
             "media_type": "application/warc"},
            {"path": "page.html", "size": len(html),
             "sha256": sha256_bytes(html), "media_type": "text/html"},
        ]
        captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        manifest = {
            "source_url": args.url,
            "final_url": args.url,
            "http_status": status,
            "title": args.title,
            "captured_at": captured_at,
            "capture_method": "browsertrix-crawler",
            "files": manifest_files,
        }
        manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode()
        with open(os.path.join(args.out, "manifest.json"), "wb") as f:
            f.write(manifest_bytes)

        json.dump({
            "captured_at": captured_at,
            "title": args.title,
            "primary_file": "page.html",
            "manifest_sha256": sha256_bytes(manifest_bytes),
            "file_count": len(manifest_files) + 1,
            "out_dir": args.out,
        }, sys.stdout)
        sys.stdout.write("\n")
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
