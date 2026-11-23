/* ==========================================================================
 * Trip Buddy — export du voyage en un seul PDF (A4)
 * Couverture, sommaire cliquable, puis le contenu du voyage : programme jour
 * par jour, lieux visités, journal, carte des lieux visités, photos, budget
 * et documents joints (PDF reproduits en annexe). Les pages de documentation
 * du coffre (accueil, mode d'emploi, guide, modèles…) ne sont pas exportées.
 * Réutilise les polices, le chargement d'images et la carte du carnet (BookletBuilder).
 * ========================================================================== */
const EXPORT_DEFAULTS = {
  font: 'moderne',
  // sections
  programme: true,     // programme jour par jour
  places: true,        // lieux visités
  journal: true,       // journal
  map: true,           // carte des lieux visités (connexion requise pour le fond de carte)
  photos: true,        // galerie des photos du voyage
  budget: true,        // budget : synthèse par catégorie et détail des dépenses
  attachments: true,   // documents joints (PDF reproduits en annexe)
  // options
  toc: true,           // sommaire
  properties: true,    // propriétés des notes (catégorie, adresse, date…)
  images: true,        // photos intégrées aux notes (lieux, journal)
  allPlaces: false,    // inclure aussi les lieux non visités
  pageBreak: false,    // chaque note commence sur une nouvelle page
};
const EXPORT_SECTIONS = [
  ['programme', 'Programme', 'Programme jour par jour'],
  ['places', 'Lieux visités', 'Lieux visités'],
  ['journal', 'Journal', 'Journal'],
  ['map', 'Carte', 'Carte des lieux visités (connexion requise)'],
  ['photos', 'Photos', 'Photos du voyage'],
  ['budget', 'Budget', 'Budget (synthèse et détail)'],
  ['attachments', 'Documents joints', 'Documents joints (PDF en annexe)'],
];

const EX = {
  MM: 72 / 25.4,
  W: 595.28, H: 841.89, // A4 portrait
};

/* Nettoyage des caractères pour les polices (comme bkText, sans rogner les espaces) */
function exClean(s) {
  if (s == null) return '';
  const t = String(s).normalize('NFC')
    .replace(/[    ]/g, ' ')
    .replace(/[→⟶➜➔]/g, '–').replace(/[←⟵]/g, '–').replace(/↔/g, '–').replace(/≈/g, '~').replace(/×/g, 'x')
    .replace(/≥/g, '>=').replace(/≤/g, '<=').replace(/−/g, '-').replace(/ᵉ/g, 'e').replace(/ʳ/g, 'r')
    .replace(/[​-‍️]/g, '');
  let out = '';
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch) || ch === '\n' || ch === '\t') out += ch === '\t' ? ' ' : ch;
  }
  return out;
}

/** Texte inline Markdown → segments { text, b, i, code, href, target } */
function exInline(src) {
  const runs = [];
  let b = false, it = false, buf = '';
  const s = String(src || '');
  const push = (text, extra = {}) => { if (text) runs.push({ text, b, i: it, ...extra }); };
  const flush = () => { push(buf); buf = ''; };
  const strip = (x) => x.replace(/(\*\*|__|\*|~~|==|`)/g, '');
  let k = 0;
  while (k < s.length) {
    const rest = s.slice(k);
    let m;
    if ((m = rest.match(/^`([^`]+)`/))) { flush(); push(m[1], { code: true }); k += m[0].length; continue; }
    if ((m = rest.match(/^!\[\[[^\]]*\]\]/)) || (m = rest.match(/^!\[[^\]]*\]\([^)]*\)/))) { k += m[0].length; continue; }
    if ((m = rest.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/))) {
      flush();
      const target = m[1].trim();
      const label = m[2] ? m[2] : target.split('#').filter(Boolean).join(' › ').replace(/\.md$/i, '').split('/').pop();
      push(strip(label), { target });
      k += m[0].length; continue;
    }
    if ((m = rest.match(/^\[([^\]]+)\]\(<?([^)\s>]+)>?(?:\s+"[^"]*")?\)/))) {
      flush();
      const url = m[2];
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) push(strip(m[1]), { href: url });
      else push(strip(m[1]), { target: decodeURI(url) });
      k += m[0].length; continue;
    }
    if ((m = rest.match(/^<(https?:\/\/[^>\s]+)>/))) { flush(); push(m[1], { href: m[1] }); k += m[0].length; continue; }
    if ((m = rest.match(/^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/))) { flush(); push(m[0], { href: m[0] }); k += m[0].length; continue; }
    if ((m = rest.match(/^<br\s*\/?>/i))) { buf += '\n'; k += m[0].length; continue; }
    if ((m = rest.match(/^<\/?[a-zA-Z][^>]*>/))) { k += m[0].length; continue; }
    if (rest[0] === '\\' && rest.length > 1) { buf += rest[1]; k += 2; continue; }
    if (rest.startsWith('**') || rest.startsWith('__')) {
      const mk = rest.slice(0, 2);
      if (b || s.indexOf(mk, k + 2) > k + 2) { flush(); b = !b; k += 2; continue; }
    }
    if (rest.startsWith('~~') || rest.startsWith('==')) { k += 2; continue; }
    if (rest[0] === '*' || rest[0] === '_') {
      const prev = s[k - 1] || ' ', next = s[k + 1] || ' ';
      const word = /[\p{L}\p{N}]/u;
      const canOpen = !it && !/\s/.test(next) && (rest[0] === '*' || !word.test(prev)) && s.indexOf(rest[0], k + 1) > k;
      const canClose = it && !/\s/.test(prev) && (rest[0] === '*' || !word.test(next));
      if (canOpen || canClose) { flush(); it = !it; k += 1; continue; }
    }
    buf += s[k]; k += 1;
  }
  flush();
  return runs;
}

/** Note Markdown → blocs (titres, paragraphes, listes, tableaux, encadrés, images, code) */
function exBlocks(md) {
  const lines = md.replace(/\r\n?/g, '\n').replace(/%%[\s\S]*?%%/g, '').split('\n');
  const blocks = [];
  let para = null;
  const flush = () => { if (para) { blocks.push({ t: 'p', text: para.join('\n') }); para = null; } };
  const isTableSep = (l) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l) && l.includes('-');
  const listRe = /^(\s*)([-*+]|\d+[.)])\s+(?:\[(.)\]\s+)?(.*)$/;
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    // bloc de code
    const fence = line.match(/^\s*(```+|~~~+)\s*([\w-]*)/);
    if (fence) {
      flush();
      const body = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++;
      const lang = fence[2].toLowerCase();
      if (lang.startsWith('tripbuddy-')) blocks.push({ t: 'plugin', lang, source: body.join('\n') });
      else if (!['dataview', 'dataviewjs', 'query', 'tasks', 'mermaid'].includes(lang)) blocks.push({ t: 'code', lines: body });
      continue;
    }
    if (!line.trim()) { flush(); i++; continue; }
    // titre
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) { flush(); blocks.push({ t: 'h', level: h[1].length, text: h[2] }); i++; continue; }
    // séparateur
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); blocks.push({ t: 'hr' }); i++; continue; }
    // tableau
    if (/^\s*\|/.test(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      flush();
      const split = (l) => {
        let s = l.trim().replace(/\\\|/g, '\u0001');
        // un lien [[a|b]] dans un tableau est écrit [[a\|b]] ; on protège aussi la forme non échappée
        s = s.replace(/\[\[[^\]]*\]\]/g, (m) => m.replace(/\|/g, '\u0001'));
        if (s.startsWith('|')) s = s.slice(1);
        if (s.endsWith('|')) s = s.slice(0, -1);
        return s.split('|').map((c) => c.replace(/\u0001/g, '|').trim());
      };
      const header = split(line);
      const align = split(lines[i + 1]).map((c) => (/:$/.test(c) ? (/^:/.test(c) ? 'center' : 'right') : 'left'));
      const rows = [];
      i += 2;
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(split(lines[i++]));
      blocks.push({ t: 'table', header, align, rows });
      continue;
    }
    // citation / encadré
    if (/^\s*>/.test(line)) {
      flush();
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      const co = (body[0] || '').match(/^\[!([\w-]+)\][+-]?\s*(.*)$/);
      if (co) blocks.push({ t: 'quote', callout: co[1].toLowerCase(), title: co[2], blocks: exBlocks(body.slice(1).join('\n')) });
      else blocks.push({ t: 'quote', blocks: exBlocks(body.join('\n')) });
      continue;
    }
    // liste
    const li = line.match(listRe);
    if (li) {
      flush();
      const items = [];
      const stack = [];
      while (i < lines.length) {
        const l = lines[i].replace(/\t/g, '    ').trimEnd();
        const m = l.match(listRe);
        if (m) {
          const ind = m[1].length;
          while (stack.length && ind < stack[stack.length - 1]) stack.pop();
          if (!stack.length || ind > stack[stack.length - 1]) stack.push(ind);
          items.push({ level: stack.length - 1, marker: m[2], task: m[3] !== undefined ? m[3] : null, text: m[4] });
          i++;
          continue;
        }
        // ligne de continuation (indentée, non vide)
        if (l.trim() && /^\s{2,}/.test(l) && items.length && !/^\s*(```|~~~|>|\|)/.test(l)) { items[items.length - 1].text += '\n' + l.trim(); i++; continue; }
        break;
      }
      // champs de modèle laissés vides (« - **Horaires** : ») sans sous-liste : ignorés
      const kept = items.filter((it, k) => {
        const bare = it.task === null && /^[^:]{1,60}:\s*$/.test(it.text.replace(/[*_`]/g, '').trim());
        return !(bare && !(items[k + 1] && items[k + 1].level > it.level));
      });
      if (kept.length) blocks.push({ t: 'list', items: kept });
      continue;
    }
    // images seules sur leur ligne
    const embeds = [...line.matchAll(/!\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(<?([^)>]+?)>?\)/g)];
    if (embeds.length && !line.replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '').trim()) {
      flush();
      embeds.forEach((m) => blocks.push({ t: 'embed', link: (m[1] || decodeURI(m[2] || '')).trim() }));
      i++;
      continue;
    }
    if (embeds.length) embeds.forEach((m) => { flush(); blocks.push({ t: 'embed', link: (m[1] || decodeURI(m[2] || '')).trim() }); });
    (para = para || []).push(line.replace(/!\[\[[^\]]*\]\]|!\[[^\]]*\]\([^)]*\)/g, '').trim());
    if (!para[para.length - 1]) para.pop();
    if (para && !para.length) para = null;
    i++;
  }
  flush();
  return blocks;
}

class VaultExporter {
  constructor(plugin, opts = {}) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.data = plugin.data;
    this.opts = { ...EXPORT_DEFAULTS, ...opts };
    this.bk = new BookletBuilder(plugin, { font: this.opts.font });
    this.stats = { notes: 0, programmes: 0, places: 0, journal: 0, photos: 0, expenses: 0, images: 0, pdfs: 0, pdfPages: 0, skippedPdfs: [] };
  }

  static outputPath(plugin) {
    const s = plugin.settings;
    const folder = normalizePath(s.folders.documents || '');
    const name = U.sanitizeFileName(`Export du voyage - ${s.trip.name || 'voyage'}`);
    return normalizePath(`${folder ? folder + '/' : ''}${name}.pdf`);
  }

  /* ------------------------------------------------------------- contenu */
  /** Rassemble le contenu du voyage (sans les pages de documentation du coffre) */
  async collect() {
    const o = this.opts;
    const d = this.data;
    const vault = this.app.vault;
    const cmp = (a, b) => a.localeCompare(b, LOCALE, { numeric: true, sensitivity: 'base' });
    const out = VaultExporter.outputPath(this.plugin);

    const programmes = o.programme ? d.programmes() : [];
    const journal = o.journal ? d.journal() : [];
    const allPois = d.pois();

    // lieux : regroupés par jour de visite, dans l'ordre du programme
    const placeList = o.places ? allPois.filter((p) => o.allPlaces || p.done) : [];
    const byKey = new Map();
    for (const p of placeList) {
      const k = p.done ? (p.doneDate || '~visited') : '~todo';
      if (!byKey.has(k)) byKey.set(k, []);
      byKey.get(k).push(p);
    }
    const rankKey = (k) => (k === '~visited' ? 'zz1' : k === '~todo' ? 'zz2' : k);
    const placeGroups = [...byKey.entries()].sort((a, b) => rankKey(a[0]).localeCompare(rankKey(b[0]))).map(([key, list]) => {
      let label;
      if (key === '~visited') label = 'Visités (date non renseignée)';
      else if (key === '~todo') label = 'Non visités';
      else { const idx = d.dayIndex(key); label = U.cap(U.fmtLong(key)) + (idx ? ` · jour ${idx}` : ''); }
      const pois = key.startsWith('~') ? list.sort((a, b) => cmp(a.name, b.name)) : this.bk.orderDay(key, list);
      return { key, label, pois };
    });
    const places = placeGroups.flatMap((g) => g.pois);
    this.placeNo = new Map(places.map((p, i) => [p.path, i + 1]));

    // carte : lieux visités localisés
    const mapPois = o.map ? (places.length ? places : allPois).filter((p) => p.done && p.hasCoords) : [];

    // photos du voyage : images du coffre hors modèles, sauf les photos d'illustration des lieux
    const poiPhotos = new Set(allPois.filter((p) => p.photo).map((p) => p.photo.path));
    const allJournal = d.journal();
    const rl = this.app.metadataCache.resolvedLinks || {};
    const photoDay = (f) => {
      const j = allJournal.find((x) => (rl[x.file.path] || {})[f.path] || (x.cover && d.resolveLink(x.cover, x.file.path) === f));
      return j || null;
    };
    const photos = o.photos
      ? vault.getFiles()
        .filter((f) => IMG_EXT.includes(f.extension.toLowerCase()) && f.extension.toLowerCase() !== 'svg' && !d.isTemplate(f) && !poiPhotos.has(f.path))
        .map((f) => ({ file: f, day: photoDay(f) }))
        .sort((a, b) => ((a.day && a.day.date) || '9999').localeCompare((b.day && b.day.date) || '9999') || cmp(a.file.path, b.file.path))
      : [];

    // budget
    const budget = o.budget ? await d.budget() : null;

    // documents joints : PDF du coffre, sauf ceux produits par Trip Buddy (carnets, exports)
    const pdfs = [];
    if (o.attachments) {
      const { PDFDocument } = TB_loadPdfLib();
      const files = vault.getFiles().filter((f) => f.extension.toLowerCase() === 'pdf' && f.path !== out && !d.isTemplate(f)).sort((a, b) => cmp(a.path, b.path));
      for (const f of files) {
        try {
          const bytes = await vault.readBinary(f);
          const src = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
          if (/trip buddy/i.test(String(src.getCreator() || '') + ' ' + String(src.getProducer() || ''))) continue;
          if (src.isEncrypted) throw new Error('document protégé par un mot de passe');
          if (!src.getPageCount()) throw new Error('aucune page');
          pdfs.push({ file: f, src });
        } catch (e) {
          console.warn('[Trip Buddy] PDF non intégré', f.path, e);
          this.stats.skippedPdfs.push(f.basename);
          pdfs.push({ file: f, error: e.message || String(e) });
        }
      }
    }

    // fichiers présents dans l'export (pour n'activer que les liens qui mènent quelque part)
    this.exported = new Set([
      ...programmes.map((p) => p.file.path), ...places.map((p) => p.path), ...journal.map((j) => j.file.path),
      ...photos.map((p) => p.file.path), ...pdfs.filter((p) => !p.error).map((p) => p.file.path),
    ]);
    if (budget && budget.file && budget.expenses.length) this.exported.add(budget.file.path);
    return { programmes, placeGroups, places, journal, mapPois, photos, budget, pdfs };
  }

  /** Le lien mène-t-il à une page de l'export ? */
  linkable(target) {
    if (!target) return false;
    if (target.startsWith('#')) return true;
    if (this.exported.has(target)) return true;
    const f = this.data.resolveLink(target, '');
    return f instanceof TFile && this.exported.has(f.path);
  }

  /** Titre affiché d'une note, et ligne d'accroche (type, date) */
  noteTitle(file) {
    const fm = this.data.fm(file);
    const type = String(fm.type || '').toLowerCase();
    const date = U.normDate(fm.date);
    let title = fm.name || fm.nom || file.basename;
    let kicker = '';
    if (type === 'journal') {
      const idx = date && this.data.dayIndex(date);
      kicker = `Journal${idx ? ` · jour ${idx}` : ''}${date ? ' · ' + U.cap(U.fmtLong(date)) : ''}`;
      title = fm.title || fm.titre || (date ? U.cap(U.fmtLong(date)) : title);
    } else if (type === 'programme') {
      const idx = date && this.data.dayIndex(date);
      kicker = `Programme${idx ? ` · jour ${idx}` : ''}${date ? ' · ' + U.cap(U.fmtLong(date)) : ''}`;
      title = fm.title || fm.titre || (date ? U.cap(U.fmtLong(date)) : title);
    } else if (type === 'poi') {
      kicker = 'Lieu · ' + this.data.poiCat(fm.category ?? fm.categorie).label;
    }
    return { title: exClean(title).replace(/\s+/g, ' ').trim() || file.basename, kicker, type, fm };
  }

  /** Propriétés lisibles d'une note : [[libellé, valeur]] */
  properties(file, type, fm) {
    const skip = new Set(['cssclasses', 'cssclass', 'type', 'name', 'nom', 'title', 'titre', 'position', 'aliases', 'photo', 'image', 'cover', 'photo_credit', 'track_color', 'lat', 'lon', 'lng', 'latitude', 'longitude', 'publish', 'tags']);
    if (type === 'programme') { skip.add('pois'); skip.add('etapes'); }
    if (type === 'poi') { skip.add('done'); skip.add('fait'); }
    if (type === 'journal' || type === 'programme') skip.add('date');
    const labels = {
      category: 'Catégorie', categorie: 'Catégorie', address: 'Adresse', adresse: 'Adresse', done: 'Visité', fait: 'Visité',
      done_date: 'Date de visite', date_fait: 'Date de visite', rating: 'Note', note: 'Note', tags: 'Tags', date: 'Date',
      location: 'Lieu', location_name: 'Lieu', lieu: 'Lieu', weather: 'Météo', meteo: 'Météo', mood: 'Humeur', humeur: 'Humeur',
      gpx: 'Trace GPX', distance_km: 'Distance', ele_gain: 'Dénivelé +', ele_loss: 'Dénivelé -', pois: 'Étapes', url: 'Site', website: 'Site',
      phone: 'Téléphone', telephone: 'Téléphone', hours: 'Horaires', horaires: 'Horaires', price: 'Prix', prix: 'Prix',
    };
    const val = (v) => {
      if (v == null || v === '') return '';
      if (Array.isArray(v)) return v.map(val).filter(Boolean).join(', ');
      if (typeof v === 'boolean') return v ? 'oui' : 'non';
      if (typeof v === 'object') return Object.entries(v).map(([k, x]) => `${k} : ${val(x)}`).join(', ');
      return String(v).replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, (m, a) => a.split('#')[0].replace(/\.md$/i, ''));
    };
    const out = [];
    for (const [k, v] of Object.entries(fm || {})) {
      const key = k.toLowerCase();
      if (skip.has(key)) continue;
      let s = val(v);
      if (key === 'category' || key === 'categorie') s = this.data.poiCat(v).label;
      else if (key === 'tags') s = (Array.isArray(v) ? v : String(v).split(/[\s,]+/)).filter(Boolean).map((t) => '#' + String(t).replace(/^#/, '')).join(' ');
      else if (['rating', 'note', 'mood', 'humeur'].includes(key)) { const n = U.toNum(v); if (!n) continue; s = `${n}/5`; }
      else if (key === 'done' || key === 'fait') s = U.toBool(v) ? 'oui' : 'non';
      else if (['date', 'done_date', 'date_fait'].includes(key) && U.normDate(v)) s = U.cap(U.fmtLong(U.normDate(v)));
      else if (key === 'distance_km' && U.toNum(v)) s = `${String(v).replace('.', ',')} km`;
      else if ((key === 'ele_gain' || key === 'ele_loss') && U.toNum(v)) s = `${v} m`;
      s = exClean(s).trim();
      if (!s) continue;
      out.push([labels[key] || U.cap(k.replace(/[_-]+/g, ' ')), s]);
    }
    const lat = U.toNum(fm.lat ?? fm.latitude), lon = U.toNum(fm.lon ?? fm.lng ?? fm.longitude);
    if (!isNaN(lat) && !isNaN(lon)) out.push(['Coordonnées', `${lat.toFixed(5)}, ${lon.toFixed(5)}`]);
    return out;
  }

  /* ---------------------------------------------------------- mise en page */
  async build() {
    const PDFLib = TB_loadPdfLib();
    const { PDFDocument, StandardFonts, rgb, PDFString } = PDFLib;
    const o = this.opts;
    const self = this;
    const content = await this.collect();
    const doc = await PDFDocument.create();
    const F = await this.bk.loadFonts(doc, PDFLib);
    F.mono = await doc.embedFont(StandardFonts.Courier);
    const S = F.scale || 1;
    const C = {
      ink: rgb(0.13, 0.13, 0.14), muted: rgb(0.4, 0.4, 0.42), faint: rgb(0.62, 0.62, 0.64), rule: rgb(0.84, 0.84, 0.86),
      accent: rgb(0.16, 0.42, 0.62), link: rgb(0.12, 0.38, 0.7), tint: rgb(0.95, 0.96, 0.97), codebg: rgb(0.94, 0.94, 0.95), white: rgb(1, 1, 1),
    };
    const CALLOUT = {
      note: rgb(0.16, 0.42, 0.75), info: rgb(0.16, 0.42, 0.75), todo: rgb(0.16, 0.42, 0.75), abstract: rgb(0.1, 0.6, 0.65), summary: rgb(0.1, 0.6, 0.65),
      tip: rgb(0.12, 0.58, 0.4), hint: rgb(0.12, 0.58, 0.4), success: rgb(0.2, 0.6, 0.3), check: rgb(0.2, 0.6, 0.3), done: rgb(0.2, 0.6, 0.3),
      question: rgb(0.85, 0.55, 0.1), help: rgb(0.85, 0.55, 0.1), faq: rgb(0.85, 0.55, 0.1), warning: rgb(0.88, 0.5, 0.1), caution: rgb(0.88, 0.5, 0.1), attention: rgb(0.88, 0.5, 0.1),
      failure: rgb(0.8, 0.25, 0.25), fail: rgb(0.8, 0.25, 0.25), missing: rgb(0.8, 0.25, 0.25), danger: rgb(0.8, 0.2, 0.2), error: rgb(0.8, 0.2, 0.2), bug: rgb(0.8, 0.2, 0.2),
      example: rgb(0.5, 0.35, 0.75), quote: rgb(0.55, 0.55, 0.58), cite: rgb(0.55, 0.55, 0.58),
    };
    const MM = EX.MM, W = EX.W, H = EX.H;
    const M = { left: 20 * MM, right: 20 * MM, top: 18 * MM, bottom: 20 * MM };
    const BODY = 10;

    /* ---- pages et état */
    const pages = []; // { page, group, plain }
    let page = null, y = 0, inset = 0, curGroup = '';
    const x0 = () => M.left + inset;
    const x1 = W - M.right;
    const width = () => x1 - x0();
    const room = () => y - M.bottom;
    const decor = []; // citations / encadrés ouverts : { color, page, top, x }
    const links = []; // { page, rect, href | target }
    const anchors = new Map(); // chemin → { page, y }
    const closeDecor = (d, bottom) => {
      const h = d.top - bottom;
      if (h <= 0) return;
      d.page.drawRectangle({ x: d.x, y: bottom, width: x1 - d.x, height: h, color: d.color, opacity: 0.06 });
      d.page.drawRectangle({ x: d.x, y: bottom, width: 2.2, height: h, color: d.color, opacity: 0.85 });
    };
    const newPage = (opts = {}) => {
      decor.forEach((d) => closeDecor(d, M.bottom - 2));
      page = doc.addPage([W, H]);
      pages.push({ page, group: curGroup, plain: !!opts.plain });
      y = H - M.top;
      decor.forEach((d) => { d.page = page; d.top = y + 2; });
      return page;
    };
    const gap = (pt) => { y -= pt; };
    const ensure = (pt) => { if (room() < pt) newPage(); };
    const rule = (color = C.rule, thickness = 0.5) => page.drawLine({ start: { x: x0(), y }, end: { x: x1, y }, thickness, color });

    /* ---- texte riche : segments → lignes */
    const pick = (bold, italic, code) => (code ? F.mono : bold ? (italic ? F.bodyBI : F.bodyB) : italic ? F.bodyI : F.body);
    const layout = (runs, { size, maxW, bold = false, italic = false }) => {
      // découpe en mots (suites de morceaux sans espace)
      const words = [];
      let cur = null, space = false;
      const hard = () => { words.push({ br: true }); cur = null; space = false; };
      for (const r of runs) {
        const parts = exClean(r.text).split(/(\n|[ ]+)/);
        for (const p of parts) {
          if (!p) continue;
          if (p === '\n') { hard(); continue; }
          if (/^ +$/.test(p)) { space = true; cur = null; continue; }
          const font = pick(bold || r.b, italic || r.i, r.code);
          const sz = r.code ? size * 0.9 : size;
          const piece = { text: p, font, size: sz, w: font.widthOfTextAtSize(p, sz), href: r.href, target: r.target, code: r.code };
          if (!cur) { cur = { pieces: [], w: 0, space: space && words.length > 0 && !words[words.length - 1].br }; words.push(cur); space = false; }
          cur.pieces.push(piece);
          cur.w += piece.w;
        }
      }
      const lines = [];
      let line = { items: [], w: 0 };
      const spaceW = F.body.widthOfTextAtSize(' ', size);
      const place = (piece, sp) => {
        const x = line.w + (sp && line.items.length ? spaceW : 0);
        line.items.push({ ...piece, x });
        line.w = x + piece.w;
      };
      for (const w of words) {
        if (w.br) { lines.push(line); line = { items: [], w: 0 }; continue; }
        const need = (line.items.length && w.space ? spaceW : 0) + w.w;
        if (line.items.length && line.w + need > maxW) { lines.push(line); line = { items: [], w: 0 }; }
        if (w.w <= maxW) { w.pieces.forEach((p, k) => place(p, k === 0 && w.space)); continue; }
        // mot plus large que la ligne (URL…) : coupé caractère par caractère
        for (const p of w.pieces) {
          let part = '';
          for (const ch of p.text) {
            const test = part + ch;
            if (line.w + p.font.widthOfTextAtSize(test, p.size) > maxW && (part || line.items.length)) {
              if (part) place({ ...p, text: part, w: p.font.widthOfTextAtSize(part, p.size) }, false);
              lines.push(line); line = { items: [], w: 0 }; part = ch;
            } else part = test;
          }
          if (part) place({ ...p, text: part, w: p.font.widthOfTextAtSize(part, p.size) }, false);
        }
      }
      if (line.items.length || !lines.length) lines.push(line);
      // supprime les lignes vides en fin de paragraphe
      while (lines.length > 1 && !lines[lines.length - 1].items.length) lines.pop();
      return lines;
    };
    /** Dessine des lignes à (x, y courant) ; gère sauts de page, liens et fond du code */
    const drawLines = (lines, { size, lead = 1.38, color = C.ink, align = 'left', x = null, maxW = null, keep = 2 } = {}) => {
      const lh = size * lead;
      if (room() < lh * Math.min(keep, lines.length)) newPage();
      for (const ln of lines) {
        if (room() < lh) newPage();
        const left = x == null ? x0() : x;
        const mw = maxW == null ? x1 - left : maxW;
        let dx = 0;
        if (align === 'center') dx = (mw - ln.w) / 2;
        else if (align === 'right') dx = mw - ln.w;
        const base = y - size;
        for (const it of ln.items) {
          const px = left + dx + it.x;
          if (it.code) page.drawRectangle({ x: px - 1, y: base - it.size * 0.25, width: it.w + 2, height: it.size * 1.15, color: C.codebg });
          const linked = it.href || (it.target && self.linkable(it.target));
          page.drawText(it.text, { x: px, y: base, size: it.size, font: it.font, color: linked ? C.link : color });
          if (linked) links.push({ page, rect: [px, base - it.size * 0.25, px + it.w, base + it.size * 0.85], href: it.href, target: it.href ? null : it.target });
        }
        y -= lh;
      }
    };
    const text = (str, opts = {}) => {
      const size = (opts.size || BODY) * S;
      const runs = typeof str === 'string' ? (opts.raw ? [{ text: str }] : exInline(str)) : str;
      const x = opts.indent ? x0() + opts.indent : null;
      const lines = layout(runs, { size, maxW: x1 - (x == null ? x0() : x), bold: opts.bold, italic: opts.italic });
      if (lines.length === 1 && !lines[0].items.length) return;
      drawLines(lines, { ...opts, size, x });
    };
    const kicker = (str, color = C.accent) => {
      const s = exClean(str).trim().toUpperCase();
      if (!s) return;
      const size = 7.5 * S;
      ensure(size + 6);
      let xx = x0();
      for (const ch of s) { page.drawText(ch, { x: xx, y: y - size, size, font: F.bodyB, color }); xx += F.bodyB.widthOfTextAtSize(ch, size) + 0.8; }
      y -= size + 5;
    };

    /* ---- images */
    const imgCache = new Map();
    this.used = new Set();
    const embedImg = async (file, maxPx = 1400) => {
      if (imgCache.has(file.path)) return imgCache.get(file.path);
      const im = await self.bk.loadImage(file, { maxPx });
      let res = null;
      try {
        if (im && im.raw) {
          const img = im.png ? await doc.embedPng(im.raw) : await doc.embedJpg(im.raw);
          res = { img, w: img.width, h: img.height };
        } else if (im) res = { img: await doc.embedJpg(im.dataUrl), w: im.w, h: im.h };
      } catch (e) {
        console.warn('[Trip Buddy] image non intégrée', file.path, e);
        self.bk.skipped = (self.bk.skipped || 0) + 1;
      }
      imgCache.set(file.path, res);
      return res;
    };
    const image = async (file, { maxH = 0.42, caption = '' } = {}) => {
      const im = await embedImg(file);
      if (!im) return false;
      this.used.add(file.path);
      let w = width(), h = (w * im.h) / im.w;
      const maxHpt = (H - M.top - M.bottom) * maxH;
      if (h > maxHpt) { h = maxHpt; w = (h * im.w) / im.h; }
      ensure(h + (caption ? 16 : 6));
      const x = x0() + (width() - w) / 2;
      page.drawImage(im.img, { x, y: y - h, width: w, height: h });
      page.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: C.rule, borderWidth: 0.4 });
      y -= h + 4;
      if (caption) text(caption, { raw: true, italic: true, size: 7.5, color: C.muted, align: 'center' });
      gap(4);
      this.stats.images++;
      return true;
    };

    /* ---- tableaux */
    const table = (header, rows, align = []) => {
      const size = 8.5 * S, pad = 3.2, lead = 1.3;
      const n = Math.max(header.length, ...rows.map((r) => r.length));
      const cells = (r, bold) => Array.from({ length: n }, (_, k) => ({ runs: exInline(r[k] || ''), bold }));
      const hdr = cells(header, true);
      const body = rows.map((r) => cells(r, false));
      const all = [hdr, ...body];
      const tw = width();
      // largeurs : naturelle (une ligne) et minimale (mot le plus long)
      const nat = Array(n).fill(0), min = Array(n).fill(0);
      for (const row of all) row.forEach((c, k) => {
        const lines = layout(c.runs, { size, maxW: 1e6, bold: c.bold });
        nat[k] = Math.max(nat[k], lines.reduce((m, l) => Math.max(m, l.w), 0) + 2 * pad);
        const words = layout(c.runs, { size, maxW: 1, bold: c.bold });
        min[k] = Math.max(min[k], Math.min(words.reduce((m, l) => Math.max(m, l.w), 0), tw * 0.3) + 2 * pad);
      });
      let cw;
      const sumNat = nat.reduce((a, b) => a + b, 0), sumMin = min.reduce((a, b) => a + b, 0);
      if (sumNat <= tw) cw = nat.map((v) => v + (tw - sumNat) / n);
      else if (sumMin >= tw) cw = min.map((v) => (v * tw) / sumMin);
      else { const extra = tw - sumMin, flex = nat.map((v, k) => v - min[k]), sf = flex.reduce((a, b) => a + b, 0) || 1; cw = min.map((v, k) => v + (flex[k] * extra) / sf); }
      const measure = (row) => row.map((c, k) => layout(c.runs, { size, maxW: cw[k] - 2 * pad, bold: c.bold }));
      const lh = size * lead;
      const drawRow = (row, isHeader) => {
        const ls = measure(row);
        const rh = Math.max(...ls.map((l) => l.length)) * lh + 2 * pad;
        if (room() < rh) { newPage(); if (!isHeader) drawRow(hdr, true); }
        const top = y;
        let cx = x0();
        if (isHeader) page.drawRectangle({ x: x0(), y: top - rh, width: tw, height: rh, color: C.tint });
        ls.forEach((lines, k) => {
          y = top - pad;
          drawLines(lines, { size, lead, x: cx + pad, maxW: cw[k] - 2 * pad, align: align[k] || 'left', keep: 1 });
          cx += cw[k];
        });
        y = top - rh;
        page.drawLine({ start: { x: x0(), y }, end: { x: x1, y }, thickness: isHeader ? 0.8 : 0.4, color: isHeader ? C.faint : C.rule });
      };
      ensure(size * 5);
      drawRow(hdr, true);
      body.forEach((r, k) => {
        // la dernière ligne (souvent un total) ne part pas seule sur une nouvelle page
        if (k === body.length - 2) {
          const hh = (row) => Math.max(...measure(row).map((l) => l.length)) * lh + 2 * pad;
          if (room() < hh(r) + hh(body[k + 1])) { newPage(); drawRow(hdr, true); }
        }
        drawRow(r, false);
      });
      gap(6);
    };

    /* ---- blocs Markdown */
    const headingSize = { 1: 16, 2: 13.5, 3: 11.5, 4: 10.5, 5: 10, 6: 10 };
    const renderBlocks = async (blocks, ctx) => {
      for (const [bi, b] of blocks.entries()) {
        if (b.t === 'h') {
          const size = headingSize[b.level];
          if (exClean(b.text).replace(/[#*_`\s]/g, '') === '') continue;
          // titre sans contenu (section laissée vide) : ignoré
          let filled = false;
          for (let k = bi + 1; k < blocks.length; k++) {
            const nb = blocks[k];
            if (nb.t === 'h') { if (nb.level <= b.level) break; continue; }
            if (nb.t === 'plugin' && nb.lang === 'tripbuddy-nav') continue;
            filled = true; break;
          }
          if (!filled) continue;
          // la section ne commence pas en bas de page
          ensure(size * S * 1.4 + 40);
          gap(b.level <= 2 ? 8 : 5);
          text(b.text, { size, bold: true, color: b.level <= 2 ? C.ink : C.ink, lead: 1.25, keep: 1 });
          if (b.level <= 2) { gap(1); rule(C.rule, 0.4); gap(4); } else gap(2);
        } else if (b.t === 'p') {
          text(b.text, { size: BODY });
          gap(5);
        } else if (b.t === 'table') {
          gap(2);
          table(b.header, b.rows, b.align);
        } else if (b.t === 'hr') {
          gap(4); ensure(10); rule(); gap(8);
        } else if (b.t === 'list') {
          let num = {};
          for (const it of b.items) {
            const ind = it.level * 5 * MM;
            const size = BODY * S;
            const bx = x0() + ind;
            ensure(size * 1.4);
            const by = y - size;
            if (it.task !== null) {
              const box = size * 0.72;
              page.drawRectangle({ x: bx + 0.5, y: by - 0.5, width: box, height: box, borderColor: C.muted, borderWidth: 0.7 });
              if (it.task.trim()) page.drawSvgPath(`M ${bx + 2} ${-(by + box * 0.5)} L ${bx + box * 0.42} ${-(by + 1.5)} L ${bx + box - 0.5} ${-(by + box + 0.5)}`.replace(/(-?\d+\.?\d*)/g, (m) => Number(m).toFixed(2)), { x: 0, y: 0, borderColor: C.accent, borderWidth: 1.1 });
            } else if (/\d/.test(it.marker)) {
              num[it.level] = (num[it.level] || 0) + 1;
              const lab = `${num[it.level]}.`;
              page.drawText(lab, { x: bx, y: by, size, font: F.body, color: C.muted });
            } else {
              page.drawCircle({ x: bx + 2.2, y: by + size * 0.32, size: it.level ? 1.2 : 1.5, color: it.level ? C.muted : C.accent });
            }
            Object.keys(num).forEach((l) => { if (Number(l) > it.level) delete num[l]; });
            const done = it.task && it.task.trim();
            text(it.text, { size: BODY, indent: ind + 5.2 * MM, color: done ? C.muted : C.ink, keep: 1 });
            gap(1.5);
          }
          gap(4);
        } else if (b.t === 'quote') {
          const color = b.callout ? CALLOUT[b.callout] || C.accent : C.faint;
          gap(2);
          ensure(30);
          const d = { color, page, top: y, x: x0() };
          decor.push(d);
          inset += 4.5 * MM;
          gap(5);
          const title = b.callout ? (b.title || U.cap(b.callout)) : '';
          if (title) { text(title, { size: BODY, bold: true, color, keep: 2 }); gap(2); }
          await renderBlocks(b.blocks, ctx);
          // espace final déjà ajouté par le dernier bloc
          y += 2;
          inset -= 4.5 * MM;
          decor.pop();
          closeDecor(d, y);
          gap(8);
        } else if (b.t === 'code') {
          const size = 8 * S;
          for (const l of b.lines) {
            const lines = layout([{ text: l.replace(/\t/g, '  ') || ' ', code: true }], { size: size / 0.9, maxW: width() - 8 });
            for (const ln of lines) {
              ensure(size * 1.4);
              page.drawRectangle({ x: x0(), y: y - size * 1.4, width: width(), height: size * 1.4, color: C.codebg });
              const base = y - size * 1.05;
              ln.items.forEach((it) => page.drawText(it.text, { x: x0() + 4 + it.x, y: base, size: it.size, font: it.font, color: C.ink }));
              y -= size * 1.4;
            }
          }
          gap(7);
        } else if (b.t === 'embed') {
          const f = self.data.resolveLink(b.link, ctx.file.path);
          if (!(f instanceof TFile)) continue;
          const ext = f.extension.toLowerCase();
          if (IMG_EXT.includes(ext) && ext !== 'svg') {
            if (o.images) { gap(2); await image(f, { maxH: 0.45 }); } else self.used.add(f.path);
          } else if (ext === 'pdf') {
            const inAnnex = self.exported.has(f.path);
            text([{ text: 'Document joint : ', i: true }, { text: f.basename, target: f.path }, { text: inAnnex ? ' (en annexe)' : '', i: true }], { size: 9, color: C.muted });
            gap(4);
          } else if (ext === 'md' && self.exported.has(f.path)) {
            text([{ text: 'Voir : ', i: true }, { text: f.basename, target: f.path }], { size: 9, color: C.muted });
            gap(4);
          }
        } else if (b.t === 'plugin') {
          await pluginBlock(b, ctx, blocks, bi);
        }
      }
    };

    /* ---- blocs Trip Buddy : contenu calculé à partir des données */
    let budgetCache = null;
    const pluginBlock = async (b, ctx) => {
      const d = self.data;
      const s = self.plugin.settings;
      const cur = s.trip.currency || 'EUR';
      const money = (n) => exClean(U.fmtMoney(n, cur));
      if (b.lang === 'tripbuddy-poi') {
        const poi = d.poiOf(ctx.file);
        if (poi && poi.photo && o.images) await image(poi.photo, { maxH: 0.36, caption: poi.photoCredit ? `Photo : ${poi.photoCredit}` : '' });
      } else if (b.lang === 'tripbuddy-journal-day') {
        const j = d.toJournal(ctx.file);
        const f = j.cover && d.resolveLink(j.cover, ctx.file.path);
        if (f instanceof TFile && o.images) await image(f, { maxH: 0.4 });
        const vis = j.date ? self.bk.orderDay(j.date, d.pois().filter((p) => p.done && p.doneDate === j.date)) : [];
        if (vis.length) {
          kicker(`${vis.length} lieu${vis.length > 1 ? 'x' : ''} visité${vis.length > 1 ? 's' : ''} ce jour`, C.muted);
          text(vis.map((p) => `[[${p.path}|${p.name.replace(/[|\]\[]/g, ' ')}]]`).join(' · '), { size: 9, color: C.muted });
          gap(8);
        }
      } else if (b.lang === 'tripbuddy-program') {
        const prog = d.toProgramme(ctx.file);
        if (!prog.steps.length) return;
        kicker('Étapes du programme', C.muted);
        const rows = prog.steps.map((p, i) => [String(i + 1), p.missing ? p.name : `[[${p.path}|${p.name.replace(/\|/g, '/')}]]`, p.missing ? '' : p.cat.label, p.missing ? '' : (p.address || '')]);
        table(['#', 'Lieu', 'Catégorie', 'Adresse'], rows, ['right']);
      } else if (b.lang === 'tripbuddy-budget') {
        if (!budgetCache) budgetCache = await d.budget();
        const ex = budgetCache.expenses;
        if (!ex.length) return;
        const by = new Map();
        ex.forEach((e) => { const k = e.cat.label; by.set(k, (by.get(k) || 0) + e.amountMain); });
        const total = ex.reduce((a, e) => a + e.amountMain, 0);
        kicker('Synthèse du budget', C.muted);
        const budgets = new Map((s.expenseCategories || []).map((c) => [c.label, U.toNum(c.budget) || 0]));
        const rows = [...by.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, money(v), budgets.get(k) ? money(budgets.get(k)) : '', `${Math.round((v / (total || 1)) * 100)} %`]);
        rows.push(['**Total**', `**${money(total)}**`, s.trip.budget ? `**${money(U.toNum(s.trip.budget))}**` : '', '100 %']);
        table(['Catégorie', 'Dépensé', 'Budget', 'Part'], rows, ['left', 'right', 'right', 'right']);
        const payers = new Map();
        ex.forEach((e) => { if (e.payer) payers.set(e.payer, (payers.get(e.payer) || 0) + e.amountMain); });
        if (payers.size) { text([...payers.entries()].map(([p, v]) => `${p} : ${money(v)}`).join(' · '), { size: 9, color: C.muted, italic: true }); gap(6); }
      } else if (b.lang === 'tripbuddy-pois') {
        const pois = d.pois();
        if (!pois.length) return;
        kicker(`${pois.length} lieux · ${pois.filter((p) => p.done).length} visités`, C.muted);
        const rows = pois.sort((a, b) => a.cat.label.localeCompare(b.cat.label, LOCALE) || a.name.localeCompare(b.name, LOCALE))
          .map((p) => [`[[${p.path}|${p.name.replace(/\|/g, '/')}]]`, p.cat.label, p.done ? (p.doneDate ? `visité le ${U.fmtShort(p.doneDate)}` : 'visité') : '', p.rating ? `${p.rating}/5` : '']);
        table(['Lieu', 'Catégorie', 'Statut', 'Note'], rows);
      } else if (b.lang === 'tripbuddy-map' && o.map) {
        await poiMap(d.pois().filter((p) => p.hasCoords));
      } else if (b.lang === 'tripbuddy-dashboard') {
        const T = s.trip;
        const days = d.tripDays();
        const rows = [];
        if (T.destination) rows.push(['Destination', T.destination]);
        if (days.length) rows.push(['Dates', `${U.cap(U.fmtLong(days[0]))} – ${U.fmtLong(days[days.length - 1])} (${days.length} jour${days.length > 1 ? 's' : ''})`]);
        if ((T.travelers || []).length) rows.push(['Voyageurs', T.travelers.join(', ')]);
        const pois = d.pois();
        rows.push(['Lieux', `${pois.length} repérés, ${pois.filter((p) => p.done).length} visités`]);
        rows.push(['Journal', `${d.journal().length} journée(s) racontée(s)`]);
        kicker('Le voyage', C.muted);
        props(rows);
      }
    };

    const hex = (c) => { const m = String(c || '').match(/^#?([0-9a-f]{6})$/i); if (!m) return C.accent; const v = parseInt(m[1], 16); return rgb(((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255); };
    /** Pastille numérotée (numéro du lieu dans la section « Lieux visités ») */
    const pin = (p, cx, cy, r, n) => {
      page.drawCircle({ x: cx, y: cy, size: r, color: hex(p.cat.color), borderColor: C.white, borderWidth: 0.9 });
      if (!n) return;
      const sz = (n.length > 2 ? 4.2 : n.length > 1 ? 5.2 : 6) * (r / 5.6);
      const tw = F.bodyB.widthOfTextAtSize(n, sz);
      page.drawText(n, { x: cx - tw / 2, y: cy - sz * 0.36, size: sz, font: F.bodyB, color: C.white });
    };

    /** Carte des lieux : pastilles numérotées et cliquables */
    const poiMap = async (pts, { maxH = 0.6 } = {}) => {
      if (!pts.length) return false;
      const w = width(), h = Math.min(w * 1.05, (H - M.top - M.bottom) * maxH);
      ensure(h + 14);
      let mp;
      try { mp = await self.bk.renderMap(pts.map((p) => ({ lat: p.lat, lon: p.lon })), w, h); } catch (e) { console.warn('[Trip Buddy] carte', e); mp = { offline: true }; }
      if (mp.offline) { text('Carte non incluse : fond de carte indisponible (hors ligne).', { raw: true, italic: true, size: 8.5, color: C.muted }); gap(6); self.mapOffline = true; return false; }
      const img = await doc.embedJpg(mp.dataUrl);
      const top = y;
      page.drawImage(img, { x: x0(), y: top - h, width: w, height: h });
      page.drawRectangle({ x: x0(), y: top - h, width: w, height: h, borderColor: C.rule, borderWidth: 0.6 });
      // ordre inverse : les premiers numéros restent au-dessus
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        const [rx, ry] = mp.pos[i];
        if (rx < 0 || rx > 1 || ry < 0 || ry > 1) continue;
        const cx = x0() + rx * w, cy = top - ry * h, r = 5.6;
        pin(p, cx, cy, r, String(self.placeNo.get(p.path) || ''));
        if (self.linkable(p.path)) links.push({ page, rect: [cx - r, cy - r, cx + r, cy + r], target: p.path });
      }
      y = top - h - 2;
      const attr = exClean(mp.attribution);
      const asz = 6 * S;
      page.drawText(attr, { x: x1 - F.bodyI.widthOfTextAtSize(attr, asz), y: y - asz, size: asz, font: F.bodyI, color: C.faint });
      y -= asz + 8;
      return true;
    };

    /** Légende de la carte, sur deux colonnes : numéro, nom (lien), date de visite */
    const legend = (pts) => {
      const size = 8 * S, lh = size * 1.7, gapX = 6 * MM;
      const cw = (width() - gapX) / 2;
      for (let i = 0; i < pts.length; i += 2) {
        if (room() < lh) newPage();
        const base = y - size;
        [pts[i], pts[i + 1]].forEach((p, c) => {
          if (!p) return;
          const cx = x0() + c * (cw + gapX);
          pin(p, cx + 4.2, base + size * 0.34, 4.2, String(self.placeNo.get(p.path) || ''));
          const date = p.doneDate ? exClean(U.fmtShort(p.doneDate)) : '';
          const dw = date ? F.bodyI.widthOfTextAtSize(date, size * 0.95) : 0;
          if (date) page.drawText(date, { x: cx + cw - dw, y: base, size: size * 0.95, font: F.bodyI, color: C.faint });
          const maxW = cw - 12 - dw - 6;
          let lab = exClean(p.name).replace(/\s+/g, ' ').trim();
          if (F.body.widthOfTextAtSize(lab, size) > maxW) {
            while (lab.length > 1 && F.body.widthOfTextAtSize(lab + '…', size) > maxW) lab = lab.slice(0, -1);
            lab = lab.trimEnd() + '…';
          }
          const ok = self.linkable(p.path);
          page.drawText(lab, { x: cx + 12, y: base, size, font: F.body, color: ok ? C.link : C.ink });
          if (ok) links.push({ page, rect: [cx, base - 3, cx + 12 + F.body.widthOfTextAtSize(lab, size), base + size], target: p.path });
        });
        y -= lh;
      }
      gap(6);
    };

    /** Propriétés : libellé à gauche, valeur à droite, sur fond teinté */
    const props = (rows) => {
      if (!rows.length) return;
      const size = 8.5 * S, lh = size * 1.35, pad = 4;
      const labW = Math.min(width() * 0.3, Math.max(...rows.map(([k]) => F.bodyB.widthOfTextAtSize(exClean(k), size))) + 10);
      const laid = rows.map(([k, v]) => [k, layout(exInline(v), { size, maxW: width() - labW - 2 * pad })]);
      const boxH = laid.reduce((a, [, ls]) => a + ls.length * lh, 0) + 2 * pad - 2;
      // fond teinté posé avant le texte quand l'encadré tient sur la page
      if (boxH <= H - M.top - M.bottom) {
        ensure(boxH);
        page.drawRectangle({ x: x0(), y: y - boxH, width: width(), height: boxH, color: C.tint, borderColor: C.rule, borderWidth: 0.4 });
      }
      gap(pad);
      for (const [k, lines] of laid) {
        if (room() < lh * Math.min(2, lines.length)) newPage();
        page.drawText(exClean(k), { x: x0() + pad, y: y - size, size, font: F.bodyB, color: C.muted });
        drawLines(lines, { size, lead: 1.35, x: x0() + pad + labW, maxW: width() - labW - 2 * pad, keep: 1 });
      }
      gap(pad - 2);
      gap(10);
    };

    /** Galerie de photos sur deux colonnes, légende = journée du journal où la photo apparaît */
    const gallery = async (items) => {
      const gapX = 5 * MM, cw = (width() - gapX) / 2, maxCellH = cw * 1.3, capSize = 7.5 * S;
      for (let i = 0; i < items.length; i += 2) {
        const row = [];
        for (const it of items.slice(i, i + 2)) {
          const im = await embedImg(it.file);
          if (!im) continue;
          let w = cw, h = (cw * im.h) / im.w;
          if (h > maxCellH) { h = maxCellH; w = (h * im.w) / im.h; }
          row.push({ ...it, im, w, h });
        }
        if (!row.length) continue;
        const rowH = Math.max(...row.map((r) => r.h)) + capSize * 1.4 + 8;
        ensure(rowH);
        const top = y;
        row.forEach((r, c) => {
          const cx = row.length === 1 ? x0() + (width() - cw) / 2 : x0() + c * (cw + gapX);
          const ix = cx + (cw - r.w) / 2;
          page.drawImage(r.im.img, { x: ix, y: top - r.h, width: r.w, height: r.h });
          page.drawRectangle({ x: ix, y: top - r.h, width: r.w, height: r.h, borderColor: C.rule, borderWidth: 0.4 });
          anchors.set(r.file.path, { page, y: top });
          y = top - r.h - 3;
          const day = r.day;
          const runs = day
            ? [{ text: 'Journal · ', i: true }, { text: day.date ? U.cap(U.fmtMedium(day.date)) : (day.title || day.file.basename), target: day.file.path, i: true }]
            : [{ text: r.file.basename, i: true }];
          drawLines(layout(runs, { size: capSize, maxW: cw }), { size: capSize, x: cx, maxW: cw, align: 'center', color: C.muted, keep: 1 });
          this.stats.photos++;
          this.stats.images++;
        });
        y = top - rowH;
        gap(5);
      }
    };

    /** Budget : vue d'ensemble, synthèse par catégorie et par voyageur, détail des dépenses */
    const budgetSection = (bud) => {
      const s = self.plugin.settings;
      const cur = s.trip.currency || 'EUR';
      const money = (n, c = cur) => exClean(U.fmtMoney(n, c));
      const ex = bud.expenses;
      const total = ex.reduce((a, e) => a + e.amountMain, 0);
      const budgetTotal = U.toNum(s.trip.budget) || 0;
      const nDays = self.data.tripDays().length;

      // vue d'ensemble
      const over = [['Total dépensé', `**${money(total)}**`]];
      if (budgetTotal) {
        over.push(['Budget prévu', money(budgetTotal)]);
        const left = budgetTotal - total;
        over.push([left >= 0 ? 'Reste' : 'Dépassement', `${money(Math.abs(left))} (${Math.round((total / budgetTotal) * 100)} % du budget utilisé)`]);
      }
      if (nDays) over.push(['Moyenne par jour', `${money(total / nDays)} sur ${nDays} jour${nDays > 1 ? 's' : ''}`]);
      const dated = ex.filter((e) => e.date).map((e) => e.date).sort();
      if (dated.length) over.push(['Période', `du ${U.fmtShort(dated[0])} au ${U.fmtShort(dated[dated.length - 1])}`]);
      props(over);

      // synthèse par catégorie
      heading('Synthèse par catégorie', '#budget:sum');
      const by = new Map();
      ex.forEach((e) => { const k = e.cat.label; const v = by.get(k) || { sum: 0, n: 0 }; v.sum += e.amountMain; v.n++; by.set(k, v); });
      const budgets = new Map((s.expenseCategories || []).map((c) => [c.label, U.toNum(c.budget) || 0]));
      const anyBudget = [...budgets.values()].some(Boolean);
      for (const [k, b] of budgets) if (b && !by.has(k)) by.set(k, { sum: 0, n: 0 });
      const rows = [...by.entries()].sort((a, b) => b[1].sum - a[1].sum).map(([k, v]) => {
        const r = [k, String(v.n), money(v.sum)];
        if (anyBudget) { const b = budgets.get(k); r.push(b ? money(b) : '', b ? `${Math.round((v.sum / b) * 100)} %` : ''); }
        r.push(`${Math.round((v.sum / (total || 1)) * 100)} %`);
        return r;
      });
      const tot = ['**Total**', `**${ex.length}**`, `**${money(total)}**`];
      if (anyBudget) tot.push(budgetTotal ? `**${money(budgetTotal)}**` : '', budgetTotal ? `**${Math.round((total / budgetTotal) * 100)} %**` : '');
      tot.push('**100 %**');
      rows.push(tot);
      table(anyBudget ? ['Catégorie', 'Dépenses', 'Dépensé', 'Budget', 'Utilisé', 'Part'] : ['Catégorie', 'Dépenses', 'Dépensé', 'Part'], rows,
        anyBudget ? ['left', 'right', 'right', 'right', 'right', 'right'] : ['left', 'right', 'right', 'right']);

      // par voyageur
      const payers = new Map();
      ex.forEach((e) => { const k = e.payer || 'Non renseigné'; payers.set(k, (payers.get(k) || 0) + e.amountMain); });
      if (payers.size > 1 || !payers.has('Non renseigné')) {
        heading('Par voyageur', null, 3);
        table(['Payé par', 'Montant', 'Part'], [...payers.entries()].sort((a, b) => b[1] - a[1]).map(([p, v]) => [p, money(v), `${Math.round((v / (total || 1)) * 100)} %`]), ['left', 'right', 'right']);
      }

      // détail
      heading('Détail des dépenses', '#budget:detail');
      const hasNote = ex.some((e) => e.note), hasPayer = ex.some((e) => e.payer);
      const sorted = [...ex].sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
      const det = sorted.map((e) => {
        const amt = e.currency && e.currency !== cur ? `${money(e.amount, e.currency)} (${money(e.amountMain)})` : money(e.amount);
        const r = [e.date ? U.fmtShort(e.date) : '', e.label, e.cat.label];
        if (hasPayer) r.push(e.payer);
        r.push(amt);
        if (hasNote) r.push(e.note);
        return r;
      });
      const totRow = ['', '**Total**', ''];
      if (hasPayer) totRow.push('');
      totRow.push(`**${money(total)}**`);
      if (hasNote) totRow.push('');
      det.push(totRow);
      const head = ['Date', 'Libellé', 'Catégorie'];
      const al = ['left', 'left', 'left'];
      if (hasPayer) { head.push('Payé par'); al.push('left'); }
      head.push('Montant'); al.push('right');
      if (hasNote) { head.push('Note'); al.push('left'); }
      table(head, det, al);
      this.stats.expenses = ex.length;
    };

    /* ================================================== composition */
    const T = this.plugin.settings.trip;
    const title = exClean(T.name || this.app.vault.getName()).trim() || 'Mon voyage';
    const days = this.data.tripDays();
    const pl = (n, w, ws = w + 's') => `${n} ${n > 1 ? ws : w}`;
    const secLabel = (key) => EXPORT_SECTIONS.find((x) => x[0] === key)[1];
    const bud = content.budget && content.budget.expenses.length ? content.budget : null;

    /** Libellé d'une note dans le sommaire */
    const tocLabel = (file) => {
      const nt = this.noteTitle(file);
      const date = U.normDate(nt.fm.date);
      if ((nt.type === 'programme' || nt.type === 'journal') && date) {
        const t = nt.fm.title || nt.fm.titre;
        return U.cap(U.fmtMedium(date)) + (t ? ' — ' + t : '');
      }
      if (nt.type === 'poi' && self.placeNo.has(file.path)) return `${self.placeNo.get(file.path)}. ${nt.title}`;
      return nt.title;
    };

    // entrées du sommaire : { label, target, bold, ind }
    const tocEntries = [];
    const tocSec = (key) => tocEntries.push({ label: secLabel(key), target: '#sec:' + key, bold: true });
    if (content.programmes.length) { tocSec('programme'); content.programmes.forEach((p) => tocEntries.push({ label: tocLabel(p.file), target: p.file.path, ind: 1 })); }
    if (content.places.length) {
      tocSec('places');
      const showGroups = content.placeGroups.length > 1 || content.placeGroups[0].key.startsWith('~');
      for (const g of content.placeGroups) {
        if (showGroups) tocEntries.push({ label: g.label, target: '#pl:' + g.key, ind: 1, semi: true });
        g.pois.forEach((p) => tocEntries.push({ label: tocLabel(p.file), target: p.path, ind: showGroups ? 2 : 1 }));
      }
    }
    if (content.journal.length) { tocSec('journal'); content.journal.forEach((j) => tocEntries.push({ label: tocLabel(j.file), target: j.file.path, ind: 1 })); }
    if (content.mapPois.length) tocSec('map');
    if (content.photos.length) tocSec('photos');
    if (bud) {
      tocSec('budget');
      tocEntries.push({ label: 'Synthèse par catégorie', target: '#budget:sum', ind: 1 });
      tocEntries.push({ label: 'Détail des dépenses', target: '#budget:detail', ind: 1 });
    }
    if (content.pdfs.some((p) => !p.error)) { tocSec('attachments'); content.pdfs.filter((p) => !p.error).forEach((p) => tocEntries.push({ label: p.file.basename, target: p.file.path, ind: 1 })); }

    // 1 · couverture (remplie à la fin, quand les totaux sont connus)
    const cover = newPage({ plain: true });

    // 2 · sommaire : pages réservées maintenant, remplies à la fin
    const tocSize = 9.5 * S, tocLh = tocSize * 1.55;
    const tocPages = [];
    if (o.toc && tocEntries.length) {
      let n = 1, yy = H - M.top - 40;
      for (const e of tocEntries) {
        const need = tocLh + (e.bold ? 6 : e.semi ? 3 : 0);
        if (yy - need < M.bottom) { n++; yy = H - M.top; }
        yy -= need;
      }
      for (let k = 0; k < n; k++) tocPages.push(newPage());
    }

    /** Page d'ouverture d'une section */
    const startSection = (key, sub) => {
      curGroup = secLabel(key);
      newPage();
      anchors.set('#sec:' + key, { page, y: H - M.top });
      kicker(title);
      text(secLabel(key), { raw: true, size: 24, bold: true, lead: 1.15 });
      if (sub) text(sub, { raw: true, size: 9, italic: true, color: C.muted });
      gap(4); rule(C.faint, 0.8); gap(14);
    };
    /** Intertitre (avec ancre éventuelle) */
    const heading = (str, anchor, level = 2) => {
      const size = headingSize[level];
      ensure(size * S * 1.4 + 50);
      gap(8);
      if (anchor) anchors.set(anchor, { page, y: y + 4 });
      text(str, { raw: true, size, bold: true, lead: 1.25, keep: 1 });
      gap(1); rule(C.rule, 0.4); gap(5);
    };
    /** Une note : accroche, titre, propriétés, contenu */
    const renderNote = async (file, { first = false, newPageEach = false, kick = null } = {}) => {
      const { title: nt, kicker: nk, type, fm } = this.noteTitle(file);
      if (!first) {
        if (newPageEach || o.pageBreak) newPage();
        else { ensure(110); gap(10); page.drawLine({ start: { x: x0(), y }, end: { x: x0() + 40 * MM, y }, thickness: 1.2, color: C.accent }); gap(16); }
      } else ensure(110);
      anchors.set(file.path, { page, y: y + 6 });
      const k = kick || nk;
      if (k) kicker(k);
      text(nt, { raw: true, size: 18, bold: true, lead: 1.18, keep: 1 });
      gap(4);
      if (o.properties) props(this.properties(file, type, fm));
      else gap(4);
      let md = '';
      try { md = await this.app.vault.cachedRead(file); } catch (e) { md = ''; }
      md = md.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, '');
      const blocks = exBlocks(md);
      // titre principal identique au nom de la note : déjà affiché
      const norm = (s) => exClean(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
      const firstH = blocks.findIndex((b) => b.t === 'h');
      if (firstH >= 0 && blocks[firstH].level === 1 && blocks.slice(0, firstH).every((b) => b.t === 'plugin')
        && [norm(nt), norm(file.basename)].includes(norm(blocks[firstH].text))) blocks.splice(firstH, 1);
      await renderBlocks(blocks, { file });
      this.stats.notes++;
    };

    // 3 · programme jour par jour
    if (content.programmes.length) {
      const n = content.programmes.length;
      startSection('programme', `${pl(n, 'journée')} au programme`);
      for (const [i, p] of content.programmes.entries()) { await renderNote(p.file, { first: i === 0, newPageEach: true }); this.stats.programmes++; }
    }

    // 4 · lieux visités, jour par jour
    if (content.places.length) {
      const nv = content.places.filter((p) => p.done).length;
      startSection('places', o.allPlaces ? `${pl(content.places.length, 'lieu', 'lieux')}, dont ${nv} visité${nv > 1 ? 's' : ''}` : `${pl(nv, 'lieu visité', 'lieux visités')}, dans l'ordre des journées`);
      const showGroups = content.placeGroups.length > 1 || content.placeGroups[0].key.startsWith('~');
      for (const [gi, g] of content.placeGroups.entries()) {
        if (showGroups) {
          if (gi > 0) newPage();
          anchors.set('#pl:' + g.key, { page, y: y + 4 });
          text(g.label, { raw: true, size: 13, bold: true, color: C.accent, keep: 1 });
          text(pl(g.pois.length, 'lieu', 'lieux'), { raw: true, size: 8.5, italic: true, color: C.muted });
          gap(10);
        }
        for (const [i, p] of g.pois.entries()) {
          const n = self.placeNo.get(p.path);
          const kick = `Lieu ${n} · ${p.cat.label}` + (p.done ? (p.doneDate ? ` · visité le ${U.fmtShort(p.doneDate)}` : ' · visité') : ' · non visité');
          await renderNote(p.file, { first: i === 0, kick });
          this.stats.places++;
        }
      }
    }

    // 5 · journal
    if (content.journal.length) {
      startSection('journal', `${pl(content.journal.length, 'journée racontée', 'journées racontées')}`);
      for (const [i, j] of content.journal.entries()) { await renderNote(j.file, { first: i === 0, newPageEach: true }); this.stats.journal++; }
    }

    // 6 · carte des lieux visités
    if (content.mapPois.length) {
      startSection('map', `${pl(content.mapPois.length, 'lieu visité', 'lieux visités')} — les numéros renvoient à la section « Lieux visités »`);
      await poiMap(content.mapPois);
      legend(content.mapPois);
    }

    // 7 · photos du voyage
    if (content.photos.length) {
      startSection('photos', pl(content.photos.length, 'photo'));
      await gallery(content.photos);
    }

    // 8 · budget
    if (bud) {
      const total = bud.expenses.reduce((a, e) => a + e.amountMain, 0);
      startSection('budget', `${pl(bud.expenses.length, 'dépense')} · total ${exClean(U.fmtMoney(total, T.currency || 'EUR'))}`);
      budgetSection(bud);
    }

    // 9 · documents joints : liste, puis pages des PDF
    const okPdfs = content.pdfs.filter((p) => !p.error);
    if (content.pdfs.length) {
      startSection('attachments', `${pl(okPdfs.length, 'document')} reproduit${okPdfs.length > 1 ? 's' : ''} à la suite`);
      const listStart = { page, y };
      const imported = [];
      for (const it of content.pdfs) {
        if (it.error) { imported.push(it); continue; }
        try {
          const copied = await doc.copyPages(it.src, it.src.getPageIndices());
          const firstIdx = doc.getPageCount();
          copied.forEach((p) => doc.addPage(p));
          const p0 = doc.getPage(firstIdx);
          anchors.set(it.file.path, { page: p0, y: p0.getHeight() });
          imported.push({ ...it, n: copied.length, first: firstIdx + 1 });
          this.stats.pdfs++;
          this.stats.pdfPages += copied.length;
        } catch (e) {
          console.warn('[Trip Buddy] PDF non intégré', it.file.path, e);
          this.stats.skippedPdfs.push(it.file.basename);
          imported.push({ ...it, error: e.message || String(e) });
        }
      }
      page = listStart.page; y = listStart.y;
      for (const it of imported) {
        if (room() < 14) break;
        const folder = it.file.parent && it.file.parent.path !== '/' ? it.file.parent.name : '';
        if (it.error) text([{ text: `${it.file.basename} — non intégré (${it.error})`, i: true }], { size: 9.5, color: C.muted, keep: 1 });
        else text([{ text: it.file.basename, target: it.file.path }, { text: `${folder ? ' · ' + folder : ''} — ${pl(it.n, 'page')}, p. ${it.first}`, i: true }], { size: 9.5, keep: 1 });
        gap(3);
      }
    }

    /* ---- numéros de page */
    const allPages = doc.getPages();
    const pageNo = (pg) => allPages.indexOf(pg) + 1;
    const total = allPages.length;

    /* ---- sommaire */
    if (tocPages.length) {
      let ti = 0;
      page = tocPages[0]; y = H - M.top;
      kicker('Sommaire');
      text(title, { raw: true, size: 18, bold: true });
      gap(8);
      for (const e of tocEntries) {
        const a = anchors.get(e.target);
        if (!a) continue;
        if (e.bold) gap(6); else if (e.semi) gap(3);
        if (room() < tocLh) { ti++; if (!tocPages[ti]) break; page = tocPages[ti]; y = H - M.top; }
        const ind = (e.ind || 0) * 5 * MM;
        const num = String(pageNo(a.page));
        const font = e.bold ? F.bodyB : e.semi ? F.bodyI : F.body;
        const numW = font.widthOfTextAtSize(num, tocSize);
        const maxW = width() - ind - numW - 14;
        let lab = exClean(e.label).replace(/\s+/g, ' ').trim();
        if (font.widthOfTextAtSize(lab, tocSize) > maxW) {
          while (lab.length > 1 && font.widthOfTextAtSize(lab + '…', tocSize) > maxW) lab = lab.slice(0, -1);
          lab = lab.trimEnd() + '…';
        }
        const base = y - tocSize;
        const lx = x0() + ind;
        page.drawText(lab, { x: lx, y: base, size: tocSize, font, color: e.bold ? C.ink : e.semi ? C.accent : C.ink });
        page.drawText(num, { x: x1 - numW, y: base, size: tocSize, font, color: e.bold ? C.ink : C.muted });
        // points de conduite
        const from = lx + font.widthOfTextAtSize(lab, tocSize) + 5, to = x1 - numW - 5;
        for (let xx = from; xx < to; xx += 3.2) page.drawCircle({ x: xx, y: base + 1.6, size: 0.35, color: C.faint });
        links.push({ page, rect: [lx, base - 3, x1, base + tocSize], target: e.target });
        y -= tocLh;
      }
    }

    /* ---- couverture */
    page = cover;
    page.drawRectangle({ x: 12 * MM, y: 12 * MM, width: W - 24 * MM, height: H - 24 * MM, borderColor: C.rule, borderWidth: 0.8 });
    y = H * 0.62;
    text('CARNET DU VOYAGE', { raw: true, size: 9, bold: true, color: C.accent, align: 'center' });
    gap(8);
    text(title, { raw: true, size: 32, bold: true, lead: 1.12, align: 'center' });
    gap(6);
    if (T.destination) text(T.destination, { raw: true, size: 13, color: C.muted, align: 'center' });
    if (days.length) text(`${U.fmtDate(days[0], { day: 'numeric', month: 'long' })} – ${U.fmtDate(days[days.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })}`, { raw: true, size: 12, italic: true, color: C.muted, align: 'center' });
    if ((T.travelers || []).length) { gap(6); text(T.travelers.join(' & '), { raw: true, size: 12, italic: true, align: 'center' }); }
    y = 42 * MM;
    const st = this.stats;
    const bits = [];
    if (st.programmes) bits.push(pl(st.programmes, 'jour') + ' de programme');
    if (st.places) bits.push(pl(st.places, 'lieu', 'lieux') + (o.allPlaces ? '' : st.places > 1 ? ' visités' : ' visité'));
    if (st.journal) bits.push(pl(st.journal, 'page') + ' de journal');
    if (st.photos) bits.push(pl(st.photos, 'photo'));
    if (bud) bits.push(pl(bud.expenses.length, 'dépense'));
    if (st.pdfs) bits.push(pl(st.pdfs, 'document joint', 'documents joints'));
    if (bits.length) text(bits.join(' · '), { raw: true, size: 9, color: C.muted, align: 'center' });
    text(`Exporté le ${U.fmtLong(U.todayISO())} · ${total} pages`, { raw: true, size: 9, italic: true, color: C.faint, align: 'center' });

    /* ---- liens cliquables (sommaire, liens internes, URL) */
    const ctx = doc.context;
    for (const l of links) {
      let dict = null;
      if (l.href) dict = { Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0], A: { Type: 'Action', S: 'URI', URI: PDFString.of(l.href) } };
      else {
        let a = anchors.get(l.target);
        if (!a && l.target && !l.target.startsWith('#')) {
          const f = self.data.resolveLink(l.target, '');
          if (f instanceof TFile) a = anchors.get(f.path);
        }
        if (!a) continue;
        dict = { Type: 'Annot', Subtype: 'Link', Rect: l.rect, Border: [0, 0, 0], Dest: [a.page.ref, 'XYZ', null, a.y, null] };
      }
      try { l.page.node.addAnnot(ctx.register(ctx.obj(dict))); } catch (e) { /* lien ignoré */ }
    }

    /* ---- pied de page des pages composées (pas les annexes importées) */
    for (const p of pages) {
      if (p.plain) continue;
      const n = pageNo(p.page);
      const size = 7.5 * S;
      const lab = `${n} / ${total}`;
      p.page.drawLine({ start: { x: M.left, y: 13 * MM }, end: { x: x1, y: 13 * MM }, thickness: 0.4, color: C.rule });
      p.page.drawText(lab, { x: x1 - F.body.widthOfTextAtSize(lab, size), y: 9 * MM, size, font: F.body, color: C.muted });
      const left = exClean(`${title}${p.group ? ' · ' + p.group : ''}`);
      p.page.drawText(left, { x: M.left, y: 9 * MM, size, font: F.bodyI, color: C.faint });
    }

    doc.setTitle(`${title} — export du coffre`);
    doc.setCreator('Trip Buddy (Obsidian)');
    doc.setProducer('Trip Buddy');
    return { doc, total };
  }

  async generate() {
    const { doc, total } = await this.build();
    const bytes = await doc.save();
    return { bytes, pages: total, ...this.stats, skipped: this.bk.skipped || 0, fontFallback: !!this.bk.fontFallback, mapOffline: !!this.mapOffline };
  }
}

/* ----------------------------------------------------------- fenêtre */
class VaultExportModal extends TBModal {
  constructor(plugin) { super(plugin, '📄 Exporter le voyage en PDF'); }

  onOpen() {
    const c = this.contentEl;
    c.addClass('tb', 'tb-booklet');
    this.modalEl.addClass('tb-booklet-modal');
    const saved = this.plugin.settings.vaultExport || {};
    this.opts = { ...EXPORT_DEFAULTS, ...saved };
    if (!BK_FONTS[this.opts.font]) this.opts.font = 'moderne';
    BookletModal.loadPreviewFonts(this.plugin);

    c.createDiv({ cls: 'tb-muted tb-bk-intro', text: `Un seul PDF A4 avec couverture et sommaire cliquable, rassemblant le contenu du voyage. Les pages de documentation du coffre (accueil, mode d’emploi, guide, valise, modèles) ne sont pas incluses. Enregistré dans « ${this.plugin.settings.folders.documents || 'la racine'} ».` });

    const section = (title) => { const s = c.createDiv('tb-bk-section'); s.createEl('h4', { text: title }); return s; };
    const checks = (parent, list) => {
      const g = parent.createDiv('tb-bk-checks');
      for (const [key, label] of list) {
        const l = g.createEl('label', { cls: 'tb-bk-check' });
        const cb = l.createEl('input', { type: 'checkbox' });
        cb.checked = !!this.opts[key];
        cb.addEventListener('change', () => { this.opts[key] = cb.checked; });
        l.createSpan({ text: label });
      }
    };

    /* ---- sections */
    const d = this.plugin.data;
    const pois = d.pois();
    const count = {
      programme: d.programmes().length, places: pois.filter((p) => p.done).length, journal: d.journal().length,
      map: pois.filter((p) => p.done && p.hasCoords).length,
    };
    const se = section('📖 Sections');
    checks(se, EXPORT_SECTIONS.map(([key, , label]) => [key, count[key] != null ? `${label} (${count[key]})` : label]));

    /* ---- options */
    const op = section('⚙️ Options');
    checks(op, [
      ['toc', 'Sommaire cliquable'],
      ['properties', 'Propriétés des notes (adresse, note, météo…)'],
      ['images', 'Photos dans les lieux et le journal'],
      ['allPlaces', 'Inclure aussi les lieux non visités'],
      ['pageBreak', 'Chaque lieu sur une nouvelle page'],
    ]);

    /* ---- police */
    const ft = section('🖋️ Police');
    const fgr = ft.createDiv('tb-bk-fonts');
    for (const [key, def] of Object.entries(BK_FONTS)) {
      const b = fgr.createEl('button', { cls: 'tb-bk-font tb-no-ico' + (this.opts.font === key ? ' is-active' : ''), attr: { type: 'button' } });
      const sample = b.createDiv({ cls: 'tb-bk-font-sample', text: 'Arrivée à Barcelone' });
      sample.style.fontFamily = def.css || `"tb-bk-${key}", serif`;
      const lab = b.createDiv({ cls: 'tb-bk-font-name' });
      lab.createSpan({ text: def.label });
      lab.createSpan({ cls: 'tb-muted', text: ' · ' + def.desc });
      b.addEventListener('click', () => {
        this.opts.font = key;
        fgr.querySelectorAll('.tb-bk-font').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
      });
    }

    this.status = c.createDiv({ cls: 'tb-muted tb-small' });
    this.footer([
      ['↺ Options par défaut', 'tb-bk-reset', () => { this.plugin.settings.vaultExport = {}; this.contentEl.empty(); this.onOpen(); }],
      ['Annuler', '', () => this.close()],
      ['📄 Exporter le PDF', 'mod-cta', () => this.run()],
    ]);
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    this.status.setText('⏳ Export en cours… (photos, carte et documents peuvent prendre quelques secondes)');
    try {
      this.plugin.settings.vaultExport = { ...this.opts };
      await this.plugin.persistSettings();
      const file = await VaultExportModal.export(this.plugin, this.opts);
      this.close();
      this.plugin.openFile(file, true);
    } catch (e) {
      console.error('[Trip Buddy] export du voyage', e);
      this.status.setText('⚠️ Échec de l’export : ' + (e.message || e));
    } finally {
      this.busy = false;
    }
  }

  /** Génère et enregistre le PDF ; renvoie le fichier créé (ou mis à jour) */
  static async export(plugin, opts) {
    const res = await new VaultExporter(plugin, opts).generate();
    const app = plugin.app;
    const path = VaultExporter.outputPath(plugin);
    await plugin.ensureFolder(path.split('/').slice(0, -1).join('/'));
    const buf = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength);
    const existing = app.vault.getAbstractFileByPath(path);
    let file;
    if (existing instanceof TFile) { await app.vault.modifyBinary(existing, buf); file = existing; } else file = await app.vault.createBinary(path, buf);
    const pl = (n, w, ws = w + 's') => `${n} ${n > 1 ? ws : w}`;
    const notes = [];
    if (res.skippedPdfs.length) notes.push(`${pl(res.skippedPdfs.length, 'PDF')} non intégré${res.skippedPdfs.length > 1 ? 's' : ''} (${res.skippedPdfs.join(', ')})`);
    if (res.skipped) notes.push(`${pl(res.skipped, 'image')} illisible${res.skipped > 1 ? 's' : ''}`);
    if (res.fontFallback) notes.push('police indisponible, Times utilisée');
    if (res.mapOffline) notes.push('carte non incluse (hors ligne)');
    new Notice(`📄 Voyage exporté : ${res.pages} pages`
      + (res.places ? `, ${pl(res.places, 'lieu', 'lieux')}` : '') + (res.journal ? `, ${res.journal} jour${res.journal > 1 ? 's' : ''} de journal` : '')
      + (res.photos ? `, ${pl(res.photos, 'photo')}` : '') + (res.pdfs ? `, ${pl(res.pdfs, 'document')} joint${res.pdfs > 1 ? 's' : ''}` : '')
      + (notes.length ? ` — ${notes.join(' · ')}` : ''), 9000);
    return file;
  }

  onClose() { this.contentEl.empty(); }
}
