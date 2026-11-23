/* ==========================================================================
 * Trip Buddy — cartographie (Leaflet + OpenStreetMap)
 * ========================================================================== */
class TripMap {
  static live = new Set();
  /**
   * @param plugin
   * @param el conteneur (doit avoir une hauteur)
   * @param opts { locate, addPoi, compact, interactive }
   */
  constructor(plugin, el, opts = {}) {
    this.plugin = plugin;
    this.el = el;
    this.opts = opts;
    this.fitted = false;
    this.pois = [];
    this.route = null;
    el.addClass('tb-map');

    const s = plugin.settings.map;
    this.map = L.map(el, {
      zoomControl: !opts.compact,
      attributionControl: true,
      scrollWheelZoom: !opts.compact,
      tapHold: true,
      worldCopyJump: true,
    }).setView([Number(s.lat) || 0, Number(s.lon) || 0], Number(s.zoom) || 12);
    this.map.attributionControl.setPrefix(false);

    this.addBaseLayers();
    this.trackLayer = L.layerGroup().addTo(this.map);
    this.trackPois = [];
    this.trackBounds = null;
    this.markers = L.layerGroup().addTo(this.map);
    this.routeLayer = L.layerGroup().addTo(this.map);
    this.meLayer = L.layerGroup().addTo(this.map);

    if (opts.locate !== false) this.addLocateControl();
    this.addFitControl();
    if (opts.fullscreen !== false && !opts.compact) this.addFullscreenControl();
    if (opts.addPoi !== false) this.addPoiTools();
    if (!opts.compact && opts.tracks !== false) this.addTrackControl();
    if (!opts.compact && opts.transit !== false) this.initTransit();

    // Leaflet a besoin d'une taille réelle : on surveille le conteneur
    this.ro = new ResizeObserver(() => {
      if (!this.el.isConnected || this.el.clientWidth === 0) return;
      this.map.invalidateSize({ animate: false });
      if (!this.fitted) this.fit(false);
    });
    this.ro.observe(el);

    // dernière vue affichée : proposée comme zone à télécharger pour la consultation hors ligne
    this.map.on('moveend', () => {
      if (!this.el.isConnected || this.el.clientWidth === 0) return;
      const b = this.map.getBounds();
      TripMap.lastView = { bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()], zoom: this.map.getZoom() };
    });
  }

  addBaseLayers() {
    const s = this.plugin.settings.map;
    const layers = {};
    let initial = null;
    const mk = (p) => TBOffline.layer(p.url, {
      attribution: p.attribution, maxZoom: p.maxZoom || 19, subdomains: p.subdomains || 'abc',
      referrerPolicy: 'strict-origin-when-cross-origin',
    });
    if (s.tiles === 'custom' && s.customUrl) {
      layers['Personnalisé'] = initial = mk({ url: s.customUrl, attribution: '© OpenStreetMap', maxZoom: 19 });
    }
    const remembered = U.storeGet('baselayer', null);
    for (const [key, p] of Object.entries(TILE_PRESETS)) {
      const layer = mk(p);
      layer._tbKey = key;
      layers[p.name] = layer;
      if (!initial && key === (remembered || s.tiles)) initial = layer;
    }
    if (!initial) initial = layers[TILE_PRESETS.osm.name];
    initial.addTo(this.map);
    if (!this.opts.compact) {
      const lc = L.control.layers(layers, null, { position: 'topright', collapsed: true }).addTo(this.map);
      const tg = lc.getContainer && lc.getContainer().querySelector('.leaflet-control-layers-toggle');
      const ic = tg && TBIcons.enabled() && TBIcons.el('layers');
      if (ic) { tg.appendChild(ic); tg.classList.add('has-ico'); }
      this.map.on('baselayerchange', (e) => { if (e.layer._tbKey) U.storeSet('baselayer', e.layer._tbKey); });
    }
  }

  control(position, build) {
    const C = L.Control.extend({
      onAdd: () => {
        const div = L.DomUtil.create('div', 'leaflet-bar tb-map-ctrl');
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.disableScrollPropagation(div);
        build(div);
        return div;
      },
    });
    const c = new C({ position });
    c.addTo(this.map);
    return c;
  }

  ctrlButton(div, text, title, onClick) {
    const a = L.DomUtil.create('a', 'tb-map-btn', div);
    a.href = '#';
    a.title = title;
    a.setAttribute('role', 'button');
    a.setAttribute('aria-label', title);
    TripMap.setCtrl(a, text);
    L.DomEvent.on(a, 'click', (e) => { L.DomEvent.preventDefault(e); onClick(a); });
    return a;
  }

  /** Contenu d'un bouton de contrôle : icône au trait si possible, sinon le caractère */
  static setCtrl(a, text) {
    a.textContent = '';
    const ic = TBIcons.enabled() && TBIcons.el(TBIcons.nameFor(text) || (text === '✕' ? 'x' : null));
    if (ic) a.appendChild(ic); else a.textContent = text;
  }

  /* ------------------------------------------------------- géolocalisation */
  addLocateControl() {
    this.control('topleft', (div) => {
      this.locBtn = this.ctrlButton(div, '◎', 'Me localiser (suivi en direct)', () => this.toggleLocate());
    });
    this.map.on('locationfound', (e) => {
      this.meLayer.clearLayers();
      L.circle(e.latlng, { radius: e.accuracy, className: 'tb-me-accuracy', weight: 1 }).addTo(this.meLayer);
      L.marker(e.latlng, {
        icon: L.divIcon({ className: 'tb-me', html: '<div class="tb-me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }),
        interactive: false, keyboard: false, zIndexOffset: 1000,
      }).addTo(this.meLayer);
      if (!this.locCentered) { this.map.setView(e.latlng, Math.max(this.map.getZoom(), 15)); this.locCentered = true; }
    });
    this.map.on('locationerror', (e) => {
      this.stopLocate();
      new Notice('📍 Localisation impossible : ' + (e.message || 'autorisez l’accès à la position.'));
    });
  }

  toggleLocate() {
    if (this.locating) { this.stopLocate(); return; }
    this.locating = true;
    this.locCentered = false;
    this.locBtn && this.locBtn.addClass('is-active');
    this.map.locate({ watch: true, enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 });
  }

  stopLocate() {
    this.locating = false;
    this.map.stopLocate();
    this.meLayer.clearLayers();
    this.locBtn && this.locBtn.removeClass('is-active');
  }

  addFitControl() {
    this.control('topleft', (div) => {
      this.ctrlButton(div, '⤢', 'Recentrer sur les lieux', () => this.fit(true));
    });
  }

  /* ------------------------------------------------------- plein écran */
  addFullscreenControl() {
    this.control('topright', (div) => {
      this.fsBtn = this.ctrlButton(div, '⛶', 'Plein écran', () => this.toggleFullscreen());
    });
  }

  /**
   * Plein écran « dans l'application » : la carte est déplacée sous <body> en position fixe
   * (les conteneurs des notes créent un contexte qui empêcherait le position: fixed).
   */
  toggleFullscreen(force) {
    const on = force !== undefined ? force : !this.fs;
    if (on === !!this.fs) return;
    const center = this.map.getCenter(), zoom = this.map.getZoom();
    if (on) {
      this.fsPlaceholder = createDiv('tb-map-fs-placeholder');
      this.fsPlaceholder.style.height = this.el.offsetHeight + 'px';
      this.el.parentNode.insertBefore(this.fsPlaceholder, this.el);
      document.body.appendChild(this.el);
      this.el.addClass('tb', 'tb-map-fs');
      this.fsKey = (e) => { if (e.key === 'Escape') this.toggleFullscreen(false); };
      document.addEventListener('keydown', this.fsKey);
    } else {
      this.el.removeClass('tb-map-fs', 'tb');
      if (this.fsPlaceholder && this.fsPlaceholder.parentNode) this.fsPlaceholder.replaceWith(this.el);
      this.fsPlaceholder = null;
      document.removeEventListener('keydown', this.fsKey);
    }
    this.fs = on;
    if (this.fsBtn) {
      TripMap.setCtrl(this.fsBtn, on ? '✕' : '⛶');
      this.fsBtn.title = on ? 'Quitter le plein écran (Échap)' : 'Plein écran';
    }
    if (on) this.fsView = { center, zoom };
    setTimeout(() => {
      this.map.invalidateSize({ animate: false });
      if (on) this.fit(false); // recadre sur l'itinéraire / les lieux pour profiter de tout l'écran
      else if (this.fsView) this.map.setView(this.fsView.center, this.fsView.zoom, { animate: false });
    }, 60);
  }

  /* ---------------------------------------------------- ajout de POI */
  addPoiTools() {
    this.control('topleft', (div) => {
      this.addBtn = this.ctrlButton(div, '📌', 'Ajouter un POI en touchant la carte', () => {
        this.addMode = !this.addMode;
        this.addBtn.toggleClass('is-active', this.addMode);
        this.el.toggleClass('is-adding', this.addMode);
        if (this.addMode) new Notice('📍 Touchez la carte à l’endroit du nouveau POI');
      });
    });
    const proposeAt = (latlng) => {
      const box = createDiv('tb-popup');
      box.createDiv({ cls: 'tb-popup-title', text: 'Nouveau lieu ici ?' });
      box.createDiv({ cls: 'tb-popup-addr', text: `${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}` });
      const act = box.createDiv('tb-popup-actions');
      U.button(act, '＋ Créer un POI', 'mod-cta', () => {
        this.map.closePopup();
        new PoiCreateModal(this.plugin, { lat: latlng.lat, lon: latlng.lng, reverse: true }).open();
      });
      TBIcons.iconize(box);
      L.popup({ className: 'tb-leaflet-popup' }).setLatLng(latlng).setContent(box).openOn(this.map);
    };
    this.map.on('click', (e) => {
      if (!this.addMode) return;
      this.addMode = false;
      this.addBtn.removeClass('is-active');
      this.el.removeClass('is-adding');
      proposeAt(e.latlng);
    });
    this.map.on('contextmenu', (e) => proposeAt(e.latlng));
  }

  /* -------------------------------------------------- transports en commun */
  initTransit() {
    // volets dédiés, sous les traces (400) et les repères (600) ; rendu canvas (milliers de segments)
    this.map.createPane('tbTransit').style.zIndex = 360;
    this.map.createPane('tbTransitStops').style.zIndex = 370;
    // écran tactile : zone de tap des stations élargie (~36 px), points un peu plus gros
    this.touch = !!(obsidian.Platform && obsidian.Platform.isMobile) || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    this.transitRenderer = L.canvas({ pane: 'tbTransit', padding: 0.3, tolerance: this.touch ? 8 : 4 });
    this.stopRenderer = L.canvas({ pane: 'tbTransitStops', padding: 0.3, tolerance: this.touch ? 12 : 3 });
    this.transitLayer = L.layerGroup().addTo(this.map);
    this.stopsMajor = L.layerGroup();
    this.stopsAll = L.layerGroup();
    this.transitCtrl = this.control('topleft', (div) => {
      this.transitBtn = this.ctrlButton(div, '🚇', 'Afficher / masquer les transports en commun', async () => {
        this.plugin.settings.transit.show = !this.transitOn();
        await this.plugin.saveSettings();
        this.drawTransit();
      });
    });
    this.transitCtrl.getContainer().addClass('tb-hidden');
    this.map.on('zoomend', () => this.updateStops());
    TripMap.live.add(this);
    this.drawTransit();
  }

  /** Redessine les réseaux de toutes les cartes ouvertes (si les réglages ont changé) */
  static refreshTransit() {
    for (const m of TripMap.live) {
      if (!m.el.isConnected) { TripMap.live.delete(m); continue; }
      m.drawTransit();
    }
  }

  transitOn() {
    const t = this.plugin.settings.transit;
    return !!t && t.show !== false;
  }

  async drawTransit() {
    if (!this.transitLayer) return;
    const nets = this.plugin.transitNetworks();
    const on = this.transitOn();
    // rien à refaire si les réseaux affichés n'ont pas changé
    const sig = on ? nets.map((n) => `${n.file}@${n.fetched}`).join('|') : 'off';
    if (sig === this.transitSig) return;
    this.transitSig = sig;
    const token = (this.transitToken = (this.transitToken || 0) + 1);
    this.transitCtrl.getContainer().toggleClass('tb-hidden', !nets.length);
    this.transitBtn.toggleClass('is-active', on && nets.length > 0);
    const datas = [];
    if (on) {
      for (const n of nets) {
        const d = await TBTransit.load(this.plugin, n);
        if (token !== this.transitToken) return;
        if (d) datas.push(d);
      }
    }
    this.transitLayer.clearLayers();
    this.stopsMajor.remove(); this.stopsAll.remove();
    this.stopsMajor = L.layerGroup(); this.stopsAll = L.layerGroup();
    const badge = (l) => `<span class="tb-transit-ref" style="--tb-c:${U.esc(l.color)}">${U.esc(l.ref || TRANSIT_MODES[l.mode].label)}</span>`;
    const rank = { tram: 0, funicular: 1, metro: 2 };
    for (const d of datas) {
      const lines = d.lines.map((l, i) => ({ l, i })).sort((a, b) => rank[a.l.mode] - rank[b.l.mode]);
      const weight = (l) => (l.mode === 'metro' ? 3.5 : 2.6);
      for (const { l } of lines) {
        L.polyline(l.paths, { renderer: this.transitRenderer, color: '#fff', weight: weight(l) + 2.5, opacity: 0.75, interactive: false, smoothFactor: 1.2 }).addTo(this.transitLayer);
      }
      for (const { l } of lines) {
        const pl = L.polyline(l.paths, {
          renderer: this.transitRenderer, color: l.color, weight: weight(l), opacity: 0.85,
          dashArray: l.mode === 'funicular' ? '6 4' : null, lineCap: 'round', lineJoin: 'round', smoothFactor: 1.2,
        });
        const ends = l.ends && l.ends.length === 2 ? `${l.ends[0]} ↔ ${l.ends[1]}` : (l.name || '');
        pl.bindTooltip(`${badge(l)} ${U.esc(TRANSIT_MODES[l.mode].label)}${ends ? ' · ' + U.esc(ends) : ''}`, { sticky: true, className: 'tb-transit-tip' });
        pl.addTo(this.transitLayer);
      }
      for (const st of d.stations) {
        const ls = st.lines.map((i) => d.lines[i]).filter(Boolean);
        if (!ls.length) continue;
        const hub = ls.length > 1;
        const k = this.touch ? 1.35 : 1;
        const m = L.circleMarker([st.lat, st.lon], {
          renderer: this.stopRenderer, radius: (hub ? 4.5 : 3.4) * k, weight: hub ? 2 : 1.6,
          color: hub ? '#222' : ls[0].color, fillColor: '#fff', fillOpacity: 1,
        });
        m.bindTooltip(`<div class="tb-transit-st">${U.esc(st.name)}</div><div class="tb-transit-refs">${ls.map(badge).join('')}</div>`, { className: 'tb-transit-tip', direction: 'top', offset: [0, -4] });
        m.addTo(hub ? this.stopsMajor : this.stopsAll);
      }
    }
    this.updateStops();
  }

  /** Stations : correspondances dès le zoom 12, toutes à partir du zoom 14 */
  updateStops() {
    if (!this.stopsAll) return;
    const z = this.map.getZoom();
    const show = (layer, yes) => { if (yes && !this.map.hasLayer(layer)) layer.addTo(this.map); if (!yes && this.map.hasLayer(layer)) layer.remove(); };
    show(this.stopsMajor, z >= 12);
    show(this.stopsAll, z >= 14);
  }

  /* ------------------------------------------------------------ traces GPX */
  tracksOn() {
    if (this.opts.tracks === false) return false;
    return this.plugin.settings.map.showTracks !== false;
  }

  addTrackControl() {
    this.trackCtrl = this.control('topleft', (div) => {
      this.trackBtn = this.ctrlButton(div, '🥾', 'Afficher / masquer les traces GPX', async () => {
        this.plugin.settings.map.showTracks = !this.tracksOn();
        await this.plugin.saveSettings();
        this.drawTracks();
      });
    });
    this.trackCtrl.getContainer().addClass('tb-hidden');
  }

  /** POI dont la trace doit être dessinée (lieux affichés + étapes de l'itinéraire) */
  setTrackPois(list) {
    const seen = new Set();
    this.trackPois = list.filter((p) => p && p.gpx && p.gpx.length && !seen.has(p.path) && seen.add(p.path));
    this.drawTracks();
  }

  async drawTracks() {
    const token = (this.trackToken = (this.trackToken || 0) + 1);
    const on = this.tracksOn();
    const has = this.trackPois.length > 0;
    if (this.trackCtrl) this.trackCtrl.getContainer().toggleClass('tb-hidden', !has);
    if (this.trackBtn) this.trackBtn.toggleClass('is-active', on && has);
    const loaded = [];
    if (on) {
      for (const p of this.trackPois) {
        const list = await TBGpx.forPoi(this.plugin, p);
        if (token !== this.trackToken) return; // une mise à jour plus récente a pris le relais
        list.forEach((x) => loaded.push({ poi: p, track: x.track }));
      }
    }
    this.trackLayer.clearLayers();
    let b = null;
    for (const { poi, track } of loaded) {
      const color = poi.trackColor || poi.cat.color || '#e67e22';
      const lines = track.segments.map((seg) => seg.map((q) => [q.lat, q.lon]));
      if (lines.length) {
        L.polyline(lines, { className: 'tb-track-halo', weight: 7, opacity: 1, interactive: false, smoothFactor: 1.5 }).addTo(this.trackLayer);
        const line = L.polyline(lines, { className: 'tb-track', color, weight: 4, opacity: 0.95, lineJoin: 'round', smoothFactor: 1.5 });
        const st = track.stats;
        line.bindTooltip(`${U.esc(poi.name)} · ${U.esc(U.fmtDist(st.distanceKm))}${st.gain ? ` · ↗ ${st.gain} m` : ''}`, { sticky: true, className: 'tb-track-tip' });
        line.bindPopup(() => this.popupFor(poi, `🥾 Trace · ${U.fmtDist(st.distanceKm)}${st.gain ? ` · +${st.gain} m` : ''}`), { className: 'tb-leaflet-popup', maxWidth: 280, minWidth: 200 });
        line.addTo(this.trackLayer);
        const last = track.segments[track.segments.length - 1];
        const end = last[last.length - 1];
        const first = track.segments[0][0];
        if (U.haversine(first, end) > 0.05) {
          L.circleMarker([end.lat, end.lon], { radius: 5, weight: 2, color: '#fff', fillColor: color, fillOpacity: 1, className: 'tb-track-end' })
            .bindTooltip('Arrivée · ' + U.esc(poi.name)).addTo(this.trackLayer);
        }
        if (!poi.hasCoords) {
          L.circleMarker([first.lat, first.lon], { radius: 6, weight: 2, color: '#fff', fillColor: color, fillOpacity: 1 })
            .bindTooltip('Départ · ' + U.esc(poi.name)).addTo(this.trackLayer);
        }
      }
      if (this.opts.waypoints) {
        track.waypoints.forEach((w) => {
          const m = L.circleMarker([w.lat, w.lon], { radius: 4, weight: 1.5, color, fillColor: '#fff', fillOpacity: 1 });
          if (w.name) m.bindTooltip(U.esc(w.name) + (w.ele != null ? ` · ${Math.round(w.ele)} m` : ''));
          m.addTo(this.trackLayer);
        });
      }
      if (track.bounds) b = b ? b.extend(track.bounds) : L.latLngBounds(track.bounds);
    }
    this.trackBounds = b;
    if (b && this.opts.fitTracks && !this.trackFitted) { this.trackFitted = true; this.fitted = false; this.fit(false); }
  }

  /** Repère temporaire (survol du profil altimétrique) */
  showCursor(p) {
    if (!p) { if (this.cursor) this.cursor.remove(); this.cursor = null; return; }
    if (!this.cursor) {
      this.cursor = L.circleMarker([p.lat, p.lon], { radius: 7, weight: 3, color: '#fff', fillColor: '#111', fillOpacity: 0.9, interactive: false }).addTo(this.map);
    } else this.cursor.setLatLng([p.lat, p.lon]);
  }

  /* -------------------------------------------------------------- marqueurs */
  static pinIcon(cat, label, done, highlight) {
    const html = `
      <div class="tb-pin${done ? ' is-done' : ''}${highlight ? ' is-hl' : ''}" style="--tb-c:${U.esc(cat.color || '#888')}">
        <div class="tb-pin-head"><span>${/^\d+$/.test(String(label)) ? U.esc(label) : TBIcons.html(label)}</span></div>
        ${done ? '<i class="tb-pin-check">✓</i>' : ''}
      </div>`;
    return L.divIcon({ className: 'tb-pin-wrap', html, iconSize: [36, 46], iconAnchor: [18, 44], popupAnchor: [0, -40] });
  }

  popupFor(poi, extra) {
    const box = createDiv('tb-popup');
    const purl = this.plugin.data.photoUrl(poi);
    if (purl) { const img = box.createDiv('tb-popup-photo').createEl('img'); img.src = purl; img.alt = ''; }
    const head = box.createDiv('tb-popup-head');
    U.catChip(head, poi.cat);
    if (poi.done) head.createSpan({ cls: 'tb-chip tb-chip-done', text: '✓ Fait' + (poi.doneDate ? ' · ' + U.fmtShort(poi.doneDate) : '') });
    if (extra) box.createDiv({ cls: 'tb-popup-step', text: extra });
    box.createDiv({ cls: 'tb-popup-title', text: poi.name });
    if (poi.address) box.createDiv({ cls: 'tb-popup-addr', text: poi.address });
    if (poi.rating) box.createDiv({ cls: 'tb-stars-static', text: U.starsText(poi.rating) });
    const act = box.createDiv('tb-popup-actions');
    U.button(act, '📄 Ouvrir', 'mod-cta', () => this.plugin.openFile(poi.file));
    U.button(act, '📅 Au programme…', '', () => { this.map.closePopup(); new AddToProgrammeModal(this.plugin, poi).open(); }, 'Ajouter au programme d’un jour');
    U.button(act, '✏️', 'tb-btn-icon', () => { this.map.closePopup(); new PoiCreateModal(this.plugin, { edit: poi }).open(); }, 'Modifier');
    U.button(act, poi.done ? '↺ À faire' : '✓ Fait', '', async () => {
      await this.plugin.data.setPoiDone(poi, !poi.done);
      this.map.closePopup();
    });
    const dir = this.plugin.mapLink('directions', poi);
    const go = act.createEl('a', { cls: 'tb-btn', text: '🧭 Y aller', href: dir.url });
    go.setAttr('target', '_blank');
    go.setAttr('title', `Itinéraire avec ${dir.label}`);
    TBIcons.iconize(box);
    return box;
  }

  setPois(pois, { fit = false } = {}) {
    this.shownPois = pois;
    this.setTrackPois([...pois, ...(this.route || [])]);
    this.pois = pois.filter((p) => p.hasCoords);
    this.markers.clearLayers();
    this.markerByPath = {};
    for (const p of this.pois) {
      const m = L.marker([p.lat, p.lon], {
        icon: TripMap.pinIcon(p.cat, p.cat.icon || '📍', p.done),
        title: p.name, riseOnHover: true,
      });
      m.bindPopup(() => this.popupFor(p), { className: 'tb-leaflet-popup', maxWidth: 280, minWidth: 200 });
      m.addTo(this.markers);
      this.markerByPath[p.path] = m;
    }
    if (fit || !this.fitted) this.fit(false);
  }

  setRoute(steps, { fit = true } = {}) {
    this.routeLayer.clearLayers();
    this.route = steps.filter((s) => s && s.hasCoords);
    this.setTrackPois([...(this.shownPois || []), ...steps.filter(Boolean)]);
    const latlngs = [];
    this.route.forEach((p, i) => {
      latlngs.push([p.lat, p.lon]);
      const m = L.marker([p.lat, p.lon], {
        icon: TripMap.pinIcon(p.cat, String(i + 1), p.done, true),
        title: `${i + 1}. ${p.name}`, zIndexOffset: 500 + i,
      });
      m.bindPopup(() => this.popupFor(p, `Étape ${i + 1}`), { className: 'tb-leaflet-popup', maxWidth: 280, minWidth: 200 });
      m.addTo(this.routeLayer);
    });
    if (latlngs.length > 1) {
      L.polyline(latlngs, { className: 'tb-route-halo', weight: 9, opacity: 1 }).addTo(this.routeLayer);
      L.polyline(latlngs, { className: 'tb-route', weight: 4, opacity: 1, dashArray: '2 9', lineCap: 'round' }).addTo(this.routeLayer);
    }
    if (fit) { this.fitted = false; this.fit(false); }
  }

  fit(animate) {
    if (!this.el.isConnected || this.el.clientWidth === 0) return;
    this.map.invalidateSize({ animate: false });
    const pts = (this.route && this.route.length ? this.route : this.pois).map((p) => [p.lat, p.lon]);
    if (this.opts.fitTracks && this.trackBounds) {
      const b = L.latLngBounds(this.trackBounds.getSouthWest(), this.trackBounds.getNorthEast());
      pts.forEach((x) => b.extend(x));
      this.map.fitBounds(b, { padding: [24, 24], maxZoom: 17, animate });
      this.fitted = true;
      return;
    }
    if (!pts.length) {
      const s = this.plugin.settings.map;
      this.map.setView([Number(s.lat) || 0, Number(s.lon) || 0], Number(s.zoom) || 12, { animate });
    } else if (pts.length === 1) {
      this.map.setView(pts[0], 16, { animate });
    } else {
      this.map.fitBounds(L.latLngBounds(pts), { padding: [36, 36], maxZoom: 16, animate });
    }
    this.fitted = true;
  }

  focus(path) {
    const m = this.markerByPath && this.markerByPath[path];
    if (!m) return;
    this.map.setView(m.getLatLng(), Math.max(this.map.getZoom(), 16));
    setTimeout(() => m.openPopup(), 250);
  }

  destroy() {
    if (this.fs) {
      document.removeEventListener('keydown', this.fsKey);
      if (this.fsPlaceholder) this.fsPlaceholder.remove();
      this.el.remove();
    }
    try { this.ro && this.ro.disconnect(); } catch (e) { /* */ }
    try { this.map.stopLocate(); this.map.remove(); } catch (e) { /* */ }
  }
}

/* --------------------------------------------------------------------------
 * Panneau carte : barre de filtres + carte (utilisé par le bloc et la vue)
 * -------------------------------------------------------------------------- */
class MapPanel {
  constructor(plugin, parent, opts = {}) {
    this.plugin = plugin;
    this.opts = opts;
    this.root = parent.createDiv('tb tb-mappanel' + (opts.fill ? ' is-fill' : ''));
    this.filters = {
      q: '',
      cats: new Set(opts.category ? String(opts.category).split(',').map((s) => s.trim()) : []),
      status: opts.status || 'all',
    };
    this.buildToolbar();
    this.mapEl = this.root.createDiv();
    if (!opts.fill) this.mapEl.style.height = (parseInt(opts.height, 10) || 480) + 'px';
    this.map = new TripMap(plugin, this.mapEl, {
      tracks: String(opts.tracks) === 'false' ? false : undefined,
      transit: String(opts.transit) === 'false' ? false : undefined,
    });
  }

  buildToolbar() {
    const bar = this.root.createDiv('tb-toolbar');
    const search = bar.createEl('input', { type: 'search', cls: 'tb-input tb-search', attr: { placeholder: '🔎 Rechercher un lieu…' } });
    search.addEventListener('input', () => { this.filters.q = search.value.toLowerCase(); this.apply(); });
    U.segmented(bar, [['all', 'Tous'], ['todo', 'À faire'], ['done', 'Faits']], this.filters.status, (v) => {
      this.filters.status = v; this.apply();
    });
    this.count = bar.createSpan('tb-count');
    U.button(bar, '🥾', 'tb-btn-icon', () => this.plugin.pickGpx(), 'Importer une trace GPX (nouveau lieu)');
    if (!this.opts.fill) {
      U.button(bar, '⛶', 'tb-btn-icon', () => this.plugin.openMapView(), 'Ouvrir la carte en plein écran');
    }
    this.chips = this.root.createDiv('tb-chips tb-chips-scroll');
  }

  renderChips() {
    this.chips.empty();
    const counts = {};
    this.all.forEach((p) => { counts[p.cat.id] = (counts[p.cat.id] || 0) + 1; });
    const cats = [...this.plugin.settings.poiCategories];
    // catégories inconnues présentes dans les notes
    this.all.forEach((p) => { if (p.cat.unknown && !cats.find((c) => c.id === p.cat.id)) cats.push(p.cat); });
    cats.filter((c) => counts[c.id]).forEach((c) => {
      const chip = U.catChip(this.chips, c, 'is-toggle');
      chip.createSpan({ cls: 'tb-chip-count', text: String(counts[c.id]) });
      chip.toggleClass('is-off', this.filters.cats.size > 0 && !this.filters.cats.has(c.id));
      chip.addEventListener('click', () => {
        if (this.filters.cats.has(c.id)) this.filters.cats.delete(c.id);
        else this.filters.cats.add(c.id);
        this.renderChips();
        this.apply();
      });
    });
  }

  refresh() {
    this.all = this.plugin.data.pois();
    this.renderChips();
    this.apply();
    if (this.opts.programme) {
      const prog = this.plugin.data.programmeFor(U.normDate(this.opts.programme));
      this.map.setRoute(prog ? prog.steps.filter((s) => !s.missing) : [], { fit: !this.map.fitted });
    }
  }

  apply() {
    const f = this.filters;
    const list = this.all.filter((p) => {
      if (f.cats.size && !f.cats.has(p.cat.id)) return false;
      if (f.status === 'todo' && p.done) return false;
      if (f.status === 'done' && !p.done) return false;
      if (f.q && !(p.name + ' ' + p.address + ' ' + p.cat.label).toLowerCase().includes(f.q)) return false;
      return true;
    });
    const noCoords = list.filter((p) => !p.hasCoords).length;
    this.count.setText(`${list.length} lieu${list.length > 1 ? 'x' : ''}` + (noCoords ? ` · ${noCoords} sans coordonnées` : ''));
    this.map.setPois(list, { fit: false });
  }

  destroy() { this.map.destroy(); }
}
