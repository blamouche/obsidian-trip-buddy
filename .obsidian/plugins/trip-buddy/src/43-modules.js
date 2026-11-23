/* ==========================================================================
 * Trip Buddy — packing list, journal, documents, accueil, navigation
 * ========================================================================== */
const NAV_ITEMS = [
  ['home', '🏠', 'Accueil'],
  ['programme', '🗓️', 'Programme'],
  ['map', '🗺️', 'Carte'],
  ['pois', '📍', 'Lieux'],
  ['guide', '📚', 'Guide'],
  ['journal', '📔', 'Journal'],
  ['budget', '💰', 'Budget'],
  ['packing', '🎒', 'Valise'],
  ['documents', '📁', 'Documents'],
];
const MOODS = ['', '😞', '🙁', '😐', '🙂', '😄'];

/* --------------------------------------------------------------------------
 * ```tripbuddy-nav``` — barre de navigation entre les modules
 * -------------------------------------------------------------------------- */
class NavBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-nav');
    return this.refresh();
  }
  async refresh() {
    this.root.empty();
    const current = this.plugin.navKey(this.sourceFile());
    this.plugin.navItems().forEach(([key, icon, label]) => {
      const path = normalizePath(this.s.files[key] || '');
      const a = this.root.createEl('a', { cls: 'tb-nav-item' + (key === current ? ' is-active' : ''), href: '#' });
      a.createSpan({ cls: 'tb-nav-ico', text: icon });
      a.createSpan({ cls: 'tb-nav-lbl', text: label });
      a.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openPath(path, e.ctrlKey || e.metaKey); });
    });
    this.updateBanner();
  }

  /** Panneau « nouvelle version disponible » au-dessus du menu (vérification GitHub en cache 6 h) */
  async updateBanner() {
    const token = (this.bannerToken = (this.bannerToken || 0) + 1);
    if (this.banner) { this.banner.remove(); this.banner = null; }
    if (this.s.display && this.s.display.updateBanner === false) return;
    const u = await this.plugin.checkUpdate(false);
    if (token !== this.bannerToken || !this.root.isConnected) return;
    if (!u || !u.ok || !u.newer || U.storeGet('updateDismissed', '') === u.latest) return;

    const b = createDiv({ cls: 'tb tb-update-banner' });
    this.el.insertBefore(b, this.root);
    this.banner = b;
    b.createDiv({ cls: 'tb-update-banner-ico', text: '🆕' });
    const txt = b.createDiv('tb-update-banner-txt');
    txt.createDiv({ cls: 'tb-update-banner-title', text: `Trip Buddy ${u.latest} est disponible` });
    txt.createDiv({ cls: 'tb-update-banner-sub', text: `Vous utilisez la version ${u.current}. La mise à jour concerne le module et les skills IA : vos notes et réglages ne changent pas.` });
    const act = b.createDiv('tb-update-banner-actions');
    if (u.bundle) {
      const go = act.createEl('button', { cls: 'mod-cta tb-btn-sm', text: '⬇️ Mettre à jour' });
      go.addEventListener('click', (e) => { e.preventDefault(); this.plugin.confirmUpdate(u, go); });
    } else {
      U.button(act, '⚙️ Comment mettre à jour', 'tb-btn-sm', () => this.plugin.openSettings());
    }
    const news = act.createEl('a', { cls: 'tb-update-banner-link', text: 'Nouveautés', href: u.url });
    news.setAttr('target', '_blank');
    U.button(act, '✕', 'tb-btn-icon tb-btn-sm tb-update-banner-close', () => {
      U.storeSet('updateDismissed', u.latest);
      this.plugin.refreshAll();
    }, `Masquer jusqu’à la prochaine version`);
  }

  destroy() { if (this.banner) this.banner.remove(); }
  relevant() { return false; }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-packing``` — progression + outils de la liste de bagages
 * -------------------------------------------------------------------------- */
class PackingBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-packing');
    this.file = this.opts.file ? this.data.resolveLink(this.opts.file, this.ctx.sourcePath) : this.sourceFile();
    this.hide = U.storeGet('packHide', false);
    setTimeout(() => this.applyHide(), 100);
    return this.refresh();
  }

  relevant(f) { return f === this.file; }

  viewEl() { return this.el.closest('.workspace-leaf-content') || this.el.closest('.markdown-preview-view') || document.body; }

  applyHide() {
    const v = this.viewEl();
    if (v && v !== document.body) v.toggleClass('tb-hide-checked', !!this.hide);
  }

  async refresh() {
    if (!this.file) { this.root.empty(); U.empty(this.root, '🎒', 'Liste introuvable'); return; }
    const text = await this.app.vault.cachedRead(this.file);
    this.cats = this.data.parsePacking(text);
    const r = this.root;
    r.empty();
    const total = this.cats.reduce((a, c) => a + c.items.length, 0);
    const done = this.cats.reduce((a, c) => a + c.items.filter((i) => i.checked).length, 0);

    const head = r.createDiv('tb-packing-head');
    U.ring(head, total ? done / total : 0, `${total ? Math.round((done / total) * 100) : 0} %`, `${done}/${total}`,
      done === total && total ? 'var(--tb-good)' : undefined);
    const txt = head.createDiv('tb-packing-txt');
    txt.createDiv({ cls: 'tb-kicker', text: '🎒 Valise' });
    txt.createDiv({
      cls: 'tb-budget-title',
      text: !total ? 'Liste vide' : done === total ? 'Tout est prêt, bon voyage ! 🎉' : `Encore ${total - done} élément${total - done > 1 ? 's' : ''} à préparer`,
    });
    const tools = txt.createDiv('tb-actions');
    U.button(tools, '＋ Ajouter', 'mod-cta', () => new PackingAddModal(this.plugin, this.file, this.cats).open());
    U.button(tools, '📋 Modèle', '', () => new PackingTemplateModal(this.plugin, this.file).open(), 'Importer un modèle de liste');
    const hb = U.button(tools, this.hide ? '👁 Afficher cochés' : '🙈 Masquer cochés', '', () => {
      this.hide = !this.hide; U.storeSet('packHide', this.hide); this.applyHide();
      hb.setText(this.hide ? '👁 Afficher cochés' : '🙈 Masquer cochés');
    });
    U.button(tools, '↺ Tout décocher', '', () => {
      new ConfirmModal(this.plugin, 'Tout décocher ?', 'Toutes les cases de la liste seront décochées (pratique pour le retour !).', 'Tout décocher',
        () => this.plugin.setAllPacking(this.file, false)).open();
    });

    const grid = r.createDiv('tb-packcats');
    this.cats.forEach((c) => {
      const n = c.items.length, d = c.items.filter((i) => i.checked).length;
      const card = grid.createDiv('tb-packcat' + (n && d === n ? ' is-complete' : ''));
      const t = card.createDiv('tb-packcat-top');
      t.createSpan({ cls: 'tb-packcat-name', text: c.name });
      t.createSpan({ cls: 'tb-packcat-n', text: n && d === n ? '✓' : `${d}/${n}` });
      U.progress(card, n ? d / n : 0, n && d === n ? 'var(--tb-good)' : undefined);
      card.addEventListener('click', () => this.scrollTo(c.name));
    });
  }

  scrollTo(name) {
    const v = this.viewEl();
    const hs = v.querySelectorAll('h2, h3, h4, h5, h6, .HyperMD-header');
    for (const h of hs) {
      if (h.textContent.replace(/^#+\s*/, '').trim() === name.trim()) { h.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    }
  }
}

const WEATHERS = [
  ['☀️', 'Soleil'], ['🌤️', 'Éclaircies'], ['⛅', 'Nuageux'], ['☁️', 'Couvert'], ['🌦️', 'Averses'],
  ['🌧️', 'Pluie'], ['⛈️', 'Orage'], ['🌨️', 'Neige'], ['🌫️', 'Brouillard'], ['💨', 'Vent'],
];

/** « ☀️ 24 °C, grand ciel bleu » → { icon, temp, note } */
function parseWeather(s) {
  s = String(s || '').trim();
  const icon = (WEATHERS.find(([e]) => s.startsWith(e)) || [''])[0];
  let rest = icon ? s.slice(icon.length).trim() : s;
  const m = rest.match(/^(-?\d+(?:[.,]\d+)?)\s*°\s*C?/i);
  const temp = m ? m[1] : '';
  if (m) rest = rest.slice(m[0].length);
  return { icon, temp, note: rest.replace(/^[\s,–—-]+/, '').trim() };
}

class WeatherModal extends TBModal {
  constructor(plugin, current, onSave) {
    super(plugin, '🌤️ Météo du jour');
    this.w = parseWeather(current);
    this.onSave = onSave;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    const grid = c.createDiv('tb-weather-grid');
    WEATHERS.forEach(([e, l]) => {
      const b = grid.createEl('button', { cls: 'tb-weather-pick' + (e === this.w.icon ? ' is-active' : '') });
      b.createDiv({ cls: 'tb-weather-ico', text: e });
      b.createDiv({ cls: 'tb-weather-lbl', text: l });
      b.addEventListener('click', () => {
        this.w.icon = this.w.icon === e ? '' : e;
        grid.querySelectorAll('.tb-weather-pick').forEach((x) => x.removeClass('is-active'));
        if (this.w.icon) b.addClass('is-active');
      });
    });
    const row = c.createDiv('tb-form-grid');
    this.temp = this.input('text', this.w.temp, 'Ex. 22');
    this.temp.setAttr('inputmode', 'decimal');
    this.field(row, 'Température (°C)', this.temp);
    this.note = this.input('text', this.w.note, 'Ex. grand ciel bleu, vent frais…');
    this.field(row, 'Précisions', this.note);
    this.footer([
      ['Effacer', 'tb-push-left', () => { this.close(); this.onSave(''); }],
      ['Annuler', '', () => this.close()],
      ['Enregistrer', 'mod-cta', () => this.save()],
    ]);
  }
  save() {
    const t = this.temp.value.trim().replace(',', '.');
    const parts = [this.w.icon, t ? `${t} °C` : ''].filter(Boolean).join(' ');
    const note = this.note.value.trim();
    this.close();
    this.onSave([parts, note].filter(Boolean).join(parts && note ? ', ' : ''));
  }
  onClose() { this.contentEl.empty(); }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-journal-day``` — en-tête d'une entrée de journal
 * -------------------------------------------------------------------------- */
class JournalDayBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-jday');
    this.file = this.sourceFile();
    return this.refresh();
  }

  relevant(f) {
    if (f === this.file) return true;
    const t = this.data.fm(f).type;
    return t === 'poi' || t === 'programme' || f.path === normalizePath(this.s.files.budget);
  }

  async refresh() {
    const r = this.root;
    if (!this.file) return;
    const j = this.data.toJournal(this.file);
    const days = this.data.tripDays();
    const idx = this.data.dayIndex(j.date);
    const { expenses } = await this.data.budget();
    r.empty();

    const card = r.createDiv('tb-jday-card');
    const badge = card.createDiv('tb-prog-date');
    badge.createDiv({ cls: 'tb-prog-dow', text: U.fmtWeekdayShort(j.date) });
    badge.createDiv({ cls: 'tb-prog-dnum', text: U.fmtDay(j.date) });
    badge.createDiv({ cls: 'tb-prog-mon', text: U.fmtMonthShort(j.date) });
    const main = card.createDiv('tb-jday-main');
    main.createDiv({ cls: 'tb-kicker', text: (idx ? `Jour ${idx} sur ${days.length} · ` : '') + U.cap(U.fmtLong(j.date)) });
    const setFm = (key, val) => this.app.fileManager.processFrontMatter(this.file, (fm) => { fm[key] = val; });

    // titre (modifiable directement)
    const title = main.createEl('input', { type: 'text', cls: 'tb-title-input tb-jday-title', attr: { placeholder: 'Donnez un titre à cette journée…' } });
    title.value = j.title || '';
    title.addEventListener('change', () => setFm('title', title.value.trim()));

    const chips = main.createDiv('tb-chips tb-jday-chips');
    // lieu
    const loc = chips.createDiv('tb-pill tb-pill-edit');
    loc.createSpan({ text: '📍' });
    const locIn = loc.createEl('input', { type: 'text', cls: 'tb-pill-input', attr: { placeholder: 'Où étiez-vous ?' } });
    locIn.value = j.location || '';
    locIn.addEventListener('change', () => setFm('location', locIn.value.trim()));
    // météo
    const wBtn = chips.createEl('button', { cls: 'tb-pill tb-pill-btn', text: j.weather || '🌤️ Ajouter la météo' });
    if (!j.weather) wBtn.addClass('is-empty');
    wBtn.setAttr('title', 'Modifier la météo');
    wBtn.addEventListener('click', () => new WeatherModal(this.plugin, j.weather, (v) => setFm('weather', v)).open());
    // humeur : 5 boutons
    const mood = chips.createDiv('tb-pill tb-mood');
    mood.setAttr('title', 'Humeur du jour');
    const cur = !isNaN(j.mood) ? U.clamp(Math.round(j.mood), 0, 5) : 0;
    for (let i = 1; i <= 5; i++) {
      const b = mood.createEl('button', { cls: 'tb-mood-btn' + (i === cur ? ' is-active' : ''), text: MOODS[i] });
      b.setAttr('aria-label', `Humeur ${i}/5`);
      b.addEventListener('click', () => setFm('mood', i === cur ? 0 : i));
    }

    // photo du jour
    const coverFile = j.cover ? this.data.resolveLink(j.cover, this.file.path) : null;
    const pickCover = () => {
      const input = createEl('input', { type: 'file', attr: { accept: 'image/*' } });
      input.addEventListener('change', async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        const img = await this.plugin.saveImage(f, f.name.split('.').pop(), `Journal ${j.date}`);
        await setFm('cover', this.data.linkTo(img, this.file.path));
        new Notice('📷 Photo du jour ajoutée');
      });
      input.click();
    };
    if (coverFile instanceof TFile) {
      const cov = r.createDiv('tb-jday-cover');
      const img = cov.createEl('img');
      img.src = this.app.vault.getResourcePath(coverFile);
      img.alt = j.title || 'Photo du jour';
      const tools = cov.createDiv('tb-jday-cover-tools');
      U.button(tools, '📷', 'tb-btn-icon tb-cover-btn', pickCover, 'Changer la photo du jour');
      U.button(tools, '✕', 'tb-btn-icon tb-cover-btn', () => this.app.fileManager.processFrontMatter(this.file, (fm) => { delete fm.cover; }), 'Retirer la photo (le fichier est conservé)');
    } else {
      U.button(r.createDiv('tb-jday-addcover'), '📷 Ajouter une photo du jour', '', pickCover);
    }

    const info = r.createDiv('tb-jday-info');
    const seen = this.data.pois().filter((p) => p.done && p.doneDate === j.date);
    const box1 = info.createDiv('tb-mini');
    box1.createDiv({ cls: 'tb-mini-title', text: `✅ Lieux faits ce jour (${seen.length})` });
    if (seen.length) {
      const c = box1.createDiv('tb-chips');
      seen.forEach((p) => {
        const chip = c.createSpan({ cls: 'tb-chip tb-cat' });
        chip.style.setProperty('--tb-c', p.cat.color);
        chip.createSpan({ text: p.cat.icon + ' ' });
        U.noteLink(this.plugin, chip, p.file, p.name);
      });
    } else box1.createDiv({ cls: 'tb-muted tb-small', text: 'Cochez des lieux comme « faits » à cette date pour les voir ici.' });

    const dayExp = expenses.filter((e) => e.date === j.date);
    const box2 = info.createDiv('tb-mini');
    box2.createDiv({ cls: 'tb-mini-title', text: '💸 Dépenses du jour' });
    const tot = dayExp.reduce((a, e) => a + e.amountMain, 0);
    box2.createDiv({ cls: 'tb-mini-value', text: U.fmtMoney(tot, this.s.trip.currency) });
    box2.createDiv({ cls: 'tb-muted tb-small', text: dayExp.length ? dayExp.map((e) => e.label).slice(0, 3).join(' · ') + (dayExp.length > 3 ? '…' : '') : 'Aucune dépense' });

    const nav = r.createDiv('tb-jday-nav');
    const all = this.data.journal();
    const i = all.findIndex((x) => x.file === this.file);
    const prev = all[i - 1], next = all[i + 1];
    const pb = U.button(nav, prev ? `◀ ${U.fmtShort(prev.date)}` : '◀', '', () => prev && this.plugin.openFile(prev.file));
    pb.toggleClass('is-disabled', !prev);
    const prog = this.data.programmeFor(j.date);
    if (prog) U.button(nav, '🗓️ Programme du jour', '', () => this.plugin.openFile(prog.file));
    U.button(nav, '📔 Tout le journal', '', () => this.plugin.openPath(this.s.files.journal));
    const nb = U.button(nav, next ? `${U.fmtShort(next.date)} ▶` : '▶', '', () => next && this.plugin.openFile(next.file));
    nb.toggleClass('is-disabled', !next);
  }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-journal``` — frise de toutes les journées
 * -------------------------------------------------------------------------- */
class JournalIndexBlock extends TBBlock {
  mount() { this.root.addClass('tb-journal'); return this.refresh(); }
  relevant(f) { return this.data.fm(f).type === 'journal'; }

  async refresh() {
    const r = this.root;
    const entries = this.data.journal();
    const days = this.data.tripDays();
    const map = {};
    entries.forEach((e) => { map[e.date] = e; });
    const all = days.slice();
    entries.forEach((e) => { if (e.date && !all.includes(e.date)) all.push(e.date); });
    all.sort();
    const token = (this.token = (this.token || 0) + 1);
    r.empty();

    const head = r.createDiv('tb-budget-head');
    const h = head.createDiv();
    h.createDiv({ cls: 'tb-kicker', text: '📔 Carnet de voyage' });
    h.createDiv({ cls: 'tb-budget-title', text: `${entries.length} journée${entries.length > 1 ? 's' : ''} racontée${entries.length > 1 ? 's' : ''}` + (days.length ? ` sur ${days.length}` : '') });
    const hb = head.createDiv('tb-actions');
    U.button(hb, '🖨️ Carnet PDF', 'tb-btn-lg', () => new BookletModal(this.plugin).open(), 'Générer le carnet souvenir imprimable (livret A6)');
    U.button(hb, '✍️ Écrire aujourd’hui', 'mod-cta tb-btn-lg', () => this.plugin.openJournal(this.data.currentDay()));

    if (!all.length) { U.empty(r, '📔', 'Aucune entrée', 'Définissez les dates du voyage dans les réglages.'); return; }
    const tl = r.createDiv('tb-timeline');
    const today = U.todayISO();
    for (const d of all) {
      const e = map[d];
      const idx = this.data.dayIndex(d);
      const item = tl.createDiv('tb-tl-item' + (e ? '' : ' is-missing') + (d === today ? ' is-today' : ''));
      const dot = item.createDiv('tb-tl-dot');
      dot.setText(idx ? String(idx) : '·');
      const card = item.createDiv('tb-tl-card');
      const top = card.createDiv('tb-tl-top');
      top.createSpan({ cls: 'tb-kicker', text: U.cap(U.fmtMedium(d)) });
      if (e) {
        if (e.weather) top.createSpan({ cls: 'tb-tl-weather', text: e.weather });
        if (e.mood) top.createSpan({ text: MOODS[U.clamp(Math.round(e.mood), 1, 5)] || '' });
        const body = card.createDiv('tb-tl-body');
        const tx = body.createDiv('tb-tl-txt');
        U.noteLink(this.plugin, tx, e.file, e.title || `Jour ${idx || ''}`, 'tb-tl-title');
        if (e.location) tx.createDiv({ cls: 'tb-muted tb-small', text: '📍 ' + e.location });
        const ex = tx.createDiv('tb-tl-excerpt');
        poiExcerpt(this.app, e.file, 220).then((t) => { if (token === this.token) ex.setText(t); });
        if (e.cover) {
          const f = this.data.resolveLink(e.cover, e.file.path);
          if (f instanceof TFile) {
            const img = body.createEl('img', { cls: 'tb-tl-thumb' });
            img.src = this.app.vault.getResourcePath(f);
            img.alt = '';
          }
        }
        card.addEventListener('click', (ev) => { if (!ev.target.closest('a')) this.plugin.openFile(e.file); });
      } else {
        const b = card.createDiv('tb-tl-body');
        b.createDiv({ cls: 'tb-muted', text: d > today ? 'Journée à venir' : 'Pas encore écrit' });
        U.button(b, '＋ Écrire', '', () => this.plugin.openJournal(d));
      }
    }
  }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-documents``` — documents de voyage (PDF, photos, …)
 * -------------------------------------------------------------------------- */
const DOC_ICONS = { pdf: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', heic: '🖼️', md: '📝', doc: '📃', docx: '📃', xls: '📊', xlsx: '📊', csv: '📊', txt: '📃', mp3: '🎵', m4a: '🎵', mp4: '🎬', mov: '🎬', zip: '🗜️', gpx: '🧭', kml: '🧭', ics: '📅', pkpass: '🎫' };
const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'];
const DOC_DRAG_TYPE = 'application/x-tripbuddy-doc';

class DocumentsBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-docs');
    this.q = '';
    const bar = this.root.createDiv('tb-toolbar');
    const search = bar.createEl('input', { type: 'search', cls: 'tb-input tb-search', attr: { placeholder: '🔎 Rechercher un document…' } });
    search.addEventListener('input', () => { this.q = search.value.toLowerCase(); this.renderList(); });
    bar.createDiv('tb-grow');
    U.button(bar, '📄 Exporter le voyage', '', () => new VaultExportModal(this.plugin).open(), 'Programme, lieux visités, journal, carte, photos, budget et documents dans un seul PDF');
    this.target = bar.createEl('select', { cls: 'tb-input dropdown' });
    this.target.setAttr('title', 'Dossier de destination');
    const up = U.button(bar, '⬆️ Ajouter des fichiers', 'mod-cta', () => input.click());
    const input = bar.createEl('input', { type: 'file', attr: { multiple: true, accept: '*/*' } });
    input.addClass('tb-hidden');
    input.addEventListener('change', async () => {
      up.addClass('is-disabled');
      await this.upload(Array.from(input.files || []));
      input.value = '';
      up.removeClass('is-disabled');
    });
    this.list = this.root.createDiv();
    return this.refresh();
  }

  relevant() { return false; }

  folder() { return normalizePath(this.opts.folder || this.s.folders.documents); }

  async refresh() {
    const base = this.folder();
    const root = this.app.vault.getAbstractFileByPath(base);
    this.files = this.app.vault.getFiles().filter((f) => f.path.startsWith(base + '/') && f.path !== this.ctx.sourcePath);
    // dossiers cibles pour l'import
    const cur = this.target.value;
    this.target.empty();
    const folders = [base];
    const walk = (fo) => fo.children.forEach((c) => { if (c instanceof TFolder) { folders.push(c.path); walk(c); } });
    if (root instanceof TFolder) walk(root);
    folders.forEach((p) => { const o = this.target.createEl('option', { text: '📂 ' + this.folderLabel(p) }); o.value = p; });
    this.folders = folders;
    this.target.value = cur || folders[1] || base;
    this.renderList();
  }

  /** Nom affiché d'un dossier (« Général » pour le dossier racine, « A / B » pour les sous-dossiers). */
  folderLabel(p) {
    const base = this.folder();
    return p === base ? 'Général' : p.slice(base.length + 1).split('/').join(' / ');
  }

  renderList() {
    const base = this.folder();
    const l = this.list;
    l.empty();
    const files = this.files.filter((f) => !this.q || f.path.toLowerCase().includes(this.q));
    if (!files.length) {
      U.empty(l, '📁', 'Aucun document', `Déposez vos billets, réservations et photos dans « ${base} » ou utilisez le bouton « Ajouter des fichiers ».`);
      return;
    }
    // un groupe par dossier ; les dossiers vides ne s'affichent que pendant un glisser-déposer
    const groups = {};
    (this.folders || [base]).forEach((p) => { groups[p] = []; });
    files.forEach((f) => {
      const p = f.parent ? f.parent.path : base;
      (groups[p] = groups[p] || []).push(f);
    });
    // la section des photos (dossier des pièces jointes, « Photos » par défaut) est placée tout en bas
    const att = normalizePath((this.s.display && this.s.display.attachmentFolder) || `${base}/Photos`);
    const isPhoto = (p) => p === att || p.startsWith(att + '/');
    const rank = (p) => (p === base ? 0 : isPhoto(p) ? 2 : 1);
    Object.keys(groups).sort((a, b) => rank(a) - rank(b) || this.folderLabel(a).localeCompare(this.folderLabel(b), LOCALE)).forEach((p) => {
      const list = groups[p];
      const sec = l.createDiv('tb-doc-group' + (list.length ? '' : ' is-empty'));
      const t = sec.createDiv('tb-group-title');
      t.createSpan({ text: '📂 ' + this.folderLabel(p) });
      t.createSpan({ cls: 'tb-group-count', text: String(list.length) });
      const grid = sec.createDiv('tb-doc-grid');
      list.sort((a, b) => a.basename.localeCompare(b.basename, LOCALE)).forEach((f) => this.card(grid, f));
      if (!list.length) grid.createDiv({ cls: 'tb-doc-drop-hint', text: 'Déposez un document ici' });
      this.dropZone(sec, p);
    });
  }

  /** Fait d'une section de catégorie une cible de dépôt pour les cartes de documents. */
  dropZone(sec, folder) {
    const accepts = (e) => this.dragging && this.dragging.parent && this.dragging.parent.path !== folder
      && Array.from(e.dataTransfer.types || []).includes(DOC_DRAG_TYPE);
    sec.addEventListener('dragover', (e) => {
      if (!accepts(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      sec.addClass('is-drop-target');
    });
    sec.addEventListener('dragleave', (e) => { if (!sec.contains(e.relatedTarget)) sec.removeClass('is-drop-target'); });
    sec.addEventListener('drop', (e) => {
      sec.removeClass('is-drop-target');
      if (!accepts(e)) return;
      e.preventDefault();
      const f = this.dragging;
      this.endDrag();
      this.moveTo(f, folder);
    });
  }

  endDrag() {
    this.dragging = null;
    this.root.removeClass('is-dragging');
    this.root.querySelectorAll('.is-drop-target, .is-drag-source').forEach((x) => x.removeClass('is-drop-target', 'is-drag-source'));
  }

  /** Déplace un document dans un autre dossier (les liens des notes sont mis à jour par Obsidian). */
  async moveTo(f, folder) {
    if (!f || !f.parent || f.parent.path === folder) return;
    const stem = f.basename, ext = f.extension ? '.' + f.extension : '';
    let path = normalizePath(`${folder}/${f.name}`), i = 2;
    while (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}/${stem} ${i++}${ext}`);
    try {
      await this.app.fileManager.renameFile(f, path);
      new Notice(`📂 « ${f.basename} » déplacé vers ${this.folderLabel(folder)}`);
    } catch (e) {
      new Notice(`Échec du déplacement de ${f.name} : ${e.message || e}`);
      return;
    }
    this.refresh();
  }

  card(parent, f) {
    const ext = f.extension.toLowerCase();
    const c = parent.createDiv('tb-doc');
    const th = c.createDiv('tb-doc-thumb tb-doc-' + ext);
    if (IMG_EXT.includes(ext)) {
      const img = th.createEl('img');
      img.src = this.app.vault.getResourcePath(f);
      img.alt = f.basename;
      img.loading = 'lazy';
      img.draggable = false; // on glisse la carte entière, pas l'image
    } else {
      th.createDiv({ cls: 'tb-doc-ico', text: DOC_ICONS[ext] || '📎' });
      th.createDiv({ cls: 'tb-doc-ext', text: ext.toUpperCase() });
    }
    const info = c.createDiv('tb-doc-info');
    info.createDiv({ cls: 'tb-doc-name', text: f.basename });
    info.createDiv({ cls: 'tb-doc-sub', text: [ext.toUpperCase(), U.fileSize(f.stat.size)].filter(Boolean).join(' · ') });
    c.setAttr('title', f.path);
    c.addEventListener('click', (e) => this.plugin.openFile(f, true));
    // glisser-déposer vers une autre catégorie
    c.setAttr('draggable', 'true');
    c.addEventListener('dragstart', (e) => {
      this.dragging = f;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData(DOC_DRAG_TYPE, f.path);
      c.addClass('is-drag-source');
      // différé : modifier la mise en page pendant dragstart annulerait le glisser
      setTimeout(() => { if (this.dragging === f) this.root.addClass('is-dragging'); }, 0);
    });
    c.addEventListener('dragend', () => this.endDrag());
    // alternative au glisser (mobile, clavier) : clic droit / appui long → « Déplacer vers »
    c.addEventListener('contextmenu', (e) => {
      const others = (this.folders || []).filter((p) => !f.parent || p !== f.parent.path);
      if (!others.length) return;
      e.preventDefault();
      const menu = new obsidian.Menu();
      others.forEach((p) => menu.addItem((it) => it.setTitle('Déplacer vers « ' + this.folderLabel(p) + ' »').setIcon('folder-input').onClick(() => this.moveTo(f, p))));
      menu.showAtMouseEvent(e);
    });
  }

  async upload(files) {
    if (!files.length) return;
    const dir = this.target.value || this.folder();
    await this.plugin.ensureFolder(dir);
    let n = 0;
    for (const file of files) {
      try {
        const buf = await file.arrayBuffer();
        const name = file.name.replace(/[\\/:*?"<>|#^[\]]/g, ' ');
        const dot = name.lastIndexOf('.');
        const stem = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
        let path = normalizePath(`${dir}/${name}`), i = 2;
        while (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${dir}/${stem} ${i++}${ext}`);
        await this.app.vault.createBinary(path, buf);
        n++;
      } catch (e) {
        new Notice(`Échec de l’import de ${file.name} : ${e.message || e}`);
      }
    }
    new Notice(`📁 ${n} fichier${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`);
    this.refresh();
  }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-dashboard``` — page d'accueil du voyage
 * -------------------------------------------------------------------------- */
class DashboardBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-dash');
    this.top = this.root.createDiv();
    const mapCard = this.root.createDiv('tb-card tb-dash-map');
    const mh = mapCard.createDiv('tb-card-title tb-row');
    mh.createSpan({ text: '🗺️ Tous les lieux' });
    mh.createDiv('tb-grow');
    U.button(mh, '⛶ Plein écran', 'tb-btn-sm', () => this.plugin.openMapView());
    this.mapEl = mapCard.createDiv();
    this.mapEl.style.height = (parseInt(this.opts.height, 10) || 340) + 'px';
    this.map = new TripMap(this.plugin, this.mapEl, { compact: false });
    return this.refresh();
  }

  async refresh() {
    const s = this.s;
    const d = this.data;
    const r = this.top;
    const pois = d.pois();
    const days = d.tripDays();
    const journal = d.journal();
    const progs = d.programmes();
    const { expenses } = await d.budget();
    let packing = { total: 0, done: 0 };
    const pf = d.packingFile();
    if (pf) {
      const cats = d.parsePacking(await this.app.vault.cachedRead(pf));
      cats.forEach((c) => { packing.total += c.items.length; packing.done += c.items.filter((i) => i.checked).length; });
    }
    const docs = this.app.vault.getFiles().filter((f) => f.path.startsWith(normalizePath(s.folders.documents) + '/') && f.extension !== 'md').length;
    r.empty();

    /* ---- héros */
    const hero = r.createDiv('tb-hero');
    // dégradé de fond aux couleurs de l'emoji du voyage (dégradé par défaut si l'emoji est sans couleur)
    const pal = emojiPalette(s.trip.emoji || '✈️');
    if (pal) {
      hero.addClass('has-palette');
      pal.forEach((c, i) => hero.style.setProperty(`--tb-hero-c${i + 1}`, c));
    }
    hero.createDiv({ cls: 'tb-hero-emoji', text: s.trip.emoji || '✈️' });
    const ht = hero.createDiv('tb-hero-txt');
    ht.createDiv({ cls: 'tb-hero-dest', text: s.trip.destination || '' });
    ht.createDiv({ cls: 'tb-hero-name', text: s.trip.name || 'Mon voyage' });
    const dates = days.length ? `${U.fmtDate(days[0], { day: 'numeric', month: 'long' })} → ${U.fmtDate(days[days.length - 1], { day: 'numeric', month: 'long', year: 'numeric' })} · ${days.length} jour${days.length > 1 ? 's' : ''}` : 'Dates à définir';
    ht.createDiv({ cls: 'tb-hero-dates', text: dates });
    const meta = ht.createDiv('tb-hero-meta');
    meta.createSpan({ cls: 'tb-hero-status', text: d.tripStatus().label });
    const trav = meta.createDiv('tb-avatars');
    (s.trip.travelers || []).forEach((t) => { const a = trav.createSpan({ cls: 'tb-avatar', text: t.slice(0, 1).toUpperCase() }); a.setAttr('title', t); });
    U.button(hero, '⚙️', 'tb-btn-icon tb-hero-settings', () => this.plugin.openSettings(), 'Réglages du voyage');

    /* ---- sélecteur de thème */
    const cur = (s.display && s.display.theme) || 'default';
    const sw = hero.createDiv('tb-theme-switch');
    sw.setAttr('role', 'radiogroup');
    sw.setAttr('aria-label', 'Thème');
    [['default', '🎨', 'Thème par défaut (suit Obsidian)'], ['dark', '🌙', 'Thème sombre']].forEach(([id, ico, label]) => {
      const b = sw.createEl('button', { cls: 'tb-theme-opt' + (id === cur ? ' is-active' : ''), text: ico });
      b.setAttr('title', label);
      b.setAttr('aria-label', label);
      b.setAttr('role', 'radio');
      b.setAttr('aria-checked', String(id === cur));
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        if (s.display.theme === id) return;
        s.display.theme = id;
        sw.querySelectorAll('.tb-theme-opt').forEach((x) => { x.removeClass('is-active'); x.setAttr('aria-checked', 'false'); });
        b.addClass('is-active');
        b.setAttr('aria-checked', 'true');
        await this.plugin.saveSettings();
      });
    });

    /* ---- tuiles de navigation */
    const spent = expenses.reduce((a, e) => a + e.amountMain, 0);
    const budget = Number(s.trip.budget) || s.expenseCategories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
    const poiDone = pois.filter((p) => p.done).length;
    const planned = progs.filter((p) => p.steps.length).length;
    const tiles = r.createDiv('tb-tiles');
    const tile = (key, icon, label, stat, ratio) => {
      const t = tiles.createEl('a', { cls: 'tb-tile', href: '#' });
      t.createDiv({ cls: 'tb-tile-ico', text: icon });
      t.createDiv({ cls: 'tb-tile-lbl', text: label });
      t.createDiv({ cls: 'tb-tile-stat', text: stat });
      if (ratio != null) U.progress(t, ratio);
      t.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openPath(s.files[key], e.ctrlKey || e.metaKey); });
    };
    tile('programme', '🗓️', 'Programme', `${planned}/${days.length || '–'} jours planifiés`, days.length ? planned / days.length : null);
    tile('map', '🗺️', 'Carte', `${pois.filter((p) => p.hasCoords).length} lieux géolocalisés`);
    tile('pois', '📍', 'Lieux', `${poiDone}/${pois.length} faits`, pois.length ? poiDone / pois.length : 0);
    tile('journal', '📔', 'Journal', `${journal.length}/${days.length || '–'} jours écrits`, days.length ? journal.length / days.length : null);
    tile('budget', '💰', 'Budget', budget ? `${U.fmtMoney(spent, s.trip.currency)} / ${U.fmtMoney(budget, s.trip.currency)}` : U.fmtMoney(spent, s.trip.currency), budget ? spent / budget : null);
    tile('packing', '🎒', 'Valise', packing.total ? `${Math.round((packing.done / packing.total) * 100)} % prêt` : 'Liste vide', packing.total ? packing.done / packing.total : 0);
    tile('documents', '📁', 'Documents', `${docs} fichier${docs > 1 ? 's' : ''}`);

    /* ---- voyage d'exemple : explication + accès direct à la remise à zéro */
    if (s.demo) {
      const demo = r.createDiv('tb-card tb-demo-notice');
      demo.createDiv({ cls: 'tb-demo-ico', text: '🧪' });
      const body = demo.createDiv('tb-demo-body');
      body.createDiv({ cls: 'tb-demo-title', text: 'Voyage d’exemple' });
      body.createDiv({
        cls: 'tb-demo-text',
        text: `« ${s.trip.name || 'Ce voyage'} » est un contenu de démonstration, fictif : lieux, programme, journal, budget, documents et guide servent à découvrir Trip Buddy. `
          + 'Quand vous êtes prêt, remettez le coffre à zéro dans les réglages pour préparer votre propre voyage.',
      });
      const act = body.createDiv('tb-demo-actions');
      U.button(act, '🧹 Repartir de zéro (réglages)', 'mod-cta tb-btn-sm', () => this.plugin.openSettings('reset'));
      U.button(act, 'Masquer ce message', 'tb-btn-link', async () => { s.demo = false; await this.plugin.saveSettings(); });
    }

    /* ---- journée en cours */
    const day = d.currentDay();
    const prog = d.programmeFor(day);
    const card = r.createDiv('tb-card tb-dash-day');
    const th = card.createDiv('tb-card-title tb-row');
    th.createSpan({ text: (day === U.todayISO() ? '☀️ Aujourd’hui — ' : '🗓️ ') + U.cap(U.fmtMedium(day)) + (prog && prog.title ? ` · ${prog.title}` : '') });
    th.createDiv('tb-grow');
    U.button(th, '✍️ Journal', 'tb-btn-sm', () => this.plugin.openJournal(day));
    U.button(th, '💸 Dépense', 'tb-btn-sm', () => new ExpenseModal(this.plugin).open());
    if (prog && prog.steps.length) {
      const list = card.createDiv('tb-mini-steps');
      prog.steps.forEach((st, i) => {
        const it = list.createDiv('tb-mini-step' + (st.done ? ' is-done' : ''));
        if (st.cat) it.style.setProperty('--tb-c', st.cat.color);
        it.createSpan({ cls: 'tb-step-num', text: String(i + 1) });
        if (st.file) U.noteLink(this.plugin, it, st.file, `${st.cat.icon} ${st.name}`);
        else it.createSpan({ text: st.name });
      });
      U.button(card, 'Ouvrir le programme →', 'tb-btn-link', () => this.plugin.openPath(s.files.programme));
      this.map.setRoute(prog.steps.filter((x) => !x.missing), { fit: false });
    } else {
      card.createDiv({ cls: 'tb-muted', text: 'Rien de planifié pour ce jour.' });
      U.button(card, '🗓️ Planifier la journée', 'mod-cta', () => this.plugin.openPath(s.files.programme));
      this.map.setRoute([], { fit: false });
    }
    this.map.route = null;
    this.map.setPois(pois, { fit: !this.map.fitted });
  }

  destroy() { this.map && this.map.destroy(); }
}
