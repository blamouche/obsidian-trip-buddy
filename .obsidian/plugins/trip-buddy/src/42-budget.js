/* ==========================================================================
 * Trip Buddy — ```tripbuddy-budget``` : suivi des dépenses
 * ========================================================================== */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(parent, tag, attrs) {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, String(v)));
  parent.appendChild(e);
  return e;
}

/** Infobulle partagée pour les graphiques */
function attachTooltip(wrap) {
  const tip = wrap.createDiv('tb-tip');
  return {
    show(evt, title, lines) {
      tip.empty();
      tip.createDiv({ cls: 'tb-tip-title', text: title });
      (lines || []).forEach((l) => tip.createDiv({ cls: 'tb-tip-line', text: l }));
      tip.addClass('is-on');
      const r = wrap.getBoundingClientRect();
      const x = (evt.touches ? evt.touches[0].clientX : evt.clientX) - r.left;
      const y = (evt.touches ? evt.touches[0].clientY : evt.clientY) - r.top;
      const w = tip.offsetWidth;
      tip.style.left = U.clamp(x - w / 2, 4, Math.max(4, r.width - w - 4)) + 'px';
      tip.style.top = Math.max(0, y - tip.offsetHeight - 14) + 'px';
    },
    hide() { tip.removeClass('is-on'); },
  };
}

class BudgetBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-budget');
    return this.refresh();
  }

  relevant(f) { return f.path === normalizePath(this.s.files.budget); }

  async refresh() {
    const { expenses, file } = await this.data.budget();
    const s = this.s;
    const cur = s.trip.currency || 'EUR';
    const money = (v) => U.fmtMoney(v, cur);
    const r = this.root;
    r.empty();

    const catBudgetSum = s.expenseCategories.reduce((a, c) => a + (Number(c.budget) || 0), 0);
    const budget = Number(s.trip.budget) || catBudgetSum;
    const spent = expenses.reduce((a, e) => a + e.amountMain, 0);
    const days = this.data.tripDays();
    const today = U.todayISO();
    const tripSpent = expenses.filter((e) => days.includes(e.date)).reduce((a, e) => a + e.amountMain, 0);
    const preSpent = spent - tripSpent;
    let elapsed = days.filter((d) => d <= today).length;
    if (!elapsed || today > days[days.length - 1]) elapsed = days.length;
    const perDay = tripSpent / Math.max(1, elapsed);
    const projection = preSpent + perDay * (days.length || 1);

    /* ---- en-tête + action */
    const head = r.createDiv('tb-budget-head');
    const h = head.createDiv();
    h.createDiv({ cls: 'tb-kicker', text: '💰 Budget du voyage' });
    h.createDiv({ cls: 'tb-budget-title', text: `${money(spent)} dépensés` + (budget ? ` sur ${money(budget)}` : '') });
    U.button(head, '＋ Ajouter une dépense', 'mod-cta tb-btn-lg', () => new ExpenseModal(this.plugin).open());

    if (budget) {
      const big = r.createDiv('tb-budget-gauge');
      const ratio = spent / budget;
      U.progress(big, ratio, ratio > 1 ? 'var(--tb-bad)' : ratio > 0.85 ? 'var(--tb-warn)' : 'var(--tb-accent)');
      big.createDiv({ cls: 'tb-muted', text: `${Math.round(ratio * 100)} % du budget consommé` });
    }

    /* ---- KPI */
    const kpis = r.createDiv('tb-kpis');
    const kpi = (label, value, sub, cls) => {
      const k = kpis.createDiv('tb-kpi ' + (cls || ''));
      k.createDiv({ cls: 'tb-kpi-label', text: label });
      k.createDiv({ cls: 'tb-kpi-value', text: value });
      if (sub) k.createDiv({ cls: 'tb-kpi-sub', text: sub });
    };
    kpi('Budget prévu', budget ? money(budget) : '—', budget ? (days.length ? `${money(budget / days.length)} / jour` : '') : 'À définir dans les réglages');
    kpi('Dépensé', money(spent), `${expenses.length} dépense${expenses.length > 1 ? 's' : ''}`);
    if (budget) kpi('Restant', money(budget - spent), budget - spent < 0 ? '⚠︎ Budget dépassé' : 'disponible', budget - spent < 0 ? 'is-bad' : 'is-good');
    kpi('Moyenne / jour', money(perDay), preSpent ? `hors ${money(preSpent)} réglés avant le départ` : 'sur place');
    if (days.length) kpi('Projection', money(projection), budget ? (projection > budget ? `⚠︎ ${money(projection - budget)} au-dessus` : `✓ ${money(budget - projection)} de marge`) : 'fin de voyage', budget && projection > budget ? 'is-warn' : '');

    if (!expenses.length) {
      U.empty(r, '🧾', 'Aucune dépense pour l’instant', 'Ajoutez votre première dépense avec le bouton ci-dessus.');
      return;
    }

    /* ---- répartition par catégorie */
    const byCat = {};
    expenses.forEach((e) => {
      const k = e.cat.id;
      (byCat[k] = byCat[k] || { cat: e.cat, total: 0, n: 0 }).total += e.amountMain;
      byCat[k].n++;
    });
    const order = s.expenseCategories.map((c) => c.id);
    const cats = [
      ...s.expenseCategories.map((c) => byCat[c.id] || { cat: c, total: 0, n: 0 }),
      ...Object.values(byCat).filter((x) => !order.includes(x.cat.id)),
    ];

    const sec1 = r.createDiv('tb-card');
    sec1.createDiv({ cls: 'tb-card-title', text: 'Par catégorie' });
    // barre de composition (part du total)
    const compWrap = sec1.createDiv('tb-comp-wrap');
    const comp = compWrap.createDiv('tb-comp');
    const tip1 = attachTooltip(compWrap);
    cats.filter((c) => c.total > 0).forEach((c) => {
      const seg = comp.createDiv('tb-comp-seg');
      seg.style.flexGrow = String(c.total);
      seg.style.background = c.cat.color;
      const pct = Math.round((c.total / spent) * 100);
      seg.addEventListener('mousemove', (e) => tip1.show(e, `${c.cat.icon} ${c.cat.label}`, [`${money(c.total)} · ${pct} %`]));
      seg.addEventListener('mouseleave', () => tip1.hide());
    });
    const rows = sec1.createDiv('tb-catrows');
    cats.forEach((c) => {
      const planned = Number(c.cat.budget) || 0;
      if (!c.total && !planned) return;
      const row = rows.createDiv('tb-catrow');
      row.style.setProperty('--tb-c', c.cat.color);
      const lbl = row.createDiv('tb-catrow-lbl');
      lbl.createSpan({ cls: 'tb-swatch' });
      lbl.createSpan({ text: `${c.cat.icon} ${c.cat.label}` });
      const track = row.createDiv('tb-catrow-track');
      const max = Math.max(c.total, planned) || 1;
      const fill = track.createDiv('tb-catrow-fill');
      fill.style.width = `${(c.total / max) * 100}%`;
      if (planned && c.total > planned) {
        track.addClass('is-over');
        const mk = track.createDiv('tb-catrow-mark');
        mk.style.left = `${(planned / max) * 100}%`;
        mk.setAttr('title', 'Budget prévu');
      }
      const val = row.createDiv('tb-catrow-val');
      val.createSpan({ cls: 'tb-strong', text: money(c.total) });
      if (planned) {
        val.createSpan({ cls: 'tb-muted', text: ` / ${money(planned)}` });
        if (c.total > planned) val.createSpan({ cls: 'tb-over', text: ` ⚠︎ +${money(c.total - planned)}` });
      }
    });

    /* ---- dépenses par jour */
    if (days.length) {
      const sec2 = r.createDiv('tb-card');
      sec2.createDiv({ cls: 'tb-card-title', text: 'Dépenses par jour' });
      const cols = [];
      if (preSpent > 0) sec2.createDiv({ cls: 'tb-muted tb-small tb-chart-note', text: `Hors graphique : ${money(preSpent)} réglés avant le départ ou après le retour (vols, logement…).` });
      days.forEach((d, i) => {
        const items = expenses.filter((e) => e.date === d);
        cols.push({ key: d, label: `J${i + 1}`, date: d, total: items.reduce((a, e) => a + e.amountMain, 0), items });
      });
      this.dayChart(sec2, cols, budget ? budget / days.length : 0, money);
    }

    /* ---- équilibre entre voyageurs */
    const travelers = s.trip.travelers || [];
    const payers = {};
    expenses.forEach((e) => { if (e.payer) payers[e.payer] = (payers[e.payer] || 0) + e.amountMain; });
    if (travelers.length > 1 && Object.keys(payers).length) {
      const sec3 = r.createDiv('tb-card');
      sec3.createDiv({ cls: 'tb-card-title', text: 'Qui a payé quoi ?' });
      const shared = Object.values(payers).reduce((a, b) => a + b, 0);
      const share = shared / travelers.length;
      const grid = sec3.createDiv('tb-payers');
      travelers.forEach((t) => {
        const paid = payers[t] || 0;
        const bal = paid - share;
        const p = grid.createDiv('tb-payer');
        p.createDiv({ cls: 'tb-avatar', text: t.slice(0, 1).toUpperCase() });
        const tx = p.createDiv();
        tx.createDiv({ cls: 'tb-strong', text: t });
        tx.createDiv({ cls: 'tb-muted', text: `a payé ${money(paid)}` });
        p.createDiv({
          cls: 'tb-balance ' + (bal >= 0 ? 'is-good' : 'is-bad'),
          text: Math.abs(bal) < 0.5 ? 'à l’équilibre' : (bal > 0 ? `doit recevoir ${money(bal)}` : `doit ${money(-bal)}`),
        });
      });
      sec3.createDiv({ cls: 'tb-muted tb-small', text: `Partage égal de ${money(shared)} entre ${travelers.length} voyageurs (dépenses avec un payeur renseigné).` });
    }

    /* ---- dernières dépenses */
    const sec4 = r.createDiv('tb-card');
    const t4 = sec4.createDiv('tb-card-title');
    t4.setText('Dernières dépenses');
    const list = sec4.createDiv('tb-exp-list');
    const recent = expenses.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.line - a.line).slice(0, Number(this.opts.recent) || 8);
    recent.forEach((e) => {
      const row = list.createDiv('tb-exp');
      row.style.setProperty('--tb-c', e.cat.color);
      row.createDiv({ cls: 'tb-exp-ico', text: e.cat.icon });
      const tx = row.createDiv('tb-exp-txt');
      tx.createDiv({ cls: 'tb-exp-label', text: e.label || e.cat.label });
      tx.createDiv({ cls: 'tb-exp-sub', text: [e.date ? U.fmtShort(e.date) : '', e.cat.label, e.payer].filter(Boolean).join(' · ') });
      const am = row.createDiv('tb-exp-amount');
      am.createDiv({ text: U.fmtMoney(e.amount, e.currency) });
      if (e.currency !== cur) am.createDiv({ cls: 'tb-muted tb-small', text: '≈ ' + money(e.amountMain) });
      row.setAttr('title', 'Modifier');
      row.addEventListener('click', () => new ExpenseModal(this.plugin, e).open());
    });
    if (file) sec4.createDiv({ cls: 'tb-muted tb-small', text: 'Toutes les dépenses sont dans le tableau « Dépenses » ci-dessous — modifiable à la main.' });
  }

  dayChart(parent, cols, dailyBudget, money) {
    const wrap = parent.createDiv('tb-chart');
    let lastW = 0;
    const draw = () => {
      const w = wrap.clientWidth || 600;
      if (Math.abs(w - lastW) < 30) return;
      lastW = w;
      wrap.empty();
      this.drawDayChart(wrap, cols, dailyBudget, money, w);
    };
    draw();
    if (this.chartRO) this.chartRO.disconnect();
    this.chartRO = new ResizeObserver(() => draw());
    this.chartRO.observe(wrap);
  }

  destroy() { if (this.chartRO) this.chartRO.disconnect(); }

  drawDayChart(wrap, cols, dailyBudget, money, width) {
    const tip = attachTooltip(wrap);
    const W = Math.max(300, width, cols.length * 30), H = 200, padL = 8, padR = 8, padT = 22, padB = 30;
    const max = Math.max(dailyBudget, ...cols.map((c) => c.total)) * 1.1 || 1;
    const svg = svgEl(wrap, 'svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'tb-svg', role: 'img', 'aria-label': 'Dépenses par jour' });
    const plotH = H - padT - padB;
    const bw = (W - padL - padR) / cols.length;
    const y = (v) => padT + plotH - (v / max) * plotH;
    svgEl(svg, 'line', { x1: padL, x2: W - padR, y1: y(0), y2: y(0), class: 'tb-axis' });
    if (dailyBudget) {
      svgEl(svg, 'line', { x1: padL, x2: W - padR, y1: y(dailyBudget), y2: y(dailyBudget), class: 'tb-ref' });
      const t = svgEl(svg, 'text', { x: W - padR, y: y(dailyBudget) - 5, class: 'tb-ref-label', 'text-anchor': 'end' });
      t.textContent = `budget/jour ${money(dailyBudget)}`;
    }
    const today = U.todayISO();
    const top = cols.reduce((a, c) => (c.total > a.total ? c : a), cols[0]);
    cols.forEach((c, i) => {
      const x = padL + i * bw;
      const bh = Math.max(0, y(0) - y(c.total));
      const w = Math.max(4, Math.min(28, bw - 10));
      const bx = x + (bw - w) / 2;
      if (c.total > 0) {
        // barre aux extrémités hautes arrondies (4 px), ancrée sur la ligne de base
        const r = Math.min(4, bh, w / 2);
        const top = y(c.total);
        const d = `M${bx},${y(0)} L${bx},${top + r} Q${bx},${top} ${bx + r},${top} L${bx + w - r},${top} Q${bx + w},${top} ${bx + w},${top + r} L${bx + w},${y(0)} Z`;
        svgEl(svg, 'path', { d, class: 'tb-bar' + (dailyBudget && c.total > dailyBudget ? ' is-over' : '') });
      }
      const lbl = svgEl(svg, 'text', { x: x + bw / 2, y: H - 10, class: 'tb-axis-label' + (c.date === today ? ' is-today' : ''), 'text-anchor': 'middle' });
      lbl.textContent = c.label;
      // zone de survol plus large que la barre
      const hit = svgEl(svg, 'rect', { x, y: padT, width: bw, height: plotH + 6, class: 'tb-hit' });
      const lines = [money(c.total)];
      c.items.slice(0, 5).forEach((e) => lines.push(`${e.cat.icon} ${e.label} — ${money(e.amountMain)}`));
      if (c.items.length > 5) lines.push(`… et ${c.items.length - 5} autre(s)`);
      const title = U.cap(U.fmtMedium(c.date));
      hit.addEventListener('mousemove', (e) => tip.show(e, title, lines));
      hit.addEventListener('mouseleave', () => tip.hide());
      hit.addEventListener('touchstart', (e) => tip.show(e, title, lines), { passive: true });
    });
    // étiquette directe : uniquement le jour le plus dépensier
    if (top && top.total > 0) {
      const i = cols.indexOf(top);
      const t = svgEl(svg, 'text', { x: padL + i * bw + bw / 2, y: y(top.total) - 6, class: 'tb-val-label', 'text-anchor': 'middle' });
      t.textContent = money(top.total);
    }
  }
}
