"""Outils partagés par les scripts du skill travel-planner (sans dépendance externe)."""
import json
import re
from pathlib import Path

DEFAULT_FOLDERS = {
    "documents": "01 Documents",
    "poi": "05 POI",
    "programme": "06 Programme",
    "guide": "08 Guide",
}

USER_AGENT = "TripBuddyPlanner/1.0 (Obsidian travel vault helper)"


SETTINGS_FILE = "trip-buddy.json"  # réglages du module, à la racine du coffre


def load_settings(vault: Path) -> dict:
    """Réglages Trip Buddy : trip-buddy.json, sinon la copie de secours data.json du plugin."""
    for p in (vault / SETTINGS_FILE, vault / ".obsidian" / "plugins" / "trip-buddy" / "data.json"):
        if p.exists():
            try:
                with p.open(encoding="utf-8") as f:
                    return json.load(f)
            except json.JSONDecodeError as e:
                print(f"⚠ {p.name} illisible ({e}) : réglages par défaut utilisés")
    return {}


def folder(vault: Path, settings: dict, key: str) -> Path:
    return vault / settings.get("folders", {}).get(key, DEFAULT_FOLDERS[key])


def split_frontmatter(text: str):
    """Renvoie (lignes du frontmatter, reste du texte) ou (None, texte)."""
    if not text.startswith("---"):
        return None, text
    lines = text.split("\n")
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            return lines[1:i], "\n".join(lines[i + 1:])
    return None, text


def _scalar(v: str):
    v = v.strip()
    if " #" in v and not v.startswith(('"', "'")):
        v = v.split(" #", 1)[0].strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
        return v[1:-1]
    return v


def parse_frontmatter(lines) -> dict:
    """Parseur minimal : clés de premier niveau, scalaires et listes simples."""
    data, key = {}, None
    for line in lines or []:
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        m = re.match(r"^([A-Za-z_][\w-]*):(.*)$", line)
        if m:
            key, rest = m.group(1), m.group(2).strip()
            if rest.startswith("[") and rest.endswith("]"):
                data[key] = [_scalar(x) for x in rest[1:-1].split(",") if x.strip()]
            else:
                data[key] = _scalar(rest) if rest else None
            continue
        m = re.match(r"^\s+-\s*(.*)$", line)
        if m and key:
            if not isinstance(data.get(key), list):
                data[key] = []
            data[key].append(_scalar(m.group(1)))
    return data


def read_note(path: Path):
    text = path.read_text(encoding="utf-8")
    fm_lines, body = split_frontmatter(text)
    return text, fm_lines, parse_frontmatter(fm_lines), body


def to_float(v):
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


WIKILINK = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]")
