/* ==========================================================================
 * Trip Buddy — cœur : imports, réglages par défaut, utilitaires
 * ========================================================================== */
const obsidian = require('obsidian');
const {
  Plugin, PluginSettingTab, Setting, Modal, Notice, ItemView,
  MarkdownRenderChild, TFile, TFolder, requestUrl, normalizePath, debounce,
} = obsidian;

const VIEW_TYPE_MAP = 'trip-buddy-map';
/* Réglages du module : fichier JSON à la racine du coffre (modifiable à la main ou par un agent,
 * rechargé automatiquement). data.json n'en est plus qu'une copie de secours. */
const SETTINGS_FILE = 'trip-buddy.json';
const SETTINGS_INFO = 'Réglages du module Trip Buddy. Ce fichier peut être modifié à la main ou par un agent : '
  + 'Obsidian le recharge automatiquement. Garder un JSON valide. Détail des clés : README.md § Réglages.';
const LOCALE = 'fr-FR';
const EVT_REFRESH = 'trip-buddy:refresh';

const TILE_PRESETS = {
  osm: {
    name: 'OpenStreetMap',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19,
  },
  osmfr: {
    name: 'OSM France',
    url: 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png',
    attribution: '© OpenStreetMap France · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20, subdomains: 'abc',
  },
  topo: {
    name: 'OpenTopoMap',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · © OpenTopoMap (CC-BY-SA)',
    maxZoom: 17, subdomains: 'abc',
  },
  /* Fonds additionnels, tous utilisables sans clé d'API */
  satellite: {
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics, GIS User Community',
    maxZoom: 19,
  },
  esritopo: {
    name: 'Topographique (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '© Esri, HERE, Garmin, FAO, NOAA, USGS · © OpenStreetMap',
    maxZoom: 19,
  },
  cyclosm: {
    name: 'CyclOSM (vélo)',
    url: 'https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.cyclosm.org">CyclOSM</a> · © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 20, subdomains: 'abc',
  },
  hot: {
    name: 'OSM Humanitaire',
    url: 'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png',
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · Humanitarian OSM Team · OSM France',
    maxZoom: 19, subdomains: 'abc',
  },
};

/* Services de carte pour « Itinéraire » et « Ouvrir dans ».
 * Variables d'URL : {lat} {lon} {name} {address} {query} (nom + adresse), encodées automatiquement. */
const MAP_PROVIDERS = {
  osm: {
    label: 'OpenStreetMap', icon: '🌍',
    open: 'https://www.openstreetmap.org/?mlat={lat}&mlon={lon}#map=18/{lat}/{lon}',
    directions: 'https://www.openstreetmap.org/directions?to={lat}%2C{lon}#map=17/{lat}/{lon}',
  },
  google: {
    label: 'Google Maps', icon: '📍',
    open: 'https://www.google.com/maps/search/?api=1&query={lat}%2C{lon}',
    directions: 'https://www.google.com/maps/dir/?api=1&destination={lat}%2C{lon}&travelmode=walking',
  },
};

/* Données écrites par les skills Claude de planification (.claude/skills/travel-*),
 * mises à la corbeille par « Vider les données d'exemple ». */
const SKILL_DATA = {
  context: 'CONTEXT.md',     // contexte du voyage (skill travel-context)
  workdir: '.trip-planner',  // dossier de travail caché (skill travel-planner)
};

/* Nom et emoji donnés au voyage par « Vider les données d'exemple ». */
const NEW_TRIP = { name: 'My trip', emoji: '🧳' };

const DEFAULT_SETTINGS = {
  trip: {
    name: 'Mon voyage',
    destination: 'Destination',
    start: '',
    end: '',
    travelers: ['Moi'],
    currency: 'EUR',
    budget: 0,
    emoji: '✈️',
  },
  folders: {
    documents: '01 Documents',
    journal: '02 Journal',
    poi: '05 POI',
    programme: '06 Programme',
    guide: '08 Guide',
    templates: '99 Modèles',
  },
  files: {
    home: '00 Accueil.md',
    documents: '01 Documents/Documents.md',
    journal: '02 Journal/Journal.md',
    budget: '03 Budget/Budget.md',
    packing: '04 Packing/Packing list.md',
    pois: '05 POI/Index des POI.md',
    programme: '06 Programme/Programme.md',
    map: '07 Carte/Carte.md',
    guide: '08 Guide/Guide.md',
  },
  templates: {
    poi: 'POI.md',
    journal: 'Journal.md',
    programme: 'Programme.md',
  },
  poiCategories: [
    { id: 'monument', label: 'Monument', icon: '🏛️', color: '#c0841a' },
    { id: 'musee', label: 'Musée', icon: '🖼️', color: '#8e44ad' },
    { id: 'point-de-vue', label: 'Point de vue', icon: '🌅', color: '#e67e22' },
    { id: 'restaurant', label: 'Restaurant', icon: '🍽️', color: '#e74c3c' },
    { id: 'cafe', label: 'Café & bar', icon: '☕', color: '#a0522d' },
    { id: 'nature', label: 'Nature & parc', icon: '🌳', color: '#27ae60' },
    { id: 'randonnee', label: 'Randonnée & balade', icon: '🥾', color: '#6d4c9f' },
    { id: 'shopping', label: 'Shopping', icon: '🛍️', color: '#d81b60' },
    { id: 'quartier', label: 'Quartier', icon: '🏘️', color: '#2980b9' },
    { id: 'hebergement', label: 'Hébergement', icon: '🛏️', color: '#34495e' },
    { id: 'transport', label: 'Transport', icon: '🚉', color: '#16a085' },
  ],
  expenseCategories: [
    { id: 'transport', label: 'Transport', icon: '✈️', color: '#2980b9', budget: 0 },
    { id: 'hebergement', label: 'Hébergement', icon: '🛏️', color: '#8e44ad', budget: 0 },
    { id: 'restauration', label: 'Restauration', icon: '🍽️', color: '#e74c3c', budget: 0 },
    { id: 'activites', label: 'Activités', icon: '🎟️', color: '#f39c12', budget: 0 },
    { id: 'shopping', label: 'Shopping', icon: '🛍️', color: '#d81b60', budget: 0 },
    { id: 'divers', label: 'Divers', icon: '📦', color: '#7f8c8d', budget: 0 },
  ],
  currencies: [
    { code: 'EUR', rate: 1 },
  ],
  map: {
    tiles: 'osm',
    customUrl: '',
    lat: 48.8566,
    lon: 2.3522,
    zoom: 13,
    showTracks: true,
  },
  transit: {
    show: true,      // réseaux visibles sur les cartes (bouton 🚇)
    networks: [],    // { id, name, country, file, bbox, lines, stations, modes, fetched, enabled }
  },
  geocoder: {
    lang: 'fr',
    countryCodes: '',
  },
  openHomeOnStartup: true,
  openHomeWhenEmpty: true,
  mapLinks: {
    open: 'osm', // service pour « Ouvrir dans »
    directions: 'osm', // service pour « Itinéraire »
    custom: [], // fournisseurs ajoutés : { id, label, icon, open, directions }
  },
  display: {
    hideProperties: true, // masque le bloc « Propriétés » en tête des notes
    hideInlineTitle: false, // masque le titre affiché en haut des notes
    journalQuickAdd: true, // zone de saisie sous chaque section du journal (mode lecture)
    pageWidth: 'wide', // largeur des pages du voyage : normal | wide | full
    theme: 'default', // thème des pages du voyage : default | dark
    iconStyle: 'line', // pictogrammes de l'interface : line (traits) | emoji
    readingMode: true, // ouvre les notes en mode lecture (réglage Obsidian appliqué par le module)
    attachmentFolder: '01 Documents/Photos', // dossier des images collées ('' = laisser Obsidian décider)
    showHiddenFiles: false, // affiche les fichiers et dossiers « . » du coffre dans l'explorateur (hors .obsidian)
    hiddenExclude: '.git, .trash, .DS_Store', // noms masqués à ne jamais afficher (séparés par des virgules)
  },
  navOrder: [], // ordre des rubriques du menu principal (clés de NAV_ITEMS) ; vide = ordre par défaut
  navHidden: [], // rubriques masquées dans le menu principal (clés de NAV_ITEMS)
  autoHideSidebars: {
    enabled: true,
    delay: 10, // secondes sans interaction avant de replier une colonne
    sides: 'both', // both | left | right
  },
};

/* ------------------------------------------------------------------ utils */
const U = {
  pad2: (n) => String(n).padStart(2, '0'),

  isoDate(d) {
    if (!d) return '';
    return `${d.getFullYear()}-${U.pad2(d.getMonth() + 1)}-${U.pad2(d.getDate())}`;
  },

  /** Normalise une date (string, Date, nombre) en "YYYY-MM-DD" ou "" */
  normDate(v) {
    if (v == null || v === '') return '';
    if (v instanceof Date && !isNaN(v)) {
      return `${v.getUTCFullYear()}-${U.pad2(v.getUTCMonth() + 1)}-${U.pad2(v.getUTCDate())}`;
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${U.pad2(m[2])}-${U.pad2(m[3])}`;
    m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})/);
    if (m) return `${m[3]}-${U.pad2(m[2])}-${U.pad2(m[1])}`;
    return '';
  },

  parseISO(s) {
    const n = U.normDate(s);
    if (!n) return null;
    const [y, m, d] = n.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  todayISO: () => U.isoDate(new Date()),

  addDays(iso, n) {
    const d = U.parseISO(iso);
    if (!d) return '';
    d.setDate(d.getDate() + n);
    return U.isoDate(d);
  },

  daysBetween(a, b) {
    const da = U.parseISO(a), db = U.parseISO(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  },

  fmtDate(iso, opts) {
    const d = U.parseISO(iso);
    if (!d) return '';
    return new Intl.DateTimeFormat(LOCALE, opts).format(d);
  },
  fmtLong: (iso) => U.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  fmtMedium: (iso) => U.fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }),
  fmtShort: (iso) => U.fmtDate(iso, { day: 'numeric', month: 'short' }),
  fmtDay: (iso) => U.fmtDate(iso, { day: 'numeric' }),
  fmtWeekdayShort: (iso) => U.fmtDate(iso, { weekday: 'short' }).replace('.', ''),
  fmtMonthShort: (iso) => U.fmtDate(iso, { month: 'short' }).replace('.', ''),

  cap: (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : ''),

  fmtMoney(n, cur) {
    const v = Number(n) || 0;
    try {
      return new Intl.NumberFormat(LOCALE, {
        style: 'currency', currency: cur || 'EUR',
        maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : 2,
        minimumFractionDigits: Math.abs(v) < 1000 && Math.round(v * 100) % 100 !== 0 ? 2 : 0,
      }).format(v);
    } catch (e) {
      return `${v.toFixed(2)} ${cur || ''}`.trim();
    }
  },

  /** "1 234,50 €" → 1234.5 */
  parseAmount(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;
    let s = String(str).replace(/[^\d,.\-]/g, '');
    if (s.includes(',') && s.includes('.')) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    const v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  },

  slug(s) {
    return String(s || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '');
  },

  toBool(v) {
    if (typeof v === 'boolean') return v;
    if (v == null) return false;
    return ['true', 'yes', 'oui', 'x', '1', 'fait', 'done'].includes(String(v).trim().toLowerCase());
  },

  toNum(v) {
    if (v == null || v === '') return NaN;
    if (typeof v === 'number') return v;
    return parseFloat(String(v).replace(',', '.'));
  },

  clamp: (v, a, b) => Math.min(b, Math.max(a, v)),

  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  },

  sanitizeFileName(s) {
    return String(s || 'Sans titre').replace(/[\\/:*?"<>|#^[\]]/g, ' ').replace(/\s+/g, ' ').trim() || 'Sans titre';
  },

  /** Distance haversine en km */
  haversine(a, b) {
    if (!a || !b) return 0;
    const R = 6371;
    const toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  },

  fmtDist(km) {
    if (!isFinite(km)) return '';
    if (km < 1) return `${Math.round(km * 1000 / 10) * 10} m`;
    return `${km.toLocaleString(LOCALE, { maximumFractionDigits: 1 })} km`;
  },

  /** Temps de marche estimé (4,5 km/h, détour ×1,3) */
  fmtWalk(km) {
    const min = Math.round((km * 1.3 / 4.5) * 60);
    if (min < 60) return `${Math.max(1, min)} min`;
    return `${Math.floor(min / 60)} h ${U.pad2(min % 60)}`;
  },

  starsText(n) {
    const r = U.clamp(Math.round(Number(n) || 0), 0, 5);
    return '★'.repeat(r) + '☆'.repeat(5 - r);
  },

  /** Lit des options "clé: valeur" dans le corps d'un bloc de code */
  parseOptions(source) {
    const out = {};
    String(source || '').split('\n').forEach((line) => {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (m) out[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    });
    return out;
  },

  /** "[[Note|alias]]" → "Note" */
  linkTarget(v) {
    if (v == null) return '';
    let s = String(v).trim();
    const m = s.match(/^!?\[\[([^\]]+)\]\]$/);
    if (m) s = m[1];
    s = s.split('|')[0].split('#')[0].trim();
    return s;
  },

  storeGet(key, def) {
    try {
      const v = window.localStorage.getItem('trip-buddy:' + key);
      return v == null ? def : JSON.parse(v);
    } catch (e) { return def; }
  },
  storeSet(key, val) {
    try { window.localStorage.setItem('trip-buddy:' + key, JSON.stringify(val)); } catch (e) { /* stockage indisponible */ }
  },

  fileSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  },

  deepMerge(base, extra) {
    const out = Array.isArray(base) ? base.slice() : { ...base };
    if (!extra || typeof extra !== 'object') return out;
    for (const k of Object.keys(extra)) {
      const bv = base ? base[k] : undefined;
      const ev = extra[k];
      if (bv && typeof bv === 'object' && !Array.isArray(bv) && ev && typeof ev === 'object' && !Array.isArray(ev)) {
        out[k] = U.deepMerge(bv, ev);
      } else if (ev !== undefined) {
        out[k] = ev;
      }
    }
    return out;
  },

  /** Petit helper : bouton avec emoji + libellé */
  button(parent, label, cls, onClick, title) {
    const b = parent.createEl('button', { cls: 'tb-btn ' + (cls || ''), text: label });
    if (title) b.setAttr('title', title);
    if (onClick) b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); onClick(e); });
    return b;
  },

  /** Lien interne cliquable vers une note */
  noteLink(plugin, parent, file, text, cls, newTab) {
    const a = parent.createEl('a', { cls: 'tb-link internal-link ' + (cls || ''), text: text || file.basename, href: '#' });
    a.setAttr('data-href', file.path);
    a.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      plugin.openFile(file, newTab || e.ctrlKey || e.metaKey);
    });
    return a;
  },

  catChip(parent, cat, extraCls) {
    const c = parent.createSpan({ cls: 'tb-chip tb-cat ' + (extraCls || '') });
    c.style.setProperty('--tb-c', cat.color || '#888');
    c.createSpan({ cls: 'tb-chip-ico', text: cat.icon || '📍' });
    c.createSpan({ text: cat.label || cat.id || 'Autre' });
    return c;
  },

  progress(parent, ratio, color) {
    const bar = parent.createDiv('tb-progress');
    const fill = bar.createDiv('tb-progress-fill');
    fill.style.width = `${U.clamp(ratio || 0, 0, 1) * 100}%`;
    if (color) fill.style.background = color;
    return bar;
  },

  /** Anneau de progression SVG */
  ring(parent, ratio, label, sub, color) {
    const size = 112, stroke = 11, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const wrap = parent.createDiv('tb-ring');
    const pct = U.clamp(ratio || 0, 0, 1);
    wrap.innerHTML = `
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--tb-track)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color || 'var(--tb-accent)'}"
          stroke-width="${stroke}" stroke-linecap="round" stroke-dasharray="${c * pct} ${c}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>`;
    const txt = wrap.createDiv('tb-ring-label');
    txt.createDiv({ cls: 'tb-ring-value', text: label });
    if (sub) txt.createDiv({ cls: 'tb-ring-sub', text: sub });
    return wrap;
  },

  empty(parent, emoji, title, text) {
    const e = parent.createDiv('tb-empty');
    e.createDiv({ cls: 'tb-empty-ico', text: emoji });
    e.createDiv({ cls: 'tb-empty-title', text: title });
    if (text) e.createDiv({ cls: 'tb-empty-text', text });
    return e;
  },

  segmented(parent, options, value, onChange) {
    const seg = parent.createDiv('tb-seg');
    options.forEach(([val, label]) => {
      const b = seg.createEl('button', { text: label, cls: val === value ? 'is-active' : '' });
      b.addEventListener('click', (e) => {
        e.preventDefault();
        seg.querySelectorAll('button').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
        onChange(val);
      });
    });
    return seg;
  },
};
