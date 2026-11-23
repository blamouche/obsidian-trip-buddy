/* ==========================================================================
 * Trip Buddy — saisie rapide dans le journal en mode lecture
 * Sous le dernier bloc de chaque section (## …) d'une entrée de journal, une zone
 * de texte permet d'ajouter du contenu sans passer en mode édition.
 * ========================================================================== */
const HEADING_RE = /^#{1,6}\s/;

/** Ajoute `addition` à la fin de la section dont la ligne de titre est `headingLine` */
function appendToSection(text, headingLine, addition) {
  const lines = text.split('\n');
  const add = addition.replace(/\s+$/, '').split('\n');
  const h = lines.findIndex((l) => /^#{2,6}\s/.test(l) && l.trim() === headingLine.trim());
  if (h < 0) return text.replace(/\s*$/, '\n\n') + add.join('\n') + '\n';
  let next = lines.length;
  for (let i = h + 1; i < lines.length; i++) if (HEADING_RE.test(lines[i])) { next = i; break; }
  let last = next - 1;
  while (last > h && lines[last].trim() === '') last--;
  const isList = (l) => /^\s*([-*+]|\d+[.)])\s/.test(l);
  // pas de ligne vide entre deux éléments de liste, sinon un paragraphe séparé
  const sep = last === h || (isList(lines[last]) && isList(add[0])) ? [] : [''];
  const block = [...sep, ...add];
  lines.splice(last + 1, 0, ...block);
  const nextAfter = next + block.length;
  if (nextAfter < lines.length && lines[nextAfter - 1].trim() !== '') lines.splice(nextAfter, 0, '');
  return lines.join('\n');
}

/** Supprime des lignes du fichier si elles correspondent toujours au texte attendu */
function removeLines(text, expected, hintStart) {
  const lines = text.split('\n');
  const n = expected.length;
  const matchAt = (i) => i >= 0 && i + n <= lines.length && expected.every((l, k) => lines[i + k] === l);
  let at = matchAt(hintStart) ? hintStart : -1;
  if (at < 0) for (let i = 0; i + n <= lines.length; i++) if (matchAt(i)) { at = i; break; }
  if (at < 0) return null;
  lines.splice(at, n);
  // évite deux lignes vides consécutives à l'endroit supprimé
  if (at > 0 && at < lines.length && lines[at - 1].trim() === '' && lines[at].trim() === '') lines.splice(at, 1);
  return lines.join('\n');
}

/** Remplace des lignes du fichier si elles correspondent toujours au texte attendu */
function replaceLines(text, expected, hintStart, replacement) {
  const lines = text.split('\n');
  const n = expected.length;
  const matchAt = (i) => i >= 0 && i + n <= lines.length && expected.every((l, k) => lines[i + k] === l);
  let at = matchAt(hintStart) ? hintStart : -1;
  if (at < 0) for (let i = 0; i + n <= lines.length; i++) if (matchAt(i)) { at = i; break; }
  if (at < 0) return null;
  lines.splice(at, n, ...replacement);
  return lines.join('\n');
}

const LIST_ITEM_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[.\]\s+)?/;

/** Texte modifiable d'un bloc : pour un élément de liste, sans la puce (ni la case à cocher),
 *  qui sont remises telles quelles à l'enregistrement */
function editableText(expected, isItem) {
  const m = isItem && LIST_ITEM_RE.exec(expected[0]);
  if (!m) return { text: expected.join('\n'), rebuild: (v) => v.split('\n') };
  const prefix = m[0];
  const indent = ' '.repeat((m[1] + m[2] + m[3]).length);
  const rest = expected.slice(1).map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l.replace(/^\s+/, '')));
  return {
    text: [expected[0].slice(prefix.length), ...rest].join('\n'),
    rebuild: (v) => v.split('\n').map((l, i) => (i === 0 ? prefix + l : l.trim() ? indent + l : '')),
  };
}

/** Édition en place d'un bloc (ou d'un élément de liste) rendu en mode lecture */
function startInlineEdit(plugin, file, host, expected, hintStart, isItem) {
  if (host.hasClass('is-editing')) return;
  const keep = (n) => n.nodeType === 1 && (n.hasClass('tb-del-actions') || n.hasClass('tb-quick-add') || (isItem && /^(UL|OL)$/.test(n.tagName)));
  const moved = [...host.childNodes].filter((n) => !keep(n));
  const orig = createDiv('tb-edit-orig');
  if (moved.length) host.insertBefore(orig, moved[0]); else host.prepend(orig);
  moved.forEach((n) => orig.appendChild(n));
  host.addClass('is-editing');

  const { text, rebuild } = editableText(expected, isItem);
  const box = createDiv('tb tb-quick-add tb-inline-edit is-open');
  orig.after(box);
  const ta = box.createEl('textarea', { cls: 'tb-input', attr: { rows: '2' } });
  ta.value = text;
  const bar = box.createDiv('tb-quick-bar');
  bar.createSpan({ cls: 'tb-muted tb-small', text: 'Ctrl/Cmd + Entrée pour enregistrer · Échap pour annuler' });
  bar.createDiv('tb-grow');

  const restore = () => {
    box.remove();
    [...orig.childNodes].forEach((n) => orig.before(n));
    orig.remove();
    host.removeClass('is-editing');
  };
  const save = async () => {
    const v = ta.value.replace(/\s+$/, '');
    if (v === text.replace(/\s+$/, '')) { restore(); return; }
    if (!v.trim()) { new Notice('Le texte est vide : utilisez ✕ pour le supprimer.'); return; }
    ta.disabled = true;
    let ok = false;
    await plugin.app.vault.process(file, (t) => {
      const r = replaceLines(t, expected, hintStart, rebuild(v));
      if (r == null) return t;
      ok = true;
      return r;
    });
    if (ok) new Notice('✏️ Texte modifié');
    else { new Notice('Le texte a changé entre-temps : rien n’a été modifié.'); restore(); }
  };
  U.button(bar, 'Annuler', 'tb-btn-sm', restore);
  U.button(bar, 'Enregistrer', 'mod-cta tb-btn-sm', save);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 420) + 'px'; };
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); restore(); }
    e.stopPropagation();
  });
  // les clics dans l'éditeur ne doivent pas cocher une case ni suivre un lien de l'élément
  box.addEventListener('click', (e) => e.stopPropagation());
  TBIcons.iconize(box);
  setTimeout(() => { grow(); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 0);
}

/** Boutons « modifier » et « supprimer » d'un bloc (ou d'un élément de liste) */
function addDeleteButton(plugin, file, host, expected, hintStart, label, isItem) {
  host.addClass('tb-del-host');
  const actions = host.createDiv('tb-del-actions');
  const edit = actions.createEl('button', { cls: 'tb-del-btn tb-edit-btn', text: '✏️' });
  edit.setAttr('aria-label', 'Modifier');
  edit.setAttr('title', 'Modifier ce texte');
  edit.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    startInlineEdit(plugin, file, host, expected, hintStart, isItem);
  });
  const b = actions.createEl('button', { cls: 'tb-del-btn', text: '✕' });
  b.setAttr('aria-label', 'Supprimer');
  b.setAttr('title', 'Supprimer ce texte');
  TBIcons.iconize(actions);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const preview = label.length > 160 ? label.slice(0, 157) + '…' : label;
    new ConfirmModal(plugin, '🗑 Supprimer ce texte ?', `« ${preview} »`, 'Supprimer', async () => {
      let ok = false;
      await plugin.app.vault.process(file, (t) => {
        const r = removeLines(t, expected, hintStart);
        if (r == null) return t;
        ok = true;
        return r;
      });
      new Notice(ok ? '🗑 Texte supprimé' : 'Le texte a changé entre-temps : rien n’a été supprimé.');
    }, true).open();
  });
}

/** Post-processeur Markdown : saisie rapide, suppression de blocs et ajout de photos dans le journal */
function journalQuickAdd(plugin, el, ctx) {
  if (!(plugin.settings.display || {}).journalQuickAdd) return;
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return;
  const ftype = String(plugin.data.fm(file).type || '').toLowerCase();
  const isJournal = ftype === 'journal';
  const isPoi = ftype === 'poi';
  const isProg = ftype === 'programme';
  const isHome = file.path === normalizePath(plugin.settings.files.home);
  const isPlanner = file.path === normalizePath(plugin.settings.files.programme);
  if (!isJournal && !isHome && !isPoi && !isProg && !isPlanner) return;
  const info = ctx.getSectionInfo && ctx.getSectionInfo(el);
  if (!info) return;
  const lines = info.text.split('\n');
  let h = -1;
  for (let i = Math.min(info.lineStart, lines.length - 1); i >= 0; i--) if (/^#{2,6}\s/.test(lines[i])) { h = i; break; }
  if (h < 0) return;
  // fiches de lieux : tout le texte se modifie ou se supprime ; la zone d'ajout reste réservée à « Mes notes »
  let poiNotes = true;
  if (isPoi) {
    let h2 = -1;
    for (let i = h; i >= 0; i--) if (/^##\s/.test(lines[i])) { h2 = i; break; }
    poiNotes = h2 >= 0 && /mes notes/i.test(lines[h2]);
  }
  // programmes : seulement la section « Notes & réservations » et ses sous-parties
  if (isProg) {
    let h2 = -1;
    for (let i = h; i >= 0; i--) if (/^##\s/.test(lines[i])) { h2 = i; break; }
    if (h2 < 0 || !/notes/i.test(lines[h2])) return;
  }
  let next = lines.length;
  for (let i = h + 1; i < lines.length; i++) if (HEADING_RE.test(lines[i])) { next = i; break; }
  let last = next - 1;
  while (last > h && lines[last].trim() === '') last--;

  /* ---- suppression : chaque bloc de texte (ou chaque élément de liste) */
  const isTable = /^\s*\|/.test(lines[info.lineStart] || '');
  if (info.lineStart > h && !isTable && !el.querySelector('[class*="block-language-tripbuddy"]')) {
    const blockLines = lines.slice(info.lineStart, info.lineEnd + 1);
    const itemIdx = blockLines.map((l, i) => (/^\s*([-*+]|\d+[.)])\s/.test(l) ? i : -1)).filter((i) => i >= 0);
    const lis = [...el.querySelectorAll('li')];
    if (itemIdx.length && lis.length === itemIdx.length) {
      // une liste : un bouton par élément (on supprime la ligne de l'élément et ses lignes de continuation)
      itemIdx.forEach((start, k) => {
        const end = (itemIdx[k + 1] != null ? itemIdx[k + 1] : blockLines.length) - 1;
        const expected = blockLines.slice(start, end + 1);
        addDeleteButton(plugin, file, lis[k], expected, info.lineStart + start, expected.join(' ').replace(/^\s*([-*+]|\d+[.)])\s/, '').trim(), true);
      });
    } else {
      const label = (el.innerText || blockLines.join(' ')).trim() || (blockLines.some((l) => /!\[\[/.test(l)) ? 'image' : 'bloc');
      addDeleteButton(plugin, file, el, blockLines, info.lineStart, label, false);
    }
  }

  if (info.lineEnd < last || !poiNotes) return; // la zone de saisie ne va que sous le dernier bloc de la section

  const headingLine = lines[h].trim();
  const label = headingLine.replace(/^#+\s*/, '');
  const box = el.createDiv('tb tb-quick-add');
  box.dataset.key = headingLine;
  const row = box.createDiv('tb-quick-row');
  const ph = isPoi ? '✍️ Ajouter une note : impression, plat goûté, prix, conseil…'
    : (isProg && /réserver/i.test(label)) ? '✍️ Ajouter une réservation : « - [ ] Table chez… »'
    : `✍️ Ajouter à « ${label} »…`;
  const ta = row.createEl('textarea', { cls: 'tb-input', attr: { rows: '1', placeholder: ph } });

  /* ---- import de photos (une ou plusieurs) */
  const photoInput = row.createEl('input', { type: 'file', attr: { accept: 'image/*', multiple: true } });
  photoInput.addClass('tb-hidden');
  const photoBtn = U.button(row, '📷', 'tb-btn-icon tb-quick-photo', () => photoInput.click(), `Ajouter une ou plusieurs photos à « ${label} »`);
  photoInput.addEventListener('change', async () => {
    const files = Array.from(photoInput.files || []);
    photoInput.value = '';
    if (!files.length) return;
    photoBtn.addClass('is-disabled');
    photoBtn.setText('⏳'); TBIcons.iconize(photoBtn);
    try {
      const date = (isJournal && plugin.data.toJournal(file).date) || U.todayISO();
      const embeds = [];
      for (const f of files) {
        const base = isJournal ? `Journal ${date}` : isPoi ? `${file.basename} ${date}` : isProg ? `${file.basename}` : `Note ${date}`;
        const img = await plugin.saveImage(f, f.name.split('.').pop(), base);
        embeds.push(`![[${img.name}]]`);
      }
      await plugin.app.vault.process(file, (t) => appendToSection(t, headingLine, embeds.join('\n')));
      new Notice(`📷 ${files.length} photo${files.length > 1 ? 's' : ''} ajoutée${files.length > 1 ? 's' : ''}`);
    } catch (e) {
      new Notice('Import impossible : ' + (e.message || e));
    } finally {
      photoBtn.removeClass('is-disabled');
      photoBtn.setText('📷'); TBIcons.iconize(photoBtn);
    }
  });

  const bar = box.createDiv('tb-quick-bar');
  bar.createSpan({ cls: 'tb-muted tb-small', text: 'Ctrl/Cmd + Entrée pour ajouter · Échap pour annuler' });
  bar.createDiv('tb-grow');
  const save = async () => {
    const v = ta.value.trim();
    if (!v) return;
    ta.disabled = true;
    try {
      await plugin.app.vault.process(file, (t) => appendToSection(t, headingLine, v));
      ta.value = '';
      box.removeClass('is-open');
    } finally { ta.disabled = false; }
  };
  U.button(bar, 'Annuler', 'tb-btn-sm', () => { ta.value = ''; box.removeClass('is-open'); ta.blur(); });
  U.button(bar, '＋ Ajouter', 'mod-cta tb-btn-sm', save);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 320) + 'px'; };
  ta.addEventListener('focus', () => box.addClass('is-open'));
  ta.addEventListener('input', grow);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
    if (e.key === 'Escape') { ta.value = ''; box.removeClass('is-open'); ta.blur(); }
    e.stopPropagation();
  });
  ta.addEventListener('blur', () => { if (!ta.value.trim()) box.removeClass('is-open'); });
  TBIcons.iconize(box);
  // une seule zone par section : on garde la plus basse (le contenu a pu bouger)
  setTimeout(() => {
    const view = box.closest('.markdown-preview-view, .markdown-rendered, .markdown-preview-sizer');
    if (!view) return;
    const same = [...view.querySelectorAll('.tb-quick-add')].filter((b) => b.dataset.key === headingLine);
    same.slice(0, -1).forEach((b) => b.remove());
  }, 60);
}

/* --------------------------------------------------------------------------
 * Valise : bouton ✕ sur chaque élément de la liste (mode lecture)
 * -------------------------------------------------------------------------- */
function packingDelete(plugin, el, ctx) {
  const file = plugin.app.vault.getAbstractFileByPath(ctx.sourcePath);
  if (!(file instanceof TFile)) return;
  const fm = plugin.data.fm(file);
  const classes = [].concat(fm.cssclasses || fm.cssclass || []).map(String);
  const isPacking = file.path === normalizePath(plugin.settings.files.packing) || classes.includes('tb-packing-page');
  if (!isPacking) return;
  const info = ctx.getSectionInfo && ctx.getSectionInfo(el);
  if (!info) return;
  const lines = info.text.split('\n').slice(info.lineStart, info.lineEnd + 1);
  const itemIdx = lines.map((l, i) => (/^\s*[-*+]\s+(\[.\]\s+)?\S/.test(l) ? i : -1)).filter((i) => i >= 0);
  const lis = [...el.querySelectorAll('li')];
  if (!itemIdx.length || lis.length !== itemIdx.length) return;
  itemIdx.forEach((start, k) => {
    const li = lis[k];
    const line = lines[start];
    const label = line.replace(/^\s*[-*+]\s+(\[.\]\s+)?/, '').trim();
    li.addClass('tb-del-host');
    const b = li.createEl('button', { cls: 'tb-del-btn', text: '✕' });
    b.setAttr('aria-label', `Retirer « ${label} »`);
    b.setAttr('title', 'Retirer de la valise');
    TBIcons.iconize(b);
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      let ok = false;
      await plugin.app.vault.process(file, (t) => {
        const r = removeLines(t, [line], info.lineStart + start);
        if (r == null) return t;
        ok = true;
        return r;
      });
      new Notice(ok ? `🗑 « ${label} » retiré de la valise` : 'La liste a changé entre-temps : rien n’a été retiré.');
    });
  });
}
