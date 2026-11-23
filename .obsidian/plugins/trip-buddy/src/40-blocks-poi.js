/* ==========================================================================
 * Trip Buddy — socle des blocs ```tripbuddy-*``` + blocs POI
 * ========================================================================== */
class TBBlock {
  constructor(plugin, el, ctx, source) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.data = plugin.data;
    this.ctx = ctx;
    this.el = el;
    this.source = source;
    this.opts = U.parseOptions(source);
    this.root = el.createDiv('tb');
  }
  get s() { return this.plugin.settings; }
  mount() { return this.refresh(); }
  async refresh() { /* à surcharger */ }
  /** Le bloc doit-il se rafraîchir quand ce fichier change ? */
  relevant(file) { return this.plugin.isTripFile(file); }
  destroy() { /* à surcharger */ }
  sourceFile() {
    const f = this.app.vault.getAbstractFileByPath(this.ctx.sourcePath);
    return f instanceof TFile ? f : null;
  }
}

class TBRenderChild extends MarkdownRenderChild {
  constructor(plugin, el, ctx, source, Klass) {
    super(el);
    this.plugin = plugin; this.ctx = ctx; this.source = source; this.Klass = Klass;
  }

  onload() {
    try {
      this.block = new this.Klass(this.plugin, this.containerEl, this.ctx, this.source);
      this.run(() => this.block.mount());
    } catch (e) {
      this.fail(e);
      return;
    }
    this.icons = TBIcons.watch(this.containerEl);
    const refresh = debounce(() => this.run(() => this.block.refresh()), 300, true);
    const app = this.plugin.app;
    this.registerEvent(app.metadataCache.on('changed', (f) => { if (this.block.relevant(f)) refresh(); }));
    this.registerEvent(app.vault.on('delete', () => refresh()));
    this.registerEvent(app.vault.on('create', (f) => { if (!(f instanceof TFile) || f.extension !== 'md') refresh(); }));
    this.registerEvent(app.vault.on('rename', () => refresh()));
    this.registerEvent(app.workspace.on(EVT_REFRESH, () => refresh()));
  }

  run(fn) {
    try {
      const p = fn();
      if (p && p.catch) p.catch((e) => this.fail(e));
    } catch (e) { this.fail(e); }
  }

  fail(e) {
    console.error('[Trip Buddy]', e);
    const box = this.containerEl.createDiv('tb tb-error');
    box.setText('⚠️ Trip Buddy : ' + (e && e.message ? e.message : e));
  }

  onunload() {
    if (this.icons) this.icons.disconnect();
    try { this.block && this.block.destroy(); } catch (e) { /* */ }
  }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-poi``` — fiche d'un POI (en tête de la note du lieu)
 * -------------------------------------------------------------------------- */
class PoiCardBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-poicard');
    this.file = this.opts.poi ? this.data.resolveLink(this.opts.poi, this.ctx.sourcePath) : this.sourceFile();
    this.body = this.root.createDiv();
    this.mapEl = this.root.createDiv('tb-poicard-map');
    this.trackEl = this.root.createDiv('tb-poicard-track');
    return this.refresh();
  }

  relevant(f) {
    if (f === this.file) return true;
    if (f && f.extension === 'gpx') return true;
    const t = this.data.fm(f).type;
    return t === 'programme';
  }

  async refresh() {
    const poi = this.file && this.data.poiOf(this.file);
    const b = this.body;
    b.empty();
    if (!poi) { U.empty(b, '📍', 'POI introuvable', 'Vérifiez le lien du bloc.'); return; }
    this.root.style.setProperty('--tb-c', poi.cat.color);

    /* ---- photo de couverture */
    const purl = this.data.photoUrl(poi);
    if (purl) {
      const cov = b.createDiv('tb-poicard-cover');
      const img = cov.createEl('img');
      img.src = purl; img.alt = poi.name;
      if (poi.photoCredit) cov.createDiv({ cls: 'tb-photo-credit', text: '📷 ' + poi.photoCredit });
      const chg = U.button(cov, '📷', 'tb-btn-icon tb-cover-btn', () => new PoiCreateModal(this.plugin, { edit: poi }).open(), 'Changer la photo');
      chg.setAttr('aria-label', 'Changer la photo');
    }

    /* ---- en-tête */
    const hero = b.createDiv('tb-poicard-hero');
    hero.createDiv({ cls: 'tb-poicard-icon', text: poi.cat.icon });
    const main = hero.createDiv('tb-poicard-main');
    const catSel = main.createEl('select', { cls: 'tb-select-chip' });
    const cats = [...this.s.poiCategories];
    if (poi.cat.unknown) cats.push(poi.cat);
    cats.forEach((c) => { const o = catSel.createEl('option', { text: `${c.icon} ${c.label}` }); o.value = c.id; });
    catSel.value = poi.cat.id;
    catSel.addEventListener('change', () => this.data.setPoiField(poi, 'category', catSel.value));
    main.createDiv({ cls: 'tb-poicard-name', text: poi.name });
    if (poi.address) main.createDiv({ cls: 'tb-poicard-addr', text: '📍 ' + poi.address });
    else main.createDiv({ cls: 'tb-poicard-addr tb-muted', text: '📍 Adresse non renseignée' });

    /* ---- statut / date / note */
    const bar = b.createDiv('tb-poicard-bar');
    const st = bar.createEl('button', {
      cls: 'tb-status' + (poi.done ? ' is-done' : ''),
      text: poi.done ? '✅ Fait' : '⬜ À faire',
    });
    st.setAttr('title', poi.done ? 'Marquer comme à faire' : 'Marquer comme fait');
    st.addEventListener('click', () => this.data.setPoiDone(poi, !poi.done));
    if (poi.done) {
      const dWrap = bar.createDiv('tb-inline');
      dWrap.createSpan({ cls: 'tb-muted', text: 'le' });
      const d = dWrap.createEl('input', { type: 'date', cls: 'tb-input tb-date' });
      d.value = poi.doneDate || '';
      d.addEventListener('change', () => this.data.setPoiField(poi, 'done_date', U.normDate(d.value)));
    }
    bar.createDiv('tb-grow');
    this.stars(bar, poi);

    /* ---- programmes contenant ce lieu */
    const progs = this.data.programmesWithPoi(this.file);
    if (progs.length) {
      const meta = b.createDiv('tb-poicard-meta');
      meta.createSpan({ text: '🗓️ Au programme : ' });
      progs.forEach((p, i) => {
        if (i) meta.appendText(' · ');
        U.noteLink(this.plugin, meta, p.file, U.cap(U.fmtMedium(p.date)) || p.file.basename);
      });
    }

    /* ---- actions */
    const act = b.createDiv('tb-actions');
    U.button(act, '✏️ Modifier', '', () => new PoiCreateModal(this.plugin, { edit: poi }).open(), 'Modifier le nom, l’adresse, les coordonnées, la photo…');
    U.button(act, '📅 Au programme…', '', () => new AddToProgrammeModal(this.plugin, poi).open(), 'Ajouter ce lieu au programme d’un jour');
    if (!purl) U.button(act, '📷 Photo', '', () => this.pickPhoto(poi), 'Ajouter une photo d’illustration');
    if (!poi.gpx.length && this.opts.track !== 'false') U.button(act, '🥾 Trace GPX', '', () => this.pickGpx(poi), 'Associer une trace GPX à ce lieu');
    const ext = (text, href, title) => {
      const a = act.createEl('a', { cls: 'tb-btn', text, href });
      a.setAttr('target', '_blank');
      a.setAttr('rel', 'noopener');
      if (title) a.setAttr('title', title);
      return a;
    };
    if (poi.hasCoords) {
      U.button(act, '🗺️ Sur la carte', '', () => this.plugin.openMapView(poi.path));
      const dir = this.plugin.mapLink('directions', poi);
      ext('🧭 Itinéraire', dir.url, `Itinéraire avec ${dir.label}`);
      const open = this.plugin.mapLink('open', poi);
      ext(`${open.icon} ${open.label}`, open.url, `Ouvrir dans ${open.label}`);
    }
    ext('🔎 Google', this.plugin.searchLink(poi), 'Rechercher ce lieu sur Google');
    if (poi.hasCoords) {
      U.button(act, '📋', 'tb-btn-icon', async () => {
        await navigator.clipboard.writeText(`${poi.lat}, ${poi.lon}`);
        new Notice('Coordonnées copiées');
      }, 'Copier les coordonnées');
      act.createSpan({ cls: 'tb-coords', text: `${poi.lat.toFixed(5)}, ${poi.lon.toFixed(5)}` });
    } else {
      U.button(act, '🔎 Géocoder l’adresse', 'mod-cta', () => new PoiCreateModal(this.plugin, { edit: poi }).open());
    }
    U.button(act, '🗑', 'tb-btn-icon tb-btn-danger', () => confirmDeletePoi(this.plugin, poi), 'Supprimer ce lieu');

    /* ---- mini-carte (et trace GPX) */
    const showTrack = poi.gpx.length > 0 && this.opts.track !== 'false';
    if ((poi.hasCoords || showTrack) && this.opts.map !== 'false') {
      this.mapEl.removeClass('tb-hidden');
      const h = (parseInt(this.opts.height, 10) || (showTrack ? 320 : 220)) + 'px';
      if (this.map && this.map.opts.fitTracks !== showTrack) { this.map.destroy(); this.map = null; this.mapEl.empty(); }
      if (!this.map) {
        this.mapEl.style.height = h;
        this.map = new TripMap(this.plugin, this.mapEl, {
          compact: !showTrack, addPoi: false, locate: true, fullscreen: showTrack, fitTracks: showTrack, waypoints: true,
          tracks: showTrack ? undefined : false,
        });
      }
      const key = `${poi.lat},${poi.lon},${poi.gpx.map((f) => f.path + (f.stat ? f.stat.mtime : '')).join('|')}`;
      if (key !== this.lastKey) this.map.trackFitted = false;
      this.map.setPois([poi], { fit: key !== this.lastKey });
      this.lastKey = key;
    } else {
      this.mapEl.addClass('tb-hidden');
    }
    await this.renderTrack(poi, showTrack);
  }

  /** Statistiques + profil altimétrique de la trace */
  async renderTrack(poi, show) {
    const box = this.trackEl;
    if (!show) { box.empty(); box.addClass('tb-hidden'); return; }
    const list = await TBGpx.forPoi(this.plugin, poi);
    box.empty();
    box.removeClass('tb-hidden');
    const head = box.createDiv('tb-card-title tb-row');
    head.createSpan({ text: '🥾 Trace GPX' });
    head.createDiv('tb-grow');
    U.button(head, '＋', 'tb-btn-icon tb-btn-sm', () => this.pickGpx(poi, true), 'Ajouter une autre trace à ce lieu');
    U.button(head, '🔁', 'tb-btn-icon tb-btn-sm', () => this.pickGpx(poi), 'Remplacer la trace');
    U.button(head, '✕', 'tb-btn-icon tb-btn-sm tb-btn-danger', async () => {
      await this.plugin.removePoiGpx(poi.file);
      new Notice('Trace retirée (le fichier GPX reste dans le coffre)');
    }, 'Retirer la trace de ce lieu');
    if (!list.length) {
      box.createDiv({ cls: 'tb-warn', text: '⚠︎ Fichier GPX illisible : ' + poi.gpx.map((f) => f.name).join(', ') });
      return;
    }
    const track = TBGpx.merge(list);
    const color = poi.trackColor || poi.cat.color;
    box.style.setProperty('--tb-c', color);
    TBGpx.renderStats(box, track);
    TBGpx.renderProfile(box, track, color, (p) => this.map && this.map.showCursor(p));
    const files = box.createDiv('tb-gpx-files tb-muted tb-small');
    files.createSpan({ text: '📎 ' });
    list.forEach((x, i) => {
      if (i) files.appendText(' · ');
      const a = files.createEl('a', { text: x.file.name, href: '#', cls: 'tb-link' });
      a.setAttr('title', 'Ouvrir le fichier GPX dans l’application par défaut');
      a.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openExternal(x.file); });
    });
    if (track.waypoints.length) files.appendText(` · ${track.waypoints.length} point${track.waypoints.length > 1 ? 's' : ''} de passage`);
  }

  /** Associe (ou remplace / ajoute) une trace GPX à ce lieu */
  pickGpx(poi, append) {
    this.plugin.pickGpx(async (files) => {
      let n = 0;
      for (const f of files) {
        try {
          const { text, track } = await this.plugin.readGpx(f);
          const gpx = await this.plugin.saveGpx(text, track.name || poi.name);
          await this.plugin.setPoiGpx(poi.file, gpx, track, { append: append || n > 0 });
          // lieu sans coordonnées : on le place au départ de la trace
          const start = TBGpx.startPoint(track);
          if (!poi.hasCoords && start) {
            await this.app.fileManager.processFrontMatter(poi.file, (fm) => { fm.lat = Number(start.lat.toFixed(6)); fm.lon = Number(start.lon.toFixed(6)); });
          }
          n++;
        } catch (e) { new Notice('🥾 ' + f.name + ' : ' + (e.message || e)); }
      }
      if (n) new Notice(`🥾 Trace${n > 1 ? 's' : ''} associée${n > 1 ? 's' : ''} à « ${poi.name} »`);
    }, true);
  }

  pickPhoto(poi) {
    const input = createEl('input', { type: 'file', attr: { accept: 'image/*' } });
    input.addEventListener('change', async () => {
      const f = input.files && input.files[0];
      if (!f) return;
      await this.plugin.setPoiPhoto(poi.file, f, f.name.split('.').pop());
      new Notice('📷 Photo ajoutée');
    });
    input.click();
  }

  stars(parent, poi) {
    const box = parent.createDiv('tb-stars');
    box.setAttr('title', 'Ma note');
    for (let i = 1; i <= 5; i++) {
      const s = box.createSpan({ cls: 'tb-star' + (i <= poi.rating ? ' is-on' : ''), text: '★' });
      s.addEventListener('click', () => this.data.setPoiField(poi, 'rating', poi.rating === i ? 0 : i));
    }
    return box;
  }

  async geocode(poi) {
    if (!poi.address && !poi.name) return;
    try {
      const res = await Geocoder.search(this.plugin, poi.address || poi.name);
      if (!res.length) { new Notice('Adresse introuvable'); return; }
      const r = res[0];
      await this.app.fileManager.processFrontMatter(poi.file, (fm) => {
        fm.lat = Number(r.lat.toFixed(6));
        fm.lon = Number(r.lon.toFixed(6));
        if (!fm.address) fm.address = r.address;
      });
      new Notice('📍 Coordonnées ajoutées');
    } catch (e) {
      new Notice('Géocodage impossible : ' + (e.message || e));
    }
  }

  destroy() { this.map && this.map.destroy(); }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-pois``` — index de tous les POI
 * -------------------------------------------------------------------------- */
class PoiListBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-poilist');
    this.state = {
      q: '',
      cat: this.opts.category || '',
      status: this.opts.status || U.storeGet('poiStatus', 'all'),
      sort: U.storeGet('poiSort', 'category'),
    };
    this.head = this.root.createDiv('tb-section-head');
    const bar = this.root.createDiv('tb-toolbar');
    const search = bar.createEl('input', { type: 'search', cls: 'tb-input tb-search', attr: { placeholder: '🔎 Rechercher…' } });
    search.addEventListener('input', () => { this.state.q = search.value.toLowerCase(); this.renderList(); });
    this.catSel = bar.createEl('select', { cls: 'tb-input dropdown' });
    this.catSel.addEventListener('change', () => { this.state.cat = this.catSel.value; this.renderList(); });
    U.segmented(bar, [['all', 'Tous'], ['todo', 'À faire'], ['done', 'Faits']], this.state.status, (v) => {
      this.state.status = v; U.storeSet('poiStatus', v); this.renderList();
    });
    const sort = bar.createEl('select', { cls: 'tb-input dropdown' });
    [['category', 'Par catégorie'], ['name', 'Par nom'], ['rating', 'Par note'], ['date', 'Par date de visite']]
      .forEach(([v, l]) => { const o = sort.createEl('option', { text: l }); o.value = v; });
    sort.value = this.state.sort;
    sort.addEventListener('change', () => { this.state.sort = sort.value; U.storeSet('poiSort', sort.value); this.renderList(); });
    bar.createDiv('tb-grow');
    U.button(bar, '⚙️', 'tb-btn-icon', () => this.plugin.openSettings(), 'Gérer les catégories');
    U.button(bar, '🥾 Importer GPX', '', () => this.plugin.pickGpx(), 'Créer un lieu à partir d’une trace GPX (plusieurs fichiers = un lieu par trace)');
    U.button(bar, '＋ Nouveau POI', 'mod-cta', () => new PoiCreateModal(this.plugin).open());
    this.list = this.root.createDiv();
    return this.refresh();
  }

  relevant(f) { return this.data.fm(f).type === 'poi'; }

  async refresh() {
    this.all = this.data.pois();
    // en-tête de statistiques
    this.head.empty();
    const done = this.all.filter((p) => p.done).length;
    U.ring(this.head, this.all.length ? done / this.all.length : 0, `${done}/${this.all.length}`, 'lieux faits');
    const cats = this.head.createDiv('tb-catstats');
    const by = {};
    this.all.forEach((p) => { (by[p.cat.id] = by[p.cat.id] || { cat: p.cat, n: 0, d: 0 }).n++; if (p.done) by[p.cat.id].d++; });
    Object.values(by).sort((a, b) => b.n - a.n).forEach(({ cat, n, d }) => {
      const it = cats.createDiv('tb-catstat');
      it.style.setProperty('--tb-c', cat.color);
      it.createSpan({ cls: 'tb-catstat-ico', text: cat.icon });
      const t = it.createDiv('tb-catstat-txt');
      t.createDiv({ cls: 'tb-catstat-lbl', text: cat.label });
      U.progress(t, n ? d / n : 0, cat.color);
      it.createSpan({ cls: 'tb-catstat-n', text: `${d}/${n}` });
      it.addEventListener('click', () => { this.state.cat = this.state.cat === cat.id ? '' : cat.id; this.catSel.value = this.state.cat; this.renderList(); });
    });
    // options catégories
    const cur = this.state.cat;
    this.catSel.empty();
    const o0 = this.catSel.createEl('option', { text: 'Toutes catégories' }); o0.value = '';
    this.s.poiCategories.forEach((c) => { const o = this.catSel.createEl('option', { text: `${c.icon} ${c.label}` }); o.value = c.id; });
    this.catSel.value = cur;
    this.renderList();
  }

  renderList() {
    const st = this.state;
    this.list.empty();
    let items = this.all.filter((p) => {
      if (st.cat && p.cat.id !== st.cat) return false;
      if (st.status === 'todo' && p.done) return false;
      if (st.status === 'done' && !p.done) return false;
      if (st.q && !(p.name + ' ' + p.address + ' ' + p.cat.label).toLowerCase().includes(st.q)) return false;
      return true;
    });
    if (!items.length) {
      U.empty(this.list, '🧭', 'Aucun lieu ici', 'Ajoutez un POI avec le bouton « Nouveau POI » ou depuis la carte.');
      return;
    }
    const groups = [];
    if (st.sort === 'category') {
      const order = this.s.poiCategories.map((c) => c.id);
      const map = {};
      items.forEach((p) => { (map[p.cat.id] = map[p.cat.id] || []).push(p); });
      Object.keys(map).sort((a, b) => {
        const ia = order.indexOf(a), ib = order.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      }).forEach((k) => groups.push({ cat: map[k][0].cat, items: map[k] }));
    } else {
      if (st.sort === 'rating') items = items.sort((a, b) => b.rating - a.rating || a.name.localeCompare(b.name, LOCALE));
      if (st.sort === 'date') items = items.sort((a, b) => (b.doneDate || '').localeCompare(a.doneDate || ''));
      groups.push({ items });
    }
    groups.forEach((g) => {
      if (g.cat) {
        const h = this.list.createDiv('tb-group-title');
        h.style.setProperty('--tb-c', g.cat.color);
        h.createSpan({ text: `${g.cat.icon} ${g.cat.label}` });
        h.createSpan({ cls: 'tb-group-count', text: String(g.items.length) });
      }
      const grid = this.list.createDiv('tb-poi-grid');
      g.items.forEach((p) => this.renderItem(grid, p));
    });
  }

  renderItem(parent, p) {
    const it = parent.createDiv('tb-poi-item' + (p.done ? ' is-done' : ''));
    it.style.setProperty('--tb-c', p.cat.color);
    const ico = it.createDiv({ cls: 'tb-poi-item-ico' + (p.photo ? ' has-photo' : ''), text: p.photo ? '' : p.cat.icon });
    if (p.photo) {
      const img = ico.createEl('img'); img.src = this.data.photoUrl(p); img.alt = ''; img.loading = 'lazy';
      ico.createSpan({ cls: 'tb-poi-item-badge', text: p.cat.icon });
    }
    const body = it.createDiv('tb-poi-item-body');
    U.noteLink(this.plugin, body, p.file, p.name, 'tb-poi-item-name', true);
    // toute la carte est cliquable (sauf la case « fait »)
    it.addEventListener('click', () => this.plugin.openFile(p.file, true));
    it.setAttr('title', 'Ouvrir dans un nouvel onglet');
    body.createDiv({ cls: 'tb-poi-item-sub', text: p.address || p.cat.label });
    const meta = body.createDiv('tb-poi-item-meta');
    if (p.rating) meta.createSpan({ cls: 'tb-stars-static', text: U.starsText(p.rating) });
    if (p.gpx.length) {
      const bits = ['🥾'];
      if (p.distanceKm > 0) bits.push(U.fmtDist(p.distanceKm));
      if (p.eleGain > 0) bits.push(`↗ ${p.eleGain} m`);
      meta.createSpan({ cls: 'tb-gpx-badge', text: bits.length > 1 ? bits.join(' ') : '🥾 trace' });
    }
    if (p.done && p.doneDate) meta.createSpan({ cls: 'tb-muted', text: '✓ ' + U.fmtShort(p.doneDate) });
    if (!p.hasCoords) meta.createSpan({ cls: 'tb-warn', text: '⚠︎ sans coordonnées' });
    const pg = it.createEl('button', { cls: 'tb-item-btn', text: '📅' });
    pg.setAttr('title', 'Ajouter au programme…');
    pg.setAttr('aria-label', 'Ajouter au programme');
    pg.addEventListener('click', (e) => { e.stopPropagation(); new AddToProgrammeModal(this.plugin, p).open(); });
    const tg = it.createEl('button', { cls: 'tb-check-btn' + (p.done ? ' is-on' : ''), text: p.done ? '✓' : '' });
    tg.setAttr('title', p.done ? 'Fait — cliquer pour annuler' : 'Marquer comme fait');
    tg.addEventListener('click', (e) => { e.stopPropagation(); this.data.setPoiDone(p, !p.done); });
  }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-map``` — carte de tous les POI
 * -------------------------------------------------------------------------- */
class MapBlock extends TBBlock {
  mount() {
    this.panel = new MapPanel(this.plugin, this.root, this.opts);
    return this.refresh();
  }
  relevant(f) { const t = this.data.fm(f).type; return t === 'poi' || t === 'programme'; }
  async refresh() { this.panel.refresh(); }
  destroy() { this.panel && this.panel.destroy(); }
}
