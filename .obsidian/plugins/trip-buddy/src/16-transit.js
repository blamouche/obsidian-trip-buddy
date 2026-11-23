/* ==========================================================================
 * Trip Buddy — réseaux de transports en commun (métro, tram, funiculaire)
 * Données OpenStreetMap téléchargées à la demande via l'API Overpass, puis
 * enregistrées dans le coffre (JSON compact) : la carte fonctionne hors ligne.
 * ========================================================================== */

/** Villes proposées : [nom, pays, sud, ouest, nord, est] */
const TRANSIT_CITIES = [
  ['Paris', 'France', 48.75, 2.15, 48.98, 2.55],
  ['Lyon', 'France', 45.66, 4.75, 45.82, 4.98],
  ['Marseille', 'France', 43.2, 5.3, 43.4, 5.5],
  ['Lille', 'France', 50.55, 2.95, 50.75, 3.25],
  ['Toulouse', 'France', 43.52, 1.33, 43.68, 1.53],
  ['Bordeaux', 'France', 44.75, -0.72, 44.93, -0.48],
  ['Nantes', 'France', 47.15, -1.67, 47.3, -1.45],
  ['Strasbourg', 'France', 48.52, 7.65, 48.65, 7.82],
  ['Montpellier', 'France', 43.55, 3.8, 43.67, 3.95],
  ['Nice', 'France', 43.64, 7.15, 43.75, 7.32],
  ['Rennes', 'France', 48.07, -1.73, 48.15, -1.62],
  ['Grenoble', 'France', 45.12, 5.66, 45.22, 5.8],
  ['Bruxelles', 'Belgique', 50.76, 4.25, 50.92, 4.48],
  ['Genève', 'Suisse', 46.15, 6.05, 46.26, 6.22],
  ['Zurich', 'Suisse', 47.32, 8.45, 47.44, 8.62],
  ['Barcelone', 'Espagne', 41.3, 2.03, 41.5, 2.27],
  ['Madrid', 'Espagne', 40.3, -3.85, 40.55, -3.55],
  ['Valence', 'Espagne', 39.4, -0.45, 39.55, -0.3],
  ['Séville', 'Espagne', 37.32, -6.05, 37.43, -5.92],
  ['Bilbao', 'Espagne', 43.22, -3.05, 43.35, -2.88],
  ['Lisbonne', 'Portugal', 38.68, -9.25, 38.8, -9.08],
  ['Porto', 'Portugal', 41.1, -8.7, 41.25, -8.55],
  ['Rome', 'Italie', 41.8, 12.4, 41.98, 12.62],
  ['Milan', 'Italie', 45.4, 9.05, 45.55, 9.3],
  ['Naples', 'Italie', 40.8, 14.15, 40.9, 14.32],
  ['Turin', 'Italie', 45.0, 7.6, 45.12, 7.75],
  ['Londres', 'Royaume-Uni', 51.4, -0.4, 51.65, 0.15],
  ['Dublin', 'Irlande', 53.28, -6.4, 53.4, -6.15],
  ['Amsterdam', 'Pays-Bas', 52.3, 4.75, 52.42, 5.02],
  ['Berlin', 'Allemagne', 52.38, 13.2, 52.62, 13.65],
  ['Munich', 'Allemagne', 48.05, 11.4, 48.25, 11.75],
  ['Hambourg', 'Allemagne', 53.45, 9.85, 53.68, 10.2],
  ['Vienne', 'Autriche', 48.12, 16.25, 48.3, 16.5],
  ['Prague', 'Tchéquie', 50.0, 14.3, 50.15, 14.6],
  ['Budapest', 'Hongrie', 47.42, 18.98, 47.58, 19.2],
  ['Varsovie', 'Pologne', 52.15, 20.9, 52.32, 21.1],
  ['Copenhague', 'Danemark', 55.6, 12.45, 55.73, 12.65],
  ['Stockholm', 'Suède', 59.25, 17.85, 59.4, 18.15],
  ['Oslo', 'Norvège', 59.87, 10.65, 59.97, 10.88],
  ['Helsinki', 'Finlande', 60.14, 24.85, 60.25, 25.1],
  ['Athènes', 'Grèce', 37.9, 23.65, 38.08, 23.85],
  ['Istanbul', 'Turquie', 40.95, 28.75, 41.15, 29.15],
  ['New York', 'États-Unis', 40.57, -74.05, 40.9, -73.75],
  ['Montréal', 'Canada', 45.42, -73.75, 45.62, -73.5],
  ['Mexico', 'Mexique', 19.3, -99.25, 19.55, -99.0],
  ['Tokyo', 'Japon', 35.6, 139.6, 35.8, 139.9],
  ['Séoul', 'Corée du Sud', 37.45, 126.85, 37.65, 127.15],
  ['Singapour', 'Singapour', 1.26, 103.65, 1.45, 104.0],
].map(([name, country, s, w, n, e]) => ({ name, country, bbox: [s, w, n, e] }));

const TRANSIT_MODES = {
  metro: { label: 'Métro', icon: '🚇', color: '#1f4e9c' },
  tram: { label: 'Tram', icon: '🚋', color: '#2a9d8f' },
  funicular: { label: 'Funiculaire', icon: '🚡', color: '#8e5b3a' },
};

const TBTransit = {
  ENDPOINTS: ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'],
  cache: new Map(),

  modeOf(route) {
    if (route === 'tram') return 'tram';
    if (route === 'funicular') return 'funicular';
    return 'metro'; // subway, light_rail, monorail
  },

  /** Emprise d'une ville quelconque (Nominatim) : { name, country, bbox } */
  async searchCity(plugin, q) {
    const params = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', limit: '6', q, 'accept-language': (plugin.settings.geocoder || {}).lang || 'fr' });
    const json = await Geocoder.get('https://nominatim.openstreetmap.org/search?' + params.toString());
    const r = (json || []).find((x) => /^(city|town|administrative|municipality)$/.test(x.type) || x.addresstype === 'city') || (json || [])[0];
    if (!r || !r.boundingbox) return null;
    let [s, n, w, e] = r.boundingbox.map(Number);
    // emprise trop grande (région, pays…) : on se limite aux environs du centre
    const lat = Number(r.lat), lon = Number(r.lon);
    if (n - s > 0.6) { s = lat - 0.25; n = lat + 0.25; }
    if (e - w > 0.8) { w = lon - 0.35; e = lon + 0.35; }
    const a = r.address || {};
    return { name: r.name || q, country: a.country || '', bbox: [s, w, n, e] };
  },

  query(bbox) {
    const b = bbox.map((v) => Number(v).toFixed(4)).join(',');
    return `[out:json][timeout:180];
rel["type"="route"]["route"~"^(subway|light_rail|monorail|tram|funicular)$"](${b})->.r;
.r out body;
rel(br.r)["type"="route_master"];
out body;
way(r.r);
out skel geom qt;
node(r.r);
out body qt;`;
  },

  /** Télécharge et compacte le réseau d'une ville */
  async download(city, onStatus = () => {}) {
    const q = TBTransit.query(city.bbox);
    let json = null, lastErr = null;
    for (const ep of TBTransit.ENDPOINTS) {
      try {
        onStatus(`Interrogation d'OpenStreetMap (${new URL(ep).host})…`);
        const res = await requestUrl({ url: `${ep}?data=${encodeURIComponent(q)}`, headers: { 'User-Agent': Geocoder.UA, Accept: 'application/json' } });
        json = res.json;
        if (json && json.elements) break;
      } catch (e) { lastErr = e; console.warn('[Trip Buddy] Overpass', ep, e); }
    }
    if (!json || !json.elements) throw new Error(lastErr ? `service indisponible (${lastErr.message || lastErr})` : 'réponse vide');
    onStatus('Préparation du réseau…');
    const net = TBTransit.build(json.elements);
    if (!net.lines.length) throw new Error('aucune ligne de métro ou de tram trouvée ici');
    return { v: 1, name: city.name, country: city.country || '', bbox: city.bbox, fetched: new Date().toISOString(), source: '© OpenStreetMap', ...net };
  },

  /** Éléments Overpass → { lines, stations } */
  build(elements) {
    const r5 = (v) => Math.round(v * 1e5) / 1e5;
    const ways = new Map(), nodes = new Map(), routes = [], masters = [];
    for (const el of elements) {
      if (el.type === 'way' && el.geometry) ways.set(el.id, el.geometry.filter(Boolean).map((g) => [r5(g.lat), r5(g.lon)]));
      else if (el.type === 'node') nodes.set(el.id, el);
      else if (el.type === 'relation') (el.tags && el.tags.type === 'route_master' ? masters : routes).push(el);
    }
    const masterOf = new Map();
    for (const m of masters) for (const mb of m.members || []) if (mb.type === 'relation') masterOf.set(mb.ref, m.tags || {});

    const lines = new Map();
    for (const rel of routes) {
      const t = rel.tags || {};
      const mt = masterOf.get(rel.id) || {};
      const mode = TBTransit.modeOf(t.route);
      const ref = String(t.ref || mt.ref || '').trim();
      const key = `${mode}|${(t.network || mt.network || '').toLowerCase()}|${ref || t.name || rel.id}`;
      let ln = lines.get(key);
      if (!ln) {
        ln = { ref, name: mt.name || t.name || ref, mode, color: '', network: t.network || mt.network || '', ways: new Set(), stops: [], ends: new Set() };
        lines.set(key, ln);
      }
      ln.color = ln.color || TBTransit.color(t.colour || mt.colour);
      if (t.from) ln.ends.add(t.from);
      if (t.to) ln.ends.add(t.to);
      for (const mb of rel.members || []) {
        if (mb.type === 'way' && /^(|forward|backward|main)$/.test(mb.role || '')) ln.ways.add(mb.ref);
        else if (mb.type === 'node' && /^(stop|platform)/.test(mb.role || '')) ln.stops.push(mb.ref);
      }
    }

    // stations : arrêts regroupés par nom (et par proximité, < 500 m)
    const stations = [];
    const byName = new Map();
    const out = [];
    for (const ln of lines.values()) {
      const paths = TBTransit.join([...ln.ways].map((id) => ways.get(id)).filter((g) => g && g.length > 1));
      if (!paths.length) continue;
      const idx = out.length;
      const ends = [...ln.ends];
      out.push({
        ref: ln.ref, name: ln.name, mode: ln.mode, network: ln.network,
        color: ln.color || TRANSIT_MODES[ln.mode].color,
        ends: ends.length === 2 ? ends : [],
        paths: paths.map(TBTransit.thin),
      });
      for (const id of ln.stops) {
        const n = nodes.get(id);
        const name = n && n.tags && (n.tags.name || n.tags['name:fr']);
        if (!n || !name || n.lat == null) continue;
        const k = name.toLowerCase();
        const list = byName.get(k) || [];
        let st = list.find((x) => U.haversine(x, n) < 0.5);
        if (!st) {
          st = { name, lat: n.lat, lon: n.lon, n: 0, lines: new Set(), _sl: 0, _so: 0 };
          list.push(st); byName.set(k, list); stations.push(st);
        }
        st._sl += n.lat; st._so += n.lon; st.n++;
        st.lat = st._sl / st.n; st.lon = st._so / st.n;
        st.lines.add(idx);
      }
    }
    // ordre lisible : mode, puis numéro de ligne
    const order = out.map((l, i) => i).sort((a, b) => {
      const A = out[a], B = out[b];
      return Object.keys(TRANSIT_MODES).indexOf(A.mode) - Object.keys(TRANSIT_MODES).indexOf(B.mode)
        || String(A.ref).localeCompare(String(B.ref), LOCALE, { numeric: true }) || A.name.localeCompare(B.name, LOCALE);
    });
    const remap = new Map(order.map((oldI, newI) => [oldI, newI]));
    return {
      lines: order.map((i) => out[i]),
      stations: stations.map((s) => ({ name: s.name, lat: r5(s.lat), lon: r5(s.lon), lines: [...s.lines].map((i) => remap.get(i)).sort((a, b) => a - b) })),
    };
  },

  /** Couleur OSM (« #E2001A », « red »…) → CSS sûre */
  color(c) {
    const v = String(c || '').trim();
    if (/^#?[0-9a-f]{6}$/i.test(v) || /^#?[0-9a-f]{3}$/i.test(v)) return v.startsWith('#') ? v : '#' + v;
    if (/^[a-z]{3,20}$/i.test(v)) return v.toLowerCase();
    return '';
  },

  /** Raboute les tronçons qui se touchent (moins de polylignes à dessiner) */
  join(segs) {
    const key = (p) => `${p[0]},${p[1]}`;
    const pool = segs.map((s) => s.slice());
    const out = [];
    while (pool.length) {
      let cur = pool.pop();
      let grown = true;
      while (grown) {
        grown = false;
        for (let i = 0; i < pool.length; i++) {
          const s = pool[i];
          const a = key(cur[0]), b = key(cur[cur.length - 1]), c = key(s[0]), d = key(s[s.length - 1]);
          if (b === c) cur = cur.concat(s.slice(1));
          else if (b === d) cur = cur.concat(s.slice(0, -1).reverse());
          else if (a === d) cur = s.concat(cur.slice(1));
          else if (a === c) cur = s.slice().reverse().concat(cur.slice(1));
          else continue;
          pool.splice(i, 1); grown = true; break;
        }
      }
      out.push(cur);
    }
    return out;
  },

  /** Allège un tracé : points distants d'au moins ~8 m */
  thin(path) {
    if (path.length <= 2) return path;
    const out = [path[0]];
    for (let i = 1; i < path.length - 1; i++) {
      const p = out[out.length - 1], q = path[i];
      if (Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) > 0.00008) out.push(q);
    }
    out.push(path[path.length - 1]);
    return out;
  },

  /** Lit un réseau enregistré (avec cache) */
  async load(plugin, net) {
    const f = plugin.app.vault.getAbstractFileByPath(net.file);
    if (!f) return null;
    const mtime = f.stat ? f.stat.mtime : 0;
    const c = TBTransit.cache.get(f.path);
    if (c && c.mtime === mtime) return c.data;
    try {
      const data = JSON.parse(await plugin.app.vault.cachedRead(f));
      TBTransit.cache.set(f.path, { mtime, data });
      return data;
    } catch (e) {
      console.warn('[Trip Buddy] réseau illisible', net.file, e);
      return null;
    }
  },

  /** Résumé « 8 lignes de métro, 7 de tram · 180 stations » */
  summary(net) {
    const m = net.modes || {};
    const parts = Object.entries(TRANSIT_MODES).filter(([k]) => m[k]).map(([k, d]) => `${m[k]} ${d.label.toLowerCase()}`);
    return `${parts.join(', ') || `${net.lines || 0} lignes`} · ${net.stations || 0} stations`;
  },
};
