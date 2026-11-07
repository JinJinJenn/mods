#!/usr/bin/env python3
"""Rebuild JinJinJenn's standalone index.html using only Python's standard library.

Run from any working directory:
    python tools/build.py          # Write index.html in the package root.
    python tools/build.py --check  # Compare bytes; do not write any files.

Source text is normalized to LF on read and written as UTF-8 bytes, so rebuilding
on Windows, macOS, and Linux produces the same output. Asset bytes are embedded
unchanged; no image decoder or encoder is required.
"""

import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import sys


ASSET_COUNT = 20
ASSET_MARKER = "__ASSET_MAP__"
GPU_MARKER = "__GPU_SOURCE__"


def read_text(path):
    """Match the original builder's universal-newline UTF-8 source reads."""
    if not path.is_file():
        raise ValueError("Missing source file: {}".format(path))
    with path.open("r", encoding="utf-8", newline=None) as source:
        return source.read()


def load_assets(package_root):
    manifest = json.loads(read_text(package_root / "source/assets-manifest.json"))
    if not isinstance(manifest, dict) or len(manifest) != ASSET_COUNT:
        raise ValueError("assets-manifest.json must contain exactly {} assets.".format(ASSET_COUNT))

    # Python preserves the manifest's asset order. Do not sort these keys.
    assets = {}
    required = {"file", "width", "height", "bounds", "bytes", "format"}
    for asset_id, meta in manifest.items():
        if not isinstance(meta, dict) or set(meta) != required:
            raise ValueError("{}: expected manifest fields {}.".format(asset_id, ", ".join(sorted(required))))
        if not isinstance(meta["file"], str) or not meta["file"]:
            raise ValueError("{}: file must be a relative path.".format(asset_id))
        relative = Path(meta["file"])
        if relative.is_absolute():
            raise ValueError("{}: asset file must be relative to the package root.".format(asset_id))
        asset_path = (package_root / relative).resolve()
        try:
            asset_path.relative_to(package_root)
        except ValueError:
            raise ValueError("{}: asset path leaves the package root.".format(asset_id))
        if not asset_path.is_file():
            raise ValueError("{}: missing asset {}.".format(asset_id, meta["file"]))
        if meta["format"] != "webp":
            raise ValueError("{}: this package expects WebP assets.".format(asset_id))
        if any(type(meta[k]) is not int or meta[k] <= 0 for k in ("width", "height", "bytes")):
            raise ValueError("{}: width, height, and bytes must be positive integers.".format(asset_id))
        bounds = meta["bounds"]
        if not isinstance(bounds, list) or len(bounds) != 4 or any(type(v) is not int for v in bounds):
            raise ValueError("{}: bounds must be [left, top, right, bottom] integers.".format(asset_id))
        left, top, right, bottom = bounds
        if not (0 <= left < right <= meta["width"] and 0 <= top < bottom <= meta["height"]):
            raise ValueError("{}: bounds must fit within the recorded image dimensions.".format(asset_id))

        payload = asset_path.read_bytes()
        if len(payload) != meta["bytes"]:
            raise ValueError("{}: asset has {} bytes; manifest records {}. Update the manifest if artwork changed.".format(asset_id, len(payload), meta["bytes"]))
        if payload[:4] != b"RIFF" or payload[8:12] != b"WEBP":
            raise ValueError("{}: file does not have a WebP header.".format(asset_id))

        # Field order is deliberate and matches the attached original HTML.
        assets[asset_id] = {
            "src": relative.as_posix(),
            "width": meta["width"],
            "height": meta["height"],
            "bounds": bounds,
            "bytes": meta["bytes"],
            "format": meta["format"],
        }
    return assets


def build_html(package_root):
    """Return the complete HTML as bytes without writing any files."""
    package_root = Path(package_root).resolve()
    template = read_text(package_root / "source/page.template.html")
    gpu = read_text(package_root / "source/gpu-scene.js")
    for marker in (ASSET_MARKER, GPU_MARKER):
        if template.count(marker) != 1:
            raise ValueError("page.template.html must contain exactly one {} marker.".format(marker))
    if "</script" in gpu.lower():
        raise ValueError("gpu-scene.js contains an embedded closing script tag.")
    if re.search(r"\b(?:fetch|import)\s*\(", gpu):
        raise ValueError("gpu-scene.js must not fetch or import external dependencies.")

    # ensure_ascii=True is the original json.dumps default. Preserve both this
    # setting and compact separators to reproduce the original HTML byte for byte.
    asset_json = json.dumps(load_assets(package_root), ensure_ascii=True, separators=(",", ":"))
    if "</script" in asset_json.lower():
        raise ValueError("Asset metadata contains an embedded closing script tag.")
    html = template.replace(ASSET_MARKER, asset_json).replace(GPU_MARKER, gpu)
    if ASSET_MARKER in html or GPU_MARKER in html:
        raise ValueError("A self-contained build marker was left unresolved.")
    if re.search(r"<script[^>]+src\s*=", html, re.I):
        raise ValueError("The page contains an external script dependency.")
    if re.search(r"<link[^>]+(?:stylesheet|preload)", html, re.I):
        raise ValueError("The page contains an external stylesheet or preload dependency.")
    return html.encode("utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--check", action="store_true", help="Compare rebuilt bytes with index.html without writing any files.")
    args = parser.parse_args()
    package_root = Path(__file__).resolve().parents[1]
    target = package_root / "index.html"
    try:
        html = build_html(package_root)
        digest = hashlib.sha256(html).hexdigest()
        if args.check:
            if not target.is_file():
                raise ValueError("Missing index.html. Run the builder without --check to create it.")
            existing = target.read_bytes()
            if existing != html:
                raise ValueError("index.html differs from the rebuilt source. No files were changed.\nExisting SHA-256: {}\nRebuilt  SHA-256: {}".format(hashlib.sha256(existing).hexdigest(), digest))
            action = "Verified"
        else:
            # Explicit bytes prevent Windows text-mode CRLF conversion.
            target.write_bytes(html)
            action = "Built"
        print("{} index.html: {} bytes, {} linked assets in source/assets/.".format(action, len(html), ASSET_COUNT))
        print("SHA-256: {}".format(digest))
        return 0
    except (OSError, ValueError) as error:
        print("Build failed: {}".format(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
