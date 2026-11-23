#!/usr/bin/env python3
"""Géolocalise les fiches POI (lat/lon) via Nominatim (OpenStreetMap).

Respecte la politique d'usage de Nominatim : une requête par seconde au plus **pour tout le coffre**,
même quand plusieurs sous-agents lancent le script en même temps (verrou partagé dans .trip-planner/),
User-Agent explicite, aucune donnée personnelle envoyée (seulement nom et adresse des lieux).

Usage :
  python3 geocode.py --vault <coffre> [--only "Nom 1" "Nom 2"] [--force] [--context "Séville, Espagne"]
  python3 geocode.py --vault <coffre> --set "Nom du lieu" <lat> <lon>     # coordonnées trouvées ailleurs
Options : --dry-run (n'écrit rien), --max-km 40 (alerte si le point est loin des autres lieux).
"""
import argparse
import json
import math
import statistics
import sys
import time
import urllib.parse
import urllib.request
from contextlib import contextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from tb_common import USER_AGENT, folder, load_settings, read_note, to_float  # noqa: E402

try:
    import fcntl
except ImportError:  # Windows : limitation au seul processus courant
    fcntl = None

ENDPOINT = "https://nominatim.openstreetmap.org/search"
MIN_INTERVAL = 1.1
_state = {"stamp": None, "last": 0.0}


@contextmanager
def throttle():
    """Garantit MIN_INTERVAL secondes entre deux requêtes, tous processus confondus."""
    stamp = _state["stamp"]
    if fcntl is None or stamp is None:
        wait = MIN_INTERVAL - (time.time() - _state["last"])
        if wait > 0:
            time.sleep(wait)
        try:
            yield
        finally:
            _state["last"] = time.time()
        return
    with open(stamp, "a+") as f:
        fcntl.flock(f, fcntl.LOCK_EX)  # les autres processus attendent ici
        try:
            f.seek(0)
            last = to_float(f.read()) or 0.0
            wait = MIN_INTERVAL - (time.time() - last)
            if wait > 0:
                time.sleep(wait)
            try:
                yield
            finally:
                f.seek(0)
                f.truncate()
                f.write(str(time.time()))
                f.flush()
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def nominatim(query: str):
    url = ENDPOINT + "?" + urllib.parse.urlencode(
        {"q": query, "format": "jsonv2", "limit": 1, "accept-language": "fr"}
    )
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    res = []
    with throttle():
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                res = json.load(r)
        except Exception as e:  # réseau, quota…
            print(f"   ! erreur réseau pour « {query} » : {e}", file=sys.stderr)
    if res:
        return float(res[0]["lat"]), float(res[0]["lon"]), res[0].get("display_name", "")
    return None


def queries_for(fm: dict, context: str):
    name = (fm.get("name") or "").strip()
    address = (fm.get("address") or "").strip()
    qs = []
    if address and "{{" not in address:
        if name:
            qs.append(f"{name}, {address}")  # le lieu lui-même plutôt que le numéro de rue
        qs.append(address)
    if name:
        qs.append(f"{name}, {context}" if context else name)
    seen, out = set(), []
    for q in qs:
        if q not in seen:
            seen.add(q)
            out.append(q)
    return out


def write_coords(path: Path, lat: float, lon: float):
    text = path.read_text(encoding="utf-8")  # relu juste avant écriture : un autre agent peut l'avoir modifié
    lines = text.split("\n")
    end = next(i for i in range(1, len(lines)) if lines[i].strip() == "---")
    new = {"lat": f"lat: {lat:.6f}", "lon": f"lon: {lon:.6f}"}
    found = set()
    for i in range(1, end):
        for k in new:
            if lines[i].startswith(f"{k}:"):
                lines[i] = new[k]
                found.add(k)
    missing = [new[k] for k in ("lat", "lon") if k not in found]
    if missing:
        anchor = next((i for i in range(1, end) if lines[i].startswith("address:")), end - 1)
        lines[anchor + 1:anchor + 1] = missing
    path.write_text("\n".join(lines), encoding="utf-8")


def km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--vault", default=".", help="racine du coffre")
    ap.add_argument("--context", default="", help="ville et pays ajoutés aux recherches par nom")
    ap.add_argument("--only", nargs="*", help="noms des fiches (sans .md) à traiter")
    ap.add_argument("--force", action="store_true", help="regéocode aussi les fiches qui ont déjà des coordonnées")
    ap.add_argument("--set", nargs=3, metavar=("NOM", "LAT", "LON"), help="écrit des coordonnées trouvées ailleurs")
    ap.add_argument("--max-km", type=float, default=40.0, help="alerte si le point est à plus de N km du centre des lieux")
    ap.add_argument("--dry-run", action="store_true", help="n'écrit rien, affiche seulement")
    args = ap.parse_args()

    vault = Path(args.vault).resolve()
    settings = load_settings(vault)
    poi_dir = folder(vault, settings, "poi")
    context = args.context or (settings.get("trip", {}) or {}).get("destination", "")
    work = vault / ".trip-planner"
    if fcntl is not None:
        work.mkdir(exist_ok=True)
        _state["stamp"] = work / ".nominatim-lock"

    notes, located = [], {}
    for p in sorted(poi_dir.glob("*.md")):
        _, _, fm, _ = read_note(p)
        if fm.get("type") != "poi":
            continue
        notes.append((p, fm))
        lat, lon = to_float(fm.get("lat")), to_float(fm.get("lon"))
        if lat is not None and lon is not None:
            located[p.stem] = (lat, lon)

    def far(name, point):
        others = [c for n, c in located.items() if n != name]
        if len(others) < 3:
            return ""
        center = (statistics.median(c[0] for c in others), statistics.median(c[1] for c in others))
        d = km(center, point)
        return f"  ⚠ à {d:.0f} km des autres lieux : vérifier" if d > args.max_km else ""

    if args.set:
        name, lat, lon = args.set[0], to_float(args.set[1]), to_float(args.set[2])
        p = poi_dir / f"{name}.md"
        if not p.exists():
            sys.exit(f"Fiche introuvable : {p.relative_to(vault)}")
        if lat is None or lon is None or not (-90 <= lat <= 90 and -180 <= lon <= 180):
            sys.exit("Coordonnées invalides : latitude puis longitude, en degrés décimaux (ex. 37.3772 -5.9869).")
        if not args.dry_run:
            write_coords(p, lat, lon)
        print(f"✓ {name} → {lat:.6f}, {lon:.6f} (saisie manuelle){far(name, (lat, lon))}")
        return 0

    if args.only:
        known = {p.stem for p, _ in notes}
        for n in args.only:
            if n not in known:
                print(f"✗ {n} — fiche introuvable dans « {poi_dir.relative_to(vault)} »")
    todo = [(p, fm) for p, fm in notes
            if (not args.only or p.stem in args.only)
            and (args.force or p.stem not in located)]

    print(f"{len(todo)} fiche(s) à géolocaliser.")
    ok, failed, doubtful = 0, [], []
    for p, fm in todo:
        hit = None
        for q in queries_for(fm, context):
            hit = nominatim(q)
            if hit:
                break
        if not hit:
            failed.append(p.stem)
            print(f"✗ {p.stem} — introuvable")
            continue
        lat, lon, label = hit
        warning = far(p.stem, (lat, lon))
        if warning:
            doubtful.append(p.stem)
        print(f"✓ {p.stem} → {lat:.6f}, {lon:.6f}  ({label[:100]}){warning}")
        if not args.dry_run:
            write_coords(p, lat, lon)
        located[p.stem] = (lat, lon)
        ok += 1

    print(f"\n{ok} géolocalisée(s), {len(failed)} échec(s), {len(doubtful)} douteuse(s).")
    if failed or doubtful:
        print("Pour chacune : trouver les coordonnées exactes (site officiel, Wikipédia, OpenStreetMap) puis")
        print('  python3 geocode.py --vault . --set "Nom du lieu" <lat> <lon>')
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
