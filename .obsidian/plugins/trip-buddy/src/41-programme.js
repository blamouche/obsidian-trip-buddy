/* ==========================================================================
 * Trip Buddy — programme journalier (planificateur + éditeur d'itinéraire)
 * ========================================================================== */
const excerptCache = new Map();

async function poiExcerpt(app, file, max = 260) {
  const key = file.path + ':' + file.stat.mtime;
  if (excerptCache.has(key)) return excerptCache.get(key);
  let text = await app.vault.cachedRead(file);
  text = text.replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/```[\s\S]*?```/g, '');
  text = text.split('\n').map((l) => (/^\s*#{1,6}\s/.test(l) ? '' : l)).join('\n');
  const paras = text.split(/\n\s*\n/).map((p) => p.trim())
    .filter((p) => p && !/^#/.test(p) && !/^[-*>|]/.test(p) && !/^!\[/.test(p));
  let out = (paras[0] || '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (m, a, b) => b || a)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ').trim();
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, '') + '…';
  excerptCache.set(key, out);
  return out;
}

/** Ordre optimisé ; si le programme revient à son point de départ (boucle), l'arrivée reste en dernier */
function optimizeOrder(steps) {
  // boucle : le point de départ réapparaît plus loin (retour à l'hôtel) → ce retour devient la dernière étape
  const first = steps[0];
  let back = -1;
  for (let i = steps.length - 1; i > 0; i--) if (first && first.file && steps[i].file === first.file) { back = i; break; }
  if (back > 0) {
    const middle = steps.filter((s, i) => i !== 0 && i !== back);
    return optimizeOrderOpen([first, ...middle]).concat([steps[back]]);
  }
  return optimizeOrderOpen(steps);
}

/** Plus proche voisin (1er point fixé) + amélioration 2-opt */
function optimizeOrderOpen(steps) {
  const pts = steps.filter((s) => s.hasCoords);
  const rest = steps.filter((s) => !s.hasCoords);
  if (pts.length < 3) return steps;
  const order = [pts[0]];
  const left = pts.slice(1);
  while (left.length) {
    const last = order[order.length - 1];
    let bi = 0, bd = Infinity;
    left.forEach((p, i) => { const d = U.haversine(last, p); if (d < bd) { bd = d; bi = i; } });
    order.push(left.splice(bi, 1)[0]);
  }
  const len = (r) => r.reduce((acc, p, i) => acc + (i ? U.haversine(r[i - 1], p) : 0), 0);
  let improved = true, guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = 1; i < order.length - 1; i++) {
      for (let k = i + 1; k < order.length; k++) {
        const cand = order.slice(0, i).concat(order.slice(i, k + 1).reverse(), order.slice(k + 1));
        if (len(cand) + 1e-9 < len(order)) { order.splice(0, order.length, ...cand); improved = true; }
      }
    }
  }
  return order.concat(rest);
}

class ProgrammeEditor {
  constructor(plugin, parent, file, opts = {}) {
    this.plugin = plugin;
    this.app = plugin.app;
    this.data = plugin.data;
    this.file = file;
    this.opts = opts;
    this.mode = opts.mode || U.storeGet('progMode', 'edit');
    this.root = parent.createDiv('tb-prog');

    this.header = this.root.createDiv('tb-prog-head');
    const tools = this.root.createDiv('tb-toolbar tb-prog-tools');
    U.segmented(tools, [['edit', '✏️ Organiser'], ['map', '🗺️ Carte'], ['text', '📝 Texte'], ['both', '🗺️ + 📝']], this.mode, (m) => {
      this.mode = m; U.storeSet('progMode', m); this.applyMode();
    });
    tools.createDiv('tb-grow');
    U.button(tools, '＋ Ajouter des lieux', 'mod-cta', () => this.pick());
    U.button(tools, '✨ Optimiser', '', () => this.optimize(), 'Réordonner pour minimiser la distance');
    U.button(tools, '🔁 Retour au départ', '', () => this.loop(), 'Ajouter le point de départ comme dernière étape (ex. retour à l’hôtel)');
    U.button(tools, '📋', 'tb-btn-icon', () => this.copy(), 'Copier l’itinéraire en Markdown');

    this.layout = this.root.createDiv('tb-prog-layout');
    this.listCol = this.layout.createDiv('tb-prog-list');
    this.textCol = this.layout.createDiv('tb-prog-text');
    this.mapCol = this.layout.createDiv('tb-prog-map');
    this.map = new TripMap(plugin, this.mapCol, { addPoi: false });
    this.applyMode();
    this.refresh();
  }

  applyMode() {
    this.layout.className = 'tb-prog-layout mode-' + this.mode;
    if (this.prog && (this.mode === 'text' || this.mode === 'both')) this.renderText();
  }

  refresh() {
    this.prog = this.data.toProgramme(this.file);
    this.steps = this.prog.steps;
    this.renderHeader();
    this.renderList();
    this.map.setRoute(this.steps.filter((s) => !s.missing), { fit: true });
    if (this.mode === 'text' || this.mode === 'both') this.renderText();
  }

  stats() {
    const pts = this.steps.filter((s) => s.hasCoords);
    let km = 0;
    for (let i = 1; i < pts.length; i++) km += U.haversine(pts[i - 1], pts[i]);
    return { n: this.steps.length, km, done: this.steps.filter((s) => s.done).length };
  }

  renderHeader() {
    const h = this.header;
    h.empty();
    const p = this.prog;
    const dateBox = h.createDiv('tb-prog-date');
    dateBox.createDiv({ cls: 'tb-prog-dow', text: U.fmtWeekdayShort(p.date) });
    dateBox.createDiv({ cls: 'tb-prog-dnum', text: U.fmtDay(p.date) });
    dateBox.createDiv({ cls: 'tb-prog-mon', text: U.fmtMonthShort(p.date) });
    const main = h.createDiv('tb-prog-main');
    const idx = this.data.dayIndex(p.date);
    main.createDiv({ cls: 'tb-kicker', text: (idx ? `Jour ${idx} · ` : '') + U.cap(U.fmtLong(p.date)) });
    const title = main.createEl('input', { type: 'text', cls: 'tb-title-input', attr: { placeholder: 'Donnez un titre à cette journée…' } });
    title.value = p.title;
    title.addEventListener('change', () => this.app.fileManager.processFrontMatter(this.file, (fm) => { fm.title = title.value.trim(); }));
    const st = this.stats();
    const sum = main.createDiv('tb-prog-summary');
    sum.createSpan({ cls: 'tb-pill', text: `📍 ${st.n} étape${st.n > 1 ? 's' : ''}` });
    if (st.km) sum.createSpan({ cls: 'tb-pill', text: `🚶 ${U.fmtDist(st.km)} · ~${U.fmtWalk(st.km)}` });
    if (st.n) sum.createSpan({ cls: 'tb-pill', text: `✅ ${st.done}/${st.n} faits` });
    if (!this.opts.inNote) {
      const open = sum.createEl('a', { cls: 'tb-pill tb-pill-link', text: '📄 Ouvrir la note', href: '#' });
      open.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openFile(this.file); });
    }
    const j = this.data.journalFor(p.date);
    if (j) {
      const jl = sum.createEl('a', { cls: 'tb-pill tb-pill-link', text: '📔 Journal du jour', href: '#' });
      jl.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openFile(j.file); });
    }
  }

  renderList() {
    const c = this.listCol;
    c.empty();
    if (!this.steps.length) {
      const e = U.empty(c, '🗺️', 'Programme vide', 'Ajoutez des lieux puis classez-les dans l’ordre de visite.');
      U.button(e, '＋ Ajouter des lieux', 'mod-cta', () => this.pick());
      return;
    }
    const list = c.createDiv('tb-steps');
    this.steps.forEach((s, i) => {
      const row = list.createDiv('tb-step' + (s.missing ? ' is-missing' : '') + (s.done ? ' is-done' : ''));
      row.setAttr('draggable', 'true');
      row.dataset.i = String(i);
      if (s.cat) row.style.setProperty('--tb-c', s.cat.color);
      row.createSpan({ cls: 'tb-step-handle', text: '⋮⋮' });
      row.createSpan({ cls: 'tb-step-num', text: String(i + 1) });
      const body = row.createDiv('tb-step-body');
      if (s.missing) {
        body.createDiv({ cls: 'tb-step-name', text: s.name });
        body.createDiv({ cls: 'tb-step-sub tb-warn', text: 'Note introuvable' });
      } else {
        U.noteLink(this.plugin, body, s.file, s.name, 'tb-step-name');
        body.createDiv({ cls: 'tb-step-sub', text: `${s.cat.icon} ${s.cat.label}${s.address ? ' · ' + s.address : ''}` });
      }
      const ctrl = row.createDiv('tb-step-ctrl');
      if (!s.missing) {
        const d = ctrl.createEl('button', { cls: 'tb-check-btn tb-check-sm' + (s.done ? ' is-on' : ''), text: s.done ? '✓' : '' });
        d.setAttr('title', s.done ? 'Fait' : 'Marquer comme fait');
        d.addEventListener('click', (e) => { e.stopPropagation(); this.data.setPoiDone(s, !s.done, this.prog.date); });
      }
      U.button(ctrl, '↑', 'tb-btn-icon tb-btn-sm', () => this.move(i, i - 1), 'Monter').toggleClass('is-disabled', i === 0);
      U.button(ctrl, '↓', 'tb-btn-icon tb-btn-sm', () => this.move(i, i + 1), 'Descendre').toggleClass('is-disabled', i === this.steps.length - 1);
      U.button(ctrl, '✕', 'tb-btn-icon tb-btn-sm tb-btn-danger', () => this.remove(i), 'Retirer du programme');

      // glisser-déposer (souris)
      row.addEventListener('dragstart', (e) => { this.dragFrom = i; row.addClass('is-dragging'); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragend', () => row.removeClass('is-dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.addClass('is-over'); });
      row.addEventListener('dragleave', () => row.removeClass('is-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.removeClass('is-over');
        if (this.dragFrom != null && this.dragFrom !== i) this.move(this.dragFrom, i);
        this.dragFrom = null;
      });

      const next = this.steps[i + 1];
      if (next && s.hasCoords && next.hasCoords) {
        const km = U.haversine(s, next);
        list.createDiv({ cls: 'tb-step-leg', text: `🚶 ${U.fmtDist(km)} · ~${U.fmtWalk(km)}` });
      } else if (next) {
        list.createDiv({ cls: 'tb-step-leg', text: '·' });
      }
    });
  }

  async renderText() {
    const c = this.textCol;
    const token = (this.textToken = (this.textToken || 0) + 1);
    c.empty();
    const it = c.createDiv('tb-itin');
    const title = it.createDiv('tb-itin-title');
    title.setText(`${U.cap(U.fmtLong(this.prog.date))}${this.prog.title ? ' — ' + this.prog.title : ''}`);
    if (!this.steps.length) { it.createDiv({ cls: 'tb-muted', text: 'Aucune étape pour le moment.' }); return; }
    for (let i = 0; i < this.steps.length; i++) {
      const s = this.steps[i];
      const step = it.createDiv('tb-itin-step');
      if (s.cat) step.style.setProperty('--tb-c', s.cat.color);
      step.createDiv({ cls: 'tb-itin-num', text: String(i + 1) });
      const body = step.createDiv('tb-itin-body');
      if (!s.missing && s.photo) {
        const th = step.createEl('img', { cls: 'tb-itin-photo' });
        th.src = this.data.photoUrl(s); th.alt = ''; th.loading = 'lazy';
      }
      const name = body.createDiv('tb-itin-name');
      if (s.missing) { name.setText(s.name); continue; }
      U.noteLink(this.plugin, name, s.file, s.name);
      if (s.done) name.createSpan({ cls: 'tb-chip tb-chip-done', text: '✓ fait' });
      const meta = [`${s.cat.icon} ${s.cat.label}`];
      if (s.rating) meta.push(U.starsText(s.rating));
      body.createDiv({ cls: 'tb-itin-meta', text: meta.join('  ·  ') });
      if (s.address) body.createDiv({ cls: 'tb-itin-addr', text: '📍 ' + s.address });
      const desc = body.createDiv('tb-itin-desc');
      poiExcerpt(this.app, s.file).then((t) => { if (token === this.textToken) desc.setText(t); });
      const next = this.steps[i + 1];
      if (next && s.hasCoords && next.hasCoords) {
        const km = U.haversine(s, next);
        it.createDiv({ cls: 'tb-itin-leg', text: `🚶 ${U.fmtDist(km)} — environ ${U.fmtWalk(km)} à pied` });
      }
    }
    const st = this.stats();
    it.createDiv({ cls: 'tb-itin-total', text: `Total : ${st.n} étapes · ${U.fmtDist(st.km)} à vol d’oiseau · ~${U.fmtWalk(st.km)} de marche` });
  }

  files() { return this.steps.filter((s) => !s.missing).map((s) => s.file); }

  async save(files) {
    await this.data.saveProgrammeSteps(this.prog, files);
  }

  async move(from, to) {
    if (to < 0 || to >= this.steps.length) return;
    const arr = this.steps.slice();
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    this.steps = arr;
    this.renderList();
    await this.save(arr.filter((s) => !s.missing).map((s) => s.file));
  }

  async remove(i) {
    const arr = this.steps.slice();
    arr.splice(i, 1);
    this.steps = arr;
    this.renderList();
    await this.save(arr.filter((s) => !s.missing).map((s) => s.file));
  }

  pick() {
    new PoiPickerModal(this.plugin, {
      exclude: this.files().map((f) => f.path),
      onPick: async (files) => {
        // un même lieu peut figurer plusieurs fois (départ / retour…) ; insertion avant le retour si la journée boucle
        await this.data.addToProgramme(this.data.toProgramme(this.file), files);
        new Notice(`📍 ${files.length} lieu${files.length > 1 ? 'x' : ''} ajouté${files.length > 1 ? 's' : ''}`);
      },
    }).open();
  }

  async loop() {
    const files = this.files();
    if (!files.length) { new Notice('Ajoutez d’abord un point de départ'); return; }
    if (files.length > 1 && files[files.length - 1] === files[0]) { new Notice('Le programme revient déjà au point de départ'); return; }
    files.push(files[0]);
    await this.save(files);
    new Notice(`🔁 Retour à « ${files[0].basename} » ajouté en fin de journée`);
  }

  async optimize() {
    const before = this.stats().km;
    const ordered = optimizeOrder(this.steps.filter((s) => !s.missing));
    await this.save(ordered.map((s) => s.file));
    let after = 0;
    const pts = ordered.filter((s) => s.hasCoords);
    for (let i = 1; i < pts.length; i++) after += U.haversine(pts[i - 1], pts[i]);
    new Notice(after < before - 0.01 ? `✨ Itinéraire raccourci : ${U.fmtDist(before)} → ${U.fmtDist(after)}` : '✨ L’ordre actuel est déjà optimal');
  }

  async copy() {
    const lines = [`## 🗓️ ${U.cap(U.fmtLong(this.prog.date))}${this.prog.title ? ' — ' + this.prog.title : ''}`, ''];
    this.steps.forEach((s, i) => {
      lines.push(`${i + 1}. **${s.name}**${s.cat ? ` — ${s.cat.icon} ${s.cat.label}` : ''}${s.address ? ` · ${s.address}` : ''}`);
      const n = this.steps[i + 1];
      if (n && s.hasCoords && n.hasCoords) {
        const km = U.haversine(s, n);
        lines.push(`   - 🚶 ${U.fmtDist(km)} (~${U.fmtWalk(km)})`);
      }
    });
    await navigator.clipboard.writeText(lines.join('\n'));
    new Notice('📋 Itinéraire copié');
  }

  destroy() { this.map.destroy(); }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-program``` — dans une note de programme
 * -------------------------------------------------------------------------- */
class ProgrammeBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-progblock');
    this.file = this.opts.date ? this.data.programmeFor(U.normDate(this.opts.date))?.file : this.sourceFile();
    if (!this.file) { U.empty(this.root, '🗓️', 'Programme introuvable'); return; }
    this.editor = new ProgrammeEditor(this.plugin, this.root, this.file, { inNote: !this.opts.date });
  }
  relevant(f) { const t = this.data.fm(f).type; return f === this.file || t === 'poi' || t === 'journal'; }
  async refresh() { this.editor && this.editor.refresh(); }
  destroy() { this.editor && this.editor.destroy(); }
}

/* --------------------------------------------------------------------------
 * ```tripbuddy-planner``` — choix d'une date puis édition du programme
 * -------------------------------------------------------------------------- */
class PlannerBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-planner');
    const days = this.data.tripDays();
    const saved = U.storeGet('plannerDay', null);
    this.day = (saved && (days.includes(saved) || !days.length)) ? saved : this.data.currentDay();
    this.strip = this.root.createDiv('tb-daystrip');
    this.content = this.root.createDiv();
    return this.refresh();
  }

  relevant(f) { const t = this.data.fm(f).type; return t === 'programme' || t === 'poi' || t === 'journal'; }

  async refresh() {
    this.renderStrip();
    const prog = this.data.programmeFor(this.day);
    if (prog && this.editor && this.editor.file === prog.file) { this.editor.refresh(); return; }
    this.editor && this.editor.destroy();
    this.editor = null;
    this.content.empty();
    if (prog) {
      this.editor = new ProgrammeEditor(this.plugin, this.content, prog.file);
    } else {
      const e = U.empty(this.content, '🗓️', `Rien de prévu le ${U.fmtMedium(this.day)}`, 'Créez le programme de cette journée puis ajoutez les lieux à visiter.');
      U.button(e, '＋ Créer le programme', 'mod-cta', async () => {
        await this.plugin.createProgramme(this.day, { open: false });
      });
    }
  }

  select(day) {
    this.day = day;
    U.storeSet('plannerDay', day);
    this.refresh();
  }

  renderStrip() {
    const s = this.strip;
    s.empty();
    const days = this.data.tripDays();
    const progs = {};
    this.data.programmes().forEach((p) => { progs[p.date] = p; });
    const all = days.slice();
    Object.keys(progs).forEach((d) => { if (d && !all.includes(d)) all.push(d); });
    if (!all.includes(this.day)) all.push(this.day);
    all.sort();
    const today = U.todayISO();
    const row = s.createDiv('tb-days');
    all.forEach((d) => {
      const p = progs[d];
      const chip = row.createEl('button', { cls: 'tb-day' + (d === this.day ? ' is-active' : '') + (d === today ? ' is-today' : '') + (days.includes(d) ? '' : ' is-extra') });
      const idx = this.data.dayIndex(d);
      chip.createDiv({ cls: 'tb-day-k', text: idx ? `J${idx}` : '·' });
      chip.createDiv({ cls: 'tb-day-dow', text: U.fmtWeekdayShort(d) });
      chip.createDiv({ cls: 'tb-day-num', text: U.fmtDay(d) });
      chip.createDiv({ cls: 'tb-day-mon', text: U.fmtMonthShort(d) });
      const n = p ? p.steps.length : 0;
      chip.createDiv({ cls: 'tb-day-badge' + (n ? '' : ' is-zero'), text: n ? `${n} lieu${n > 1 ? 'x' : ''}` : '—' });
      chip.addEventListener('click', () => this.select(d));
      if (d === this.day) {
        setTimeout(() => { row.scrollLeft = chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2; }, 50);
      }
    });
    const other = s.createDiv('tb-day-other');
    other.createSpan({ cls: 'tb-muted', text: 'Autre date :' });
    const inp = other.createEl('input', { type: 'date', cls: 'tb-input tb-date' });
    inp.value = this.day;
    inp.addEventListener('change', () => { const d = U.normDate(inp.value); if (d) this.select(d); });
  }

  destroy() { this.editor && this.editor.destroy(); }
}
