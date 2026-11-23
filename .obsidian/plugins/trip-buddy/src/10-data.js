/* ==========================================================================
 * Trip Buddy — couche de données (POI, programmes, journal, budget, packing)
 * ========================================================================== */
class TripData {
  constructor(plugin) {
    this.plugin = plugin;
    this.app = plugin.app;
  }

  get s() { return this.plugin.settings; }

  isTemplate(file) {
    const t = normalizePath(this.s.folders.templates || '');
    return !!t && (file.path === t || file.path.startsWith(t + '/'));
  }

  fm(file) {
    const c = this.app.metadataCache.getFileCache(file);
    return (c && c.frontmatter) || {};
  }

  filesOfType(type) {
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (this.isTemplate(f)) return false;
      const t = this.fm(f).type;
      return t && String(t).toLowerCase() === type;
    });
  }

  resolveLink(link, sourcePath) {
    const target = U.linkTarget(link);
    if (!target) return null;
    return this.app.metadataCache.getFirstLinkpathDest(target, sourcePath || '') ||
      this.app.vault.getAbstractFileByPath(target) ||
      this.app.vault.getAbstractFileByPath(target + '.md');
  }

  linkTo(file, sourcePath) {
    return `[[${this.app.metadataCache.fileToLinktext(file, sourcePath || '', true)}]]`;
  }

  /* --------------------------------------------------------- catégories */
  poiCat(id) {
    const key = U.slug(id);
    const cats = this.s.poiCategories || [];
    return cats.find((c) => c.id === id || U.slug(c.id) === key || U.slug(c.label) === key) ||
      { id: id || 'autre', label: id ? U.cap(String(id)) : 'Autre', icon: '📍', color: '#7f8c8d', unknown: true };
  }

  expCat(id) {
    const key = U.slug(id);
    const cats = this.s.expenseCategories || [];
    return cats.find((c) => c.id === id || U.slug(c.id) === key || U.slug(c.label) === key) ||
      { id: key || 'divers', label: id ? String(id) : 'Divers', icon: '💸', color: '#95a5a6', budget: 0, unknown: true };
  }

  /* ---------------------------------------------------------------- POI */
  toPoi(file) {
    const fm = this.fm(file);
    let lat = U.toNum(fm.lat ?? fm.latitude);
    let lon = U.toNum(fm.lon ?? fm.lng ?? fm.longitude);
    if ((isNaN(lat) || isNaN(lon)) && fm.location) {
      const loc = Array.isArray(fm.location) ? fm.location : String(fm.location).split(',');
      lat = U.toNum(loc[0]); lon = U.toNum(loc[1]);
    }
    const cat = this.poiCat(fm.category ?? fm.categorie);
    return {
      file,
      path: file.path,
      name: fm.name || fm.nom || file.basename,
      category: cat.id,
      cat,
      address: fm.address || fm.adresse || '',
      lat, lon,
      hasCoords: !isNaN(lat) && !isNaN(lon),
      done: U.toBool(fm.done ?? fm.fait),
      doneDate: U.normDate(fm.done_date ?? fm.date_fait),
      rating: U.clamp(Math.round(U.toNum(fm.rating ?? fm.note) || 0), 0, 5),
      photo: this.photoFile(fm.photo ?? fm.image ?? fm.cover, file.path),
      photoCredit: fm.photo_credit || fm.credit || '',
      gpx: this.gpxFiles(fm.gpx ?? fm.trace ?? fm.track, file.path),
      trackColor: fm.track_color || fm.couleur_trace || '',
      distanceKm: U.toNum(fm.distance_km),
      eleGain: U.toNum(fm.ele_gain),
      fm,
    };
  }

  /** Résout la propriété gpx ("[[trace.gpx]]", chemin, ou liste) en fichiers GPX du coffre */
  gpxFiles(v, sourcePath) {
    if (!v) return [];
    const list = Array.isArray(v) ? v : [v];
    return list.map((l) => this.resolveLink(l, sourcePath))
      .filter((f) => f instanceof TFile && GPX_EXT.includes(f.extension.toLowerCase()));
  }

  /** Résout la propriété photo ("[[img.jpg]]" ou chemin) en fichier local */
  photoFile(v, sourcePath) {
    if (!v) return null;
    const f = this.resolveLink(Array.isArray(v) ? v[0] : v, sourcePath);
    return f instanceof TFile && IMG_EXT.includes(f.extension.toLowerCase()) ? f : null;
  }

  photoUrl(poi) { return poi && poi.photo ? this.app.vault.getResourcePath(poi.photo) : null; }

  pois() {
    return this.filesOfType('poi').map((f) => this.toPoi(f))
      .sort((a, b) => a.name.localeCompare(b.name, LOCALE));
  }

  poiOf(fileOrPath) {
    const f = typeof fileOrPath === 'string' ? this.app.vault.getAbstractFileByPath(fileOrPath) : fileOrPath;
    return f instanceof TFile ? this.toPoi(f) : null;
  }

  async setPoiDone(poi, done, date) {
    if (done && !date) {
      // hors des dates du voyage : on reprend la date du programme contenant ce lieu
      const today = U.todayISO();
      if (!this.tripDays().includes(today)) {
        const prog = this.programmesWithPoi(poi.file)[0];
        if (prog && prog.date) date = prog.date;
      }
    }
    await this.app.fileManager.processFrontMatter(poi.file, (fm) => {
      fm.done = !!done;
      if (done) fm.done_date = date || U.normDate(fm.done_date) || U.todayISO();
      else delete fm.done_date;
    });
  }

  async setPoiField(poi, key, value) {
    await this.app.fileManager.processFrontMatter(poi.file, (fm) => {
      if (value === null || value === undefined || value === '') delete fm[key];
      else fm[key] = value;
    });
  }

  /** Met le POI à la corbeille et le retire des programmes qui le contiennent */
  async deletePoi(poi) {
    for (const prog of this.programmesWithPoi(poi.file)) {
      const keep = prog.steps.filter((st) => !st.missing && st.file !== poi.file).map((st) => st.file);
      await this.saveProgrammeSteps(prog, keep);
    }
    if (this.app.fileManager.trashFile) await this.app.fileManager.trashFile(poi.file);
    else await this.app.vault.trash(poi.file, false);
  }

  /* ---------------------------------------------------------- programmes */
  toProgramme(file) {
    const fm = this.fm(file);
    let links = fm.pois || fm.etapes || [];
    if (!Array.isArray(links)) links = [links];
    const steps = links.map((l) => {
      const f = this.resolveLink(l, file.path);
      return f instanceof TFile ? this.toPoi(f) : { missing: true, name: U.linkTarget(l), link: l };
    });
    return {
      file,
      date: U.normDate(fm.date) || U.normDate(file.basename.match(/\d{4}-\d{2}-\d{2}/)?.[0]),
      title: fm.title || fm.titre || '',
      steps,
      fm,
    };
  }

  programmes() {
    return this.filesOfType('programme').map((f) => this.toProgramme(f))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  programmeFor(date) {
    return this.programmes().find((p) => p.date === date) || null;
  }

  programmesWithPoi(poiFile) {
    return this.programmes().filter((p) => p.steps.some((s) => s.file === poiFile));
  }

  async saveProgrammeSteps(prog, poiFiles) {
    await this.app.fileManager.processFrontMatter(prog.file, (fm) => {
      fm.pois = poiFiles.map((f) => this.linkTo(f, prog.file.path));
    });
  }

  /** Ajoute des lieux à un programme (avant le retour au départ si la journée boucle) */
  async addToProgramme(prog, files) {
    const cur = prog.steps.filter((s) => !s.missing).map((s) => s.file);
    const loops = cur.length > 1 && cur[cur.length - 1] === cur[0];
    if (loops) cur.splice(cur.length - 1, 0, ...files); else cur.push(...files);
    await this.saveProgrammeSteps(prog, cur);
    return cur.length;
  }

  /* ------------------------------------------------------------- journal */
  toJournal(file) {
    const fm = this.fm(file);
    return {
      file,
      date: U.normDate(fm.date) || U.normDate(file.basename.match(/\d{4}-\d{2}-\d{2}/)?.[0]),
      title: fm.title || fm.titre || '',
      location: fm.location_name || fm.lieu || fm.location || '',
      weather: fm.weather || fm.meteo || '',
      mood: U.toNum(fm.mood ?? fm.humeur),
      cover: fm.cover || fm.photo || '',
      fm,
    };
  }

  journal() {
    return this.filesOfType('journal').map((f) => this.toJournal(f))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }

  journalFor(date) {
    return this.journal().find((j) => j.date === date) || null;
  }

  /* ----------------------------------------------------------- voyage */
  tripDays() {
    const { start, end } = this.s.trip;
    const s = U.normDate(start), e = U.normDate(end);
    if (!s || !e || e < s) return s ? [s] : [];
    const out = [];
    for (let d = s; d <= e && out.length < 366; d = U.addDays(d, 1)) out.push(d);
    return out;
  }

  dayIndex(date) {
    const days = this.tripDays();
    const i = days.indexOf(date);
    return i < 0 ? null : i + 1;
  }

  /** Jour "courant" : aujourd'hui si dans le voyage, sinon prochain jour, sinon premier */
  currentDay() {
    const days = this.tripDays();
    const t = U.todayISO();
    if (!days.length) return t;
    if (days.includes(t)) return t;
    if (t < days[0]) return days[0];
    return days[days.length - 1];
  }

  tripStatus() {
    const days = this.tripDays();
    const t = U.todayISO();
    if (!days.length) return { phase: 'none', label: 'Dates à définir' };
    if (t < days[0]) {
      const n = U.daysBetween(t, days[0]);
      return { phase: 'before', n, label: n === 1 ? 'Départ demain !' : `Départ dans ${n} jours` };
    }
    if (t > days[days.length - 1]) return { phase: 'after', label: 'Voyage terminé — place aux souvenirs' };
    const i = days.indexOf(t) + 1;
    return { phase: 'during', n: i, label: `Jour ${i} sur ${days.length}` };
  }

  /* -------------------------------------------------------------- devises */
  rate(code) {
    const main = this.s.trip.currency || 'EUR';
    if (!code || code.toUpperCase() === main.toUpperCase()) return 1;
    const c = (this.s.currencies || []).find((x) => x.code.toUpperCase() === code.toUpperCase());
    return c ? Number(c.rate) || 1 : 1;
  }

  /* --------------------------------------------------------------- budget */
  budgetFile() {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(this.s.files.budget));
    return f instanceof TFile ? f : null;
  }

  static splitRow(line) {
    let s = line.trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s.split(/(?<!\\)\|/).map((c) => c.trim());
  }

  static colKey(h) {
    const k = U.slug(h);
    if (/^date|jour/.test(k)) return 'date';
    if (/libelle|description|depense|objet|intitule|quoi/.test(k)) return 'label';
    if (/categ/.test(k)) return 'category';
    if (/montant|prix|amount|cout/.test(k)) return 'amount';
    if (/devise|monnaie|currency/.test(k)) return 'currency';
    if (/paye|payeur|qui|par/.test(k)) return 'payer';
    if (/note|comment|remarque/.test(k)) return 'note';
    return k;
  }

  /** Repère le tableau des dépenses (en-tête contenant "Montant") */
  parseExpenseTable(text) {
    const lines = text.split('\n');
    for (let i = 0; i < lines.length - 1; i++) {
      const l = lines[i].trim();
      const sep = lines[i + 1].trim();
      if (!l.startsWith('|') || !/^\|?\s*:?-{2,}/.test(sep)) continue;
      const headers = TripData.splitRow(l);
      const keys = headers.map(TripData.colKey);
      if (!keys.includes('amount')) continue;
      const rows = [];
      let j = i + 2;
      for (; j < lines.length; j++) {
        const r = lines[j].trim();
        if (!r.startsWith('|')) break;
        const cells = TripData.splitRow(r);
        const row = { line: j, raw: lines[j] };
        keys.forEach((k, idx) => { row[k] = (cells[idx] || '').replace(/\\\|/g, '|'); });
        rows.push(row);
      }
      return { headerLine: i, headers, keys, rows, endLine: j - 1, lines };
    }
    return { headerLine: -1, headers: [], keys: [], rows: [], endLine: -1, lines };
  }

  async budget() {
    const file = this.budgetFile();
    const main = this.s.trip.currency || 'EUR';
    if (!file) return { file: null, expenses: [], table: null };
    const text = await this.app.vault.cachedRead(file);
    const table = this.parseExpenseTable(text);
    const expenses = table.rows.map((r) => {
      const amount = U.parseAmount(r.amount);
      const currency = (r.currency || main).trim().toUpperCase() || main;
      const cat = this.expCat(r.category || 'divers');
      return {
        line: r.line, raw: r.raw,
        date: U.normDate(r.date),
        label: r.label || '',
        category: cat.id, cat,
        amount, currency,
        amountMain: amount * this.rate(currency),
        payer: r.payer || '',
        note: r.note || '',
      };
    }).filter((e) => e.amount !== 0 || e.label);
    return { file, expenses, table };
  }

  expenseRow(exp, keys) {
    const cell = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const val = {
      date: exp.date, label: exp.label, category: this.expCat(exp.category).label,
      amount: String(Number(exp.amount).toFixed(2)).replace('.', ','),
      currency: exp.currency, payer: exp.payer, note: exp.note,
    };
    return '| ' + keys.map((k) => cell(val[k] ?? '')).join(' | ') + ' |';
  }

  /** Ajoute / remplace une dépense dans le tableau (tri chronologique) */
  async upsertExpense(exp, original) {
    let file = this.budgetFile();
    if (!file) {
      await this.plugin.ensureFolder(this.s.files.budget.split('/').slice(0, -1).join('/'));
      file = await this.app.vault.create(normalizePath(this.s.files.budget), '# 💰 Budget\n\n```tripbuddy-budget\n```\n');
    }
    await this.app.vault.process(file, (text) => {
      let t = this.parseExpenseTable(text);
      let lines = t.lines;
      if (t.headerLine < 0) {
        const block = [
          '', '## 🧾 Dépenses', '',
          '| Date | Libellé | Catégorie | Montant | Devise | Payé par | Note |',
          '| --- | --- | --- | ---: | --- | --- | --- |',
        ];
        text = text.replace(/\s*$/, '\n') + block.join('\n') + '\n';
        t = this.parseExpenseTable(text);
        lines = t.lines;
      }
      const row = this.expenseRow(exp, t.keys);
      if (original) {
        const idx = lines.findIndex((l, i) => i > t.headerLine && l === original.raw);
        if (idx >= 0) lines.splice(idx, 1);
        t = this.parseExpenseTable(lines.join('\n'));
        lines = t.lines;
      }
      // Position d'insertion : avant la première ligne de date postérieure
      let insertAt = t.endLine + 1;
      if (t.rows.length === 0) insertAt = t.headerLine + 2;
      for (const r of t.rows) {
        const d = U.normDate(r.date);
        if (d && exp.date && d > exp.date) { insertAt = r.line; break; }
      }
      lines.splice(insertAt, 0, row);
      return lines.join('\n');
    });
  }

  async deleteExpense(exp) {
    const file = this.budgetFile();
    if (!file) return;
    await this.app.vault.process(file, (text) => {
      const lines = text.split('\n');
      const idx = lines.findIndex((l) => l === exp.raw);
      if (idx >= 0) lines.splice(idx, 1);
      return lines.join('\n');
    });
  }

  /* -------------------------------------------------------------- packing */
  packingFile(path) {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path || this.s.files.packing));
    return f instanceof TFile ? f : null;
  }

  parsePacking(text) {
    const lines = text.split('\n');
    const cats = [];
    let cur = null;
    let inFence = false;
    let inFm = lines[0] && lines[0].trim() === '---';
    lines.forEach((line, i) => {
      if (inFm) { if (i > 0 && line.trim() === '---') inFm = false; return; }
      if (/^\s*(```|~~~)/.test(line)) { inFence = !inFence; return; }
      if (inFence) return;
      const h = line.match(/^(#{2,6})\s+(.+?)\s*$/);
      if (h) { cur = { name: h[2], line: i, items: [] }; cats.push(cur); return; }
      const t = line.match(/^(\s*)[-*+]\s+\[(.)\]\s+(.*)$/);
      if (t) {
        if (!cur) { cur = { name: 'Divers', line: -1, items: [] }; cats.push(cur); }
        cur.items.push({ text: t[3], checked: t[2] !== ' ', line: i });
      }
    });
    return cats.filter((c) => c.items.length || c.line >= 0);
  }
}
