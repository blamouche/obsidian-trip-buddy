/* ==========================================================================
 * Trip Buddy — carnet souvenir imprimable
 * PDF imposé in-quarto : A4 recto-verso → livret A6, piqûre à cheval,
 * traits de coupe (tête, pied, gouttière) et repère de pli.
 *
 * Géométrie (mm, origine en haut à gauche de la feuille A4 portrait) :
 *   - 4 panneaux A6 par face (2 × 2), rangée du haut tournée à 180° ;
 *   - le dos (pli de couture) est la verticale x = 105 ;
 *   - la tête des pages est contre l'horizontale y = 148,5 (pli de tête, coupé) ;
 *   - rognage : 6 mm en gouttière, 6 mm en pied, 4 mm en tête
 *     → format fini 99 × 138,5 mm.
 * ========================================================================== */
const BK = {
  MM: 72 / 25.4,
  SHEET_W: 210, SHEET_H: 297,
  TRIM_FORE: 6, TRIM_FOOT: 6, TRIM_HEAD: 4,
  get PAGE_W() { return 105 - this.TRIM_FORE; },               // 99
  get PAGE_H() { return 148.5 - this.TRIM_FOOT - this.TRIM_HEAD; }, // 138.5
};

/** Options du compositeur (mémorisées dans les réglages, clé `booklet`) */
const BOOKLET_DEFAULTS = {
  font: 'classique',
  cover: 'auto',            // 'auto' | 'none' | chemin d'une image
  coverTitle: '',           // vide = nom du voyage
  coverDest: true, coverDates: true, coverTravelers: true,
  summary: true, map: true, tracks: true, index: true, notes: true, backCover: true,
  dayDate: true, dayLocation: true, dayWeather: true, dayMood: true,
  dayCover: true, texts: true, photos: true, dayPlaces: true, planned: true, dayMap: false, dayProfile: true,
  placeCat: true, placeRating: true, placeAddress: true, placeDate: true,
};

/** Polices proposées : Times (standard PDF) ou fichiers TTF du dossier fonts/ du module */
const BK_FONTS = {
  classique: { label: 'Classique', desc: 'Times', css: '"Times New Roman", Times, serif', scale: 1 },
  elegante: {
    label: 'Élégante', desc: 'EB Garamond', scale: 1.06,
    files: { body: 'EBGaramond-Regular.ttf', bodyI: 'EBGaramond-Italic.ttf', bodyB: 'EBGaramond-Bold.ttf', bodyBI: 'EBGaramond-BoldItalic.ttf' },
  },
  moderne: {
    label: 'Moderne', desc: 'Source Sans 3', scale: 0.94,
    files: { body: 'SourceSans3-Regular.ttf', bodyI: 'SourceSans3-Italic.ttf', bodyB: 'SourceSans3-Bold.ttf', bodyBI: 'SourceSans3-BoldItalic.ttf' },
  },
  manuscrite: {
    label: 'Manuscrite', desc: 'Kalam', scale: 0.98,
    files: { body: 'Kalam-Regular.ttf', bodyI: 'Kalam-Regular.ttf', bodyB: 'Kalam-Bold.ttf', bodyBI: 'Kalam-Bold.ttf' },
  },
};

/** Couleurs des journées sur les cartes (terre cuite, bleu canard, olive, prune, ocre, ardoise) */
const BK_DAY_COLORS = [[0.66, 0.31, 0.2], [0.13, 0.43, 0.53], [0.4, 0.47, 0.16], [0.5, 0.27, 0.49], [0.75, 0.53, 0.1], [0.3, 0.35, 0.45]];

/* Caractères encodables en WinAnsi (polices standard PDF) */
const WINANSI_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
function bkText(s) {
  if (s == null) return '';
  let t = String(s)
    .replace(/[    ]/g, ' ')
    .replace(/→/g, '–').replace(/←/g, '–').replace(/≈/g, '~').replace(/×/g, 'x')
    .replace(/[✓✔]/g, '').replace(/[★☆]/g, '').replace(/−/g, '-')
    .replace(/️/g, '');
  let out = '';
  for (const ch of t) {
    const c = ch.codePointAt(0);
    if ((c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || WINANSI_EXTRA.has(ch) || ch === '\n') out += ch;
  }
  return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Markdown d'une section → éléments simples (paragraphes, puces, images) */
function bkMarkdown(md) {
  const items = [];
  let para = [];
  const flush = () => { if (para.length) { items.push({ t: 'p', text: para.join(' ') }); para = []; } };
  const inline = (s) => s
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, (m, a) => a.split('#')[0])
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/(\*\*|__|\*|_|`|~~)/g, '');
  for (const raw of md.split('\n')) {
    const line = raw.trimEnd();
    const imgs = [...line.matchAll(/!\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map((m) => m[1]);
    if (imgs.length) { flush(); imgs.forEach((i) => items.push({ t: 'img', link: i })); }
    const text = line.replace(/!\[\[[^\]]*\]\]/g, '').trim();
    if (!text) { flush(); continue; }
    if (/^```/.test(text) || /^\|/.test(text) || /^---+$/.test(text)) { flush(); continue; }
    const callout = text.match(/^>\s*\[![^\]]+\]\s*(.*)$/);
    if (callout) { flush(); if (callout[1]) items.push({ t: 'p', text: inline(callout[1]), italic: true }); continue; }
    const li = text.match(/^(?:[-*+]|\d+[.)])\s+(?:\[.\]\s+)?(.*)$/);
    if (li) { flush(); items.push({ t: 'li', text: inline(li[1]) }); continue; }
    const h = text.match(/^#{3,6}\s+(.*)$/);
    if (h) { flush(); items.push({ t: 'h3', text: inline(h[1]) }); continue; }
    para.push(inline(text.replace(/^>\s?/, '')));
  }
  flush();
  return items.filter((i) => i.t === 'img' || bkText(i.text));
}

class BookletBuilder {
  constructor(plugin, opts = {}) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.data = plugin.data;
    this.opts = { ...BOOKLET_DEFAULTS, ...opts };
    this.tileCache = new Map();
    this.mapIssues = 0;
  }

  static fontDir(plugin) {
    const m = plugin.manifest || {};
    return normalizePath((m.dir || `${plugin.app.vault.configDir}/plugins/${m.id || 'trip-buddy'}`) + '/fonts');
  }

  /* ------------------------------------------------------ images (canvas) */
  async decode(buf, ext) {
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/jpeg';
    const blob = new Blob([buf], { type });
    if (typeof createImageBitmap === 'function') return { img: await createImageBitmap(blob), url: null };
    const url = URL.createObjectURL(blob);
    const img = await new Promise((res, rej) => {
      const i = new Image();
      const t = setTimeout(() => rej(new Error('délai dépassé')), 15000);
      i.onload = () => { clearTimeout(t); res(i); };
      i.onerror = (e) => { clearTimeout(t); rej(e); };
      i.src = url;
    });
    return { img, url };
  }

  async loadImage(file, { maxPx = 1100, aspect = null } = {}) {
    if (!(file instanceof TFile) || !IMG_EXT.includes(file.extension.toLowerCase())) return null;
    let buf = null;
    const ext = file.extension.toLowerCase();
    try {
      buf = await this.app.vault.readBinary(file);
      const { img, url } = await this.decode(buf, ext);
      let sx = 0, sy = 0, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
      if (aspect) { // recadrage centré
        if (sw / sh > aspect) { const w = sh * aspect; sx = (sw - w) / 2; sw = w; } else { const h = sw / aspect; sy = (sh - h) / 2; sh = h; }
      }
      const scale = Math.min(1, maxPx / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      if (url) URL.revokeObjectURL(url);
      if (img.close) img.close();
      return { dataUrl: c.toDataURL('image/jpeg', 0.82), w: c.width, h: c.height };
    } catch (e) {
      // repli : JPEG / PNG intégrés tels quels (sans redimensionnement ni recadrage)
      if (buf && ['jpg', 'jpeg', 'png'].includes(ext)) return { raw: new Uint8Array(buf), png: ext === 'png' };
      console.warn('[Trip Buddy] image ignorée', file.path, e);
      this.skipped = (this.skipped || 0) + 1;
      return null;
    }
  }

  /* ------------------------------------------------------------- polices */
  async loadFonts(doc, PDFLib) {
    const { StandardFonts } = PDFLib;
    const std = async () => ({
      body: await doc.embedFont(StandardFonts.TimesRoman),
      bodyI: await doc.embedFont(StandardFonts.TimesRomanItalic),
      bodyB: await doc.embedFont(StandardFonts.TimesRomanBold),
      bodyBI: await doc.embedFont(StandardFonts.TimesRomanBoldItalic),
      scale: 1,
    });
    const def = BK_FONTS[this.opts.font] || BK_FONTS.classique;
    if (!def.files) return std();
    try {
      doc.registerFontkit(TB_loadFontkit());
      const dir = BookletBuilder.fontDir(this.plugin);
      const cache = new Map();
      const load = async (name) => {
        if (!cache.has(name)) {
          const buf = await this.app.vault.adapter.readBinary(`${dir}/${name}`);
          // ccmp désactivé : la ligature catalane « l·l » de Source Sans est mal restituée par pdf-lib
          cache.set(name, await doc.embedFont(new Uint8Array(buf), { subset: false, features: { ccmp: false } }));
        }
        return cache.get(name);
      };
      const F = {};
      for (const [k, name] of Object.entries(def.files)) F[k] = await load(name);
      F.scale = def.scale || 1;
      return F;
    } catch (e) {
      console.warn('[Trip Buddy] police indisponible, repli sur Times', e);
      this.fontFallback = true;
      return std();
    }
  }

  /* ------------------------------------------------------------- carte */
  tileSource() {
    const s = this.plugin.settings.map || {};
    const preset = TILE_PRESETS[s.tiles] || TILE_PRESETS.osm;
    const url = s.tiles === 'custom' && s.customUrl ? s.customUrl : preset.url;
    const attribution = String(preset.attribution || '© OpenStreetMap').replace(/<[^>]+>/g, '');
    return { url, subdomains: preset.subdomains || 'abc', attribution, maxZoom: Math.min(preset.maxZoom || 19, 17) };
  }

  async tile(src, z, x, y) {
    const n = 2 ** z;
    const tx = ((x % n) + n) % n;
    const sub = src.subdomains[(tx + y) % src.subdomains.length];
    const url = src.url.replace('{s}', sub).replace('{z}', z).replace('{x}', tx).replace('{y}', y).replace('{r}', '');
    if (this.tileCache.has(url)) return this.tileCache.get(url);
    const p = (async () => {
      try {
        const res = await requestUrl({ url, headers: { 'User-Agent': Geocoder.UA } });
        const { img } = await this.decode(res.arrayBuffer, 'png');
        return img;
      } catch (e) {
        console.warn('[Trip Buddy] tuile indisponible', url, e);
        return null;
      }
    })();
    this.tileCache.set(url, p);
    return p;
  }

  /**
   * Fond de carte (canvas → JPEG) couvrant tous les points, et position relative (0–1) de chacun.
   * points : [{ lat, lon }] ; wPt × hPt : taille dans la page (points PDF)
   */
  /** `extent` : points supplémentaires à faire tenir dans le cadre (emprise des traces GPX) */
  async renderMap(points, wPt, hPt, extent = []) {
    const DPI = 180, T = 256;
    const pxW = Math.round((wPt / 72) * DPI), pxH = Math.round((hPt / 72) * DPI);
    const src = this.tileSource();
    const proj = (lat, lon, z) => {
      const n = T * 2 ** z, r = (lat * Math.PI) / 180;
      return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
    };
    const pad = 0.12;
    const frame = points.concat(extent);
    let z = Math.min(src.maxZoom, 16);
    if (frame.length > 1) {
      for (; z > 2; z--) {
        const xy = frame.map((p) => proj(p.lat, p.lon, z));
        const bw = Math.max(...xy.map((q) => q[0])) - Math.min(...xy.map((q) => q[0]));
        const bh = Math.max(...xy.map((q) => q[1])) - Math.min(...xy.map((q) => q[1]));
        if (bw <= pxW * (1 - 2 * pad) && bh <= pxH * (1 - 2 * pad)) break;
      }
    } else z = Math.min(src.maxZoom, 15);
    const xy = points.map((p) => proj(p.lat, p.lon, z));
    const fxy = frame.map((p) => proj(p.lat, p.lon, z));
    const cx = (Math.max(...fxy.map((q) => q[0])) + Math.min(...fxy.map((q) => q[0]))) / 2;
    const cy = (Math.max(...fxy.map((q) => q[1])) + Math.min(...fxy.map((q) => q[1]))) / 2;
    const ox = cx - pxW / 2, oy = cy - pxH / 2;

    const c = document.createElement('canvas');
    c.width = pxW; c.height = pxH;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#f2eee6'; ctx.fillRect(0, 0, pxW, pxH);
    const jobs = [];
    const n = 2 ** z;
    for (let ty = Math.floor(oy / T); ty <= Math.floor((oy + pxH) / T); ty++) {
      if (ty < 0 || ty >= n) continue;
      for (let tx = Math.floor(ox / T); tx <= Math.floor((ox + pxW) / T); tx++) {
        jobs.push(this.tile(src, z, tx, ty).then((img) => ({ img, tx, ty })));
      }
    }
    const tiles = await Promise.all(jobs);
    // teintes adoucies pour l'impression
    try { ctx.filter = 'saturate(0.6) contrast(0.97)'; } catch (e) { /* non pris en charge */ }
    let missing = 0;
    for (const t of tiles) {
      if (!t.img) { missing++; continue; }
      ctx.drawImage(t.img, Math.round(t.tx * T - ox), Math.round(t.ty * T - oy));
    }
    try { ctx.filter = 'none'; } catch (e) { /* — */ }
    ctx.fillStyle = 'rgba(255, 252, 244, 0.16)'; ctx.fillRect(0, 0, pxW, pxH);
    if (missing) this.mapIssues++;
    return {
      dataUrl: c.toDataURL('image/jpeg', 0.86),
      pos: xy.map((q) => [(q[0] - ox) / pxW, (q[1] - oy) / pxH]),
      project: (lat, lon) => { const q = proj(lat, lon, z); return [(q[0] - ox) / pxW, (q[1] - oy) / pxH]; },
      attribution: src.attribution,
      offline: missing === tiles.length,
    };
  }

  /* ------------------------------------------------------------- contenu */
  /** Ordre des lieux d'une journée : celui du programme, sinon alphabétique */
  orderDay(date, list) {
    const prog = this.data.programmeFor(date);
    const idx = (p) => {
      const i = prog ? prog.steps.findIndex((s) => s.file === p.file) : -1;
      return i < 0 ? 999 : i;
    };
    return [...list].sort((a, b) => idx(a) - idx(b) || a.name.localeCompare(b.name, LOCALE));
  }

  async collect() {
    const o = this.opts;
    const s = this.plugin.settings;
    const d = this.data;
    const days = d.tripDays();
    const journal = d.journal().filter((j) => j.date);
    const pois = d.pois();
    const chapters = [];
    const dayList = [...new Set([...journal.map((j) => j.date), ...pois.filter((p) => p.done && p.doneDate).map((p) => p.doneDate)])].sort();
    for (const date of dayList) {
      const j = journal.find((x) => x.date === date);
      const visited = this.orderDay(date, pois.filter((p) => p.done && p.doneDate === date));
      const prog = d.programmeFor(date);
      const ch = { date, idx: d.dayIndex(date), title: j ? j.title : '', location: j ? j.location : '', weather: j ? j.weather : '', mood: j ? j.mood : NaN, cover: null, sections: [], visited, planned: [] };
      if (!visited.length && prog) ch.planned = prog.steps.filter((x) => !x.missing && x.cat && !['hebergement', 'transport'].includes(x.cat.id));
      if (j) {
        if (j.cover && o.dayCover) ch.cover = d.resolveLink(j.cover, j.file.path);
        if (o.texts || o.photos) {
          const text = await this.app.vault.cachedRead(j.file);
          const body = text.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/```[\s\S]*?```/g, '');
          const parts = body.split(/^##\s+/m).slice(1);
          for (const part of parts) {
            const nl = part.indexOf('\n');
            const heading = bkText(nl < 0 ? part : part.slice(0, nl));
            const items = bkMarkdown(nl < 0 ? '' : part.slice(nl + 1))
              .map((it) => (it.t === 'img' ? { ...it, file: d.resolveLink(it.link, j.file.path) } : it))
              .filter((it) => (it.t === 'img' ? o.photos && it.file instanceof TFile : o.texts));
            if (items.length) ch.sections.push({ heading, items });
          }
        }
      }
      chapters.push(ch);
    }
    const allVisited = pois.filter((p) => p.done);
    return { trip: s.trip, days, chapters, pois, allVisited };
  }

  /** Photo de couverture selon l'option choisie */
  coverFile(content) {
    const o = this.opts;
    if (o.cover === 'none') return null;
    if (o.cover && o.cover !== 'auto') {
      const f = this.app.vault.getAbstractFileByPath(o.cover);
      if (f instanceof TFile) return f;
    }
    const journalCovers = this.data.journal().map((j) => j.cover && this.data.resolveLink(j.cover, j.file.path));
    return journalCovers.find((f) => f instanceof TFile) ||
      content.allVisited.map((p) => p.photo).find((f) => f instanceof TFile) ||
      content.pois.map((p) => p.photo).find((f) => f instanceof TFile) || null;
  }

  /* ---------------------------------------------------------- mise en page */
  async build() {
    const PDFLib = TB_loadPdfLib();
    const { PDFDocument, rgb } = PDFLib;
    const o = this.opts;
    const content = await this.collect();
    const doc = await PDFDocument.create();
    const F = await this.loadFonts(doc, PDFLib);
    const S = F.scale;
    const C = { ink: rgb(0.13, 0.12, 0.11), muted: rgb(0.42, 0.39, 0.35), faint: rgb(0.72, 0.69, 0.64), accent: rgb(0.58, 0.32, 0.2), rule: rgb(0.82, 0.78, 0.71), star: rgb(0.85, 0.6, 0.15), white: rgb(1, 1, 1) };
    const dayColor = (i) => rgb(...BK_DAY_COLORS[((i % BK_DAY_COLORS.length) + BK_DAY_COLORS.length) % BK_DAY_COLORS.length]);
    const MM = BK.MM;
    const W = BK.PAGE_W * MM, H = BK.PAGE_H * MM;
    const M = { spine: 9 * MM, fore: 8 * MM, top: 9 * MM, bottom: 11 * MM };
    const pages = []; // { page, n }
    const self = this;
    const imgCache = new Map();
    const embedImg = async (file, opt) => {
      const key = file.path + JSON.stringify(opt || {});
      if (imgCache.has(key)) return imgCache.get(key);
      const im = await self.loadImage(file, opt);
      let res = null;
      try {
        if (im && im.raw) {
          const img = im.png ? await doc.embedPng(im.raw) : await doc.embedJpg(im.raw);
          res = { img, w: img.width, h: img.height };
        } else if (im) {
          res = { img: await doc.embedJpg(im.dataUrl), w: im.w, h: im.h };
        }
      } catch (e) {
        console.warn('[Trip Buddy] image non intégrée', file.path, e);
        self.skipped = (self.skipped || 0) + 1;
      }
      imgCache.set(key, res);
      return res;
    };

    /* ---- outils de page */
    let page = null, x0 = 0, x1 = 0, y = 0;
    const newPage = (opts = {}) => {
      page = doc.addPage([W, H]);
      const n = pages.length + 1;
      pages.push({ page, n, plain: !!opts.plain });
      const odd = n % 2 === 1;
      x0 = odd ? M.spine : M.fore;
      x1 = W - (odd ? M.fore : M.spine);
      y = H - M.top;
      return page;
    };
    const width = () => x1 - x0;
    const room = () => y - M.bottom;
    const wrap = (text, font, size, maxW) => {
      const words = bkText(text).split(/\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? cur + ' ' + w : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; continue; }
        if (cur) lines.push(cur);
        if (font.widthOfTextAtSize(w, size) > maxW) { // mot trop long : coupe
          let part = '';
          for (const ch of w) { if (font.widthOfTextAtSize(part + ch, size) > maxW) { lines.push(part); part = ch; } else part += ch; }
          cur = part;
        } else cur = w;
      }
      if (cur) lines.push(cur);
      return lines;
    };
    /** Paragraphe ; `size` est la taille de référence (Times), ajustée selon la police */
    const text = (str, { font = F.body, size = 9, color = C.ink, lead = 1.32, indent = 0, align = 'left', keep = 1 } = {}) => {
      size *= S;
      const lines = wrap(str, font, size, width() - indent);
      const lh = size * lead;
      if (room() < lh * Math.min(keep, lines.length)) newPage();
      for (const ln of lines) {
        if (room() < lh) newPage();
        y -= size;
        let x = x0 + indent;
        if (align === 'center') x = x0 + (width() - font.widthOfTextAtSize(ln, size)) / 2;
        if (align === 'right') x = x1 - font.widthOfTextAtSize(ln, size);
        page.drawText(ln, { x, y, size, font, color });
        y -= lh - size;
      }
    };
    const gap = (mm) => { y -= mm * MM; };
    const rule = (w = width(), color = C.rule) => { page.drawLine({ start: { x: x0, y }, end: { x: x0 + w, y }, thickness: 0.5, color }); };
    const star = (cx, cy, r, filled) => {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const rr = i % 2 === 0 ? r : r * 0.45;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)} ${(-cy - rr * Math.sin(a)).toFixed(2)}`);
      }
      // drawSvgPath : y vers le bas, origine fournie en x/y
      page.drawSvgPath('M ' + pts.join(' L ') + ' Z', { x: 0, y: 0, color: filled ? C.star : undefined, borderColor: C.star, borderWidth: 0.4 });
    };
    const stars = (x, yb, n) => { for (let i = 0; i < 5; i++) star(x + i * 7.2 + 3, yb + 3, 3, i < n); };
    /** Pastille numérotée (carte, légende, listes) */
    const badge = (cx, cy, num, color, r = 4.3) => {
      page.drawCircle({ x: cx, y: cy, size: r, color, borderColor: C.white, borderWidth: 0.7 });
      const label = String(num);
      const sz = (num > 9 ? 4.4 : 5.2) * (r / 4.3);
      const f = F.bodyB;
      page.drawText(label, { x: cx - f.widthOfTextAtSize(label, sz) / 2, y: cy - sz * 0.34, size: sz, font: f, color: C.white });
    };
    const image = async (file, { maxH = 0.5, aspect = null, caption = '' } = {}) => {
      const im = await embedImg(file, { maxPx: 1100, aspect });
      if (!im) return;
      let w = width(), h = (w * im.h) / im.w;
      const maxHpt = (H - M.top - M.bottom) * maxH;
      if (h > maxHpt) { h = maxHpt; w = (h * im.w) / im.h; }
      if (room() < h + 4) newPage();
      const x = x0 + (width() - w) / 2;
      page.drawRectangle({ x: x - 2, y: y - h - 2, width: w + 4, height: h + 4, color: rgb(1, 1, 1), borderColor: C.rule, borderWidth: 0.4 });
      page.drawImage(im.img, { x, y: y - h, width: w, height: h });
      y -= h + 6;
      if (caption) text(caption, { font: F.bodyI, size: 7, color: C.muted, align: 'center' });
    };
    const kicker = (str, color = C.accent) => {
      const s = bkText(str).toUpperCase();
      const size = 7 * S;
      // petites capitales espacées
      let xx = x0;
      for (const ch of s) { page.drawText(ch, { x: xx, y: y - size, size, font: F.bodyB, color }); xx += F.bodyB.widthOfTextAtSize(ch, size) + 0.9; }
      y -= size + 5;
    };
    const fmtDay = (iso) => bkText(U.cap(U.fmtLong(iso)));
    /** Ligne d'un lieu ; `num`/`color` : pastille de renvoi vers la carte */
    const placeLine = (p, withDate, num = 0, color = C.accent) => {
      if (room() < 26 * S) newPage();
      const indent = num ? 6 * MM : 0;
      if (num) badge(x0 + 2.2 * MM, y - 9 * S * 0.62, num, color, 3.6);
      text(p.name, { font: F.bodyB, size: 9, keep: 2, indent });
      const trk = o.tracks && p.distanceKm ? `${String(p.distanceKm).replace('.', ',')} km${p.eleGain ? ` · D+ ${p.eleGain} m` : ''}` : '';
      const bits = [o.placeCat && p.cat ? p.cat.label : '', trk, withDate && o.placeDate && p.doneDate ? bkText(U.fmtShort(p.doneDate)) : ''].filter(Boolean).join(' · ');
      const showStars = o.placeRating && p.rating;
      if (bits || showStars) {
        const sz = 7.5 * S;
        const yb = y - sz;
        if (bits) page.drawText(bkText(bits), { x: x0 + indent, y: yb, size: sz, font: F.bodyI, color: C.muted });
        if (showStars) stars(x0 + indent + (bits ? F.bodyI.widthOfTextAtSize(bkText(bits), sz) + 6 : 0), yb - 0.5, p.rating);
        y -= sz + 3.5;
      }
      if (o.placeAddress && p.address) text(p.address, { font: F.body, size: 7, color: C.faint, indent });
      gap(1.5);
    };
    /**
     * Carte : groups = [{ color, places: [poi…] }] ; numérotation continue, tracé pointillé par groupe.
     * Renvoie la Map poi.path → numéro.
     */
    const drawMap = async (groups, { hFrac = 0.6 } = {}) => {
      const numbers = new Map();
      const pts = [];
      groups.forEach((g) => g.places.forEach((p) => {
        if (!p.hasCoords || numbers.has(p.path)) return;
        numbers.set(p.path, pts.length + 1);
        pts.push({ lat: p.lat, lon: p.lon, color: g.color, num: pts.length + 1, path: p.path });
      }));
      if (!pts.length) return numbers;
      // traces GPX des lieux affichés (couleur de leur groupe)
      const tracks = [];
      const extent = [];
      if (o.tracks) {
        const seen = new Set();
        for (const g of groups) {
          for (const p of g.places) {
            if (!p.hasCoords || !(p.gpx || []).length || seen.has(p.path)) continue;
            seen.add(p.path);
            for (const { track } of await TBGpx.forPoi(self.plugin, p)) {
              if (!track.segments.some((sg) => sg.length > 1)) continue;
              tracks.push({ color: g.color, segments: track.segments });
              const b = track.bounds;
              if (b) extent.push({ lat: b[0][0], lon: b[0][1] }, { lat: b[1][0], lon: b[1][1] });
            }
          }
        }
      }
      const w = width();
      const h = Math.min((H - M.top - M.bottom) * hFrac, w * 1.15);
      if (room() < h + 10) newPage();
      const mp = await self.renderMap(pts, w, h, extent);
      const img = await doc.embedJpg(mp.dataUrl);
      const top = y;
      page.drawImage(img, { x: x0, y: top - h, width: w, height: h });
      page.drawRectangle({ x: x0, y: top - h, width: w, height: h, borderColor: C.rule, borderWidth: 0.6 });
      const at = (i) => ({ x: x0 + mp.pos[i][0] * w, y: top - mp.pos[i][1] * h });
      // traces : liseré blanc puis trait plein, points rapprochés (< 0,35 pt) écartés
      for (const t of tracks) {
        let d = '';
        for (const sg of t.segments) {
          let last = null;
          sg.forEach((q, k) => {
            const r = mp.project(q.lat, q.lon);
            const px = r[0] * w, py = r[1] * h;
            if (last && k < sg.length - 1 && Math.hypot(px - last[0], py - last[1]) < 0.35) return;
            d += `${last ? 'L' : 'M'}${px.toFixed(2)} ${py.toFixed(2)} `;
            last = [px, py];
          });
        }
        if (!d) continue;
        const line = { x: x0, y: top, borderLineCap: PDFLib.LineCapStyle.Round };
        page.drawSvgPath(d, { ...line, borderColor: C.white, borderWidth: 2.6, borderOpacity: 0.85 });
        page.drawSvgPath(d, { ...line, borderColor: t.color, borderWidth: 1.25, borderOpacity: 0.95 });
      }
      // tracé des itinéraires (ordre de visite), puis pastilles
      for (const g of groups) {
        const idx = g.places.map((p) => pts.findIndex((q) => q.path === p.path)).filter((i) => i >= 0);
        for (let k = 1; k < idx.length; k++) {
          page.drawLine({ start: at(idx[k - 1]), end: at(idx[k]), thickness: 1, color: g.color, opacity: 0.75, dashArray: [2.2, 1.6] });
        }
      }
      pts.forEach((p, i) => { const a = at(i); badge(a.x, a.y, p.num, p.color); });
      y = top - h - 2;
      const attr = bkText(mp.offline ? 'Fond de carte indisponible (hors ligne)' : mp.attribution);
      const asz = 5 * S;
      page.drawText(attr, { x: x1 - F.bodyI.widthOfTextAtSize(attr, asz), y: y - asz, size: asz, font: F.bodyI, color: C.faint });
      y -= asz + 4;
      return numbers;
    };

    /** Profil altimétrique des traces d'un lieu (titre, résumé, courbe avec altitudes et distances) */
    const fmtKm = (km) => `${(Math.round(km * 10) / 10).toLocaleString(LOCALE)} km`;
    const drawProfile = async (p, color) => {
      const list = await TBGpx.forPoi(self.plugin, p);
      if (!list.length) return false;
      const st = TBGpx.merge(list).stats;
      const prof = st.profile.filter((q) => q.ele != null);
      if (!st.hasEle || prof.length < 2 || !(st.distanceKm > 0)) return false;
      const ph = 22 * MM;
      if (room() < ph + 22 * S + 8 * MM) newPage();
      text(p.name, { font: F.bodyB, size: 8, keep: 3 });
      const bits = [fmtKm(st.distanceKm), `D+ ${st.gain} m`, `D- ${st.loss} m`, `alt. ${st.eleMin}-${st.eleMax} m`];
      const dur = TBGpx.fmtDuration(st.movingMs || st.durationMs || st.estimateMs);
      if (dur) bits.push((st.durationMs ? '' : 'env. ') + dur);
      text(bits.join(' · '), { font: F.bodyI, size: 7, color: C.muted });
      gap(2);
      // échelle verticale « ronde »
      const nice = (x) => { const k = 10 ** Math.floor(Math.log10(x)); const m = x / k; return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * k; };
      const step = nice(Math.max(st.eleMax - st.eleMin, 10) / 3);
      const lo = Math.floor(st.eleMin / step) * step;
      const hi = Math.max(Math.ceil(st.eleMax / step) * step, lo + step);
      const lsz = 5.5 * S;
      const lw = F.body.widthOfTextAtSize(`${hi} m`, lsz) + 2.5;
      const px0 = x0 + lw, pw = x1 - px0, top = y, pb = top - ph;
      for (let v = lo; v <= hi + 0.1; v += step) {
        const yy = pb + ((v - lo) / (hi - lo)) * ph;
        page.drawLine({ start: { x: px0, y: yy }, end: { x: x1, y: yy }, thickness: v === lo ? 0.5 : 0.3, color: C.rule, opacity: v === lo ? 1 : 0.7 });
        const lab = `${v} m`;
        page.drawText(lab, { x: px0 - 2 - F.body.widthOfTextAtSize(lab, lsz), y: yy - lsz * 0.35, size: lsz, font: F.body, color: C.faint });
      }
      // courbe (au plus ~300 points), puis aire teintée dessous
      // lissage léger (moyenne glissante) : le bruit du GPS ne se voit pas à l'impression
      const half = Math.max(2, Math.round(prof.length / 150));
      const smooth = prof.map((q, i) => {
        let sum = 0, n = 0;
        for (let k = Math.max(0, i - half); k <= Math.min(prof.length - 1, i + half); k++) { sum += prof[k].ele; n++; }
        return { d: q.d, ele: sum / n };
      });
      const every = Math.max(1, Math.ceil(smooth.length / 300));
      const sample = smooth.filter((q, i) => i % every === 0 || i === smooth.length - 1);
      const X = (d) => ((d / st.distanceKm) * pw).toFixed(2);
      const Y = (e) => (((hi - e) / (hi - lo)) * ph).toFixed(2);
      const line = sample.map((q, i) => `${i ? 'L' : 'M'}${X(q.d)} ${Y(q.ele)}`).join(' ');
      const area = `${line} L${X(sample[sample.length - 1].d)} ${ph.toFixed(2)} L${X(sample[0].d)} ${ph.toFixed(2)} Z`;
      page.drawSvgPath(area, { x: px0, y: top, color, opacity: 0.16 });
      page.drawSvgPath(line, { x: px0, y: top, borderColor: color, borderWidth: 1, borderLineCap: PDFLib.LineCapStyle.Round });
      // distances : départ, milieu, arrivée
      const ly = pb - 2 - lsz;
      [[0, 'left'], [st.distanceKm / 2, 'center'], [st.distanceKm, 'right']].forEach(([d, al]) => {
        const lab = d ? fmtKm(d) : '0';
        const tw = F.body.widthOfTextAtSize(lab, lsz);
        const xx = px0 + (d / st.distanceKm) * pw - (al === 'center' ? tw / 2 : al === 'right' ? tw : 0);
        page.drawText(lab, { x: xx, y: ly, size: lsz, font: F.body, color: C.faint });
      });
      y = ly - 4;
      return true;
    };

    const T = content.trip;
    const days = content.days;
    const dateRange = days.length ? `${bkText(U.fmtDate(days[0], { day: 'numeric', month: 'long' }))} – ${bkText(U.fmtDate(days[days.length - 1], { day: 'numeric', month: 'long', year: 'numeric' }))}` : '';
    const title = bkText(o.coverTitle) || T.name || 'Mon voyage';

    /* ---- 1 · couverture */
    newPage({ plain: true });
    page.drawRectangle({ x: 5 * MM, y: 5 * MM, width: W - 10 * MM, height: H - 10 * MM, borderColor: C.rule, borderWidth: 0.6 });
    y = H - 14 * MM;
    const coverFile = this.coverFile(content);
    let coverDone = false;
    if (coverFile) {
      const im = await embedImg(coverFile, { maxPx: 1300, aspect: 4 / 3.3 });
      if (im) {
        const w = W - 18 * MM, h = (w * im.h) / im.w;
        page.drawImage(im.img, { x: 9 * MM, y: y - h, width: w, height: h });
        y -= h + 9 * MM;
        coverDone = true;
      }
    }
    if (!coverDone) y -= 30 * MM;
    x0 = 10 * MM; x1 = W - 10 * MM;
    text('CARNET DE VOYAGE', { font: F.bodyB, size: 6.5, color: C.accent, align: 'center' });
    gap(2.5);
    text(title, { font: F.bodyBI, size: 19, lead: 1.15, align: 'center' });
    gap(1.5);
    if (o.coverDest && T.destination) text(T.destination, { font: F.body, size: 9.5, color: C.muted, align: 'center' });
    if (o.coverDates && dateRange) text(dateRange, { font: F.bodyI, size: 9, color: C.muted, align: 'center' });
    if (o.coverTravelers && (T.travelers || []).length) { gap(3); text((T.travelers || []).join(' & '), { font: F.bodyI, size: 9, align: 'center' }); }

    /* ---- 2 · le voyage en bref */
    if (o.summary) {
      newPage();
      kicker('Le voyage en bref');
      text(title, { font: F.bodyB, size: 13, lead: 1.2 });
      if (dateRange) text(dateRange + (days.length ? ` · ${days.length} jour${days.length > 1 ? 's' : ''}` : ''), { font: F.bodyI, size: 8.5, color: C.muted });
      gap(3); rule(); gap(4);
      for (const d of days) {
        const ch = content.chapters.find((c) => c.date === d);
        const prog = this.data.programmeFor(d);
        const dtitle = (ch && ch.title) || (prog && prog.title) || '';
        const nVisited = ch ? ch.visited.length : 0;
        const idx = this.data.dayIndex(d);
        text(`Jour ${idx} · ${fmtDay(d)}`, { font: F.bodyB, size: 8.5, keep: 2 });
        if (dtitle) text(dtitle, { font: F.bodyI, size: 8.5, color: C.muted });
        if (nVisited) text(`${nVisited} lieu${nVisited > 1 ? 'x' : ''} visité${nVisited > 1 ? 's' : ''}`, { font: F.body, size: 7.5, color: C.faint });
        gap(2.5);
      }
      if (content.allVisited.length) { gap(2); rule(); gap(3); text(`${content.allVisited.length} lieux visités au total`, { font: F.bodyI, size: 8.5, color: C.muted }); }
    }

    /* ---- 3 · carte des lieux visités */
    if (o.map && content.allVisited.some((p) => p.hasCoords)) {
      newPage();
      kicker('Carte des lieux visités');
      gap(1);
      const groups = content.chapters
        .map((ch, i) => ({ ch, color: dayColor(i), places: ch.visited.filter((p) => p.hasCoords) }))
        .filter((g) => g.places.length);
      const undated = content.allVisited.filter((p) => p.hasCoords && !p.doneDate);
      if (undated.length) groups.push({ ch: null, color: C.muted, places: undated });
      const numbers = await drawMap(groups, { hFrac: 0.62 });
      // légende : une rubrique par journée
      for (const g of groups) {
        if (room() < 24) newPage();
        const label = g.ch ? `${g.ch.idx ? `Jour ${g.ch.idx} · ` : ''}${fmtDay(g.ch.date)}` : 'Sans date';
        page.drawCircle({ x: x0 + 1.6 * MM, y: y - 7.5 * S * 0.62, size: 2.2, color: g.color });
        text(label, { font: F.bodyB, size: 7.5, color: C.ink, indent: 4.5 * MM, keep: 2 });
        gap(0.6);
        for (const p of g.places) {
          if (room() < 12) newPage();
          badge(x0 + 2.2 * MM, y - 7.5 * S * 0.62, numbers.get(p.path), g.color, 3.3);
          text(p.name, { font: F.body, size: 7.5, indent: 6 * MM });
        }
        gap(1.6);
      }
    }

    /* ---- 4 · les journées */
    for (const [ci, ch] of content.chapters.entries()) {
      newPage();
      kicker(ch.idx ? `Jour ${ch.idx}` : 'Hors programme');
      if (o.dayDate) text(fmtDay(ch.date), { font: F.bodyI, size: 8.5, color: C.muted });
      gap(1);
      if (ch.title) text(ch.title, { font: F.bodyB, size: 14, lead: 1.18 });
      const meta = [o.dayLocation ? ch.location : '', o.dayWeather ? bkText(ch.weather) : '', o.dayMood && !isNaN(ch.mood) && ch.mood ? `humeur ${ch.mood}/5` : ''].filter(Boolean).join('  ·  ');
      if (meta) text(meta, { font: F.bodyI, size: 8, color: C.muted });
      gap(3);
      if (ch.cover instanceof TFile) await image(ch.cover, { maxH: 0.42 });
      for (const sec of ch.sections) {
        // un titre de section ne reste pas seul en bas de page (au-dessus d'une photo, notamment)
        const first = sec.items[0];
        if (room() < (first && first.t === 'img' ? (H - M.top - M.bottom) * 0.45 + 22 : 40)) newPage();
        gap(1.5);
        text(sec.heading, { font: F.bodyB, size: 10, color: C.accent, keep: 3 });
        gap(1);
        for (const it of sec.items) {
          if (it.t === 'p') { text(it.text, { font: it.italic ? F.bodyI : F.body, size: 9, keep: 2 }); gap(1.6); }
          else if (it.t === 'li') {
            if (room() < 12) newPage();
            page.drawText('•', { x: x0 + 1, y: y - 9 * S, size: 9 * S, font: F.body, color: C.accent });
            text(it.text, { font: F.body, size: 9, indent: 3.5 * MM });
            gap(0.6);
          } else if (it.t === 'h3') { text(it.text, { font: F.bodyBI, size: 9, keep: 3 }); }
          else if (it.t === 'img') { gap(1); await image(it.file, { maxH: 0.45 }); }
        }
      }
      if (o.dayPlaces) {
        const list = ch.visited.length ? ch.visited : (o.planned ? ch.planned : []);
        if (list.length) {
          const withMap = o.dayMap && ch.visited.some((p) => p.hasCoords);
          if (room() < (withMap ? (H - M.top - M.bottom) * 0.42 + 45 : 50)) newPage();
          gap(3);
          rule();
          gap(3);
          kicker(ch.visited.length ? 'Lieux visités' : 'Au programme', C.muted);
          const color = dayColor(ci);
          let numbers = null;
          if (withMap) numbers = await drawMap([{ color, places: ch.visited }], { hFrac: 0.42 });
          for (const p of list) placeLine(p, false, numbers ? numbers.get(p.path) || 0 : 0, color);
        }
      } else if (o.dayMap && ch.visited.some((p) => p.hasCoords)) {
        if (room() < 60) newPage();
        gap(3);
        await drawMap([{ color: dayColor(ci), places: ch.visited }], { hFrac: 0.42 });
      }
      const withTrack = o.dayProfile ? ch.visited.filter((p) => (p.gpx || []).length && p.eleGain != null) : [];
      if (withTrack.length) {
        if (room() < 22 * MM + 40 * S) newPage();
        gap(3); rule(); gap(3);
        kicker(withTrack.length > 1 ? 'Profils altimétriques' : 'Profil altimétrique', C.muted);
        for (const p of withTrack) { await drawProfile(p, dayColor(ci)); gap(2); }
      }
    }

    /* ---- 5 · index des lieux visités */
    if (o.index && content.allVisited.length) {
      newPage();
      kicker('Tous les lieux visités');
      gap(1);
      const byCat = {};
      content.allVisited.forEach((p) => { (byCat[p.cat.label] = byCat[p.cat.label] || []).push(p); });
      for (const [cat, list] of Object.entries(byCat).sort((a, b) => a[0].localeCompare(b[0], LOCALE))) {
        if (room() < 40) newPage();
        text(cat, { font: F.bodyB, size: 9.5, color: C.accent, keep: 3 });
        gap(1);
        list.sort((a, b) => (a.doneDate || '').localeCompare(b.doneDate || '')).forEach((p) => placeLine(p, true));
        gap(1.5);
      }
    }

    /* ---- 6 · compléter à un multiple de 8 + 4ᵉ de couverture */
    const total = Math.ceil((pages.length + 1) / 8) * 8;
    while (pages.length < total - 1) {
      newPage({ plain: true });
      if (o.notes) {
        kicker('Notes', C.faint);
        gap(2);
        for (let yy = y; yy > M.bottom + 4; yy -= 7 * MM) page.drawLine({ start: { x: x0, y: yy }, end: { x: x1, y: yy }, thickness: 0.35, color: C.rule });
      }
    }
    newPage({ plain: true });
    x0 = 10 * MM; x1 = W - 10 * MM;
    if (o.backCover) {
      y = H / 2 + 14;
      text(title, { font: F.bodyBI, size: 11, align: 'center' });
      if (dateRange) text(dateRange, { font: F.bodyI, size: 8, color: C.muted, align: 'center' });
      y = 16 * MM;
      text('Carnet imprimé avec Trip Buddy', { font: F.body, size: 5.5, color: C.faint, align: 'center' });
    }

    /* ---- folios */
    for (const p of pages) {
      if (p.plain) continue;
      const odd = p.n % 2 === 1;
      const label = String(p.n);
      const size = 7 * S;
      const xw = F.body.widthOfTextAtSize(label, size);
      p.page.drawText(label, { x: odd ? W - M.fore - xw : M.fore, y: 6 * MM, size, font: F.body, color: C.muted });
    }
    this.embeddedImages = [...imgCache.values()].filter(Boolean).length;
    return { doc, pageCount: pages.length, PDFLib };
  }

  /* --------------------------------------------------------------- imposition */
  /** Positions in-quarto de la feuille j (0 = extérieure) pour un livret de N pages */
  static sheetLayout(N, j) {
    const kO = 2 * j, kI = 2 * j + 1;
    return {
      front: { TL: N - 2 * kI - 1, TR: 2 * kI + 2, BL: N - 2 * kO, BR: 2 * kO + 1 },
      back: { TL: 2 * kI + 1, TR: N - 2 * kI, BL: 2 * kO + 2, BR: N - 2 * kO - 1 },
    };
  }

  async impose(src) {
    const { PDFDocument, StandardFonts, rgb, degrees } = src.PDFLib;
    const N = src.pageCount;
    const out = await PDFDocument.create();
    out.setTitle(`Carnet — ${bkText(this.opts.coverTitle || this.plugin.settings.trip.name || 'voyage')}`);
    out.setCreator('Trip Buddy (Obsidian)');
    // pdf-lib n'écrit les polices et images qu'à la finalisation : sans elle, les pages importées
    // référenceraient des ressources absentes (PDF corrompu, photos manquantes)
    if (typeof src.doc.flush === 'function') await src.doc.flush(); else await src.doc.save();
    const embedded = await out.embedPages(src.doc.getPages());
    const font = await out.embedFont(StandardFonts.TimesRoman);
    const MM = BK.MM, SW = BK.SHEET_W * MM, SH = BK.SHEET_H * MM;
    const pw = BK.PAGE_W * MM;
    const F_ = BK.TRIM_FORE, FOOT = BK.TRIM_FOOT, HEAD = BK.TRIM_HEAD;
    const sheets = N / 8;
    // boîtes finies (mm, origine haut-gauche) — colonnes : gauche [6,105], droite [105,204]
    const colX = { L: F_, R: 105 };
    const rowTop = { T: FOOT, B: 148.5 + HEAD }; // haut des boîtes : rangée du haut (tournée) / du bas
    const black = rgb(0, 0, 0), grey = rgb(0.55, 0.55, 0.55);

    const marks = (pg, label) => {
      const t = 0.3;
      const line = (x1, y1, x2, y2, dash) => pg.drawLine({ start: { x: x1 * MM, y: SH - y1 * MM }, end: { x: x2 * MM, y: SH - y2 * MM }, thickness: t, color: dash ? grey : black, dashArray: dash ? [2, 2] : undefined });
      const ys = [FOOT, 148.5 - HEAD, 148.5 + HEAD, 297 - FOOT];
      // traits de coupe verticaux (gouttières) dans les marges haute et basse, et dans la bande de tête
      [F_, 210 - F_].forEach((x) => {
        line(x, 0.5, x, FOOT - 1.5); line(x, 297 - FOOT + 1.5, x, 296.5);
        line(x, 148.5 - HEAD + 1, x, 148.5 + HEAD - 1);
      });
      // traits de coupe horizontaux (pied, tête) dans les marges gauche et droite
      ys.forEach((yy) => { line(0.5, yy, F_ - 1.5, yy); line(210 - F_ + 1.5, yy, 209.5, yy); });
      // repère de pli (dos) : pointillés en haut, en bas et dans la bande de tête
      line(105, 0.5, 105, FOOT - 1.5, true); line(105, 297 - FOOT + 1.5, 105, 296.5, true);
      line(105, 148.5 - HEAD + 1, 105, 148.5 + HEAD - 1, true);
      // légende dans la bande de tête (partie coupée)
      pg.drawText(label, { x: 112 * MM, y: SH - 149.6 * MM, size: 4.5, font, color: grey });
    };

    for (let j = 0; j < sheets; j++) {
      const lay = BookletBuilder.sheetLayout(N, j);
      for (const side of ['front', 'back']) {
        const pg = out.addPage([SW, SH]);
        const pos = lay[side];
        for (const [slot, num] of Object.entries(pos)) {
          const emb = embedded[num - 1];
          const col = slot[1] === 'L' ? 'L' : 'R';
          const bx = colX[col] * MM;
          if (slot[0] === 'T') {
            // rangée du haut tournée à 180° : on place le coin haut-droit de la boîte
            pg.drawPage(emb, { x: bx + pw, y: SH - rowTop.T * MM, rotate: degrees(180) });
          } else {
            pg.drawPage(emb, { x: bx, y: SH - (rowTop.B + BK.PAGE_H) * MM });
          }
        }
        marks(pg, `Trip Buddy · feuille ${j + 1}/${sheets} · ${side === 'front' ? 'recto' : 'verso'} · pages ${Object.values(pos).sort((a, b) => a - b).join(', ')}`);
      }
    }
    return out;
  }

  async generate() {
    const src = await this.build();
    const out = await this.impose(src);
    const bytes = await out.save();
    return {
      bytes, pages: src.pageCount, sheets: src.pageCount / 8,
      images: this.embeddedImages || 0, skipped: this.skipped || 0,
      fontFallback: !!this.fontFallback, mapIssues: this.mapIssues,
    };
  }
}

/* ----------------------------------------------------------- fenêtre */
class BookletModal extends TBModal {
  constructor(plugin) { super(plugin, '🖨️ Carnet souvenir imprimable'); }

  /** Charge les polices du dossier fonts/ pour l'aperçu dans la fenêtre */
  static async loadPreviewFonts(plugin) {
    if (BookletModal.previewFonts) return BookletModal.previewFonts;
    BookletModal.previewFonts = (async () => {
      if (typeof FontFace === 'undefined' || !document.fonts) return;
      const dir = BookletBuilder.fontDir(plugin);
      for (const [key, def] of Object.entries(BK_FONTS)) {
        if (!def.files) continue;
        for (const [role, name] of [['body', def.files.body], ['bodyB', def.files.bodyB]]) {
          try {
            const buf = await plugin.app.vault.adapter.readBinary(`${dir}/${name}`);
            const ff = new FontFace(`tb-bk-${key}`, buf, { weight: role === 'bodyB' ? '700' : '400' });
            await ff.load();
            document.fonts.add(ff);
          } catch (e) { /* aperçu seulement */ }
        }
      }
    })();
    return BookletModal.previewFonts;
  }

  /** Photos proposées pour la couverture : journal puis lieux visités ; `all` = toutes les images du coffre */
  coverCandidates(all) {
    const d = this.plugin.data;
    const seen = new Set();
    const out = [];
    const add = (f) => {
      if (!(f instanceof TFile) || seen.has(f.path)) return;
      const ext = f.extension.toLowerCase();
      if (!IMG_EXT.includes(ext) || ext === 'svg') return;
      seen.add(f.path); out.push(f);
    };
    for (const j of d.journal()) {
      if (j.cover) add(d.resolveLink(j.cover, j.file.path));
      const cache = this.app.metadataCache.getFileCache(j.file);
      (cache && cache.embeds || []).forEach((e) => add(d.resolveLink(e.link, j.file.path)));
    }
    const pois = d.pois();
    pois.filter((p) => p.done).forEach((p) => add(p.photo));
    const main = out.length;
    if (all) {
      pois.forEach((p) => add(p.photo));
      this.app.vault.getFiles().sort((a, b) => a.path.localeCompare(b.path)).forEach(add);
    }
    return { files: out, main };
  }

  onOpen() {
    const c = this.contentEl;
    c.addClass('tb', 'tb-booklet');
    this.modalEl.addClass('tb-booklet-modal');
    const d = this.plugin.data;
    const saved = this.plugin.settings.booklet || {};
    this.opts = { ...BOOKLET_DEFAULTS, ...saved };
    if (!BK_FONTS[this.opts.font]) this.opts.font = 'classique';
    BookletModal.loadPreviewFonts(this.plugin);

    const nJ = d.journal().length, nV = d.pois().filter((p) => p.done).length;
    c.createDiv({ cls: 'tb-muted tb-bk-intro', text: `Livret A6 à partir du journal : ${nJ} journée${nJ > 1 ? 's' : ''} écrite${nJ > 1 ? 's' : ''}, ${nV} lieu${nV > 1 ? 'x' : ''} visité${nV > 1 ? 's' : ''}. Imposé in-quarto : 8 pages par feuille A4 recto-verso.` });

    const section = (title) => {
      const s = c.createDiv('tb-bk-section');
      s.createEl('h4', { text: title });
      return s;
    };
    const checks = (parent, list) => {
      const g = parent.createDiv('tb-bk-checks');
      for (const [key, label] of list) {
        const l = g.createEl('label', { cls: 'tb-bk-check' });
        const cb = l.createEl('input', { type: 'checkbox' });
        cb.checked = !!this.opts[key];
        cb.addEventListener('change', () => { this.opts[key] = cb.checked; });
        l.createSpan({ text: label });
      }
      return g;
    };

    /* ---- couverture */
    const cov = section('📷 Couverture');
    const tf = cov.createDiv('tb-bk-row');
    tf.createEl('label', { text: 'Titre' });
    const ti = tf.createEl('input', { type: 'text', cls: 'tb-input' });
    ti.placeholder = this.plugin.settings.trip.name || 'Mon voyage';
    ti.value = this.opts.coverTitle || '';
    ti.addEventListener('input', () => { this.opts.coverTitle = ti.value.trim(); });
    cov.createDiv({ cls: 'tb-bk-label', text: 'Photo de couverture' });
    const grid = cov.createDiv('tb-bk-covers');
    const more = cov.createEl('a', { cls: 'tb-bk-more', href: '#', text: 'Afficher toutes les photos du coffre' });
    const renderCovers = (all) => {
      grid.empty();
      const { files, main } = this.coverCandidates(all);
      const tile = (value, build, title) => {
        const b = grid.createEl('button', { cls: 'tb-bk-cover' + (this.opts.cover === value ? ' is-active' : ''), attr: { type: 'button', title } });
        build(b);
        b.addEventListener('click', () => {
          this.opts.cover = value;
          grid.querySelectorAll('.tb-bk-cover').forEach((x) => x.removeClass('is-active'));
          b.addClass('is-active');
        });
      };
      tile('auto', (b) => { b.addClass('is-text'); b.createSpan({ text: '✨ Auto' }); }, 'Première photo de journée, sinon d’un lieu visité');
      tile('none', (b) => { b.addClass('is-text'); b.createSpan({ text: 'Sans photo' }); }, 'Couverture typographique');
      files.forEach((f, i) => {
        if (all && i === main && main) grid.createDiv('tb-bk-sep');
        tile(f.path, (b) => {
          const img = b.createEl('img', { attr: { loading: 'lazy', alt: '' } });
          img.src = this.app.vault.getResourcePath(f);
        }, f.basename);
      });
      // image choisie précédemment mais hors liste : on la garde visible
      if (!['auto', 'none'].includes(this.opts.cover) && !files.some((f) => f.path === this.opts.cover)) {
        const f = this.app.vault.getAbstractFileByPath(this.opts.cover);
        if (f instanceof TFile) tile(f.path, (b) => { b.createEl('img', { attr: { alt: '' } }).src = this.app.vault.getResourcePath(f); }, f.basename);
        else this.opts.cover = 'auto';
      }
      more.style.display = all ? 'none' : '';
    };
    more.addEventListener('click', (e) => { e.preventDefault(); renderCovers(true); });
    renderCovers(false);
    checks(cov, [['coverDest', 'Destination'], ['coverDates', 'Dates'], ['coverTravelers', 'Voyageurs']]);

    /* ---- contenu */
    const cont = section('📖 Contenu du carnet');
    checks(cont, [
      ['summary', 'Page « Le voyage en bref »'],
      ['map', 'Carte des lieux visités'],
      ['tracks', 'Traces GPX (cartes et distances)'],
      ['index', 'Index des lieux visités'],
      ['notes', 'Pages « Notes » lignées'],
      ['backCover', 'Texte en 4ᵉ de couverture'],
    ]);

    /* ---- journées */
    const days = section('📔 Journées');
    checks(days, [
      ['dayDate', 'Date'], ['dayLocation', 'Lieu'], ['dayWeather', 'Météo'], ['dayMood', 'Humeur'],
      ['dayCover', 'Photo de la journée'], ['texts', 'Textes du journal'], ['photos', 'Photos du journal'],
      ['dayPlaces', 'Lieux visités du jour'], ['planned', 'Programme prévu (si rien de visité)'], ['dayMap', 'Carte de chaque journée'],
      ['dayProfile', 'Profil altimétrique des traces GPX'],
    ]);

    /* ---- lieux */
    const pl = section('📍 Infos des lieux');
    checks(pl, [['placeCat', 'Catégorie'], ['placeRating', 'Note (étoiles)'], ['placeAddress', 'Adresse'], ['placeDate', 'Date de visite (index)']]);

    /* ---- police */
    const ft = section('🖋️ Police');
    const fg = ft.createDiv('tb-bk-fonts');
    for (const [key, def] of Object.entries(BK_FONTS)) {
      const b = fg.createEl('button', { cls: 'tb-bk-font tb-no-ico' + (this.opts.font === key ? ' is-active' : ''), attr: { type: 'button' } });
      const fam = def.css || `"tb-bk-${key}", serif`;
      const sample = b.createDiv({ cls: 'tb-bk-font-sample', text: 'Arrivée à Barcelone' });
      sample.style.fontFamily = fam;
      const lab = b.createDiv({ cls: 'tb-bk-font-name' });
      lab.createSpan({ text: def.label });
      lab.createSpan({ cls: 'tb-muted', text: ' · ' + def.desc });
      b.addEventListener('click', () => {
        this.opts.font = key;
        fg.querySelectorAll('.tb-bk-font').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
      });
    }

    const how = c.createEl('details', { cls: 'tb-booklet-how' });
    how.createEl('summary', { text: '📖 Comment imprimer et monter le carnet' });
    const ol = how.createEl('ol');
    [
      'Imprimer en recto-verso, retournement sur le bord long, à la taille réelle (100 %, sans « ajuster à la page »).',
      'Plier chaque feuille en deux, le haut vers l’arrière (pli horizontal), puis encore en deux, la moitié gauche vers l’arrière : la page 1 (couverture) apparaît sur le dessus.',
      'Emboîter les cahiers : la feuille 2 pliée à l’intérieur de la feuille 1, la 3 dans la 2, etc.',
      'Agrafer 2 fois dans le pli du dos (piqûre à cheval, agrafeuse à bras long).',
      'Massicoter le pied, la gouttière et la tête (pli du haut) en suivant les traits de coupe : on obtient un livret de 99 × 138,5 mm.',
    ].forEach((t) => ol.createEl('li', { text: t }));

    this.status = c.createDiv({ cls: 'tb-muted tb-small' });
    this.footer([
      ['↺ Options par défaut', 'tb-bk-reset', () => { this.plugin.settings.booklet = {}; this.contentEl.empty(); this.onOpen(); }],
      ['Annuler', '', () => this.close()],
      ['🖨️ Générer le PDF', 'mod-cta', () => this.run()],
    ]);
  }

  async run() {
    if (this.busy) return;
    this.busy = true;
    this.status.setText('⏳ Mise en page en cours… (photos et carte peuvent prendre quelques secondes)');
    try {
      this.plugin.settings.booklet = { ...this.opts };
      await this.plugin.persistSettings();
      const res = await new BookletBuilder(this.plugin, this.opts).generate();
      const s = this.plugin.settings;
      const folder = normalizePath(s.folders.documents || '');
      await this.plugin.ensureFolder(folder);
      const name = U.sanitizeFileName(`Carnet de voyage - ${s.trip.name || 'voyage'}`);
      const path = normalizePath(`${folder}/${name}.pdf`);
      const existing = this.app.vault.getAbstractFileByPath(path);
      const buf = res.bytes.buffer.slice(res.bytes.byteOffset, res.bytes.byteOffset + res.bytes.byteLength);
      let file;
      if (existing instanceof TFile) { await this.app.vault.modifyBinary(existing, buf); file = existing; } else file = await this.app.vault.createBinary(path, buf);
      const pl = (n, w) => `${n} ${w}${n > 1 ? 's' : ''}`;
      const notes = [];
      if (res.skipped) notes.push(`${pl(res.skipped, 'photo')} illisible${res.skipped > 1 ? 's' : ''} ignorée${res.skipped > 1 ? 's' : ''}`);
      if (res.fontFallback) notes.push('police indisponible, Times utilisée');
      if (res.mapIssues) notes.push('fond de carte incomplet (connexion ?)');
      new Notice(`🖨️ Carnet généré : ${res.pages} pages A6 sur ${pl(res.sheets, 'feuille')} A4 recto-verso, ${pl(res.images, 'photo')}`
        + (notes.length ? ` — ${notes.join(' · ')}` : ''), 8000);
      this.close();
      this.plugin.openFile(file, true);
    } catch (e) {
      console.error('[Trip Buddy] carnet', e);
      this.status.setText('⚠️ Échec de la génération : ' + (e.message || e));
    } finally {
      this.busy = false;
    }
  }

  onClose() { this.contentEl.empty(); }
}
