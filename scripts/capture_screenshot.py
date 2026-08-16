#!/usr/bin/env python3
"""Screenshot capture for interactive entries (PLAN.md G7).

Runs browsertrix-crawler with --screenshot view (rendered viewport of the
page, stored by the crawler as a WARC resource record), extracts the image,
and writes it as webp (via ffmpeg; falls back to png when ffmpeg is absent).

Requires Docker. Exit code 2 on any failure.

Usage:
  python3 scripts/capture_screenshot.py --url URL --out FILE.webp
                                        [--timeout SECONDS]
"""
import argparse
import glob
import os
import shutil
import subprocess
import sys
import tempfile

from warcio.archiveiterator import ArchiveIterator

CRAWLER_IMAGE = "webrecorder/browsertrix-crawler:1.5.4"


def run_crawl(url, workdir, timeout):
    cmd = [
        "docker", "run", "--rm",
        "--shm-size=1g",
        "-v", f"{workdir}:/crawls",
        CRAWLER_IMAGE,
        "crawl",
        "--url", url,
        "--scopeType", "page-spa",
        "--allowHashUrls",
        "--screenshot", "view",
        "--collection", "cap",
        "--behaviors", "autoscroll,autoplay,autofetch,siteSpecific",
        "--pageExtraDelay", "5",
        "--timeout", str(timeout),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True,
                          timeout=timeout + 300)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-2000:] + proc.stderr[-2000:])
        print(f"screenshot failed: {url}: crawler exit {proc.returncode}",
              file=sys.stderr)
        sys.exit(2)


def extract_screenshot(warc_paths):
    """Return (bytes, content_type) of the viewport screenshot record."""
    fallback = None
    for path in sorted(warc_paths):
        with open(path, "rb") as fh:
            for record in ArchiveIterator(fh):
                if record.rec_type != "resource":
                    continue
                target = record.rec_headers.get_header("WARC-Target-URI") or ""
                ctype = record.rec_headers.get_header("Content-Type") or ""
                if not ctype.startswith("image/"):
                    continue
                body = record.content_stream().read()
                if target.startswith("urn:view:"):
                    return body, ctype
                fallback = (body, ctype)
    if fallback:
        return fallback
    print("screenshot failed: no image resource record in WARCs",
          file=sys.stderr)
    sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--timeout", type=int, default=180)
    args = ap.parse_args()

    workdir = tempfile.mkdtemp(prefix="aj-shot-")
    try:
        run_crawl(args.url, workdir, args.timeout)
        warcs = glob.glob(
            os.path.join(workdir, "collections", "cap", "archive", "*.warc.gz"))
        image, _ctype = extract_screenshot(warcs)

        os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
        raw = os.path.join(workdir, "shot.png")
        with open(raw, "wb") as f:
            f.write(image)

        if args.out.endswith(".webp") and shutil.which("ffmpeg"):
            subprocess.run(
                ["ffmpeg", "-y", "-loglevel", "error", "-i", raw,
                 "-quality", "80", args.out],
                check=True, timeout=120,
            )
        else:
            # No ffmpeg (or non-webp target): ship the raw image as-is.
            shutil.copyfile(raw, args.out if not args.out.endswith(".webp")
                            else args.out[:-5] + ".png")
        print(args.out)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    main()
