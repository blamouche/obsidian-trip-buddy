#!/usr/bin/env python3
"""Contrôle la cohérence des fiches POI, des programmes et des pages du guide.

Usage :
  python3 check.py --vault <coffre> [--max-km 40]

Code de sortie 1 s'il reste des erreurs (✗). Les avertissements (⚠) sont à examiner.
"""
import argparse
import math
import re
import statistics
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tb_common import WIKILINK, folder, load_settings, read_note, to_float  # noqa: E402

errors, warnings = [], []


def err(where, msg):
    errors.append(f"✗ {where} — {msg}")


def warn(where, msg):
    warnings.append(f"⚠ {where} — {msg}")


def km(a, b):
    r = 6371.0
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * r * math.asin(math.sqrt(h))


def parse_date(v):
    try:
        return date.fromisoformat(str(v).strip())
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vault", default=".")
    ap.add_argument("--max-km", type=float, default=40.0,
                    help="distance au centre des lieux au-delà de laquelle un lieu est signalé")
    args = ap.parse_args()

    vault = Path(args.vault).resolve()
    settings = load_settings(vault)
    trip = settings.get("trip", {}) or {}
    cat_ids = {c.get("id") for c in settings.get("poiCategories", [])}
    attachments = {p.name for p in vault.rglob("*") if p.is_file() and ".trash" not in p.parts}
    notes = {p.stem for p in vault.rglob("*.md") if not {".trash", ".claude", ".agents"} & set(p.parts)}

    # --- POI
    poi_dir = folder(vault, settings, "poi")
    coords, n_poi, used_cats = {}, 0, {}
    for p in sorted(poi_dir.glob("*.md")):
        _, fm_lines, fm, body = read_note(p)
        if fm.get("type") != "poi":
            continue
        n_poi += 1
        where = f"POI « {p.stem} »"
        if not fm.get("name"):
            err(where, "propriété name vide")
        elif fm["name"] != p.stem:
            warn(where, f"name « {fm['name']} » différent du nom du fichier")
        cat = fm.get("category")
        if not cat:
            err(where, "catégorie vide")
        elif cat_ids and cat not in cat_ids:
            err(where, f"catégorie « {cat} » absente des réglages Trip Buddy")
        used_cats[cat] = used_cats.get(cat, 0) + 1
        if not fm.get("address") or "{{" in str(fm.get("address")):
            warn(where, "adresse manquante")
        lat, lon = to_float(fm.get("lat")), to_float(fm.get("lon"))
        if lat is None or lon is None:
            err(where, "coordonnées manquantes (lancer geocode.py)")
        elif not (-90 <= lat <= 90 and -180 <= lon <= 180):
            err(where, f"coordonnées invalides {lat}, {lon}")
        else:
            coords[p.stem] = (lat, lon)
        photo = fm.get("photo")
        if photo:
            m = WIKILINK.search(str(photo))
            if m and m.group(1).strip() not in attachments:
                err(where, f"photo introuvable : {m.group(1)}")
            if not fm.get("photo_credit"):
                warn(where, "photo sans crédit")
        for section in ("## 📖 Présentation", "## 💡 Infos pratiques", "## 📝 Mes notes"):
            if section not in body:
                warn(where, f"section manquante : {section}")
        if "tripbuddy-poi" not in body:
            err(where, "bloc tripbuddy-poi manquant")
        if "Horaires vérifiés" not in body:
            warn(where, "pas de ligne « Horaires vérifiés »")
        if "⚠️ à vérifier" in body:
            warn(where, "contient des points ⚠️ à vérifier")
        for m in WIKILINK.finditer(body):
            t = m.group(1).strip()
            if t not in notes and t not in attachments:
                warn(where, f"lien vers une note inexistante : [[{t}]]")

    if len(coords) >= 3:
        center = (statistics.median(c[0] for c in coords.values()),
                  statistics.median(c[1] for c in coords.values()))
        for name, c in coords.items():
            d = km(center, c)
            if d > args.max_km:
                warn(f"POI « {name} »", f"à {d:.0f} km du centre des lieux : géocodage à vérifier (ou excursion ?)")

    # --- Programmes
    prog_dir = folder(vault, settings, "programme")
    start, end = parse_date(trip.get("start")), parse_date(trip.get("end"))
    n_prog = 0
    for p in sorted(prog_dir.glob("*.md")):
        _, _, fm, body = read_note(p)
        if fm.get("type") != "programme":
            continue
        n_prog += 1
        where = f"Programme « {p.stem} »"
        d = parse_date(fm.get("date"))
        if not d:
            err(where, "date invalide")
        else:
            if p.stem != f"Programme {d.isoformat()}":
                warn(where, f"nom de fichier attendu : « Programme {d.isoformat()} »")
            if start and end and not (start <= d <= end):
                warn(where, f"date hors des dates du voyage dans les réglages ({start} → {end})")
        if not fm.get("title"):
            warn(where, "titre vide")
        pois = fm.get("pois") or []
        if not pois:
            warn(where, "aucun lieu dans pois")
        for item in pois:
            m = WIKILINK.search(str(item))
            if not m:
                err(where, f"élément de pois qui n'est pas un lien : {item}")
            elif m.group(1).strip() not in notes:
                err(where, f"lieu sans fiche : [[{m.group(1).strip()}]]")
        if "tripbuddy-program" not in body:
            err(where, "bloc tripbuddy-program manquant")
    if start and end:
        expected = (end - start).days + 1
        if n_prog and n_prog < expected:
            warn("Programmes", f"{n_prog} programme(s) pour {expected} jour(s) de voyage")

    # --- Guide
    guide_dir = folder(vault, settings, "guide")
    index_name = Path(settings.get("files", {}).get("guide", "08 Guide/Guide.md")).stem
    orders, n_guide = {}, 0
    for p in sorted(guide_dir.glob("*.md")):
        if p.stem == index_name:
            continue
        _, _, fm, body = read_note(p)
        where = f"Guide « {p.stem} »"
        if fm.get("type") != "guide":
            err(where, "type: guide manquant")
            continue
        n_guide += 1
        for k in ("guide", "order", "icon", "summary"):
            if not fm.get(k):
                err(where, f"propriété {k} manquante")
        o = fm.get("order")
        if o is not None:
            if not re.fullmatch(r"\d+", str(o)):
                err(where, f"order non entier : {o}")
            elif o in orders:
                warn(where, f"même order ({o}) que « {orders[o]} »")
            else:
                orders[o] = p.stem
        if "mode: pager" not in body:
            warn(where, "barre de pages (tripbuddy-guide, mode: pager) manquante")
        if len(body.strip()) < 600:
            warn(where, "page très courte : squelette non rempli ?")
        for m in WIKILINK.finditer(body):
            t = m.group(1).strip()
            if t not in notes and t not in attachments:
                warn(where, f"lien vers une note inexistante : [[{t}]]")

    # --- Bilan
    print(f"POI : {n_poi} · Programmes : {n_prog} · Pages du guide : {n_guide}")
    if used_cats:
        print("Lieux par catégorie : " + ", ".join(f"{k} {v}" for k, v in sorted(used_cats.items(), key=lambda x: str(x[0]))))
    for line in errors + warnings:
        print(line)
    print(f"\n{len(errors)} erreur(s), {len(warnings)} avertissement(s).")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
