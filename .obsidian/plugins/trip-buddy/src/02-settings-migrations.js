/* ==========================================================================
 * Trip Buddy — version des réglages : migrations et contrôle des types
 *
 * trip-buddy.json porte un numéro `settingsVersion`. Au chargement (et quand le fichier est
 * modifié pendant qu'Obsidian est ouvert), les migrations plus récentes que ce numéro sont
 * appliquées dans l'ordre au contenu brut du fichier, AVANT la fusion avec DEFAULT_SETTINGS ;
 * puis chaque valeur est contrôlée par rapport au type de sa valeur par défaut. Si quelque
 * chose a changé, le fichier est réécrit.
 *
 * Ajouter une migration (nouveau réglage renommé, format modifié, catégorie par défaut ajoutée…) :
 *   1. incrémenter SETTINGS_VERSION ;
 *   2. ajouter { version, label, run(raw) } à la fin de SETTINGS_MIGRATIONS.
 * Un simple nouveau réglage n'a pas besoin de migration : sa valeur par défaut s'applique seule.
 * Les migrations doivent être idempotentes : un fichier réécrit sans settingsVersion les rejoue toutes.
 * ========================================================================== */
const SETTINGS_VERSION = 1;

const SETTINGS_MIGRATIONS = [
  {
    version: 1,
    label: 'thème « Moleskine » retiré : retour au thème par défaut',
    run(raw) {
      const d = raw.display;
      if (d && typeof d === 'object' && d.theme !== undefined && !['default', 'dark'].includes(d.theme)) d.theme = 'default';
    },
  },
  // Exemples pour les prochaines versions :
  // { version: 2, label: 'display.wide → display.pageWidth', run: (raw) => SettingsMigration.rename(raw, 'display.wide', 'display.pageWidth') },
  // { version: 3, label: 'nouvelle catégorie « Plage »', run: (raw) => SettingsMigration.addDefaultItem(raw, 'poiCategories', 'plage') },
];

const SettingsMigration = {
  isPlain: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
  clone: (v) => JSON.parse(JSON.stringify(v)),

  get(obj, path) {
    return path.split('.').reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
  },
  set(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    for (const k of keys.slice(0, -1)) {
      if (!SettingsMigration.isPlain(o[k])) o[k] = {};
      o = o[k];
    }
    o[keys[keys.length - 1]] = value;
  },
  remove(obj, path) {
    const keys = path.split('.');
    const parent = SettingsMigration.get(obj, keys.slice(0, -1).join('.')) || (keys.length === 1 ? obj : null);
    if (parent && typeof parent === 'object') delete parent[keys[keys.length - 1]];
  },

  /** Renomme un réglage (chemin « a.b.c ») ; ne remplace pas une valeur déjà présente à la nouvelle place */
  rename(raw, from, to) {
    const v = SettingsMigration.get(raw, from);
    if (v === undefined) return;
    if (SettingsMigration.get(raw, to) === undefined) SettingsMigration.set(raw, to, v);
    SettingsMigration.remove(raw, from);
  },

  /** Ajoute à une liste personnalisée (poiCategories, expenseCategories…) l'élément par défaut `id`
   *  s'il n'y est pas. Sans liste dans le fichier, les valeurs par défaut s'appliquent déjà. */
  addDefaultItem(raw, listKey, id) {
    const list = raw[listKey];
    if (!Array.isArray(list) || list.some((x) => x && x.id === id)) return;
    const def = (DEFAULT_SETTINGS[listKey] || []).find((x) => x && x.id === id);
    if (def) list.push(SettingsMigration.clone(def));
  },

  /** Applique les migrations manquantes au contenu brut ; renvoie { from, to, done } */
  migrate(raw) {
    const from = Number(raw.settingsVersion) || 0;
    const done = [];
    for (const m of SETTINGS_MIGRATIONS) {
      if (m.version <= from) continue;
      try {
        m.run(raw);
        done.push(`${m.version} : ${m.label}`);
      } catch (e) {
        console.error(`[Trip Buddy] migration des réglages ${m.version}`, e);
      }
    }
    // un fichier écrit par une version plus récente du module garde son numéro
    const to = Math.max(from, SETTINGS_VERSION);
    raw.settingsVersion = to;
    return { from, to, done };
  },

  /** Contrôle récursif des types par rapport aux valeurs par défaut ; corrige sur place.
   *  Renvoie les chemins corrigés. Les clés absentes des valeurs par défaut ne sont pas touchées. */
  sanitize(obj, defs, path = '', fixes = []) {
    const M = SettingsMigration;
    for (const k of Object.keys(defs)) {
      const d = defs[k];
      const v = obj[k];
      const p = path ? `${path}.${k}` : k;
      if (v === undefined || d === null || d === undefined) continue;
      if (M.isPlain(d)) {
        if (!M.isPlain(v)) { obj[k] = M.clone(d); fixes.push(p); } else M.sanitize(v, d, p, fixes);
      } else if (Array.isArray(d)) {
        if (Array.isArray(v)) continue;
        // « Camille, Thomas » au lieu de ["Camille", "Thomas"] : on découpe plutôt que de perdre la valeur
        obj[k] = typeof v === 'string' && d.every((x) => typeof x === 'string')
          ? v.split(',').map((x) => x.trim()).filter(Boolean)
          : M.clone(d);
        fixes.push(p);
      } else if (typeof d === 'number') {
        if (typeof v === 'number' && Number.isFinite(v)) continue;
        const n = typeof v === 'string' && v.trim() !== '' ? Number(v.replace(/\s/g, '').replace(',', '.')) : NaN;
        obj[k] = Number.isFinite(n) ? n : d;
        fixes.push(p);
      } else if (typeof d === 'boolean') {
        if (typeof v === 'boolean') continue;
        obj[k] = v === 'true' ? true : v === 'false' ? false : d;
        fixes.push(p);
      } else if (typeof d === 'string') {
        if (typeof v === 'string') continue;
        obj[k] = typeof v === 'number' ? String(v) : d;
        fixes.push(p);
      }
    }
    return fixes;
  },
};
