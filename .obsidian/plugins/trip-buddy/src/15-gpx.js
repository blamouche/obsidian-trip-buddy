/* ==========================================================================
 * Trip Buddy — traces GPX : lecture, statistiques, profil altimétrique
 * Une trace est rattachée à un POI par la propriété `gpx: "[[fichier.gpx]]"`.
 * ========================================================================== */
const GPX_EXT = ['gpx'];

const TBGpx = {
  cache: new Map(), // chemin → { mtime, track }

  /**
   * Analyse le XML d'un fichier GPX.
   * @returns {{name, desc, segments: Array<Array<{lat,lon,ele,time}>>, waypoints, stats, bounds}}
   */
  parse(text) {
    const doc = new DOMParser().parseFromString(String(text || ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('fichier GPX illisible');
    const root = doc.documentElement;
    if (!root || root.localName.toLowerCase() !== 'gpx') throw new Error('ce fichier n’est pas un GPX');
    const childText = (el, tag) => {
      for (const c of el.children) if (c.localName === tag) return (c.textContent || '').trim();
      return '';
    };
    const pt = (el) => {
      const lat = parseFloat(el.getAttribute('lat')), lon = parseFloat(el.getAttribute('lon'));
      if (!isFinite(lat) || !isFinite(lon)) return null;
      const ele = parseFloat(childText(el, 'ele'));
      const t = Date.parse(childText(el, 'time'));
      return { lat, lon, ele: isFinite(ele) ? ele : null, time: isFinite(t) ? t : null };
    };
    const segments = [];
    const byTag = (el, tag) => [...el.getElementsByTagNameNS('*', tag)];
    byTag(root, 'trkseg').forEach((seg) => {
      const pts = byTag(seg, 'trkpt').map(pt).filter(Boolean);
      if (pts.length > 1) segments.push(pts);
    });
    byTag(root, 'rte').forEach((rte) => {
      const pts = byTag(rte, 'rtept').map(pt).filter(Boolean);
      if (pts.length > 1) segments.push(pts);
    });
    const waypoints = [...root.children].filter((c) => c.localName === 'wpt').map((w) => {
      const p = pt(w);
      return p ? { ...p, name: childText(w, 'name'), desc: childText(w, 'desc') || childText(w, 'cmt') } : null;
    }).filter(Boolean);
    if (!segments.length && !waypoints.length) throw new Error('aucune trace ni aucun point dans ce fichier');

    const meta = [...root.children].find((c) => c.localName === 'metadata');
    const trk = [...root.children].find((c) => c.localName === 'trk' || c.localName === 'rte');
    const name = (meta && childText(meta, 'name')) || (trk && childText(trk, 'name')) || '';
    const desc = (meta && childText(meta, 'desc')) || (trk && childText(trk, 'desc')) || '';
    const track = { name, desc, segments, waypoints };
    track.stats = TBGpx.stats(segments);
    track.bounds = TBGpx.bounds(segments, waypoints);
    return track;
  },

  /** Distance, dénivelés, altitudes, durée, profil */
  stats(segments) {
    let dist = 0, gain = 0, loss = 0, min = Infinity, max = -Infinity;
    let t0 = null, t1 = null, moving = 0, points = 0;
    const profile = []; // { d (km), ele, lat, lon }
    segments.forEach((pts) => {
      // altitude lissée (moyenne glissante sur 5 points) pour ne pas compter le bruit du GPS
      const raw = pts.map((p) => p.ele);
      const sm = raw.map((e, i) => {
        if (e == null) return null;
        let s = 0, n = 0;
        for (let k = Math.max(0, i - 2); k <= Math.min(raw.length - 1, i + 2); k++) if (raw[k] != null) { s += raw[k]; n++; }
        return s / n;
      });
      let ref = null;
      pts.forEach((p, i) => {
        points++;
        if (i > 0) {
          const q = pts[i - 1];
          const dk = U.haversine(q, p);
          dist += dk;
          if (p.time != null && q.time != null && p.time > q.time) {
            const h = (p.time - q.time) / 3600000;
            if (dk / h > 0.8 && h < 0.5) moving += p.time - q.time; // en mouvement (> 0,8 km/h, pas une pause)
          }
        }
        if (p.ele != null) { min = Math.min(min, p.ele); max = Math.max(max, p.ele); }
        const e = sm[i];
        if (e != null) {
          if (ref == null) ref = e;
          else if (e - ref >= 3) { gain += e - ref; ref = e; }
          else if (ref - e >= 3) { loss += ref - e; ref = e; }
        }
        if (p.time != null) { if (t0 == null || p.time < t0) t0 = p.time; if (t1 == null || p.time > t1) t1 = p.time; }
        profile.push({ d: dist, ele: p.ele, lat: p.lat, lon: p.lon });
      });
    });
    const hasEle = isFinite(min);
    return {
      distanceKm: dist,
      gain: hasEle ? Math.round(gain) : null,
      loss: hasEle ? Math.round(loss) : null,
      eleMin: hasEle ? Math.round(min) : null,
      eleMax: hasEle ? Math.round(max) : null,
      start: t0, end: t1,
      durationMs: t0 != null && t1 > t0 ? t1 - t0 : null,
      movingMs: moving || null,
      estimateMs: TBGpx.estimate(dist, hasEle ? gain : 0, hasEle ? loss : 0),
      points,
      profile,
      hasEle,
    };
  },

  /** Temps de marche estimé (méthode DIN 33466 : 4 km/h, 300 m/h en montée, 500 m/h en descente) */
  estimate(km, up, down) {
    const h = km / 4, v = up / 300 + down / 500;
    return (Math.max(h, v) + Math.min(h, v) / 2) * 3600000;
  },

  bounds(segments, waypoints) {
    let s = 90, w = 180, n = -90, e = -180, any = false;
    const add = (p) => { any = true; s = Math.min(s, p.lat); n = Math.max(n, p.lat); w = Math.min(w, p.lon); e = Math.max(e, p.lon); };
    segments.forEach((pts) => pts.forEach(add));
    (waypoints || []).forEach(add);
    return any ? [[s, w], [n, e]] : null;
  },

  /** Premier point de la trace (ou premier point de passage) */
  startPoint(track) {
    const seg = track.segments[0];
    if (seg && seg.length) return seg[0];
    return track.waypoints[0] || null;
  },

  /** Charge (avec cache) la trace d'un fichier du coffre */
  async load(plugin, file) {
    const key = file.path;
    const mtime = file.stat ? file.stat.mtime : 0;
    const c = TBGpx.cache.get(key);
    if (c && c.mtime === mtime) return c.track;
    const text = await plugin.app.vault.cachedRead(file);
    const track = TBGpx.parse(text);
    TBGpx.cache.set(key, { mtime, track });
    return track;
  },

  /** Traces d'un POI (les fichiers illisibles sont signalés une seule fois dans la console) */
  async forPoi(plugin, poi) {
    const out = [];
    for (const f of poi.gpx || []) {
      try { out.push({ file: f, track: await TBGpx.load(plugin, f) }); } catch (e) { console.warn('[Trip Buddy] GPX', f.path, e); }
    }
    return out;
  },

  /** Fusionne plusieurs traces en une seule (pour les statistiques d'un POI) */
  merge(list) {
    if (list.length === 1) return list[0].track;
    const segments = [].concat(...list.map((x) => x.track.segments));
    const waypoints = [].concat(...list.map((x) => x.track.waypoints));
    return { name: list[0].track.name, desc: '', segments, waypoints, stats: TBGpx.stats(segments), bounds: TBGpx.bounds(segments, waypoints) };
  },

  fmtDuration(ms) {
    if (!ms || !isFinite(ms)) return '';
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min} min`;
    const d = Math.floor(min / 1440);
    if (d >= 1) return `${d} j ${Math.floor((min % 1440) / 60)} h`;
    return `${Math.floor(min / 60)} h ${U.pad2(min % 60)}`;
  },

  fmtEle: (m) => (m == null ? '' : `${Math.round(m).toLocaleString(LOCALE)} m`),

  /** Propriétés « résumé » écrites dans la note du POI (lisibles sans ouvrir le GPX) */
  fmProps(track) {
    const st = track.stats;
    const out = { distance_km: Math.round(st.distanceKm * 10) / 10 };
    if (st.gain != null) { out.ele_gain = st.gain; out.ele_loss = st.loss; out.ele_max = st.eleMax; }
    if (st.durationMs) out.duration = TBGpx.fmtDuration(st.durationMs);
    return out;
  },

  /**
   * Profil altimétrique interactif.
   * @param onHover(point|null) appelé au survol (pour placer un repère sur la carte)
   */
  renderProfile(parent, track, color, onHover) {
    const st = track.stats;
    const pts = st.profile.filter((p) => p.ele != null);
    if (!st.hasEle || pts.length < 2) return null;
    const W = 600, H = 140, padL = 0, padB = 0;
    const box = parent.createDiv('tb-gpx-profile');
    const total = pts[pts.length - 1].d || 1;
    const lo = st.eleMin, hi = Math.max(st.eleMax, st.eleMin + 10);
    const span = hi - lo;
    const yMin = lo - span * 0.08, yMax = hi + span * 0.12;
    const X = (d) => padL + (d / total) * (W - padL);
    const Y = (e) => (H - padB) - ((e - yMin) / (yMax - yMin)) * (H - padB);
    // échantillonnage : au plus ~600 sommets
    const step = Math.max(1, Math.floor(pts.length / 600));
    const sample = pts.filter((p, i) => i % step === 0 || i === pts.length - 1);
    const line = sample.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.ele).toFixed(1)}`).join('');
    const area = `${line}L${X(total).toFixed(1)},${H}L${X(0).toFixed(1)},${H}Z`;
    const c = U.esc(color || 'var(--tb-accent)');
    const grid = [0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${W}" y1="${(H * f).toFixed(1)}" y2="${(H * f).toFixed(1)}" class="tb-gpx-grid"/>`).join('');
    const plot = box.createDiv('tb-gpx-plot');
    plot.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
        ${grid}
        <path d="${area}" fill="${c}" class="tb-gpx-area"/>
        <path d="${line}" fill="none" stroke="${c}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
      </svg>`;
    plot.createDiv({ cls: 'tb-gpx-ylab is-top', text: TBGpx.fmtEle(hi) });
    plot.createDiv({ cls: 'tb-gpx-ylab is-bottom', text: TBGpx.fmtEle(lo) });
    const cursor = plot.createDiv('tb-gpx-cursor');
    const dot = cursor.createDiv('tb-gpx-dot');
    dot.style.setProperty('--tb-c', color || 'var(--tb-accent)');
    const tip = plot.createDiv('tb-gpx-tip');
    const axis = box.createDiv('tb-gpx-axis');
    axis.createSpan({ text: '0 km' });
    axis.createSpan({ text: U.fmtDist(total / 2) });
    axis.createSpan({ text: U.fmtDist(total) });
    const find = (d) => {
      let a = 0, b = pts.length - 1;
      while (b - a > 1) { const m = (a + b) >> 1; if (pts[m].d < d) a = m; else b = m; }
      return Math.abs(pts[a].d - d) < Math.abs(pts[b].d - d) ? pts[a] : pts[b];
    };
    const move = (clientX) => {
      const r = plot.getBoundingClientRect();
      if (!r.width) return;
      const fx = U.clamp((clientX - r.left) / r.width, 0, 1);
      const p = find(fx * total);
      const x = (p.d / total) * 100;
      cursor.style.left = x + '%';
      dot.style.top = ((Y(p.ele) / H) * 100) + '%';
      tip.setText(`${U.fmtDist(p.d)} · ${TBGpx.fmtEle(p.ele)}`);
      tip.style.left = U.clamp(x, 12, 88) + '%';
      box.addClass('is-hover');
      if (onHover) onHover(p);
    };
    const leave = () => { box.removeClass('is-hover'); if (onHover) onHover(null); };
    plot.addEventListener('mousemove', (e) => move(e.clientX));
    plot.addEventListener('mouseleave', leave);
    plot.addEventListener('touchstart', (e) => move(e.touches[0].clientX), { passive: true });
    plot.addEventListener('touchmove', (e) => move(e.touches[0].clientX), { passive: true });
    plot.addEventListener('touchend', leave);
    return box;
  },

  /** Ligne de statistiques (puces) */
  renderStats(parent, track) {
    const st = track.stats;
    const row = parent.createDiv('tb-gpx-stats');
    const chip = (ico, val, lbl) => {
      if (!val) return;
      const c = row.createDiv('tb-gpx-stat');
      c.createSpan({ cls: 'tb-gpx-stat-ico', text: ico });
      const t = c.createDiv('tb-gpx-stat-txt');
      t.createDiv({ cls: 'tb-gpx-stat-val', text: val });
      t.createDiv({ cls: 'tb-gpx-stat-lbl', text: lbl });
    };
    chip('📏', U.fmtDist(st.distanceKm), 'distance');
    if (st.hasEle) {
      chip('↗️', '+' + TBGpx.fmtEle(st.gain), 'dénivelé positif');
      chip('↘️', '−' + TBGpx.fmtEle(st.loss), 'dénivelé négatif');
      chip('⛰️', TBGpx.fmtEle(st.eleMax), `alt. max (min ${TBGpx.fmtEle(st.eleMin)})`);
    }
    if (st.durationMs) {
      chip('⏱️', TBGpx.fmtDuration(st.durationMs), st.movingMs ? `durée (${TBGpx.fmtDuration(st.movingMs)} en mouvement)` : 'durée');
      if (st.start) chip('📅', U.fmtShort(U.isoDate(new Date(st.start))), 'enregistrée le');
    } else if (st.distanceKm > 0.2) {
      chip('🥾', '≈ ' + TBGpx.fmtDuration(st.estimateMs), 'temps de marche estimé');
    }
    return row;
  },
};
