#!/usr/bin/env python3
"""Video capture via yt-dlp (PLAN.md M13).

For `kind: video` entries the media itself is the resource — a static or even
browser-rendered page capture only preserves the player shell. This fetches
the video (size- and resolution-capped), its metadata, and thumbnail, and
emits the same package contract as the other capture scripts:

    video.<ext>        the media (primary file)
    video.info.json    yt-dlp metadata (title, uploader, upload date, ...)
    video.<img ext>    thumbnail (when available)
    manifest.json      per-file size + SHA-256, plus capture metadata

Prints the same JSON result to stdout as capture.py / capture_render.py.

Merging bestvideo+bestaudio requires ffmpeg (present on GitHub runners and
most dev machines); without it, falls back to the best pre-merged format.

Exit codes: 2 download failure.

Usage:
  python3 scripts/capture_video.py --url URL --out DIR [--title T]
                                   [--max-height 720] [--max-bytes N]
"""
import argparse
import glob
import json
import mimetypes
import os
import shutil
import subprocess
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from capture import sha256_bytes  # noqa: E402

VIDEO_EXTS = {".mp4", ".mkv", ".webm", ".mov", ".m4v"}


def run_ytdlp(url, outdir, max_height, max_bytes, timeout):
    have_ffmpeg = shutil.which("ffmpeg") is not None
    fmt = (
        f"bv*[height<={max_height}]+ba/b[height<={max_height}]/b"
        if have_ffmpeg
        else f"b[height<={max_height}]/b"
    )
    cmd = [
        sys.executable, "-m", "yt_dlp",
        url,
        "-o", os.path.join(outdir, "video.%(ext)s"),
        "-f", fmt,
        "--max-filesize", str(max_bytes),
        "--no-playlist",
        "--write-info-json",
        "--write-thumbnail",
        "--no-progress",
        "--no-warnings",
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if proc.returncode != 0:
        sys.stderr.write(proc.stdout[-2000:] + proc.stderr[-2000:])
        print(f"video capture failed: {url}: yt-dlp exit {proc.returncode}",
              file=sys.stderr)
        sys.exit(2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--title", default="")
    ap.add_argument("--max-height", type=int, default=720)
    ap.add_argument("--max-bytes", type=int, default=2_000_000_000)
    ap.add_argument("--timeout", type=int, default=1500)
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    run_ytdlp(args.url, args.out, args.max_height, args.max_bytes,
              args.timeout)

    files = sorted(
        f for f in os.listdir(args.out)
        if os.path.isfile(os.path.join(args.out, f)) and f != "manifest.json"
    )
    primary = next(
        (f for f in files if os.path.splitext(f)[1].lower() in VIDEO_EXTS),
        None,
    )
    if primary is None:
        # --max-filesize skips oversized downloads without failing.
        print("video capture failed: no media file produced "
              "(over the size cap, or the source has no downloadable video)",
              file=sys.stderr)
        sys.exit(2)

    manifest_files = []
    for name in files:
        with open(os.path.join(args.out, name), "rb") as f:
            data = f.read()
        manifest_files.append({
            "path": name,
            "size": len(data),
            "sha256": sha256_bytes(data),
            "media_type": mimetypes.guess_type(name)[0]
                          or "application/octet-stream",
        })

    captured_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    manifest = {
        "source_url": args.url,
        "final_url": args.url,
        "http_status": 200,
        "title": args.title,
        "captured_at": captured_at,
        "capture_method": "yt-dlp",
        "files": manifest_files,
    }
    manifest_bytes = json.dumps(manifest, indent=2, sort_keys=True).encode()
    with open(os.path.join(args.out, "manifest.json"), "wb") as f:
        f.write(manifest_bytes)

    json.dump({
        "captured_at": captured_at,
        "title": args.title,
        "primary_file": primary,
        "manifest_sha256": sha256_bytes(manifest_bytes),
        "file_count": len(manifest_files) + 1,
        "out_dir": args.out,
    }, sys.stdout)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
