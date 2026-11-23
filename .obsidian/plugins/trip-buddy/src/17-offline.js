/* ==========================================================================
 * Trip Buddy — fonds de carte hors ligne
 * Les tuiles d'une zone sont téléchargées à la demande et rangées dans IndexedDB
 * (sur l'appareil, pas dans le coffre : rien à synchroniser). Les cartes lisent
 * d'abord ce cache, puis le réseau ; au-delà du zoom téléchargé, la tuile du
 * niveau le plus détaillé disponible est agrandie.
 * ========================================================================== */
const TBOffline = {
  MAX_ZOOM: 16,       // politique d'usage des tuiles OSM : pas de téléchargement massif au-delà
  MAX_TILES: 20000,   // garde-fou (≈ 400 Mo)
  AVG_TILE: 20 * 1024, // taille moyenne d'une tuile, pour l'estimation
  THREADS: 2,         // téléchargements simultanés (politique OSM : 2 au plus)
  areas: [],
  job: null,
  listeners: new Set(),

  /* ------------------------------------------------------------ stockage */
  init(plugin) {
    this.plugin = plugin;
    const id = (plugin.app && (plugin.app.appId || plugin.app.vault.getName())) || 'default';
    this.dbName = 'trip-buddy-tiles-' + id;
    this.ready = this.tx('areas', 'readonly', (s) => s.getAll())
      .then((a) => { this.areas = a || []; })
      .catch((e) => { console.warn('[Trip Buddy] cache hors ligne indisponible', e); this.areas = []; });
    return this.ready;
  },

  db() {
    if (!this._db) {
      this._db = new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('IndexedDB indisponible')); return; }
        const r = window.indexedDB.open(this.dbName, 1);
        r.onupgradeneeded = () => {
          const d = r.result;
          if (!d.objectStoreNames.contains('tiles')) d.createObjectStore('tiles');
          if (!d.objectStoreNames.contains('areas')) d.createObjectStore('areas', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      this._db.catch(() => { this._db = null; });
    }
    return this._db;
  },

  /** Exécute fn(store) dans une transaction ; renvoie le résultat de la dernière requête */
  async tx(store, mode, fn) {
    const d = await this.db();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode);
      const r = fn(t.objectStore(store));
      t.oncomplete = () => res(r && 'result' in r ? r.result : undefined);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('transaction annulée'));
    });
  },

  key: (url, z, x, y) => `${url}|${z}/${x}/${y}`,

  async get(url, z, x, y) {
    try {
      const rec = await this.tx('tiles', 'readonly', (s) => s.get(this.key(url, z, x, y)));
      return rec || null;
    } catch (e) { return null; }
  },

  /* ---------------------------------------------------------- géométrie */
  lon2x: (lon, z) => Math.floor(((lon + 180) / 360) * 2 ** z),
  lat2y(lat, z) {
    const r = (Math.max(-85.0511, Math.min(85.0511, lat)) * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
  },

  /** Tuiles couvrant bbox [sud, ouest, nord, est] au zoom z */
  range(bbox, z) {
    const n = 2 ** z, c = (v) => Math.max(0, Math.min(n - 1, v));
    const [s, w, no, e] = bbox;
    return { x0: c(this.lon2x(w, z)), x1: c(this.lon2x(e, z)), y0: c(this.lat2y(no, z)), y1: c(this.lat2y(s, z)) };
  },

  inRect(rect, z, x, y) {
    if (z < (rect.minZoom || 0) || z > rect.maxZoom) return false;
    const r = this.range(rect.bbox, z);
    return x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1;
  },

  /** Liste dédoublonnée des tuiles [z, x, y] d'un ensemble de rectangles, zooms faibles d'abord */
  tilesFor(rects, limit = Infinity) {
    const seen = new Set(), out = [];
    const zMax = Math.max(0, ...rects.map((r) => r.maxZoom));
    for (let z = 0; z <= zMax; z++) {
      for (const rect of rects) {
        if (z < (rect.minZoom || 0) || z > rect.maxZoom) continue;
        const r = this.range(rect.bbox, z);
        for (let x = r.x0; x <= r.x1; x++) {
          for (let y = r.y0; y <= r.y1; y++) {
            const k = `${z}/${x}/${y}`;
            if (seen.has(k)) continue;
            seen.add(k);
            out.push([z, x, y]);
            if (out.length > limit) return out;
          }
        }
      }
    }
    return out;
  },

  /** Une zone téléchargée contient-elle cette tuile ? */
  covers(url, z, x, y) {
    return this.areas.some((a) => a.url === url && a.rects.some((r) => this.inRect(r, z, x, y)));
  },

  /** Tuile « parente » téléchargée la plus détaillée, pour agrandir au-delà du zoom téléchargé */
  ancestor(url, z, x, y) {
    let best = null;
    for (const a of this.areas) {
      if (a.url !== url) continue;
      for (const r of a.rects) {
        if (z <= r.maxZoom || (best && best.z >= r.maxZoom)) continue;
        const d = z - r.maxZoom;
        const px = x >> d, py = y >> d;
        if (this.inRect(r, r.maxZoom, px, py)) best = { z: r.maxZoom, x: px, y: py };
      }
    }
    return best;
  },

  /* -------------------------------------------------------------- zones */
  /** Rectangles à télécharger autour des lieux du voyage */
  poiRects(maxZoom) {
    const pts = this.plugin.data.pois().filter((p) => p.hasCoords).map((p) => [Number(p.lat), Number(p.lon)]);
    if (!pts.length) return [];
    // cœur du voyage : lieux à moins de 25 km du point médian, couverts en entier
    const med = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const c = { lat: med(pts.map((p) => p[0])), lon: med(pts.map((p) => p[1])) };
    const near = [], far = [];
    pts.forEach((p) => (U.haversine(c, { lat: p[0], lon: p[1] }) <= 25 ? near : far).push(p));
    const around = ([lat, lon], km) => {
      const dLat = km / 111, dLon = km / (111 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
      return [lat - dLat, lon - dLon, lat + dLat, lon + dLon];
    };
    const rects = [];
    if (near.length) {
      const b = near.reduce((acc, p) => {
        const r = around(p, 1);
        return [Math.min(acc[0], r[0]), Math.min(acc[1], r[1]), Math.max(acc[2], r[2]), Math.max(acc[3], r[3])];
      }, [90, 180, -90, -180]);
      rects.push({ bbox: b, minZoom: 0, maxZoom });
    }
    // lieux éloignés (excursions…) : leurs environs seulement
    far.forEach((p) => {
      rects.push({ bbox: around(p, 10), minZoom: 0, maxZoom: Math.min(12, maxZoom) });
      if (maxZoom > 12) rects.push({ bbox: around(p, 1.2), minZoom: 13, maxZoom });
    });
    return rects;
  },

  rectsFor(source, maxZoom) {
    if (source.type === 'pois') return this.poiRects(maxZoom);
    return [{ bbox: source.bbox, minZoom: 0, maxZoom }];
  },

  estimate(rects) {
    const tiles = this.tilesFor(rects, this.MAX_TILES).length;
    return { tiles, bytes: tiles * this.AVG_TILE, tooMany: tiles > this.MAX_TILES };
  },

  layerInfo(layerKey) {
    const s = this.plugin.settings.map;
    if (layerKey === 'custom') return { name: 'Personnalisé', url: s.customUrl, subdomains: 'abc' };
    const p = TILE_PRESETS[layerKey] || TILE_PRESETS.osm;
    return { name: p.name, url: p.url, subdomains: p.subdomains || 'abc', maxZoom: p.maxZoom };
  },

  totalBytes() { return this.areas.reduce((t, a) => t + (a.bytes || 0), 0); },

  /* -------------------------------------------------------- téléchargement */
  emit() { for (const fn of this.listeners) { try { fn(this.job); } catch (e) { /* */ } } },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },

  tileUrl(tpl, subdomains, z, x, y) {
    const sub = subdomains[(x + y) % subdomains.length];
    return tpl.replace('{s}', sub).replace('{z}', z).replace('{x}', x).replace('{y}', y).replace('{r}', '');
  },

  /**
   * Télécharge (ou complète) une zone.
   * opts : { name, layerKey, source: { type: 'pois' } | { type: 'bbox', bbox }, maxZoom, refresh }
   */
  async download(opts) {
    if (this.job && this.job.running) throw new Error('Un téléchargement est déjà en cours.');
    await this.ready;
    const layer = this.layerInfo(opts.layerKey);
    if (!layer.url) throw new Error('Aucune URL de tuiles pour ce fond de carte.');
    const maxZoom = Math.min(opts.maxZoom || this.MAX_ZOOM, this.MAX_ZOOM, layer.maxZoom || 19);
    const rects = this.rectsFor(opts.source, maxZoom);
    if (!rects.length) throw new Error('Aucun lieu géolocalisé : choisissez une ville.');
    const list = this.tilesFor(rects, this.MAX_TILES);
    if (list.length > this.MAX_TILES) throw new Error(`Zone trop grande (plus de ${this.MAX_TILES.toLocaleString(LOCALE)} tuiles) : baissez le niveau de détail ou choisissez une zone plus petite.`);

    const id = `${U.slug(opts.name) || 'zone'}@${opts.layerKey}`;
    const previous = this.areas.find((a) => a.id === id) || null;
    const job = this.job = {
      running: true, cancelled: false, name: opts.name, layerName: layer.name,
      total: list.length, done: 0, bytes: 0, errors: 0, fetched: 0,
    };
    this.emit();
    let next = 0, consecutiveErr = 0, fatal = null;
    const worker = async () => {
      while (!job.cancelled && !fatal && next < list.length) {
        const [z, x, y] = list[next++];
        const key = this.key(layer.url, z, x, y);
        try {
          let rec = opts.refresh ? null : await this.tx('tiles', 'readonly', (s) => s.get(key));
          if (!rec) {
            const res = await requestUrl({ url: this.tileUrl(layer.url, layer.subdomains, z, x, y), headers: { 'User-Agent': Geocoder.UA } });
            if (res.status && res.status >= 400) throw new Error('HTTP ' + res.status);
            const buf = res.arrayBuffer;
            if (!buf || !buf.byteLength) throw new Error('tuile vide');
            rec = { d: buf, t: (res.headers && (res.headers['content-type'] || res.headers['Content-Type'])) || 'image/png' };
            await this.tx('tiles', 'readwrite', (s) => s.put(rec, key));
            job.fetched++;
          }
          job.bytes += rec.d.byteLength || 0;
          consecutiveErr = 0;
        } catch (e) {
          job.errors++;
          consecutiveErr++;
          if (consecutiveErr >= 25) fatal = new Error('le serveur de tuiles ne répond pas (connexion coupée ?)');
        }
        job.done++;
        if (job.done % 10 === 0 || job.done === job.total) this.emit();
      }
    };
    try {
      await Promise.all(Array.from({ length: this.THREADS }, worker));
      const area = {
        id, name: opts.name, layerKey: opts.layerKey, layerName: layer.name, url: layer.url,
        source: opts.source, maxZoom, rects,
        tiles: job.done - job.errors, planned: list.length, bytes: job.bytes, errors: job.errors,
        partial: job.cancelled || !!fatal || job.errors > 0, fetched: new Date().toISOString(),
      };
      if (job.done > job.errors || previous) {
        await this.tx('areas', 'readwrite', (s) => s.put(area));
        this.areas = this.areas.filter((a) => a.id !== id).concat(area);
        // ancienne version de la zone (autres lieux, autre zoom) : on retire les tuiles devenues inutiles
        if (previous) await this.prune(previous);
      }
      job.area = area;
      if (fatal) throw fatal;
      return area;
    } finally {
      job.running = false;
      this.emit();
    }
  },

  cancel() { if (this.job && this.job.running) this.job.cancelled = true; },

  /** Supprime les tuiles d'une zone qui ne servent à aucune autre zone enregistrée */
  async prune(area) {
    const list = this.tilesFor(area.rects);
    const keys = list.filter(([z, x, y]) => !this.covers(area.url, z, x, y)).map(([z, x, y]) => this.key(area.url, z, x, y));
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      await this.tx('tiles', 'readwrite', (s) => { chunk.forEach((k) => s.delete(k)); });
    }
  },

  async remove(id) {
    await this.ready;
    const area = this.areas.find((a) => a.id === id);
    if (!area) return;
    this.areas = this.areas.filter((a) => a.id !== id);
    await this.tx('areas', 'readwrite', (s) => s.delete(id));
    await this.prune(area);
  },

  async clearAll() {
    this.areas = [];
    await this.tx('areas', 'readwrite', (s) => s.clear());
    await this.tx('tiles', 'readwrite', (s) => s.clear());
  },

  /** Interrompt un téléchargement en cours (et attend sa fin), puis supprime toutes les zones. Renvoie le nombre de zones supprimées. */
  async stopAndClear() {
    await this.ready;
    if (this.job && this.job.running) {
      this.cancel();
      await new Promise((res) => {
        const timer = setTimeout(() => { off(); res(); }, 30000);
        const off = this.on((job) => { if (!job || !job.running) { clearTimeout(timer); off(); res(); } });
        if (!this.job.running) { clearTimeout(timer); off(); res(); }
      });
    }
    const n = this.areas.length;
    await this.clearAll();
    this.job = null;
    this.emit();
    return n;
  },

  /* ----------------------------------------------------- couche Leaflet */
  /** Couche de tuiles : cache hors ligne d'abord, réseau ensuite, puis agrandissement */
  layer(url, options) {
    return new TBOfflineLayer(url, options);
  },

  /** URL objet d'une tuile agrandie depuis sa parente téléchargée */
  async overzoom(url, z, x, y, size) {
    const a = this.ancestor(url, z, x, y);
    if (!a) return null;
    const rec = await this.get(url, a.z, a.x, a.y);
    if (!rec) return null;
    const blob = new Blob([rec.d], { type: rec.t || 'image/png' });
    let img;
    try { img = await createImageBitmap(blob); } catch (e) { return null; }
    const d = z - a.z, part = size / 2 ** d;
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const ctx = cv.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (x - (a.x << d)) * part, (y - (a.y << d)) * part, part, part, 0, 0, size, size);
    const out = await new Promise((res) => cv.toBlob(res));
    return out ? URL.createObjectURL(out) : null;
  },
};

const TBOfflineLayer = L.TileLayer.extend({
  initialize(url, options) {
    L.TileLayer.prototype.initialize.call(this, url, options);
    this.on('tileunload', (e) => {
      if (e.tile && e.tile._tbObj) { URL.revokeObjectURL(e.tile._tbObj); e.tile._tbObj = null; }
    });
  },

  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    tile.setAttribute('role', 'presentation');
    if (typeof this.options.referrerPolicy === 'string') tile.referrerPolicy = this.options.referrerPolicy;
    const url = this._url, { z, x, y } = coords;
    const size = this.getTileSize().x;
    const setObj = (obj) => {
      if (tile._tbObj) URL.revokeObjectURL(tile._tbObj);
      tile._tbObj = obj;
      tile.src = obj;
    };
    let triedZoom = false;
    tile.addEventListener('load', () => this._tileOnLoad(done, tile));
    tile.addEventListener('error', async (e) => {
      // réseau indisponible : on tente d'agrandir une tuile téléchargée moins détaillée
      if (!triedZoom) {
        triedZoom = true;
        const obj = await TBOffline.overzoom(url, z, x, y, size).catch(() => null);
        if (obj) { setObj(obj); return; }
      }
      this._tileOnError(done, tile, e);
    });
    (async () => {
      try {
        await TBOffline.ready;
        if (TBOffline.covers(url, z, x, y)) {
          const rec = await TBOffline.get(url, z, x, y);
          if (rec) { setObj(URL.createObjectURL(new Blob([rec.d], { type: rec.t || 'image/png' }))); return; }
        }
      } catch (e) { /* cache indisponible : réseau */ }
      tile.src = this.getTileUrl(coords);
    })();
    return tile;
  },
});
