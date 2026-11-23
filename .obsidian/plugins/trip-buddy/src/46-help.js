/* ==========================================================================
 * Trip Buddy — aide visuelle
 *
 * Bouton 💡 à côté du choix du thème (accueil) ou commande « Afficher / masquer l'aide visuelle »
 * → réglage display.helpMode. Quand il est actif, de petites aides d'une ligne apparaissent à côté
 * des zones de chaque bloc ```tripbuddy-*``` : ce qui s'y règle, avec un lien direct vers la section
 * des réglages, et les options du bloc. Elles sont placées par TBRenderChild après chaque rendu :
 * aucun bloc n'a à s'en occuper.
 * ========================================================================== */

/* Sections de l'onglet de réglages : titre → identifiant (ancre de plugin.openSettings(id)) */
const SETTINGS_SECTIONS = {
  version: 'ℹ️ Version et mises à jour',
  trip: '✈️ Le voyage',
  'poi-categories': '📍 Catégories de lieux',
  'expense-categories': '💰 Catégories de dépenses',
  currencies: '💱 Devises',
  map: '🗺️ Carte',
  geocoder: '🔎 Recherche d’adresses',
  'map-links': '🧭 Itinéraire et « Ouvrir dans »',
  nav: '🧭 Menu principal',
  folders: '📂 Dossiers et pages',
  display: '🧾 Affichage des notes',
  sidebars: '↔️ Colonnes latérales',
  startup: '🏠 Démarrage',
  exports: '📤 Exports PDF',
  reset: '🧹 Préparer un nouveau voyage',
  offline: '📥 Cartes hors ligne',
  transit: '🚇 Transports en commun',
};
const SETTINGS_SECTION_IDS = Object.fromEntries(Object.entries(SETTINGS_SECTIONS).map(([id, title]) => [title, id]));

/* Aides contextuelles, par bloc (clé = nom de la classe du bloc).
 * Chaque aide est une petite ligne placée à côté de la zone qu'elle explique :
 *   at   : sélecteur CSS de la zone dans le bloc (null = le bloc lui-même)
 *   pos  : 'before' | 'after' (à côté de la zone) ou 'prepend' | 'append' (dedans)
 *   text : ce qui se règle ; links : identifiants de sections des réglages
 * Une zone absente (bloc vide, filtre…) : l'aide n'est simplement pas affichée.
 * options : options du bloc, en une ligne sous le bloc. */
const HELP_SPOTS = {
  NavBlock: {
    spots: [
      { at: null, pos: 'after', text: 'Menu : ordre des rubriques, rubriques masquées, page ouverte par chacune', links: ['nav', 'folders'], toggle: true },
    ],
  },
  DashboardBlock: {
    spots: [
      { at: '.tb-hero', pos: 'after', text: 'En-tête : nom, destination, dates, voyageurs ; le dégradé reprend les couleurs de l’emoji du voyage', links: ['trip'] },
      { at: '.tb-hero', pos: 'after', text: 'Thème 🎨 / 🌙, pictogrammes et largeur des pages ; accueil ouvert au démarrage', links: ['display', 'startup'] },
      { at: '.tb-tiles', pos: 'after', text: 'Tuiles : chacune ouvre la page de sa rubrique', links: ['folders'] },
      { at: '.tb-dash-day', pos: 'before', text: 'Journée du jour : les journées suivent les dates du voyage', links: ['trip'] },
      { at: '.tb-dash-map', pos: 'before', text: 'Carte : fond, centre et zoom, traces GPX, cartes hors ligne, transports en commun', links: ['map', 'offline', 'transit'] },
    ],
    options: [['height', 'hauteur de la carte (340 par défaut)']],
  },
  MapBlock: {
    spots: [
      { at: '.tb-map', pos: 'before', text: 'Fond de carte, traces GPX ; carte utilisable sans connexion ; lignes de métro et de tram', links: ['map', 'offline', 'transit'] },
      { at: '.tb-map', pos: 'after', text: 'Pastilles : emoji et couleur des catégories ; boutons « Itinéraire » et « Ouvrir dans »', links: ['poi-categories', 'map-links'] },
    ],
    options: [['height', 'hauteur'], ['category', 'une catégorie'], ['status', 'todo / done'], ['programme', 'étapes d’une date'], ['tracks: false', 'sans traces GPX'], ['transit: false', 'sans transports']],
  },
  PoiListBlock: {
    spots: [
      { at: '.tb-section-head', pos: 'after', text: 'Catégories : créer, renommer, réordonner, emoji et couleur', links: ['poi-categories'] },
      { at: '.tb-toolbar', pos: 'before', text: 'Ajout d’un lieu : langue et pays de la recherche d’adresses ; dossier et modèle des fiches', links: ['geocoder', 'folders'] },
    ],
    options: [['category', 'une catégorie'], ['status', 'todo / done']],
  },
  PoiCardBlock: {
    spots: [
      { at: '.tb-poicard-hero', pos: 'after', text: 'Catégorie : liste et couleurs des catégories de lieux', links: ['poi-categories'] },
      { at: '.tb-actions', pos: 'after', text: 'Boutons « Itinéraire » et « Ouvrir dans » ; recherche d’adresse de « Modifier »', links: ['map-links', 'geocoder'] },
      { at: '.tb-poicard-map', pos: 'before', text: 'Mini-carte : fond de carte', links: ['map'] },
      { at: null, pos: 'append', text: '« Mes notes » : saisie rapide en mode lecture', links: ['display'] },
    ],
    options: [['poi', 'lien vers une autre fiche'], ['map: false', 'sans mini-carte'], ['track: false', 'sans trace'], ['height', 'hauteur de la carte']],
  },
  PlannerBlock: {
    spots: [
      { at: '.tb-daystrip', pos: 'after', text: 'Journées : dates du voyage ; dossier et modèle des programmes', links: ['trip', 'folders'] },
    ],
  },
  ProgrammeBlock: {
    spots: [
      { at: '.tb-prog-head', pos: 'after', text: 'Itinéraire entre les étapes ; fond de carte et transports en commun', links: ['map-links', 'map', 'transit'] },
    ],
    options: [['date', 'journée affichée (AAAA-MM-JJ)']],
  },
  BudgetBlock: {
    spots: [
      { at: '.tb-kpis', pos: 'after', text: 'Budget total, devise principale et voyageurs (« Payé par »)', links: ['trip'] },
      { at: '.tb-catrows', pos: 'before', text: 'Catégories de dépenses et budget prévu pour chacune', links: ['expense-categories'] },
      { at: '.tb-exp-list', pos: 'before', text: 'Dépenses en devise étrangère : taux de conversion', links: ['currencies'] },
    ],
    options: [['recent', 'nombre de dernières dépenses (8 par défaut)']],
  },
  PackingBlock: {
    spots: [
      { at: '.tb-packing-head', pos: 'after', text: 'Liste Markdown « ## Catégorie » puis « - [ ] élément » ; valises types dans le dossier des modèles', links: ['folders'] },
    ],
    options: [['file', 'autre liste de bagages']],
  },
  JournalIndexBlock: {
    spots: [
      { at: '.tb-budget-head', pos: 'after', text: 'Carnet souvenir imprimable et export du voyage en PDF', links: ['exports'] },
      { at: '.tb-timeline', pos: 'before', text: 'Dossier et modèle des journées ; saisie rapide sous chaque section', links: ['folders', 'display'] },
    ],
  },
  JournalDayBlock: {
    spots: [
      { at: '.tb-jday-card', pos: 'after', text: 'Saisie rapide sous chaque section (mode lecture) ; modèle de journée', links: ['display', 'folders'] },
    ],
  },
  DocumentsBlock: {
    spots: [
      { at: '.tb-toolbar', pos: 'before', text: 'Dossier des documents ; dossier où vont les images collées', links: ['folders', 'display'] },
    ],
    options: [['folder', 'sous-dossier affiché']],
  },
  GuideBlock: {
    spots: [
      { at: null, pos: 'prepend', text: 'Dossier du guide ; le skill IA travel-planner rédige les pages à partir de CONTEXT.md', links: ['folders', 'reset'] },
    ],
    options: [['mode: pager', 'barre de pages en tête de chaque page du guide']],
  },
};

const TBHelp = {
  enabled(plugin) { return !!(plugin.settings.display && plugin.settings.display.helpMode); },

  async toggle(plugin, on) {
    const d = plugin.settings.display;
    d.helpMode = on === undefined ? !d.helpMode : !!on;
    await plugin.saveSettings();
    new Notice(d.helpMode ? '💡 Aide visuelle activée : de petites aides expliquent chaque zone et mènent aux réglages.' : '💡 Aide visuelle masquée.');
  },

  /** Place (ou retire) les aides contextuelles d'un bloc rendu par TBRenderChild */
  attach(child) {
    const host = child.containerEl;
    if (!host) return;
    host.querySelectorAll('.tb-hint').forEach((el) => el.remove());
    const topic = child.block && HELP_SPOTS[child.Klass.name];
    if (!topic || !TBHelp.enabled(child.plugin)) return;
    const root = child.block.root;
    if (!root) return;
    const plugin = child.plugin;
    // plusieurs aides au même endroit : dans l'ordre de la liste
    const lastAfter = new Map();
    (topic.spots || []).forEach((spot) => {
      let target = spot.at ? root.querySelector(spot.at) : root;
      if (!target) return;
      if (spot.pos === 'before' || spot.pos === 'after') target = TBHelp.outsideRow(target, root);
      const hint = TBHelp.hint(spot, plugin);
      if (spot.pos === 'before') target.before(hint);
      else if (spot.pos === 'prepend') target.prepend(hint);
      else if (spot.pos === 'append') target.append(hint);
      else {
        const prev = lastAfter.get(target);
        (prev || target).after(hint);
        lastAfter.set(target, hint);
      }
    });
    if (topic.options && topic.options.length) {
      const opt = createDiv({ cls: 'tb tb-hint tb-hint-options' });
      opt.createSpan({ cls: 'tb-hint-ico', text: '💡' });
      const t = opt.createSpan('tb-hint-text');
      t.appendText('Options du bloc, à écrire dans le code de la note : ');
      topic.options.forEach(([k, v], i) => {
        if (i) t.appendText(' · ');
        t.createEl('code', { text: k });
        t.appendText(` ${v}`);
      });
      root.after(opt);
    }
  },

  /** Une aide posée à côté d'un élément rangé dans une ligne (flex) ou une grille deviendrait un élément
   *  de cette ligne et casserait la mise en page : on remonte jusqu'à un conteneur empilé verticalement. */
  outsideRow(el, root) {
    let t = el;
    while (t !== root && t.parentElement && t.parentElement !== root.parentElement) {
      const p = t.parentElement;
      const cs = (p.ownerDocument.defaultView || window).getComputedStyle(p);
      const row = cs.display.includes('grid') || (cs.display.includes('flex') && !String(cs.flexDirection).startsWith('column'));
      if (!row) break;
      t = p;
    }
    return t;
  },

  hint(spot, plugin) {
    const el = createDiv({ cls: 'tb tb-hint' });
    el.createSpan({ cls: 'tb-hint-ico', text: '💡' });
    el.createSpan({ cls: 'tb-hint-text', text: spot.text });
    const links = el.createSpan('tb-hint-links');
    (spot.links || []).forEach((id) => {
      const a = links.createEl('a', { cls: 'tb-hint-go', text: `${SETTINGS_SECTIONS[id] || '⚙️ Réglages'} →`, href: '#' });
      a.setAttr('title', 'Ouvrir cette section des réglages');
      a.addEventListener('click', (e) => { e.preventDefault(); plugin.openSettings(id); });
    });
    if (spot.toggle) {
      const off = el.createEl('a', { cls: 'tb-hint-off', text: 'Masquer l’aide', href: '#' });
      off.setAttr('title', 'Désactiver l’aide visuelle (bouton 💡 de l’accueil pour la réafficher)');
      off.addEventListener('click', (e) => { e.preventDefault(); TBHelp.toggle(plugin, false); });
    }
    return el;
  },
};
