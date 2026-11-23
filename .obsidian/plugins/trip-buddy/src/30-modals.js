/* ==========================================================================
 * Trip Buddy — géocodage (Nominatim / OSM) et fenêtres modales
 * ========================================================================== */
const Geocoder = {
  UA: 'TripBuddy-Obsidian-Plugin/1.0',

  async get(url) {
    const res = await requestUrl({ url, headers: { 'User-Agent': Geocoder.UA, Accept: 'application/json' } });
    return res.json;
  },

  guessCategory(plugin, r) {
    const k = `${r.category || r.class || ''}:${r.type || ''}`;
    const rules = [
      [/amenity:(restaurant|fast_food|food_court)/, 'restaurant'],
      [/amenity:(cafe|bar|pub|ice_cream|biergarten)/, 'cafe'],
      [/tourism:(museum|gallery)|amenity:arts_centre/, 'musee'],
      [/tourism:viewpoint/, 'point-de-vue'],
      [/tourism:(hotel|hostel|guest_house|apartment|motel|camp_site)/, 'hebergement'],
      [/historic:|tourism:(attraction|artwork)|amenity:place_of_worship|building:(cathedral|church)/, 'monument'],
      [/leisure:(park|garden|nature_reserve)|natural:|boundary:national_park/, 'nature'],
      [/shop:|amenity:marketplace/, 'shopping'],
      [/place:(suburb|neighbourhood|quarter|village|town|city)|boundary:administrative/, 'quartier'],
      [/railway:|public_transport:|aeroway:|amenity:(bus_station|ferry_terminal)|highway:bus_stop/, 'transport'],
    ];
    const ids = plugin.settings.poiCategories.map((c) => c.id);
    for (const [re, id] of rules) if (re.test(k) && ids.includes(id)) return id;
    return '';
  },

  format(plugin, r) {
    const a = r.address || {};
    const street = [a.house_number, a.road || a.pedestrian || a.footway || a.square].filter(Boolean).join(' ');
    const city = a.city || a.town || a.village || a.municipality || a.suburb || '';
    const parts = [street, [a.postcode, city].filter(Boolean).join(' '), a.country].filter(Boolean);
    const name = r.name || (r.namedetails && r.namedetails.name) || (r.display_name || '').split(',')[0];
    return {
      name: name || 'Lieu',
      address: parts.length >= 2 ? parts.join(', ') : (r.display_name || ''),
      full: r.display_name || '',
      lat: Number(r.lat),
      lon: Number(r.lon),
      category: Geocoder.guessCategory(plugin, r),
      kind: [r.category || r.class, r.type].filter(Boolean).join(' · '),
    };
  },

  async search(plugin, q) {
    const g = plugin.settings.geocoder || {};
    const params = new URLSearchParams({
      format: 'jsonv2', addressdetails: '1', limit: '8', q,
      'accept-language': g.lang || 'fr',
    });
    if (g.countryCodes) params.set('countrycodes', g.countryCodes);
    const json = await Geocoder.get('https://nominatim.openstreetmap.org/search?' + params.toString());
    return (json || []).map((r) => Geocoder.format(plugin, r));
  },

  async reverse(plugin, lat, lon) {
    const g = plugin.settings.geocoder || {};
    const params = new URLSearchParams({
      format: 'jsonv2', addressdetails: '1', lat: String(lat), lon: String(lon), zoom: '18',
      'accept-language': g.lang || 'fr',
    });
    const json = await Geocoder.get('https://nominatim.openstreetmap.org/reverse?' + params.toString());
    return json && !json.error ? Geocoder.format(plugin, json) : null;
  },
};

/* --------------------------------------------------------------- base modal */
class TBModal extends Modal {
  constructor(plugin, title) {
    super(plugin.app);
    this.plugin = plugin;
    this.modalEl.addClass('tb-modal');
    if (title) this.titleEl.setText(title);
  }

  open() {
    super.open();
    this.icons = TBIcons.watch(this.modalEl);
  }

  close() {
    if (this.icons) this.icons.disconnect();
    super.close();
  }

  field(parent, label, input) {
    const f = parent.createDiv('tb-field');
    f.createEl('label', { text: label });
    f.appendChild(input);
    return f;
  }

  input(type, value, placeholder) {
    const i = createEl('input', { type, cls: 'tb-input' });
    if (value !== undefined && value !== null) i.value = value;
    if (placeholder) i.placeholder = placeholder;
    return i;
  }

  select(options, value) {
    const s = createEl('select', { cls: 'tb-input dropdown' });
    options.forEach(([v, l]) => {
      const o = s.createEl('option', { text: l });
      o.value = v;
    });
    if (value !== undefined) s.value = value;
    return s;
  }

  footer(buttons) {
    const f = this.contentEl.createDiv('tb-modal-footer');
    buttons.forEach(([label, cls, fn]) => U.button(f, label, cls, fn));
    return f;
  }
}

/* --------------------------------------------------------- création de POI */
class PoiCreateModal extends TBModal {
  /** preset.edit = POI existant à modifier (sinon création) */
  constructor(plugin, preset = {}) {
    super(plugin, preset.edit ? '✏️ Modifier le lieu' : '📍 Nouveau point d’intérêt');
    this.edit = preset.edit || null;
    if (this.edit) {
      const e = this.edit;
      preset = { ...preset, name: e.name, category: e.cat.id, address: e.address, rating: e.rating,
        lat: e.hasCoords ? e.lat : null, lon: e.hasCoords ? e.lon : null,
        done: e.done, doneDate: e.doneDate, trackColor: e.trackColor, photoCredit: e.photoCredit };
    } else if (preset.gpx) {
      // import d'une trace : nom, point de départ, catégorie et date pré-remplis
      const t = preset.gpx.track;
      const start = TBGpx.startPoint(t);
      preset = {
        name: t.name || preset.gpx.fileName.replace(/\.gpx$/i, ''),
        category: plugin.settings.poiCategories.find((c) => c.id === 'randonnee') ? 'randonnee' : undefined,
        lat: start ? start.lat : null, lon: start ? start.lon : null, reverse: !!start, keepName: true,
        done: !!t.stats.start, doneDate: t.stats.start ? U.isoDate(new Date(t.stats.start)) : '',
        description: t.desc || '',
        ...preset,
      };
      this.titleEl.setText('🥾 Importer une trace GPX');
    }
    this.preset = preset;
    this.gpxNew = preset.gpx || null; // { text, track, fileName } choisi dans la fenêtre
    this.gpxRemoved = false;
  }

  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    this.modalEl.addClass('tb-poi-modal');
    const p = this.preset;
    const grid = c.createDiv('tb-form-grid');

    /* ---- nom */
    this.name = this.input('text', p.name || p.query || '', 'Ex. Torre de Belém');
    this.field(grid, 'Nom', this.name).addClass('tb-span-2');

    /* ---- catégorie + note */
    const cats = this.plugin.settings.poiCategories.map((x) => [x.id, `${x.icon} ${x.label}`]);
    this.cat = this.select(cats, p.category || (cats[0] && cats[0][0]));
    this.field(grid, 'Catégorie', this.cat);
    this.rating = this.select([['0', '—'], ['1', '★'], ['2', '★★'], ['3', '★★★'], ['4', '★★★★'], ['5', '★★★★★']], String(p.rating || 0));
    this.field(grid, 'Note', this.rating);

    /* ---- statut + date de visite */
    this.done = this.select([['0', '⬜ À faire'], ['1', '✅ Fait']], p.done ? '1' : '0');
    this.field(grid, 'Statut', this.done);
    this.doneDate = this.input('date', p.doneDate || '');
    const ddField = this.field(grid, 'Date de visite', this.doneDate);
    const syncDone = () => {
      ddField.toggleClass('is-disabled', this.done.value !== '1');
      if (this.done.value === '1' && !this.doneDate.value) this.doneDate.value = U.todayISO();
    };
    this.done.addEventListener('change', syncDone);
    this.doneDate.addEventListener('change', () => { if (this.doneDate.value) { this.done.value = '1'; syncDone(); } });
    ddField.toggleClass('is-disabled', this.done.value !== '1');

    /* ---- adresse + géocodage */
    const addrField = grid.createDiv('tb-field tb-span-2');
    addrField.createEl('label', { text: 'Adresse' });
    const addrRow = addrField.createDiv('tb-geo-row');
    this.address = addrRow.createEl('input', { type: 'text', cls: 'tb-input tb-grow', attr: { placeholder: 'Adresse, nom du lieu ou coordonnées « 38.69, -9.21 »' } });
    this.address.value = p.address || '';
    this.geoBtn = U.button(addrRow, '📍 Géocoder', 'mod-cta', () => this.geocode(), 'Trouver les coordonnées (OpenStreetMap)');
    this.address.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); this.geocode(); } });
    this.results = addrField.createDiv('tb-results tb-geo-results');
    this.status = addrField.createDiv('tb-geo-status');

    /* ---- carte d'aperçu (marqueur déplaçable) */
    this.mapEl = grid.createDiv('tb-geo-map tb-span-2 tb-map');

    /* ---- coordonnées */
    this.lat = this.input('text', p.lat != null ? Number(p.lat).toFixed(6) : '', 'Latitude');
    this.lat.setAttr('inputmode', 'decimal');
    this.field(grid, 'Latitude', this.lat);
    this.lon = this.input('text', p.lon != null ? Number(p.lon).toFixed(6) : '', 'Longitude');
    this.lon.setAttr('inputmode', 'decimal');
    this.field(grid, 'Longitude', this.lon);
    [this.lat, this.lon].forEach((i) => i.addEventListener('change', () => this.syncMap(true)));

    /* ---- trace GPX */
    const gx = grid.createDiv('tb-field tb-span-2');
    gx.createEl('label', { text: 'Trace GPX' });
    const gxRow = gx.createDiv('tb-gpx-pick');
    this.gpxInfo = gxRow.createDiv('tb-gpx-pick-info');
    const gxBtns = gxRow.createDiv('tb-photo-btns');
    this.gpxBtn = U.button(gxBtns, '🥾 Choisir un fichier GPX…', '', () => this.plugin.pickGpx(async (files) => {
      try {
        const { text, track } = await this.plugin.readGpx(files[0]);
        this.gpxNew = { text, track, fileName: files[0].name };
        this.gpxRemoved = false;
        this.onGpxChosen(track);
      } catch (e) { new Notice('🥾 ' + (e.message || e)); }
    }, false));
    this.gpxRemoveBtn = U.button(gxBtns, '✕ Retirer', 'tb-btn-danger', () => {
      this.gpxNew = null; this.gpxRemoved = true; this.renderGpxInfo(); this.drawGpx();
    });
    this.trackColor = createEl('input', { type: 'color', cls: 'tb-color' });
    this.trackColor.value = /^#[0-9a-f]{6}$/i.test(p.trackColor || '') ? p.trackColor : (this.plugin.data.poiCat(p.category || this.cat.value).color || '#e67e22');
    this.trackColorSet = !!p.trackColor;
    const tcRow = gxBtns.createDiv('tb-inline tb-gpx-color');
    tcRow.createSpan({ cls: 'tb-muted tb-small', text: 'Couleur' });
    tcRow.appendChild(this.trackColor);
    this.trackColor.addEventListener('input', () => { this.trackColorSet = true; this.drawGpx(); });
    this.cat.addEventListener('change', () => {
      if (!this.trackColorSet) { this.trackColor.value = this.plugin.data.poiCat(this.cat.value).color || '#e67e22'; this.drawGpx(); }
    });
    this.gpxColorRow = tcRow;
    this.renderGpxInfo();

    /* ---- description (création seulement : ensuite elle vit dans la note) */
    /* ---- photo d'illustration (stockée dans le coffre) */
    const ph = grid.createDiv('tb-field tb-span-2');
    ph.createEl('label', { text: 'Photo d’illustration' });
    const phRow = ph.createDiv('tb-photo-pick');
    this.photoPrev = phRow.createDiv('tb-photo-prev');
    const phBtns = phRow.createDiv('tb-photo-btns');
    const fileInput = phBtns.createEl('input', { type: 'file', attr: { accept: 'image/*' } });
    fileInput.addClass('tb-hidden');
    U.button(phBtns, '📷 Choisir une image…', '', () => fileInput.click());
    this.photoRemoveBtn = U.button(phBtns, '✕ Retirer', 'tb-btn-danger', () => {
      this.photoFile = null; this.photoRemoved = true; this.renderPhotoPrev();
    });
    phBtns.createDiv({ cls: 'tb-muted tb-small', text: 'L’image est copiée dans le coffre (fonctionne hors ligne).' });
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (f) { this.photoFile = f; this.photoRemoved = false; this.renderPhotoPrev(); }
    });
    this.renderPhotoPrev();
    this.credit = this.input('text', p.photoCredit || '', 'Auteur / source de la photo (optionnel)');
    this.field(grid, 'Crédit photo', this.credit).addClass('tb-span-2');

    if (!this.edit) {
      this.desc = createEl('textarea', { cls: 'tb-input', attr: { rows: '3', placeholder: 'Quelques mots de présentation (optionnel)' } });
      if (p.description) this.desc.value = p.description;
      this.field(grid, 'Description', this.desc).addClass('tb-span-2');
    }

    const btns = [
      ['Annuler', '', () => this.close()],
      this.edit ? ['💾 Enregistrer', 'mod-cta', () => this.save()] : ['＋ Créer la note', 'mod-cta', () => this.create()],
    ];
    if (this.edit) btns.unshift(['🗑 Supprimer', 'mod-warning tb-push-left', () => { this.close(); confirmDeletePoi(this.plugin, this.edit); }]);
    this.footer(btns);

    setTimeout(() => {
      this.initMap();
      this.drawGpx(true);
      if (p.reverse && p.lat != null) this.reverse(p.lat, p.lon, p.keepName);
      else if (p.query) { this.address.value = p.query; this.geocode(); }
      else if (this.edit) {
        if (this.edit.hasCoords) this.setStatus(`✅ Géolocalisé : ${this.edit.lat.toFixed(5)}, ${this.edit.lon.toFixed(5)} — déplacez le repère ou relancez le géocodage`, 'is-ok');
        else this.setStatus('⚠️ Ce lieu n’a pas encore de coordonnées : cliquez sur « Géocoder ».', 'is-warn');
        this.address.focus();
      } else this.name.focus();
    }, 60);
  }

  renderPhotoPrev() {
    const box = this.photoPrev;
    box.empty();
    let url = null;
    if (this.photoFile) {
      if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
      this.photoUrl = url = URL.createObjectURL(this.photoFile);
    } else if (!this.photoRemoved && this.edit && this.edit.photo) {
      url = this.plugin.data.photoUrl(this.edit);
    }
    if (url) { const img = box.createEl('img'); img.src = url; img.alt = ''; }
    else box.createDiv({ cls: 'tb-photo-empty', text: '🖼️' });
    this.photoRemoveBtn.toggleClass('tb-hidden', !url);
  }

  async applyCredit(poiFile) {
    const v = this.credit.value.trim();
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => {
      if (v && fm.photo) fm.photo_credit = v; else if (!v) delete fm.photo_credit;
    });
  }

  async applyPhoto(poiFile) {
    if (this.photoFile) {
      const ext = (this.photoFile.name.split('.').pop() || 'jpg');
      await this.plugin.setPoiPhoto(poiFile, this.photoFile, ext);
    } else if (this.photoRemoved) {
      await this.plugin.removePoiPhoto(poiFile);
    }
  }

  /* ------------------------------------------------------------ trace GPX */
  /** Trace actuellement affichée : nouvelle (choisie) ou existante (mode édition) */
  async currentTrack() {
    if (this.gpxNew) return this.gpxNew.track;
    if (this.gpxRemoved || !this.edit || !this.edit.gpx.length) return null;
    const list = await TBGpx.forPoi(this.plugin, this.edit);
    return list.length ? TBGpx.merge(list) : null;
  }

  async renderGpxInfo() {
    const box = this.gpxInfo;
    box.empty();
    const t = await this.currentTrack();
    this.gpxRemoveBtn.toggleClass('tb-hidden', !t);
    this.gpxColorRow.toggleClass('tb-hidden', !t);
    this.gpxBtn.setText(t ? '🔁 Remplacer…' : '🥾 Choisir un fichier GPX…');
    if (!t) {
      box.createDiv({ cls: 'tb-muted tb-small', text: 'Optionnel : la trace s’affiche sur la carte et dans la fiche, avec distance, dénivelé et profil.' });
      return;
    }
    const name = this.gpxNew ? this.gpxNew.fileName : this.edit.gpx.map((f) => f.name).join(', ');
    box.createDiv({ cls: 'tb-gpx-pick-name', text: '🥾 ' + name });
    const st = t.stats;
    const bits = [U.fmtDist(st.distanceKm)];
    if (st.gain != null) bits.push(`↗ ${st.gain} m`, `↘ ${st.loss} m`);
    if (st.durationMs) bits.push(TBGpx.fmtDuration(st.durationMs));
    else if (st.distanceKm > 0.2) bits.push('≈ ' + TBGpx.fmtDuration(st.estimateMs) + ' de marche');
    if (t.waypoints.length) bits.push(`${t.waypoints.length} point${t.waypoints.length > 1 ? 's' : ''} de passage`);
    box.createDiv({ cls: 'tb-muted tb-small', text: bits.join(' · ') });
  }

  /** Nouvelle trace choisie : complète les champs vides avec ses informations */
  onGpxChosen(track) {
    this.renderGpxInfo();
    if (!this.name.value.trim() && track.name) this.name.value = track.name;
    const start = TBGpx.startPoint(track);
    const hasCoords = !isNaN(U.toNum(this.lat.value)) && !isNaN(U.toNum(this.lon.value));
    if (start && !hasCoords) {
      this.setCoords(start.lat, start.lon, false);
      if (!this.address.value.trim()) this.reverse(start.lat, start.lon, true);
    }
    if (track.stats.start && this.done.value !== '1') {
      this.done.value = '1';
      this.doneDate.value = U.isoDate(new Date(track.stats.start));
      this.done.dispatchEvent(new Event('change'));
    }
    if (this.desc && !this.desc.value.trim() && track.desc) this.desc.value = track.desc;
    this.drawGpx(true);
  }

  async drawGpx(fit) {
    if (!this.map) return;
    if (!this.gpxLayer) this.gpxLayer = L.layerGroup().addTo(this.map);
    this.gpxLayer.clearLayers();
    const t = await this.currentTrack();
    if (!t) return;
    const lines = t.segments.map((seg) => seg.map((q) => [q.lat, q.lon]));
    if (lines.length) {
      L.polyline(lines, { className: 'tb-track-halo', weight: 7, opacity: 1, interactive: false }).addTo(this.gpxLayer);
      L.polyline(lines, { className: 'tb-track', color: this.trackColor.value, weight: 4, opacity: 0.95, interactive: false }).addTo(this.gpxLayer);
    }
    if (fit && t.bounds) {
      const go = () => {
        if (!this.map) return;
        if (this.map._animatingZoom) { this.map.once('zoomend', go); return; } // un zoom animé ignorerait le recadrage
        this.map.invalidateSize({ animate: false }); this.map.fitBounds(t.bounds, { padding: [20, 20], maxZoom: 16, animate: false });
      };
      go();
      setTimeout(go, 150); // la fenêtre finit de se dimensionner
    }
  }

  /** Enregistre la trace choisie (ou la retire) sur la note du POI */
  async applyGpx(poiFile, name) {
    if (this.gpxNew) {
      const gpx = await this.plugin.saveGpx(this.gpxNew.text, name || this.gpxNew.track.name || 'Trace');
      await this.plugin.setPoiGpx(poiFile, gpx, this.gpxNew.track);
    } else if (this.gpxRemoved) {
      await this.plugin.removePoiGpx(poiFile);
    }
    const hasTrack = this.gpxNew || (!this.gpxRemoved && this.edit && this.edit.gpx.length);
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => {
      if (hasTrack && this.trackColorSet) fm.track_color = this.trackColor.value;
      else delete fm.track_color;
    });
  }

  /** Statut, date et crédit photo (communs à la création et à la modification) */
  applyExtra(fm) {
    const done = this.done.value === '1';
    fm.done = done;
    if (done) fm.done_date = U.normDate(this.doneDate.value) || U.todayISO(); else delete fm.done_date;
  }

  /* ------------------------------------------------------------- carte */
  initMap() {
    const s = this.plugin.settings.map;
    const preset = TILE_PRESETS[U.storeGet('baselayer', null) || s.tiles] || TILE_PRESETS.osm;
    const url = s.tiles === 'custom' && s.customUrl ? s.customUrl : preset.url;
    this.map = L.map(this.mapEl, { zoomControl: true, attributionControl: true, scrollWheelZoom: true })
      .setView([Number(s.lat) || 0, Number(s.lon) || 0], Number(s.zoom) || 12);
    this.map.attributionControl.setPrefix(false);
    TBOffline.layer(url, { attribution: preset.attribution, maxZoom: preset.maxZoom || 19, subdomains: preset.subdomains || 'abc' }).addTo(this.map);
    const cat = () => this.plugin.data.poiCat(this.cat.value);
    this.marker = L.marker(this.map.getCenter(), { draggable: true, icon: TripMap.pinIcon(cat(), cat().icon, false) });
    this.cat.addEventListener('change', () => this.marker.setIcon(TripMap.pinIcon(cat(), cat().icon, false)));
    this.marker.on('dragend', () => {
      const ll = this.marker.getLatLng();
      this.setCoords(ll.lat, ll.lng, false);
      this.setStatus('📌 Position ajustée à la main', 'is-ok', true);
    });
    this.map.on('click', (e) => {
      this.setCoords(e.latlng.lat, e.latlng.lng, false);
      this.setStatus('📌 Position choisie sur la carte', 'is-ok', true);
    });
    setTimeout(() => this.map.invalidateSize(), 50);
    this.syncMap(true, false);
  }

  syncMap(center, animate = true) {
    if (!this.map) return;
    const lat = U.toNum(this.lat.value), lon = U.toNum(this.lon.value);
    if (isNaN(lat) || isNaN(lon)) {
      if (this.map.hasLayer(this.marker)) this.marker.remove();
      return;
    }
    this.marker.setLatLng([lat, lon]);
    if (!this.map.hasLayer(this.marker)) this.marker.addTo(this.map);
    if (center) this.map.setView([lat, lon], Math.max(this.map.getZoom(), 16), { animate });
  }

  setCoords(lat, lon, center = true) {
    this.lat.value = Number(lat).toFixed(6);
    this.lon.value = Number(lon).toFixed(6);
    this.syncMap(center);
  }

  setStatus(text, cls, withReverse) {
    this.status.empty();
    this.status.className = 'tb-geo-status ' + (cls || '');
    this.status.createSpan({ text });
    if (withReverse) {
      const a = this.status.createEl('a', { text: 'Récupérer l’adresse de ce point', href: '#' });
      a.addEventListener('click', (e) => {
        e.preventDefault();
        this.reverse(U.toNum(this.lat.value), U.toNum(this.lon.value), true);
      });
    }
  }

  /* --------------------------------------------------------- géocodage */
  apply(r, opts = {}) {
    if (!this.name.value.trim() || opts.forceName) this.name.value = r.name;
    if (r.address) this.address.value = r.address;
    if (r.category && !opts.keepCategory && !this.edit) {
      this.cat.value = r.category;
      this.cat.dispatchEvent(new Event('change'));
    }
    this.setCoords(r.lat, r.lon, true);
    this.setStatus(`✅ Géocodé : ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`, 'is-ok');
  }

  async reverse(lat, lon, keepName) {
    if (isNaN(lat) || isNaN(lon)) return;
    this.setStatus('⏳ Recherche de l’adresse…', '');
    try {
      const r = await Geocoder.reverse(this.plugin, lat, lon);
      if (!r) { this.setStatus('Adresse introuvable pour ce point — complétez-la à la main.', 'is-warn'); return; }
      r.lat = Number(lat); r.lon = Number(lon);
      if (keepName) {
        this.address.value = r.address;
        this.setStatus(`✅ Adresse retrouvée pour ${r.lat.toFixed(5)}, ${r.lon.toFixed(5)}`, 'is-ok');
      } else {
        this.apply(r);
      }
    } catch (e) {
      this.setStatus('⚠️ Service de géocodage injoignable (hors ligne ?) — complétez à la main.', 'is-warn');
    }
  }

  async geocode() {
    let q = this.address.value.trim();
    // coordonnées collées directement : « 38.6916, -9.2160 »
    const m = q.match(/^\s*(-?\d{1,3}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)\s*$/);
    if (m && q.includes('.')) {
      const lat = U.toNum(m[1]), lon = U.toNum(m[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        this.address.value = '';
        this.setCoords(lat, lon, true);
        await this.reverse(lat, lon);
        return;
      }
    }
    if (!q) q = this.name.value.trim();
    if (!q) { this.setStatus('Saisissez une adresse ou un nom de lieu.', 'is-warn'); this.address.focus(); return; }
    this.results.empty();
    this.geoBtn.addClass('is-disabled');
    this.setStatus('⏳ Recherche sur OpenStreetMap…', '');
    try {
      let list = await Geocoder.search(this.plugin, q);
      // nom + adresse si l'adresse seule ne donne rien
      if (!list.length && this.name.value.trim() && q !== this.name.value.trim()) {
        list = await Geocoder.search(this.plugin, `${this.name.value.trim()} ${q}`);
      }
      if (!list.length) { this.setStatus('Aucun résultat — précisez l’adresse, ou touchez la carte pour placer le point.', 'is-warn'); return; }
      if (list.length === 1) { this.apply(list[0], { keepCategory: true }); return; }
      this.setStatus(`${list.length} résultats — choisissez le bon :`, '');
      list.forEach((r, i) => {
        const item = this.results.createDiv('tb-result');
        const cat = this.plugin.data.poiCat(r.category);
        item.createSpan({ cls: 'tb-result-ico', text: cat.icon });
        const txt = item.createDiv('tb-result-txt');
        txt.createDiv({ cls: 'tb-result-name', text: r.name });
        txt.createDiv({ cls: 'tb-result-addr', text: r.full });
        item.addEventListener('click', () => {
          this.results.empty();
          this.apply(r);
        });
        if (i === 0) item.addClass('is-active');
      });
    } catch (e) {
      this.setStatus('⚠️ Service de géocodage injoignable : ' + (e.message || e), 'is-warn');
    } finally {
      this.geoBtn.removeClass('is-disabled');
    }
  }

  /** Mode édition : met à jour les propriétés (et renomme la note si le nom change) */
  async save() {
    const e = this.edit;
    const name = this.name.value.trim();
    if (!name) { new Notice('Donnez un nom au lieu'); this.name.focus(); return; }
    const lat = U.toNum(this.lat.value), lon = U.toNum(this.lon.value);
    await this.app.fileManager.processFrontMatter(e.file, (fm) => {
      fm.name = name;
      fm.category = this.cat.value;
      fm.address = this.address.value.trim();
      if (!isNaN(lat) && !isNaN(lon)) { fm.lat = Number(lat.toFixed(6)); fm.lon = Number(lon.toFixed(6)); } else { delete fm.lat; delete fm.lon; }
      fm.rating = Number(this.rating.value) || 0;
      this.applyExtra(fm);
    });
    await this.applyPhoto(e.file);
    await this.applyCredit(e.file);
    await this.applyGpx(e.file, name);
    // renomme le fichier si le nom a changé (les liens sont mis à jour par Obsidian)
    const base = U.sanitizeFileName(name);
    if (base !== e.file.basename) {
      const dir = e.file.path.split('/').slice(0, -1).join('/');
      const target = normalizePath(`${dir ? dir + '/' : ''}${base}.md`);
      if (!this.app.vault.getAbstractFileByPath(target)) {
        try { await this.app.fileManager.renameFile(e.file, target); } catch (err) { console.error(err); }
      }
    }
    new Notice(`✏️ « ${name} » mis à jour`);
    this.close();
  }

  async create() {
    const name = this.name.value.trim();
    if (!name) { new Notice('Donnez un nom au lieu'); this.name.focus(); return; }
    let lat = U.toNum(this.lat.value), lon = U.toNum(this.lon.value);
    // géocodage de dernière minute si l'adresse est saisie mais pas les coordonnées
    if ((isNaN(lat) || isNaN(lon)) && this.address.value.trim()) {
      try {
        const r = (await Geocoder.search(this.plugin, this.address.value.trim()))[0];
        if (r) { lat = r.lat; lon = r.lon; }
      } catch (e) { /* hors ligne : on crée sans coordonnées */ }
    }
    const file = await this.plugin.createPoi({
      name,
      category: this.cat.value,
      address: this.address.value.trim(),
      lat: isNaN(lat) ? null : lat,
      lon: isNaN(lon) ? null : lon,
      rating: Number(this.rating.value) || 0,
      description: this.desc ? this.desc.value.trim() : '',
    });
    if (file) {
      await this.app.fileManager.processFrontMatter(file, (fm) => this.applyExtra(fm));
      await this.applyPhoto(file);
      await this.applyCredit(file);
      await this.applyGpx(file, name);
      this.close();
      if (this.preset.onCreated) this.preset.onCreated(file);
      else this.plugin.openFile(file);
    }
  }

  onClose() {
    if (this.photoUrl) URL.revokeObjectURL(this.photoUrl);
    try { this.map && this.map.remove(); } catch (e) { /* */ }
    this.contentEl.empty();
  }
}

/* --------------------------------------------------------------- dépenses */
class ExpenseModal extends TBModal {
  constructor(plugin, expense) {
    super(plugin, expense ? '✏️ Modifier la dépense' : '💸 Nouvelle dépense');
    this.expense = expense;
  }

  onOpen() {
    const s = this.plugin.settings;
    const e = this.expense || {};
    const c = this.contentEl;
    c.addClass('tb');

    const amountRow = c.createDiv('tb-amount-row');
    this.amount = amountRow.createEl('input', { type: 'text', cls: 'tb-input tb-amount', attr: { inputmode: 'decimal', placeholder: '0,00' } });
    if (e.amount) this.amount.value = String(e.amount).replace('.', ',');
    const curs = [s.trip.currency, ...(s.currencies || []).map((x) => x.code)]
      .filter((v, i, a) => v && a.indexOf(v) === i).map((x) => [x, x]);
    this.currency = this.select(curs, e.currency || U.storeGet('lastCurrency', s.trip.currency));
    this.currency.addClass('tb-currency');
    amountRow.appendChild(this.currency);

    const catsBox = c.createDiv('tb-cat-picker');
    this.category = e.category || s.expenseCategories[0]?.id;
    s.expenseCategories.forEach((cat) => {
      const b = catsBox.createEl('button', { cls: 'tb-cat-pick' });
      b.style.setProperty('--tb-c', cat.color);
      b.createDiv({ cls: 'tb-cat-pick-ico', text: cat.icon });
      b.createDiv({ cls: 'tb-cat-pick-lbl', text: cat.label });
      if (cat.id === this.category) b.addClass('is-active');
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        catsBox.querySelectorAll('.tb-cat-pick').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
        this.category = cat.id;
      });
    });

    const grid = c.createDiv('tb-form-grid');
    this.label = this.input('text', e.label || '', 'Ex. Dîner chez Ramiro');
    this.field(grid, 'Libellé', this.label).addClass('tb-span-2');
    this.date = this.input('date', e.date || this.plugin.data.currentDay());
    this.field(grid, 'Date', this.date);
    const travelers = (s.trip.travelers || []).map((t) => [t, t]);
    travelers.unshift(['', '—']);
    this.payer = this.select(travelers, e.payer || U.storeGet('lastPayer', ''));
    this.field(grid, 'Payé par', this.payer);
    this.note = this.input('text', e.note || '', 'Optionnel');
    this.field(grid, 'Note', this.note).addClass('tb-span-2');

    const btns = [['Annuler', '', () => this.close()]];
    if (this.expense) {
      btns.unshift(['🗑 Supprimer', 'mod-warning', async () => {
        await this.plugin.data.deleteExpense(this.expense);
        new Notice('Dépense supprimée');
        this.close();
      }]);
    }
    btns.push([this.expense ? 'Enregistrer' : '＋ Ajouter', 'mod-cta', () => this.save()]);
    this.footer(btns);
    setTimeout(() => this.amount.focus(), 50);
    this.amount.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.label.focus(); });
    this.label.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') this.save(); });
  }

  async save() {
    const amount = U.parseAmount(this.amount.value);
    if (!amount) { new Notice('Indiquez un montant'); this.amount.focus(); return; }
    const exp = {
      date: U.normDate(this.date.value) || U.todayISO(),
      label: this.label.value.trim() || this.plugin.data.expCat(this.category).label,
      category: this.category,
      amount,
      currency: this.currency.value,
      payer: this.payer.value,
      note: this.note.value.trim(),
    };
    U.storeSet('lastCurrency', exp.currency);
    U.storeSet('lastPayer', exp.payer);
    await this.plugin.data.upsertExpense(exp, this.expense);
    new Notice(`💸 ${U.fmtMoney(amount, exp.currency)} enregistré`);
    this.close();
  }

  onClose() { this.contentEl.empty(); }
}

/* ------------------------------------------------ sélection multiple de POI */
class PoiPickerModal extends TBModal {
  constructor(plugin, { exclude = [], onPick, title }) {
    super(plugin, title || '📍 Ajouter des lieux au programme');
    this.exclude = new Set(exclude);
    this.onPick = onPick;
    this.selected = [];
    this.q = '';
    this.cat = '';
    this.hideDone = U.storeGet('pickerHideDone', false);
  }

  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    this.modalEl.addClass('tb-modal-tall');
    const bar = c.createDiv('tb-toolbar');
    const search = bar.createEl('input', { type: 'search', cls: 'tb-input tb-search', attr: { placeholder: '🔎 Filtrer…' } });
    search.addEventListener('input', () => { this.q = search.value.toLowerCase(); this.renderList(); });
    const cats = [['', 'Toutes catégories'], ...this.plugin.settings.poiCategories.map((x) => [x.id, `${x.icon} ${x.label}`])];
    const sel = this.select(cats, '');
    bar.appendChild(sel);
    sel.addEventListener('change', () => { this.cat = sel.value; this.renderList(); });
    const lbl = bar.createEl('label', { cls: 'tb-check' });
    const cb = lbl.createEl('input', { type: 'checkbox' });
    cb.checked = this.hideDone;
    lbl.appendText(' Masquer les faits');
    cb.addEventListener('change', () => { this.hideDone = cb.checked; U.storeSet('pickerHideDone', cb.checked); this.renderList(); });

    this.list = c.createDiv('tb-pick-list');
    const foot = c.createDiv('tb-modal-footer');
    U.button(foot, '＋ Nouveau POI', '', () => {
      this.close();
      new PoiCreateModal(this.plugin, { onCreated: (f) => this.onPick([f]) }).open();
    });
    foot.createDiv('tb-grow');
    U.button(foot, 'Annuler', '', () => this.close());
    this.okBtn = U.button(foot, 'Ajouter', 'mod-cta', () => {
      this.close();
      if (this.selected.length) this.onPick(this.selected.map((p) => p.file));
    });
    this.renderList();
    setTimeout(() => search.focus(), 50);
  }

  renderList() {
    this.list.empty();
    const all = this.plugin.data.pois().filter((p) => {
      if (this.cat && p.cat.id !== this.cat) return false;
      if (this.hideDone && p.done) return false;
      if (this.q && !(p.name + ' ' + p.address).toLowerCase().includes(this.q)) return false;
      return true;
    });
    if (!all.length) U.empty(this.list, '🔍', 'Aucun lieu', 'Modifiez les filtres ou créez un nouveau POI.');
    all.forEach((p) => {
      const already = this.exclude.has(p.path);
      const row = this.list.createDiv('tb-pick' + (already ? ' is-already' : ''));
      row.style.setProperty('--tb-c', p.cat.color);
      const cb = row.createEl('input', { type: 'checkbox' });
      cb.checked = this.selected.includes(p);
      row.createSpan({ cls: 'tb-pick-ico', text: p.cat.icon });
      const t = row.createDiv('tb-pick-txt');
      t.createDiv({ cls: 'tb-pick-name', text: p.name + (p.done ? '  ✓' : '') });
      t.createDiv({ cls: 'tb-pick-sub', text: already ? 'Déjà au programme — sera ajouté une seconde fois' : (p.address || p.cat.label) });
      const toggle = () => {
        const i = this.selected.indexOf(p);
        if (i >= 0) this.selected.splice(i, 1); else this.selected.push(p);
        cb.checked = i < 0;
        row.toggleClass('is-selected', cb.checked);
        this.okBtn.setText(this.selected.length ? `Ajouter (${this.selected.length})` : 'Ajouter');
      };
      row.addEventListener('click', (e) => { if (e.target !== cb) toggle(); });
      cb.addEventListener('change', () => { cb.checked = !cb.checked; toggle(); });
    });
  }

  onClose() { this.contentEl.empty(); }
}

/* ----------------------------------------------------------- confirmation */
/* ------------------------------------------- ajouter un POI au programme */
class AddToProgrammeModal extends TBModal {
  constructor(plugin, poi) {
    super(plugin, `📅 Ajouter « ${poi.name} » au programme`);
    this.poi = poi;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    const d = this.plugin.data;
    const progs = {};
    d.programmes().forEach((p) => { progs[p.date] = p; });
    const days = d.tripDays().slice();
    Object.keys(progs).forEach((k) => { if (k && !days.includes(k)) days.push(k); });
    days.sort();
    c.createDiv({ cls: 'tb-muted tb-small', text: 'Choisissez le jour : le lieu est ajouté à la fin de la journée (avant le retour au point de départ, s’il y en a un).' });
    const grid = c.createDiv('tb-days tb-days-wrap');
    const today = U.todayISO();
    days.forEach((day) => {
      const p = progs[day];
      const n = p ? p.steps.length : 0;
      const has = p && p.steps.some((s) => s.file === this.poi.file);
      const b = grid.createEl('button', { cls: 'tb-day' + (day === today ? ' is-today' : '') + (has ? ' is-has' : '') });
      const idx = d.dayIndex(day);
      b.createDiv({ cls: 'tb-day-k', text: idx ? `J${idx}` : '·' });
      b.createDiv({ cls: 'tb-day-dow', text: U.fmtWeekdayShort(day) });
      b.createDiv({ cls: 'tb-day-num', text: U.fmtDay(day) });
      b.createDiv({ cls: 'tb-day-mon', text: U.fmtMonthShort(day) });
      b.createDiv({ cls: 'tb-day-badge' + (n ? '' : ' is-zero'), text: has ? '✓ déjà prévu' : (n ? `${n} lieu${n > 1 ? 'x' : ''}` : 'vide') });
      b.addEventListener('click', () => this.add(day));
    });
    const other = c.createDiv('tb-day-other');
    other.createSpan({ cls: 'tb-muted', text: 'Autre date :' });
    const inp = other.createEl('input', { type: 'date', cls: 'tb-input tb-date' });
    U.button(other, 'Ajouter', '', () => { const v = U.normDate(inp.value); if (v) this.add(v); else new Notice('Choisissez une date'); });
  }
  async add(day) {
    const d = this.plugin.data;
    let prog = d.programmeFor(day);
    if (!prog) {
      const file = await this.plugin.createProgramme(day, { open: false });
      prog = d.toProgramme(file);
      prog.steps = [];
    }
    const n = await d.addToProgramme(prog, [this.poi.file]);
    this.close();
    new Notice(`📅 « ${this.poi.name} » ajouté au programme du ${U.fmtMedium(day)} (${n} étape${n > 1 ? 's' : ''})`);
  }
  onClose() { this.contentEl.empty(); }
}

/** Demande confirmation puis supprime le POI */
function confirmDeletePoi(plugin, poi, after) {
  const progs = plugin.data.programmesWithPoi(poi.file);
  const extra = progs.length
    ? ` Il sera aussi retiré ${progs.length > 1 ? `des ${progs.length} programmes` : 'du programme'} où il figure (${progs.map((p) => U.fmtShort(p.date)).join(', ')}).`
    : '';
  new ConfirmModal(plugin, `🗑 Supprimer « ${poi.name} » ?`,
    `La note du lieu sera placée dans la corbeille (récupérable).${extra}`,
    'Supprimer', async () => {
      await plugin.data.deletePoi(poi);
      new Notice(`🗑 « ${poi.name} » supprimé`);
      if (after) after();
    }, true).open();
}

class ConfirmModal extends TBModal {
  constructor(plugin, title, message, okLabel, onOk, danger) {
    super(plugin, title);
    this.message = message; this.okLabel = okLabel; this.onOk = onOk; this.danger = danger;
  }
  onOpen() {
    this.contentEl.addClass('tb');
    this.contentEl.createDiv({ cls: 'tb-confirm-text', text: this.message });
    this.footer([
      ['Annuler', '', () => this.close()],
      [this.okLabel, this.danger ? 'mod-warning' : 'mod-cta', async () => { this.close(); await this.onOk(); }],
    ]);
  }
  onClose() { this.contentEl.empty(); }
}

/* --------------------------------------------------- ajout packing list */
class PackingAddModal extends TBModal {
  constructor(plugin, file, categories) {
    super(plugin, '🎒 Ajouter à la valise');
    this.file = file; this.categories = categories;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    const opts = this.categories.filter((x) => x.line >= 0).map((x) => [x.name, x.name]);
    opts.push(['__new__', '＋ Nouvelle catégorie…']);
    this.cat = this.select(opts, U.storeGet('packCat', opts[0][0]));
    if (!opts.find((o) => o[0] === this.cat.value)) this.cat.value = opts[0][0];
    this.field(c, 'Catégorie', this.cat);
    this.newCat = this.input('text', '', 'Ex. 🤿 Plongée');
    const nf = this.field(c, 'Nom de la nouvelle catégorie', this.newCat);
    const sync = () => nf.toggleClass('tb-hidden', this.cat.value !== '__new__');
    this.cat.addEventListener('change', sync); sync();
    this.items = createEl('textarea', { cls: 'tb-input', attr: { rows: '5', placeholder: 'Un élément par ligne\nEx. Crème solaire\nLunettes de soleil' } });
    this.field(c, 'Éléments', this.items);
    this.footer([['Annuler', '', () => this.close()], ['＋ Ajouter', 'mod-cta', () => this.save()]]);
    setTimeout(() => this.items.focus(), 50);
  }
  async save() {
    const items = this.items.value.split('\n').map((x) => x.trim()).filter(Boolean);
    if (!items.length) { new Notice('Ajoutez au moins un élément'); return; }
    let catName = this.cat.value;
    if (catName === '__new__') catName = this.newCat.value.trim() || 'Divers';
    U.storeSet('packCat', catName);
    await this.plugin.addPackingItems(this.file, catName, items);
    this.close();
  }
  onClose() { this.contentEl.empty(); }
}

/* -------------------------------------------- choix d'un modèle de packing */
class PackingTemplateModal extends TBModal {
  constructor(plugin, file) {
    super(plugin, '📋 Importer un modèle de packing');
    this.file = file;
  }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    const folder = normalizePath(this.plugin.settings.folders.templates || '');
    const files = this.plugin.app.vault.getMarkdownFiles()
      .filter((f) => f.path.startsWith(folder + '/') && /packing/i.test(f.basename));
    if (!files.length) {
      U.empty(c, '📋', 'Aucun modèle', `Créez une note dont le nom contient « Packing » dans « ${folder} ».`);
      return;
    }
    c.createDiv({ cls: 'tb-muted', text: 'Les éléments absents de votre liste seront ajoutés dans les bonnes catégories.' });
    const list = c.createDiv('tb-pick-list');
    files.forEach((f) => {
      const row = list.createDiv('tb-pick');
      row.createSpan({ cls: 'tb-pick-ico', text: '🧳' });
      const t = row.createDiv('tb-pick-txt');
      t.createDiv({ cls: 'tb-pick-name', text: f.basename.replace(/^packing\s*[-–—]\s*/i, '') });
      row.addEventListener('click', async () => {
        this.close();
        await this.plugin.importPackingTemplate(this.file, f);
      });
    });
  }
  onClose() { this.contentEl.empty(); }
}
