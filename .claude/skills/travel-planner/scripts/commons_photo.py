#!/usr/bin/env python3
"""Télécharge une photo sous licence libre depuis Wikimedia Commons pour une fiche POI.

Usage :
  python3 commons_photo.py --vault <coffre> "File:Nom du fichier.jpg" "Nom exact du lieu" [--width 1600] [--force]

Affiche les lignes à copier dans la fiche :
  photo: "[[Nom exact du lieu.jpg]]"
  photo_credit: "Auteur — CC BY-SA 4.0, Wikimedia Commons"
"""
import argparse
import html
import json
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tb_common import USER_AGENT, folder, load_settings  # noqa: E402

API = "https://commons.wikimedia.org/w/api.php"
ALLOWED_HOSTS = {"upload.wikimedia.org", "thumb.wikimedia.org"}
FREE = re.compile(r"^(cc[ -]by|cc[ -]?0|cc-zero|public domain|pd\b|pd-)", re.I)
EXT = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
BAD_NAME = re.compile(r'[\\/:*?"<>|]')


def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def strip_html(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("file", help='titre Commons, ex. "File:Plaza de España (Sevilla).jpg"')
    ap.add_argument("name", help="nom exact du lieu (nom de la fiche POI)")
    ap.add_argument("--vault", default=".")
    ap.add_argument("--width", type=int, default=1600)
    ap.add_argument("--force", action="store_true", help="remplace une photo existante")
    args = ap.parse_args()

    title = args.file if args.file.startswith("File:") else "File:" + args.file
    if BAD_NAME.search(args.name):
        sys.exit(f"Nom de lieu invalide pour un fichier : {args.name}")

    q = urllib.parse.urlencode({
        "action": "query", "format": "json", "titles": title, "prop": "imageinfo",
        "iiprop": "url|mime|extmetadata", "iiurlwidth": args.width,
    })
    data = get_json(f"{API}?{q}")
    page = next(iter(data.get("query", {}).get("pages", {}).values()), {})
    info = (page.get("imageinfo") or [None])[0]
    if not info:
        sys.exit(f"Fichier introuvable sur Commons : {title}")

    meta = info.get("extmetadata", {})
    license_name = strip_html(meta.get("LicenseShortName", {}).get("value", ""))
    if not FREE.match(license_name):
        sys.exit(f"Licence non libre ou inconnue (« {license_name} ») : choisir une autre photo.")
    artist = strip_html(meta.get("Artist", {}).get("value", "")) or "Auteur inconnu"
    mime = info.get("thumbmime") or info.get("mime")
    ext = EXT.get(mime)
    if not ext:
        sys.exit(f"Format non pris en charge : {mime}")

    url = info.get("thumburl") or info.get("url")
    if urllib.parse.urlparse(url).hostname not in ALLOWED_HOSTS or not url.startswith("https://"):
        sys.exit(f"URL inattendue, téléchargement refusé : {url}")

    vault = Path(args.vault).resolve()
    dest_dir = folder(vault, load_settings(vault), "documents") / "Photos" / "POI"
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{args.name}{ext}"
    if dest.exists() and not args.force:
        sys.exit(f"Une photo existe déjà : {dest.relative_to(vault)} (utiliser --force pour la remplacer)")

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=60) as r:
        body = r.read()
    if len(body) > 15 * 1024 * 1024:
        sys.exit("Image trop lourde (> 15 Mo) : choisir une autre photo ou réduire --width.")
    dest.write_bytes(body)

    credit = f"{artist} — {license_name}, Wikimedia Commons".replace('"', "'")
    print(f"Enregistrée : {dest.relative_to(vault)} ({len(body) // 1024} Ko)")
    print(f'photo: "[[{dest.name}]]"')
    print(f'photo_credit: "{credit}"')
    return 0


if __name__ == "__main__":
    sys.exit(main())
