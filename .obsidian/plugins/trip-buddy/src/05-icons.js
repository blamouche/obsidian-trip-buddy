/* ==========================================================================
 * Trip Buddy — pictogrammes au trait (Lucide, fournis par Obsidian)
 * Les libellés de l'interface gardent leurs emoji dans le code ; en mode « traits »,
 * ils sont remplacés à l'affichage par des icônes SVG fines et monochromes.
 * ========================================================================== */
const ICONS = {
  /* navigation / modules */
  '🏠': 'house|home', '🗓️': 'calendar-days', '🗺️': 'map', '📍': 'map-pin', '📔': 'book-open', '💰': 'wallet',
  '🎒': 'backpack|briefcase', '📁': 'folder', '📂': 'folder-open', '⚙️': 'settings',
  /* actions */
  '✏️': 'pencil', '📅': 'calendar-plus', '🧭': 'navigation', '🌍': 'globe', '🌐': 'globe', '🔎': 'search', '🔍': 'search',
  '📋': 'clipboard-list|clipboard', '🗑️': 'trash-2', '🗑': 'trash-2', '📷': 'camera', '📸': 'camera', '✍️': 'pen-line|pencil',
  '💸': 'receipt', '🧾': 'receipt', '⛶': 'maximize', '✨': 'sparkles', '🔁': 'repeat', '📄': 'file-text', '📃': 'file',
  '📝': 'notebook-pen|file-pen-line|pencil', '📎': 'paperclip', '📌': 'map-pin-plus|map-pin', '＋': 'plus', '↺': 'rotate-ccw',
  '🐙': 'github|git-branch', '🏷️': 'tag', '🆕': 'sparkles',
  '🙈': 'eye-off', '👁': 'eye', '⬆️': 'upload', '📥': 'cloud-download|download-cloud|download', '💾': 'save', '🎉': 'party-popper|sparkles', '⏳': 'hourglass|loader',
  '⚠️': 'triangle-alert|alert-triangle', '⚠︎': 'triangle-alert|alert-triangle', '💡': 'lightbulb', '📖': 'book-open',
  '⏱️': 'clock', '🎟️': 'ticket', '🚗': 'car', '🧳': 'luggage|briefcase', '✅': 'circle-check|check-circle-2',
  '🎨': 'palette', '🌙': 'moon', '📓': 'notebook|book', '🖋️': 'pen-tool', '😀': 'smile', '↔️': 'move-horizontal',
  '🧹': 'eraser|trash', '📊': 'bar-chart-3', '🎬': 'film', '🎫': 'ticket', '🗂️': 'folders|folder',
  '🔌': 'plug', '💊': 'pill', '🧴': 'droplets', '👕': 'shirt', '🎵': 'disc-3|music', '🎶': 'music',
  /* déplacements */
  '🚶': 'footprints', '🚄': 'train-front|train', '🚆': 'train-front|train', '🚉': 'train-front|train', '🚇': 'tram-front|train',
  '🚋': 'tram-front|train', '🚌': 'bus', '✈️': 'plane', '🛫': 'plane-takeoff|plane', '🛬': 'plane-landing|plane', '🚕': 'car-taxi-front|car',
  '🚲': 'bike', '🚢': 'ship', '⛴️': 'ship', '🚡': 'cable-car|mountain', '🚠': 'cable-car|mountain',
  /* catégories de lieux */
  '🏛️': 'landmark', '🖼️': 'frame|image', '🌅': 'sunset', '🍽️': 'utensils', '☕': 'coffee', '🍺': 'beer', '🍻': 'beer',
  '🌳': 'trees', '🌴': 'palmtree|trees', '🏖️': 'umbrella', '🧺': 'shopping-basket', '🛍️': 'shopping-bag', '🏘️': 'building-2',
  '🛏️': 'bed-double|bed', '🏨': 'hotel|building', '📦': 'package', '🍢': 'utensils-crossed|utensils', '🍷': 'wine', '🥐': 'croissant|coffee',
  '🏰': 'castle', '⛪': 'church', '🎭': 'drama|theater', '🏔️': 'mountain-snow|mountain', '⛰️': 'mountain', '🌊': 'waves',
  /* météo */
  '☀️': 'sun', '🌤️': 'cloud-sun', '⛅': 'cloud-sun', '🌥️': 'cloud', '☁️': 'cloud', '🌦️': 'cloud-sun-rain|cloud-rain',
  '🌧️': 'cloud-rain', '⛈️': 'cloud-lightning', '🌩️': 'cloud-lightning', '❄️': 'snowflake', '🌨️': 'cloud-snow',
  '🌫️': 'cloud-fog', '💨': 'wind', '🌬️': 'wind', '🌈': 'rainbow',
  /* humeurs */
  '😞': 'frown', '🙁': 'annoyed|frown', '😐': 'meh', '🙂': 'smile', '😄': 'laugh|smile',
  /* flèches & divers */
  '◀': 'chevron-left', '▶': 'chevron-right', '↑': 'arrow-up', '↓': 'arrow-down', '⋮⋮': 'grip-vertical', '◎': 'locate',
  '⤢': 'scan|maximize-2', '✕': 'x', '🖨️': 'printer', '🗽': 'landmark', '🎁': 'gift', '❤️': 'heart', '⭐': 'star', '🏁': 'flag',
  '📚': 'book-marked|book-open', '🗣️': 'languages|message-circle', '💶': 'banknote|coins', '🛡️': 'shield-check|shield',
  '🥾': 'footprints', '📏': 'ruler', '↗️': 'trending-up|arrow-up-right', '↘️': 'trending-down|arrow-down-right', '🛤️': 'route|map',
  /* titres des pages du coffre */
  '💭': 'message-circle', '💬': 'message-square', '🚀': 'rocket', '🧩': 'puzzle', '🔗': 'link', '☎️': 'phone', '📞': 'phone',
  '🛂': 'id-card|contact', '🔑': 'key-round|key', '💳': 'credit-card', '🏥': 'hospital|cross', '🌡️': 'thermometer',
  '🍴': 'utensils', '🗒️': 'notepad-text|file-text', '❓': 'circle-help|help-circle', 'ℹ️': 'info', '📆': 'calendar',
  /* guide : histoire, fêtes, événements, électronique */
  '📜': 'scroll-text|scroll', '🕰️': 'history|clock', '👤': 'user', '👥': 'users', '🏗️': 'construction', '⚡': 'zap',
  '📱': 'smartphone', '🔋': 'battery-charging|battery', '💻': 'laptop', '📶': 'wifi', '🎄': 'tree-pine', '🎆': 'sparkles',
  '🎇': 'sparkles', '⚽': 'trophy', '🏟️': 'trophy', '🏆': 'trophy', '🏀': 'trophy', '🏃': 'footprints', '🚴': 'bike',
  '🎤': 'mic-vocal|mic', '🎸': 'guitar|music', '🎻': 'music', '🎷': 'music', '🎹': 'piano|music', '🎪': 'tent',
  '💃': 'music', '🎞️': 'film', '🛒': 'shopping-cart', '🥘': 'cooking-pot|utensils', '⏰': 'alarm-clock|clock',
  '🎧': 'headphones', '🔜': 'circle-arrow-right|arrow-right-circle', '👜': 'handbag|shopping-bag', '🚑': 'ambulance|siren', '🔤': 'type|a-large-small', '👋': 'hand',
  '🌹': 'flower-2|flower', '🕯️': 'flame', '🔥': 'flame', '🏮': 'lamp', '🎃': 'sparkles', '🌰': 'nut|leaf',
  /* réglages, statuts, documents */
  '📤': 'file-output|share', '💱': 'arrow-right-left|repeat', '⬜': 'circle', '🟡': 'circle-dashed|circle',
  '🗜️': 'file-archive|archive', '🤿': 'waves',
};

/** Variante sans sélecteur de variation (U+FE0F) pour chaque clé */
for (const k of Object.keys(ICONS)) {
  const bare = k.replace(/️/g, '');
  if (bare && !ICONS[bare]) ICONS[bare] = ICONS[k];
}
const ICON_KEYS = Object.keys(ICONS).sort((a, b) => b.length - a.length);
const ICON_RE = new RegExp('(' + ICON_KEYS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')️?[  ]?', 'g');

const TBIcons = {
  style: 'line',
  cache: new Map(),

  enabled() { return TBIcons.style !== 'emoji'; },

  /** SVG Lucide pour un nom (avec noms de repli « a|b|c ») ; null si introuvable */
  svg(names) {
    if (!names || typeof obsidian.getIcon !== 'function') return null;
    if (TBIcons.cache.has(names)) {
      const c = TBIcons.cache.get(names);
      return c ? c.cloneNode(true) : null;
    }
    let found = null;
    for (const n of String(names).split('|')) {
      try { found = obsidian.getIcon(n); } catch (e) { found = null; }
      if (found) break;
    }
    TBIcons.cache.set(names, found ? found.cloneNode(true) : null);
    return found;
  },

  /** Nom d'icône pour un emoji (ou null) */
  nameFor(emoji) {
    if (!emoji) return null;
    return ICONS[emoji] || ICONS[String(emoji).replace(/️/g, '')] || null;
  },

  /** Élément <span class="tb-ico"> avec l'icône (ou null) */
  el(names) {
    const s = TBIcons.svg(names);
    if (!s) return null;
    const span = document.createElement('span');
    span.className = 'tb-ico';
    span.appendChild(s);
    return span;
  },

  /** HTML d'une icône pour un emoji (repères Leaflet) ; renvoie l'emoji échappé sinon */
  html(emoji) {
    if (TBIcons.enabled()) {
      const s = TBIcons.svg(TBIcons.nameFor(emoji));
      if (s) return `<span class="tb-ico">${s.outerHTML}</span>`;
    }
    return U.esc(emoji);
  },

  /** Remplace, sous `root`, les emoji connus des textes de l'interface par des icônes.
   *  opts.skip : sélecteur supplémentaire à ignorer ; opts.keep : emoji à laisser tels quels */
  iconize(root, opts) {
    if (!root || !TBIcons.enabled()) return;
    const skip = '.tb-ico, textarea, input, script, style, .tb-no-ico, .markdown-rendered .tb-sec-raw' + (opts && opts.skip ? ', ' + opts.skip : '');
    const keep = (opts && opts.keep) || null;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest(skip)) return NodeFilter.FILTER_REJECT;
        ICON_RE.lastIndex = 0;
        return ICON_RE.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const parent = n.parentElement;
      // <option> ne peut pas contenir de SVG : on retire simplement l'emoji
      if (parent && parent.tagName === 'OPTION') {
        ICON_RE.lastIndex = 0;
        n.nodeValue = n.nodeValue.replace(ICON_RE, '').trim();
        continue;
      }
      const text = n.nodeValue;
      const frag = document.createDocumentFragment();
      let last = 0;
      ICON_RE.lastIndex = 0;
      let m;
      while ((m = ICON_RE.exec(text))) {
        if (keep && keep.includes(m[1])) continue;
        const icon = TBIcons.el(TBIcons.nameFor(m[1]));
        if (!icon) continue;
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        // l'icône seule (sans texte qui suit) n'a pas besoin d'espacement
        if (m.index + m[0].length >= text.length && last === m.index && !text.slice(0, m.index).trim()) icon.addClass('is-solo');
        frag.appendChild(icon);
        last = m.index + m[0].length;
      }
      if (last === 0) continue;
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      n.replaceWith(frag);
    }
    // placeholders des champs : on retire l'emoji
    root.querySelectorAll && root.querySelectorAll('input[placeholder], textarea[placeholder]').forEach((i) => {
      ICON_RE.lastIndex = 0;
      const ph = i.getAttribute('placeholder');
      if (ICON_RE.test(ph)) { ICON_RE.lastIndex = 0; i.setAttribute('placeholder', ph.replace(ICON_RE, '').trim()); }
    });
  },

  /** Contenu Markdown des pages (mode lecture) : titres, listes, tableaux, encadrés.
   *  Le code et les flèches typographiques du texte courant restent intacts. */
  iconizeMarkdown(el) {
    if (!el || !TBIcons.enabled()) return;
    TBIcons.iconize(el, { skip: 'pre, code, .tb-host, .frontmatter, .metadata-container', keep: ['↔', '↑', '↓', '◀', '▶', '✕'] });
    el.querySelectorAll('.tb-ico').forEach((i) => { if (!i.closest('.tb-host')) i.addClass('tb-md-ico'); });
  },

  /** Surveille un conteneur : toute partie redessinée est convertie à son tour */
  watch(root) {
    if (!root || typeof MutationObserver === 'undefined') return null;
    TBIcons.iconize(root);
    let pending = false;
    const mo = new MutationObserver(() => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => { pending = false; TBIcons.iconize(root); });
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    return mo;
  },
};
