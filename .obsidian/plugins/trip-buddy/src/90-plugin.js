/* ==========================================================================
 * Trip Buddy — plugin principal
 * ========================================================================== */
const BUILTIN_TEMPLATES = {
  poi: `---
type: poi
name: "{{name}}"
category: {{category}}
address: "{{address}}"
lat: {{lat}}
lon: {{lon}}
done: false
rating: {{rating}}
tags:
  - poi
---
\`\`\`tripbuddy-nav
\`\`\`
\`\`\`tripbuddy-poi
\`\`\`

## 📖 Présentation
{{description}}

## 💡 Infos pratiques
- **Horaires** :
- **Tarif** :
- **Site web** :

## 📝 Mes notes
`,
  journal: `---
type: journal
date: {{date}}
title: ""
location: ""
weather: "☀️ "
mood: 4
cover:
cssclasses:
  - tb-page
---
\`\`\`tripbuddy-nav
\`\`\`
\`\`\`tripbuddy-journal-day
\`\`\`

## ☀️ Résumé de la journée

## 📍 Ce qu’on a fait

## 🍽️ Où on a mangé

## 💭 Ressentis & anecdotes

## 📸 Photos
`,
  programme: `---
type: programme
date: {{date}}
title: ""
pois: []
cssclasses:
  - tb-page
  - tb-wide
---
\`\`\`tripbuddy-nav
\`\`\`
\`\`\`tripbuddy-program
\`\`\`

## 📝 Notes & réservations
-
`,
};

const CODE_BLOCKS = {
  'tripbuddy-dashboard': DashboardBlock,
  'tripbuddy-nav': NavBlock,
  'tripbuddy-map': MapBlock,
  'tripbuddy-poi': PoiCardBlock,
  'tripbuddy-pois': PoiListBlock,
  'tripbuddy-program': ProgrammeBlock,
  'tripbuddy-planner': PlannerBlock,
  'tripbuddy-budget': BudgetBlock,
  'tripbuddy-packing': PackingBlock,
  'tripbuddy-journal': JournalIndexBlock,
  'tripbuddy-journal-day': JournalDayBlock,
  'tripbuddy-documents': DocumentsBlock,
  'tripbuddy-guide': GuideBlock,
};

class TripBuddyPlugin extends Plugin {
  async onload() {
    await this.syncManifest();
    await this.loadSettings();
    this.data = new TripData(this);
    TBOffline.init(this);
    TBHiddenFiles.init(this);
    this.refreshAll = debounce(() => this.app.workspace.trigger(EVT_REFRESH), 250, true);

    this.registerView(VIEW_TYPE_MAP, (leaf) => new MapView(leaf, this));

    for (const [lang, Klass] of Object.entries(CODE_BLOCKS)) {
      this.registerMarkdownCodeBlockProcessor(lang, (source, el, ctx) => {
        el.addClass('tb-host');
        ctx.addChild(new TBRenderChild(this, el, ctx, source, Klass));
      });
    }

    this.registerMarkdownPostProcessor((el, ctx) => journalQuickAdd(this, el, ctx));
    this.registerMarkdownPostProcessor((el, ctx) => packingDelete(this, el, ctx));
    // emoji des pages → pictogrammes au trait (selon Réglages → Affichage → style d'icônes)
    this.registerMarkdownPostProcessor((el) => TBIcons.iconizeMarkdown(el));

    this.addRibbonIcon('map', 'Trip Buddy : carte du voyage', () => this.openMapView());
    this.addRibbonIcon('plane', 'Trip Buddy : accueil du voyage', () => this.openPath(this.settings.files.home));

    const cmd = (id, name, cb) => this.addCommand({ id, name, callback: cb });
    cmd('open-home', 'Ouvrir l’accueil du voyage', () => this.openPath(this.settings.files.home));
    cmd('open-map', 'Ouvrir la carte du voyage', () => this.openMapView());
    cmd('open-programme', 'Ouvrir le programme', () => this.openPath(this.settings.files.programme));
    cmd('new-poi', 'Nouveau point d’intérêt (POI)', () => new PoiCreateModal(this).open());
    cmd('import-gpx', 'Importer une trace GPX (nouveau lieu)', () => this.pickGpx());
    cmd('new-expense', 'Nouvelle dépense', () => new ExpenseModal(this).open());
    cmd('journal-today', 'Journal du jour', () => this.openJournal(this.data.currentDay()));
    cmd('programme-today', 'Programme du jour', async () => {
      const d = this.data.currentDay();
      const p = this.data.programmeFor(d);
      if (p) this.openFile(p.file); else await this.createProgramme(d, { open: true });
    });
    cmd('booklet', 'Générer le carnet souvenir (PDF imprimable, livret A6)', () => new BookletModal(this).open());
    cmd('export-vault-pdf', 'Exporter le voyage en PDF', () => new VaultExportModal(this).open());
    cmd('guide-create', 'Créer les pages du guide de voyage', async () => {
      const n = await this.ensureGuidePages();
      new Notice(n ? `📚 ${n} page(s) ajoutée(s) au guide` : '📚 Le guide est déjà complet');
      this.openPath(this.settings.files.guide);
    });
    cmd('reset-trip', 'Vider les données d’exemple (nouveau voyage)', () => this.confirmReset());

    this.settingTab = new TripBuddySettingTab(this.app, this);
    this.addSettingTab(this.settingTab);
    // réglages modifiés directement dans trip-buddy.json (agent, éditeur, synchronisation)
    const watchSettings = debounce(() => this.onSettingsFileChanged(), 300, true);
    const onFile = (f) => { if (f && f.path === SETTINGS_FILE) watchSettings(); };
    this.registerEvent(this.app.vault.on('modify', onFile));
    this.registerEvent(this.app.vault.on('create', onFile));
    this.applyDisplay();
    this.addCommand({
      id: 'cycle-theme',
      name: 'Changer de thème (défaut ↔ sombre)',
      callback: async () => {
        const order = ['default', 'dark'];
        const d = this.settings.display;
        d.theme = order[(order.indexOf(d.theme || 'default') + 1) % order.length];
        await this.saveSettings();
        new Notice({ default: '🎨 Thème par défaut', dark: '🌙 Thème sombre' }[d.theme]);
      },
    });
    this.addCommand({
      id: 'toggle-properties',
      name: 'Afficher / masquer les propriétés des notes',
      callback: async () => {
        this.settings.display.hideProperties = !this.settings.display.hideProperties;
        this.applyDisplay();
        await this.saveSettings();
        new Notice(this.settings.display.hideProperties ? '🙈 Propriétés masquées' : '👁 Propriétés affichées');
      },
    });

    this.app.workspace.onLayoutReady(() => {
      if (this.settings.openHomeOnStartup) this.openHomeOnStartup();
      // rouvre l'accueil quand le dernier onglet est fermé
      const check = debounce(() => this.openHomeIfEmpty(), 200, true);
      this.registerEvent(this.app.workspace.on('layout-change', check));
      this.applyVaultConfig();
      TBHiddenFiles.sync();
      this.applyLayout();
      const relayout = debounce(() => this.applyLayout(), 50, true);
      this.registerEvent(this.app.workspace.on('layout-change', relayout));
      this.registerEvent(this.app.workspace.on('active-leaf-change', relayout));
      this.registerEvent(this.app.workspace.on('file-open', relayout));
      // repli automatique des colonnes latérales
      this.sidebarAutoHide = new SidebarAutoHide(this);
      this.sidebarAutoHide.start();
    });
  }

  onunload() {
    TBOffline.cancel();
    TBHiddenFiles.unload();
    document.body.removeClass('tb-icons-line', 'tb-hide-properties', 'tb-hide-inline-title', 'tb-theme-dark');
    this.app.workspace.iterateAllLeaves((leaf) => {
      const c = leaf.view && leaf.view.containerEl;
      if (c) c.removeClass('tb-trip-view', 'tb-w-normal', 'tb-w-wide', 'tb-w-full', 'tb-th-dark');
    });
  }

  /**
   * Réapplique les réglages Obsidian gérés par le module (mode d'ouverture, dossier des
   * pièces jointes). Utile quand la configuration du coffre est réinitialisée (synchro…).
   */
  async applyVaultConfig() {
    const v = this.app.vault;
    if (typeof v.getConfig !== 'function' || typeof v.setConfig !== 'function') return;
    const d = this.settings.display || {};
    const want = { defaultViewMode: d.readingMode ? 'preview' : 'source' };
    const folder = normalizePath((d.attachmentFolder || '').trim());
    if (folder) {
      await this.ensureFolder(folder);
      want.attachmentFolderPath = folder;
    }
    for (const [key, val] of Object.entries(want)) {
      try { if (v.getConfig(key) !== val) v.setConfig(key, val); } catch (e) { console.error('[Trip Buddy]', key, e); }
    }
  }

  /** Générateur du carnet imprimable (utilisé par la fenêtre « Carnet PDF ») */
  bookletBuilder(opts) { return new BookletBuilder(this, opts); }

  /** Rubriques du menu principal, dans l'ordre choisi dans les réglages (les rubriques absentes suivent, dans l'ordre par défaut).
   *  Les rubriques masquées (navHidden) sont retirées, sauf avec { all: true } (éditeur des réglages). */
  navItems(opts) {
    const order = Array.isArray(this.settings.navOrder) ? this.settings.navOrder : [];
    const byKey = new Map(NAV_ITEMS.map((it) => [it[0], it]));
    const out = [];
    order.forEach((k) => { if (byKey.has(k)) { out.push(byKey.get(k)); byKey.delete(k); } });
    byKey.forEach((it) => out.push(it));
    if (opts && opts.all) return out;
    const hidden = this.navHidden();
    return out.filter((it) => !hidden.has(it[0]));
  }

  /** Clés des rubriques masquées du menu principal */
  navHidden() {
    return new Set(Array.isArray(this.settings.navHidden) ? this.settings.navHidden : []);
  }

  /** Rubrique du menu correspondant à une note (pour la mettre en évidence) */
  navKey(file) {
    if (!file) return null;
    const files = this.settings.files;
    for (const [k, p] of Object.entries(files)) if (normalizePath(p || '') === file.path) return k;
    const t = String(this.data.fm(file).type || '').toLowerCase();
    if (t === 'poi') return 'pois';
    if (t === 'journal') return 'journal';
    if (t === 'programme') return 'programme';
    if (t === 'guide') return 'guide';
    const docs = normalizePath(this.settings.folders.documents || '');
    if (docs && file.path.startsWith(docs + '/')) return 'documents';
    return null;
  }

  /** La note fait-elle partie du voyage (largeur homogène, menu) ? */
  isTripPage(file) {
    if (!file || file.extension !== 'md' || this.data.isTemplate(file)) return false;
    return !!this.navKey(file);
  }

  /** Largeur homogène des pages du voyage : classe posée sur l'onglet (lecture + édition) */
  applyLayout() {
    const w = (this.settings.display && this.settings.display.pageWidth) || 'wide';
    const theme = (this.settings.display && this.settings.display.theme) || 'default';
    const ws = this.app.workspace;
    if (typeof ws.iterateAllLeaves !== 'function') return;
    ws.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      if (!v || typeof v.getViewType !== 'function' || v.getViewType() !== 'markdown') return;
      const trip = this.isTripPage(v.file);
      const c = v.containerEl;
      c.toggleClass('tb-trip-view', trip);
      ['normal', 'wide', 'full'].forEach((x) => c.toggleClass('tb-w-' + x, trip && w === x));
      c.toggleClass('tb-th-dark', trip && theme === 'dark');
    });
  }

  /** Redessine les pages ouvertes (après un changement de style de pictogrammes) */
  rerenderViews() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const v = leaf.view;
      try { if (v && v.previewMode && v.previewMode.rerender) v.previewMode.rerender(true); } catch (e) { /* */ }
    });
  }

  /** Applique les options d'affichage (indépendantes de la configuration d'Obsidian) */
  applyDisplay() {
    const d = this.settings.display || {};
    document.body.toggleClass('tb-hide-properties', !!d.hideProperties);
    document.body.toggleClass('tb-hide-inline-title', !!d.hideInlineTitle);
    TBIcons.style = d.iconStyle || 'line';
    document.body.toggleClass('tb-icons-line', TBIcons.enabled());
    document.body.toggleClass('tb-theme-dark', d.theme === 'dark');
  }

  /* ------------------------------------------------------------ réglages */
  /** Réglages par défaut complétés par ceux enregistrés */
  mergeSettings(saved) {
    const out = U.deepMerge(JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), saved || {});
    delete out._info;
    // thème retiré (Moleskine) : retour au thème par défaut
    if (!['default', 'dark'].includes(out.display.theme)) out.display.theme = 'default';
    return out;
  }

  /** Lit trip-buddy.json ; renvoie { data } ou { error } (fichier absent : { missing: true }). */
  async readSettingsFile() {
    const adapter = this.app.vault.adapter;
    try {
      if (!(await adapter.exists(SETTINGS_FILE))) return { missing: true };
      const text = await adapter.read(SETTINGS_FILE);
      const data = JSON.parse(text);
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('un objet JSON est attendu');
      return { data, text };
    } catch (e) {
      return { error: e };
    }
  }

  async loadSettings() {
    const res = await this.readSettingsFile();
    if (res.data) {
      this.settings = this.mergeSettings(res.data);
      this.settingsText = res.text;
      return;
    }
    // premier lancement (ou fichier illisible) : réglages de data.json, la copie de secours
    this.settings = this.mergeSettings(await this.loadData());
    if (res.error) {
      console.error(`[Trip Buddy] ${SETTINGS_FILE}`, res.error);
      new Notice(`⚠️ Trip Buddy : ${SETTINGS_FILE} est illisible (${res.error.message}). Dernière copie valide utilisée ; corrigez le fichier, il sera rechargé.`, 15000);
    } else {
      await this.persistSettings();
    }
  }

  /** Écrit les réglages dans trip-buddy.json (et la copie de secours data.json), sans rafraîchir l'affichage. */
  async persistSettings() {
    const text = JSON.stringify({ _info: SETTINGS_INFO, ...this.settings }, null, 2) + '\n';
    this.settingsText = text;
    try { await this.app.vault.adapter.write(SETTINGS_FILE, text); } catch (e) { console.error(`[Trip Buddy] ${SETTINGS_FILE}`, e); }
    await this.saveData(this.settings);
  }

  async saveSettings() {
    await this.persistSettings();
    this.applySettings();
  }

  /** Applique les réglages courants partout (affichage, configuration du coffre, cartes, pages) */
  applySettings() {
    this.applyDisplay();
    this.applyLayout();
    if (this.app.workspace.layoutReady) this.applyVaultConfig();
    TripMap.refreshTransit();
    this.refreshAll();
  }

  /** trip-buddy.json modifié hors du module (agent, éditeur, synchronisation) : recharge les réglages. */
  async onSettingsFileChanged() {
    const res = await this.readSettingsFile();
    if (res.missing || (res.text != null && res.text === this.settingsText)) return;
    if (res.error) {
      if (this.settingsErrorShown !== res.error.message) {
        this.settingsErrorShown = res.error.message;
        new Notice(`⚠️ Trip Buddy : ${SETTINGS_FILE} contient une erreur (${res.error.message}). Les réglages actuels sont conservés.`, 15000);
      }
      return;
    }
    this.settingsErrorShown = null;
    this.settingsText = res.text;
    const merged = this.mergeSettings(res.data);
    // même objet : les vues et modales qui le référencent voient les nouvelles valeurs
    Object.keys(this.settings).forEach((k) => delete this.settings[k]);
    Object.assign(this.settings, merged);
    await this.saveData(this.settings);
    this.applySettings();
    const tab = this.settingTab;
    if (tab && this.app.setting && this.app.setting.activeTab === tab) tab.display();
    new Notice('⚙️ Réglages Trip Buddy rechargés');
  }

  /** Dernière version publiée sur GitHub (releases/latest, pré-versions exclues), mise en cache 6 h.
   *  Renvoie { ok, current, latest, newer, url, download, date } ou { ok: false, error, current }.
   *  Seul appel : api.github.com, sans aucune donnée du voyage. */
  async checkUpdate(force) {
    const now = Date.now();
    if (!force && this.updateInfo && now - this.updateInfo.at < 6 * 3600e3) return this.updateInfo;
    const current = this.manifest.version;
    let res;
    try {
      const r = await requestUrl({
        url: `https://api.github.com/repos/${REPO}/releases/latest`,
        headers: { Accept: 'application/vnd.github+json' },
        throw: false,
      });
      if (r.status !== 200) throw new Error(`GitHub a répondu ${r.status}`);
      const j = r.json || {};
      const latest = String(j.tag_name || '').replace(/^v/, '');
      if (!latest) throw new Error('réponse inattendue');
      const asset = (j.assets || []).find((a) => /\.zip$/i.test(a.name));
      const bundle = (j.assets || []).find((a) => /^trip-buddy-update.*\.json$/i.test(a.name));
      res = {
        ok: true, current, latest, newer: U.semverCmp(latest, current) > 0,
        url: j.html_url || `${REPO_URL}/releases/latest`, download: asset ? asset.browser_download_url : null,
        bundle: bundle ? bundle.browser_download_url : null, date: j.published_at || '',
      };
    } catch (e) {
      res = { ok: false, current, error: (e && e.message) || String(e) };
    }
    res.at = now;
    this.updateInfo = res;
    return res;
  }

  /** Après une mise à jour, Obsidian peut garder en mémoire l'ancien manifest.json (lu à son démarrage) :
   *  on relit celui du disque pour que le numéro de version affiché soit celui du code chargé. */
  async syncManifest() {
    try {
      const dir = this.manifest.dir;
      const fresh = JSON.parse(await this.app.vault.adapter.read(`${dir}/manifest.json`));
      if (!fresh || !fresh.version || fresh.version === this.manifest.version) return;
      Object.assign(this.manifest, fresh, { dir });
      const cached = this.app.plugins && this.app.plugins.manifests && this.app.plugins.manifests[this.manifest.id];
      if (cached && cached !== this.manifest) Object.assign(cached, fresh, { dir: cached.dir || dir });
    } catch (e) {
      console.error('[Trip Buddy] manifest.json', e);
    }
  }

  /** Met à jour le module et les skills IA vers la version `info.latest` (résultat de checkUpdate),
   *  puis recharge le module. Les notes et les réglages ne sont pas touchés (voir TBUpdater). */
  async installUpdate(info) {
    if (!info || !info.bundle) throw new Error('pas de paquet de mise à jour pour cette version');
    const r = await requestUrl({ url: info.bundle, throw: false });
    if (r.status !== 200) throw new Error(`téléchargement impossible (GitHub a répondu ${r.status})`);
    const up = new TBUpdater(this.app.vault.adapter, this.manifest.dir);
    const res = await up.install(r.json, { expectedVersion: info.latest, currentVersion: this.manifest.version });
    this.updateInfo = null;
    new Notice(`✅ Trip Buddy mis à jour en ${info.latest} (${res.written} fichiers). Ancienne version copiée dans ${res.backup}. Rechargement du module…`, 10000);
    // rechargement : le module se désactive puis se réactive avec le nouveau code.
    // Obsidian garde en mémoire le manifest.json lu au démarrage : on le rafraîchit d'abord,
    // sinon le module rechargé croirait être encore dans l'ancienne version.
    const id = this.manifest.id;
    const app = this.app;
    const adapter = this.app.vault.adapter;
    const dir = this.manifest.dir;
    const expected = info.latest;
    setTimeout(async () => {
      try {
        const fresh = JSON.parse(await adapter.read(`${dir}/manifest.json`));
        const cached = app.plugins.manifests && app.plugins.manifests[id];
        if (cached) Object.assign(cached, fresh, { dir: cached.dir || dir });
        await app.plugins.disablePlugin(id);
        await app.plugins.enablePlugin(id);
        const loaded = app.plugins.plugins && app.plugins.plugins[id];
        const v = loaded && loaded.manifest && loaded.manifest.version;
        if (v !== expected) throw new Error(`version chargée : ${v || 'inconnue'}`);
        new Notice(`🎉 Trip Buddy ${v} est chargé.`, 6000);
        if (app.setting && app.setting.containerEl && app.setting.containerEl.isConnected) app.setting.openTabById(id);
      } catch (e) {
        console.error('[Trip Buddy] rechargement', e);
        new Notice(`Les fichiers de la version ${expected} sont installés. Redémarrez Obsidian pour la charger.`, 0);
      }
    }, 400);
    return res;
  }

  /** Ouvre l'onglet de réglages du module ; `section` : identifiant d'une section (ex. 'reset') à faire défiler et mettre en évidence */
  openSettings(section) {
    try {
      this.app.setting.open();
      this.app.setting.openTabById(this.manifest.id);
    } catch (e) {
      new Notice('Ouvrez Réglages → Trip Buddy');
      return;
    }
    if (!section) return;
    // l'onglet est construit à l'ouverture : on attend son rendu avant de défiler
    const reveal = (tries) => {
      const root = this.settingTab && this.settingTab.containerEl;
      const h = root && root.querySelector(`[data-tb-section="${section}"]`);
      if (!h) { if (tries > 0) setTimeout(() => reveal(tries - 1), 80); return; }
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h.removeClass('is-flash');
      void h.offsetWidth;
      h.addClass('is-flash');
    };
    requestAnimationFrame(() => reveal(10));
  }

  /* ------------------------------------------------------------ helpers */
  isTripFile(f) {
    if (!f) return false;
    const t = this.data.fm(f).type;
    if (t && ['poi', 'programme', 'journal'].includes(String(t).toLowerCase())) return true;
    const p = this.settings.files;
    return f.path === normalizePath(p.budget) || f.path === normalizePath(p.packing);
  }

  async openFile(file, newLeaf) {
    if (!file) return;
    const leaf = this.app.workspace.getLeaf(newLeaf ? 'tab' : false);
    await leaf.openFile(file);
  }

  async openPath(path, newLeaf) {
    const f = this.app.vault.getAbstractFileByPath(normalizePath(path || ''));
    if (f instanceof TFile) return this.openFile(f, newLeaf);
    new Notice(`Page introuvable : ${path} (voir réglages Trip Buddy)`);
  }

  /** Au démarrage : réaffiche l'onglet d'accueil s'il existe déjà, sinon l'ouvre dans un nouvel onglet */
  async openHomeOnStartup() {
    const home = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.files.home));
    if (!(home instanceof TFile)) return;
    const ws = this.app.workspace;
    let found = null;
    ws.iterateAllLeaves((leaf) => {
      const st = leaf.getViewState();
      if (!found && st.type === 'markdown' && st.state && st.state.file === home.path) found = leaf;
    });
    if (found) {
      ws.setActiveLeaf(found, { focus: true });
      ws.revealLeaf(found);
      return;
    }
    // les onglets restaurés sont chargés en différé : on regarde leur état plutôt que le fichier actif
    let busy = false;
    ws.iterateRootLeaves((leaf) => { const t = leaf.getViewState().type; if (t && t !== 'empty') busy = true; });
    const leaf = ws.getLeaf(busy ? 'tab' : false);
    await leaf.openFile(home, { active: true });
  }

  /** Si plus aucun onglet n'affiche de contenu dans la zone principale, y ouvre l'accueil */
  async openHomeIfEmpty() {
    if (!this.settings.openHomeWhenEmpty || this.openingHome) return;
    const ws = this.app.workspace;
    const leaves = [];
    ws.iterateRootLeaves((leaf) => leaves.push(leaf));
    if (leaves.some((l) => { const t = l.getViewState().type; return t && t !== 'empty'; })) return;
    const home = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.files.home));
    if (!(home instanceof TFile)) return;
    this.openingHome = true;
    try {
      const leaf = leaves[0] || ws.getLeaf(false);
      await leaf.openFile(home, { active: true });
    } finally {
      this.openingHome = false;
    }
  }

  async openMapView(focusPath) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_MAP)[0];
    if (!leaf) {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_MAP, active: true });
    }
    workspace.revealLeaf(leaf);
    if (focusPath && leaf.view && leaf.view.focus) setTimeout(() => leaf.view.focus(focusPath), 200);
  }

  async ensureFolder(path) {
    const p = normalizePath(path || '');
    if (!p || p === '/' || this.app.vault.getAbstractFileByPath(p)) return;
    const parts = p.split('/');
    let cur = '';
    for (const part of parts) {
      cur = cur ? `${cur}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(cur)) {
        try { await this.app.vault.createFolder(cur); } catch (e) { /* déjà créé */ }
      }
    }
  }

  uniquePath(folder, base, ext = 'md') {
    let p = normalizePath(`${folder}/${base}.${ext}`), i = 2;
    while (this.app.vault.getAbstractFileByPath(p)) p = normalizePath(`${folder}/${base} ${i++}.${ext}`);
    return p;
  }

  async template(key) {
    const name = this.settings.templates[key];
    if (name) {
      const path = normalizePath(`${this.settings.folders.templates}/${name}`);
      const f = this.app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) return this.app.vault.read(f);
    }
    return BUILTIN_TEMPLATES[key];
  }

  fill(tpl, vars) {
    return tpl.replace(/\{\{\s*([\w]+)\s*\}\}/g, (m, k) => (vars[k] != null ? String(vars[k]).replace(/"/g, '’') : ''));
  }

  /* ------------------------------------------------------------- création */
  async createPoi(p, { quiet = false } = {}) {
    const folder = this.settings.folders.poi;
    await this.ensureFolder(folder);
    const cat = this.data.poiCat(p.category);
    const path = this.uniquePath(folder, U.sanitizeFileName(p.name));
    const tpl = await this.template('poi');
    const content = this.fill(tpl, {
      name: p.name, category: cat.id, icon: cat.icon, address: p.address || '',
      lat: p.lat ?? '', lon: p.lon ?? '', rating: p.rating || 0,
      description: p.description || '', date: U.todayISO(),
    });
    const file = await this.app.vault.create(path, content);
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      fm.type = 'poi';
      fm.name = p.name;
      fm.category = cat.id;
      fm.address = p.address || '';
      if (p.lat != null && p.lon != null) { fm.lat = Number(Number(p.lat).toFixed(6)); fm.lon = Number(Number(p.lon).toFixed(6)); }
      fm.rating = p.rating || 0;
    });
    if (!quiet) new Notice(`📍 « ${p.name} » ajouté`);
    return file;
  }

  /** Tous les services de carte disponibles (intégrés + ajoutés dans les réglages) */
  mapProviders() {
    const all = { ...MAP_PROVIDERS };
    ((this.settings.mapLinks && this.settings.mapLinks.custom) || []).forEach((p) => {
      if (p && p.id && (p.open || p.directions)) all[p.id] = { icon: '🗺️', ...p };
    });
    return all;
  }

  /**
   * Lien vers un service de carte pour un POI.
   * @param kind 'open' | 'directions'
   * @returns {{url: string, label: string, icon: string}|null}
   */
  mapLink(kind, poi) {
    const all = this.mapProviders();
    const ml = this.settings.mapLinks || {};
    let prov = all[ml[kind]] || all.osm;
    if (!prov[kind]) prov = all.osm;
    const enc = (v) => encodeURIComponent(v == null ? '' : String(v));
    const vars = {
      lat: poi.lat, lon: poi.lon, name: poi.name, address: poi.address,
      query: [poi.name, poi.address].filter(Boolean).join(', '),
    };
    const url = prov[kind].replace(/\{(lat|lon|name|address|query)\}/g, (m, k) => enc(vars[k]));
    return { url, label: prov.label, icon: prov.icon || '🗺️' };
  }

  /** Lien de recherche Google pour un lieu (nom + adresse) */
  searchLink(poi) {
    const q = [poi.name, poi.address].filter(Boolean).join(' ');
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  /** Dossier où sont rangées les photos des POI */
  poiPhotoFolder() {
    const base = (this.settings.display && this.settings.display.attachmentFolder) || `${this.settings.folders.documents}/Photos`;
    return normalizePath(`${base}/POI`);
  }

  /**
   * Enregistre une image (File du navigateur ou ArrayBuffer) dans le coffre et l'associe au POI.
   * @param poiFile note du POI ; @param data File|ArrayBuffer ; @param ext extension ; @param credit crédit optionnel
   */
  async setPoiPhoto(poiFile, data, ext, credit) {
    const folder = this.poiPhotoFolder();
    await this.ensureFolder(folder);
    const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    const e = (ext || 'jpg').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
    const path = this.uniquePath(folder, U.sanitizeFileName(poiFile.basename), e);
    const img = await this.app.vault.createBinary(path, buf);
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => {
      fm.photo = this.data.linkTo(img, poiFile.path).replace(/^\[\[/, '[[');
      if (credit) fm.photo_credit = credit; else delete fm.photo_credit;
    });
    return img;
  }

  /** Copie une image dans le dossier des pièces jointes et renvoie le fichier créé */
  async saveImage(data, ext, baseName) {
    const folder = normalizePath((this.settings.display && this.settings.display.attachmentFolder) || `${this.settings.folders.documents}/Photos`);
    await this.ensureFolder(folder);
    const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
    const e = (ext || 'jpg').toLowerCase().replace(/^\./, '').replace('jpeg', 'jpg');
    return this.app.vault.createBinary(this.uniquePath(folder, U.sanitizeFileName(baseName), e), buf);
  }

  /** Ouvre un fichier non Markdown avec l'application du système (ou le montre dans l'explorateur) */
  openExternal(file) {
    try {
      if (typeof this.app.openWithDefaultApp === 'function') { this.app.openWithDefaultApp(file.path); return; }
    } catch (e) { /* mobile */ }
    try {
      const fe = this.app.internalPlugins && this.app.internalPlugins.getPluginById('file-explorer');
      if (fe && fe.instance && fe.instance.revealInFolder) { fe.instance.revealInFolder(file); return; }
    } catch (e) { /* */ }
    new Notice(file.path);
  }

  /* ---------------------------------------------------------- guide */
  guideFolder() {
    return normalizePath(this.settings.folders.guide || '08 Guide');
  }

  /** Pages du guide (type: guide), triées ; titre, icône, résumé, intertitres, brouillon ? */
  async guidePages() {
    const out = [];
    for (const f of this.data.filesOfType('guide')) {
      const fm = this.data.fm(f);
      const text = await this.app.vault.cachedRead(f);
      const lines = text.replace(/^---[\s\S]*?\n---\n?/, '').split('\n');
      let fence = false, h1 = '', content = 0;
      const headings = [];
      for (const l of lines) {
        if (/^\s*(```|~~~)/.test(l)) { fence = !fence; continue; }
        if (fence) continue;
        const m = /^(#{1,2})\s+(.+)/.exec(l);
        if (m) { if (m[1] === '#') h1 = h1 || m[2].trim(); else headings.push(m[2].trim()); continue; }
        if (l.trim() && !/^\s*>\s*\*[^*]+\*\s*$/.test(l)) content++;
      }
      const icon = String(fm.icon || '').trim() || '📄';
      let title = String(fm.title || h1 || f.basename).trim();
      if (icon && title.startsWith(icon)) title = title.slice(icon.length).trim();
      out.push({
        file: f, key: String(fm.guide || U.slug(f.basename)), order: Number(fm.order) || 99,
        icon, title, summary: String(fm.summary || ''), headings, draft: content < 3,
      });
    }
    return out.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, LOCALE));
  }

  /** Crée l'index et les pages de base qui manquent ; renvoie le nombre de pages créées */
  async ensureGuidePages() {
    const folder = this.guideFolder();
    await this.ensureFolder(folder);
    const idx = normalizePath(this.settings.files.guide || `${folder}/Guide.md`);
    if (!this.app.vault.getAbstractFileByPath(idx)) await this.app.vault.create(idx, TBGuide.indexPage());
    const have = new Set((await this.guidePages()).map((p) => p.key));
    let n = 0;
    for (const def of GUIDE_PAGES) {
      if (have.has(def.key)) continue;
      const path = this.uniquePath(folder, U.sanitizeFileName(def.title));
      await this.app.vault.create(path, TBGuide.skeleton(def));
      n++;
    }
    return n;
  }

  newGuidePage() { new GuideNewPageModal(this).open(); }

  async createGuidePage({ icon, title }) {
    const folder = this.guideFolder();
    await this.ensureFolder(folder);
    const pages = await this.guidePages();
    const def = {
      key: U.slug(title), order: Math.max(0, ...pages.map((p) => (p.order < 99 ? p.order : 0))) + 1, icon, title,
      summary: '', sections: [['📝 Notes', 'À compléter.']],
    };
    const f = await this.app.vault.create(this.uniquePath(folder, U.sanitizeFileName(title)), TBGuide.skeleton(def));
    this.app.workspace.getLeaf(false).openFile(f);
  }

  /* ------------------------------------------------- transports en commun */
  transitFolder() {
    return normalizePath(`${this.settings.folders.documents || '01 Documents'}/Transports`);
  }

  /** Réseaux visibles (activés et dont le fichier existe) */
  transitNetworks() {
    const t = this.settings.transit || {};
    return (t.networks || []).filter((n) => n.enabled !== false && n.file && this.app.vault.getAbstractFileByPath(n.file));
  }

  /** Télécharge (ou met à jour) le réseau d'une ville et l'enregistre dans le coffre */
  async downloadTransit(city, onStatus) {
    const data = await TBTransit.download(city, onStatus);
    const folder = this.transitFolder();
    await this.ensureFolder(folder);
    const id = U.slug(city.name) || 'reseau';
    const path = normalizePath(`${folder}/${U.sanitizeFileName(city.name)}.json`);
    const text = JSON.stringify(data);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) await this.app.vault.modify(existing, text);
    else await this.app.vault.create(path, text);
    const modes = {};
    data.lines.forEach((l) => { modes[l.mode] = (modes[l.mode] || 0) + 1; });
    const entry = {
      id, name: city.name, country: city.country || '', file: path, bbox: city.bbox,
      lines: data.lines.length, stations: data.stations.length, modes, fetched: data.fetched, enabled: true,
      size: text.length,
    };
    const t = this.settings.transit;
    const i = t.networks.findIndex((n) => n.id === id);
    if (i >= 0) t.networks[i] = entry; else t.networks.push(entry);
    t.show = true;
    await this.saveSettings();
    return entry;
  }

  async removeTransit(id) {
    const t = this.settings.transit;
    const net = t.networks.find((n) => n.id === id);
    if (!net) return;
    const f = this.app.vault.getAbstractFileByPath(net.file);
    if (f) await this.app.vault.trash(f, false);
    t.networks = t.networks.filter((n) => n.id !== id);
    await this.saveSettings();
  }

  /* ----------------------------------------------------------- traces GPX */
  /** Dossier où sont rangées les traces GPX importées */
  gpxFolder() {
    return normalizePath(`${this.settings.folders.documents || '01 Documents'}/Traces`);
  }

  /** Ajoute la catégorie « Randonnée & balade » si elle n'existe pas encore */
  async ensureTrackCategory() {
    const cats = this.settings.poiCategories;
    let c = cats.find((x) => x.id === 'randonnee');
    if (!c) {
      c = DEFAULT_SETTINGS.poiCategories.find((x) => x.id === 'randonnee');
      cats.push({ ...c });
      await this.saveSettings();
    }
    return c.id;
  }

  /** Lit un fichier GPX du navigateur (File) : { text, track } — lève une erreur si illisible */
  async readGpx(f) {
    const text = await f.text();
    return { text, track: TBGpx.parse(text) };
  }

  /** Copie un GPX dans le dossier des traces et renvoie le fichier créé */
  async saveGpx(text, baseName) {
    const folder = this.gpxFolder();
    await this.ensureFolder(folder);
    return this.app.vault.create(this.uniquePath(folder, U.sanitizeFileName(baseName || 'Trace'), 'gpx'), text);
  }

  /** Associe une trace (fichier du coffre) à un POI et recopie le résumé dans ses propriétés */
  async setPoiGpx(poiFile, gpxFile, track, { append = false } = {}) {
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => {
      const link = this.data.linkTo(gpxFile, poiFile.path);
      const cur = fm.gpx ? (Array.isArray(fm.gpx) ? fm.gpx : [fm.gpx]) : [];
      fm.gpx = append && cur.length ? [...cur, link] : link;
      if (track && !(append && cur.length)) Object.assign(fm, TBGpx.fmProps(track));
    });
  }

  async removePoiGpx(poiFile) {
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => {
      ['gpx', 'distance_km', 'ele_gain', 'ele_loss', 'ele_max', 'duration'].forEach((k) => delete fm[k]);
    });
  }

  /**
   * Choisit un ou plusieurs fichiers GPX sur l'appareil.
   * Un seul fichier → fenêtre de création du lieu (toutes les propriétés) ; plusieurs → un lieu par trace.
   * @param onPick(files) remplace le comportement par défaut
   */
  pickGpx(onPick, multiple = true) {
    const input = createEl('input', { type: 'file', attr: { accept: '.gpx,application/gpx+xml' } });
    if (multiple) input.multiple = true;
    input.addEventListener('change', async () => {
      const files = [...(input.files || [])];
      if (!files.length) return;
      if (onPick) return onPick(files);
      if (files.length === 1) {
        try {
          const { text, track } = await this.readGpx(files[0]);
          await this.ensureTrackCategory();
          new PoiCreateModal(this, { gpx: { text, track, fileName: files[0].name } }).open();
        } catch (e) { new Notice('🥾 ' + files[0].name + ' : ' + (e.message || e)); }
        return;
      }
      await this.importGpxBulk(files);
    });
    input.click();
  }

  /** Import groupé : un POI par fichier, placé au départ de la trace */
  async importGpxBulk(files) {
    const cat = await this.ensureTrackCategory();
    let ok = 0;
    const errors = [];
    for (const f of files) {
      try {
        const { text, track } = await this.readGpx(f);
        const name = track.name || f.name.replace(/\.gpx$/i, '');
        const start = TBGpx.startPoint(track);
        const gpx = await this.saveGpx(text, name);
        const poi = await this.createPoi({ name, category: cat, lat: start && start.lat, lon: start && start.lon, description: track.desc || '' }, { quiet: true });
        await this.setPoiGpx(poi, gpx, track);
        if (track.stats.start) await this.app.fileManager.processFrontMatter(poi, (fm) => { fm.done = true; fm.done_date = U.isoDate(new Date(track.stats.start)); });
        ok++;
      } catch (e) { errors.push(`${f.name} : ${e.message || e}`); }
    }
    new Notice(`🥾 ${ok} trace${ok > 1 ? 's' : ''} importée${ok > 1 ? 's' : ''}` + (errors.length ? `\n⚠️ ${errors.join('\n')}` : ''), errors.length ? 10000 : 5000);
  }

  async removePoiPhoto(poiFile) {
    await this.app.fileManager.processFrontMatter(poiFile, (fm) => { delete fm.photo; delete fm.photo_credit; });
  }

  async createProgramme(date, { open } = {}) {
    const existing = this.data.programmeFor(date);
    if (existing) { if (open) this.openFile(existing.file); return existing.file; }
    const folder = this.settings.folders.programme;
    await this.ensureFolder(folder);
    const tpl = await this.template('programme');
    const idx = this.data.dayIndex(date);
    const content = this.fill(tpl, { date, date_long: U.fmtLong(date), day: idx || '' });
    const file = await this.app.vault.create(this.uniquePath(folder, `Programme ${date}`), content);
    if (open) this.openFile(file);
    return file;
  }

  async openJournal(date) {
    const existing = this.data.journalFor(date);
    if (existing) return this.openFile(existing.file);
    const folder = this.settings.folders.journal;
    await this.ensureFolder(folder);
    const tpl = await this.template('journal');
    const idx = this.data.dayIndex(date);
    const content = this.fill(tpl, { date, date_long: U.fmtLong(date), day: idx || '' });
    const file = await this.app.vault.create(this.uniquePath(folder, date), content);
    return this.openFile(file);
  }

  /* -------------------------------------------------------------- packing */
  static insertPackingItems(text, catName, items) {
    const lines = text.split('\n');
    const norm = (s) => s.replace(/^#+\s*/, '').trim().toLowerCase();
    let h = lines.findIndex((l) => /^#{2,6}\s+/.test(l) && norm(l) === catName.trim().toLowerCase());
    const newLines = items.map((i) => `- [ ] ${i}`);
    if (h < 0) {
      while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
      lines.push('', `## ${catName}`, ...newLines, '');
      return lines.join('\n');
    }
    let end = h + 1;
    let lastTask = h;
    for (; end < lines.length; end++) {
      if (/^#{1,6}\s+/.test(lines[end])) break;
      if (/^\s*[-*+]\s+\[.\]/.test(lines[end])) lastTask = end;
    }
    lines.splice(lastTask + 1, 0, ...newLines);
    return lines.join('\n');
  }

  async addPackingItems(file, catName, items) {
    await this.app.vault.process(file, (t) => TripBuddyPlugin.insertPackingItems(t, catName, items));
    new Notice(`🎒 ${items.length} élément${items.length > 1 ? 's' : ''} ajouté${items.length > 1 ? 's' : ''}`);
  }

  async importPackingTemplate(file, tplFile) {
    const tplCats = this.data.parsePacking(await this.app.vault.read(tplFile));
    let added = 0;
    await this.app.vault.process(file, (text) => {
      const existing = new Set(this.data.parsePacking(text).flatMap((c) => c.items.map((i) => i.text.trim().toLowerCase())));
      for (const c of tplCats) {
        const items = c.items.map((i) => i.text).filter((t) => !existing.has(t.trim().toLowerCase()));
        if (items.length) { text = TripBuddyPlugin.insertPackingItems(text, c.name, items); added += items.length; }
      }
      return text;
    });
    new Notice(added ? `📋 ${added} élément${added > 1 ? 's' : ''} importé${added > 1 ? 's' : ''}` : 'Rien à importer : tout est déjà dans la liste');
  }

  async setAllPacking(file, checked) {
    await this.app.vault.process(file, (text) => {
      let fence = false;
      return text.split('\n').map((l) => {
        if (/^\s*(```|~~~)/.test(l)) fence = !fence;
        if (fence) return l;
        return l.replace(/^(\s*[-*+]\s+)\[.\]/, `$1[${checked ? 'x' : ' '}]`);
      }).join('\n');
    });
  }

  /* -------------------------------------------------------- nouveau voyage */
  confirmReset() {
    new ConfirmModal(this, '🧹 Vider les données d’exemple ?',
      '⚠️ Effacement DÉFINITIF : tout le contenu des dossiers Documents, Journal, POI, Programme et Guide est effacé '
      + '(fiches de lieux, entrées de journal, programmes, billets, photos, traces, pages de guide ajoutées), '
      + 'puis la corbeille du coffre (.trash) est entièrement vidée, y compris ce qui s’y trouvait déjà. Rien ne pourra être récupéré dans Obsidian. '
      + 'Le tableau des dépenses sera vidé, la valise décochée, les pages standard du guide remises à blanc et les sections libres '
      + '(Notes rapides, Idées en vrac…) vidées. '
      + 'Le contexte du voyage (CONTEXT.md) et le dossier de travail des skills de planification (.trip-planner) sont effacés aussi. '
      + 'Les réseaux de transports en commun sont retirés et les cartes hors ligne de cet appareil supprimées (à retélécharger pour la nouvelle destination). '
      + 'Le voyage est renommé « My trip » 🧳, ses participants, sa destination, ses dates et ses budgets remis à zéro (devise conservée). '
      + 'Les pages d’accueil des rubriques, les modèles et les autres réglages sont conservés.',
      'Tout effacer définitivement', () => this.resetTrip(), true).open();
  }

  async resetTrip() {
    const d = this.data;
    const s = this.settings;
    const vault = this.app.vault;
    const tag = U.sanitizeFileName(s.trip.name || 'ancien voyage');
    const tplBase = normalizePath(s.folders.templates || '');
    const isTpl = (f) => !!tplBase && (f.path === tplBase || f.path.startsWith(tplBase + '/'));
    // pages d'accueil / index des dossiers : conservées (on n'en vide que les sections libres plus bas)
    const keep = new Set(Object.values(s.files || {}).filter(Boolean).map((p) => normalizePath(p)));
    // guide : une page par rubrique standard est conservée et remise à blanc, les autres partent
    const guideKeep = new Map();
    const guideAll = await this.guidePages();
    for (const g of guideAll) {
      const def = GUIDE_PAGES.find((x) => x.key === g.key);
      if (def && !guideKeep.has(def.key)) guideKeep.set(def.key, { file: g.file, def });
    }
    const guideKept = new Set([...guideKeep.values()].map((g) => g.file));

    const victims = new Set([
      ...d.filesOfType('poi'), ...d.filesOfType('journal'), ...d.filesOfType('programme'),
      ...guideAll.map((g) => g.file).filter((f) => !guideKept.has(f)),
    ]);
    // dossiers du voyage balayés en entier (sous-dossiers, photos, traces, notes sans propriété type…)
    const sweep = ['documents', 'journal', 'poi', 'programme', 'guide']
      .map((k) => normalizePath(s.folders[k] || ''))
      .filter((b) => b && b !== '/' && b !== '.' && b !== tplBase);
    vault.getFiles().forEach((f) => {
      if (sweep.some((b) => f.path.startsWith(b + '/'))) victims.add(f);
    });
    for (const f of [...victims]) {
      if (keep.has(f.path) || guideKept.has(f) || isTpl(f)) victims.delete(f);
    }
    for (const f of victims) {
      try { await vault.trash(f, false); } catch (e) { console.error(e); }
    }
    // sous-dossiers restés vides
    const pruneEmpty = async (folder, isRoot) => {
      for (const c of [...folder.children]) if (c instanceof TFolder) await pruneEmpty(c, false);
      if (!isRoot && folder.children.length === 0) {
        try { await vault.trash(folder, false); } catch (e) { console.error(e); }
      }
    };
    for (const b of sweep) {
      const folder = vault.getAbstractFileByPath(b);
      if (folder instanceof TFolder) await pruneEmpty(folder, true);
    }

    const bf = d.budgetFile();
    if (bf) {
      await vault.process(bf, (text) => {
        const t = d.parseExpenseTable(text);
        if (t.headerLine < 0) return text;
        const lines = t.lines;
        lines.splice(t.headerLine + 2, t.rows.length);
        return lines.join('\n');
      });
    }
    const pf = d.packingFile();
    if (pf) await this.setAllPacking(pf, false);
    // guide : les pages propres à l'ancienne destination repartent du squelette (copie dans .trash)
    for (const { file, def } of guideKeep.values()) {
      try {
        await this.backupToTrash(file, tag);
        await vault.modify(file, TBGuide.skeleton(def));
      } catch (e) { console.error(e); }
    }
    // sections libres propres au voyage : Notes rapides, Idées en vrac… (copie dans .trash)
    for (const key of ['home', 'programme', 'documents']) {
      const f = s.files[key] && vault.getAbstractFileByPath(normalizePath(s.files[key]));
      if (f instanceof TFile) {
        try { await this.clearFreeSections(f, tag); } catch (e) { console.error(e); }
      }
    }
    const skillItems = await this.resetSkillData();
    const { networks, areas } = await this.resetMapData();
    // en dernier : le nom de l'ancien voyage sert à suffixer les copies mises à la corbeille
    Object.assign(s.trip, NEW_TRIP, {
      destination: DEFAULT_SETTINGS.trip.destination, start: '', end: '', budget: 0, travelers: [],
    });
    (s.expenseCategories || []).forEach((c) => { if (c.budget) c.budget = 0; });
    s.demo = false; // plus de bandeau « voyage d'exemple » sur l'accueil
    if (s.booklet) { s.booklet.cover = ''; s.booklet.coverTitle = ''; }
    U.storeSet('plannerDay', null);
    U.storeSet('lastPayer', '');
    await this.saveSettings();
    // tout ce qui vient d'être mis à la corbeille (et ce qui y était déjà) est effacé définitivement
    const purged = await this.emptyVaultTrash();
    const extra = [
      networks ? `${networks} réseau${networks > 1 ? 'x' : ''} de transports retiré${networks > 1 ? 's' : ''}` : '',
      areas ? `${areas} carte${areas > 1 ? 's' : ''} hors ligne supprimée${areas > 1 ? 's' : ''}` : '',
    ].filter(Boolean).join(', ');
    const done = purged
      ? `${victims.size + skillItems} fichiers effacés, corbeille vidée`
      : `${victims.size + skillItems} fichiers mis à la corbeille (impossible de la vider : voir la console)`;
    new Notice(`🧹 ${done}${extra ? ` · ${extra}` : ''}. Renseignez la destination et les dates du nouveau voyage !`, 10000);
    this.openSettings();
  }

  /** Vide définitivement la corbeille du coffre (.trash). Renvoie false en cas d'échec. */
  async emptyVaultTrash() {
    const adapter = this.app.vault.adapter;
    try {
      if (await adapter.exists('.trash')) await adapter.rmdir('.trash', true);
      return true;
    } catch (e) {
      console.error('[Trip Buddy] vidage de .trash', e);
      return false;
    }
  }

  /** Copie une note dans .trash, suffixée du nom du voyage (« Note (Voyage).md », numérotée si besoin). */
  async backupToTrash(file, tag) {
    const adapter = this.app.vault.adapter;
    if (!(await adapter.exists('.trash'))) await adapter.mkdir('.trash');
    let p = normalizePath(`.trash/${file.basename} (${tag}).md`);
    for (let i = 2; await adapter.exists(p); i++) p = normalizePath(`.trash/${file.basename} (${tag}) ${i}.md`);
    await adapter.write(p, await this.app.vault.read(file));
  }

  /**
   * Vide le contenu des sections « ## … » d'une page (intertitres, en-têtes de tableau et blocs
   * tripbuddy conservés), après en avoir mis une copie dans .trash. Rien n'est fait si elles sont déjà vides.
   */
  async clearFreeSections(file, tag) {
    const text = await this.app.vault.read(file);
    const fmEnd = /^---\n[\s\S]*?\n---\n?/.exec(text);
    const head = fmEnd ? fmEnd[0] : '';
    const out = [];
    let inSec = false, fence = false, keepFence = false, tableRows = 0, dropped = false;
    for (const l of text.slice(head.length).split('\n')) {
      const fenceLine = /^\s*(```|~~~)/.test(l);
      if (fence) {
        if (keepFence) out.push(l); else dropped = true;
        if (fenceLine) fence = false;
        continue;
      }
      if (fenceLine) {
        fence = true;
        keepFence = !inSec || /^\s*(```|~~~)\s*tripbuddy/.test(l);
        if (keepFence) out.push(l); else dropped = true;
        continue;
      }
      if (/^#\s/.test(l)) { inSec = false; out.push(l); continue; }
      if (/^##\s/.test(l)) { inSec = true; tableRows = 0; out.push(l); continue; }
      if (!inSec) { out.push(l); continue; }
      if (/^\s*\|/.test(l)) {
        if (tableRows++ < 2) { out.push(l); continue; }
      } else {
        tableRows = 0;
        if (!l.trim()) { out.push(l); continue; }
      }
      dropped = true;
    }
    if (!dropped) return;
    await this.backupToTrash(file, tag);
    const body = out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s*$/, '\n');
    await this.app.vault.modify(file, head + body);
  }

  /**
   * Réseaux de transports en commun (fichiers JSON à la corbeille, liste vidée dans les réglages)
   * et cartes hors ligne (tuiles IndexedDB de cet appareil). Renvoie le nombre d'éléments retirés.
   */
  async resetMapData() {
    const t = this.settings.transit || {};
    const nets = t.networks || [];
    for (const net of nets) {
      const f = net.file && this.app.vault.getAbstractFileByPath(net.file);
      if (f) { try { await this.app.vault.trash(f, false); } catch (e) { console.error(e); } }
    }
    if (nets.length) {
      t.networks = [];
      TBTransit.cache.clear();
      await this.saveSettings();
    }
    let areas = 0;
    try { areas = await TBOffline.stopAndClear(); } catch (e) { console.error('[Trip Buddy] cartes hors ligne', e); }
    return { networks: nets.length, areas };
  }

  /**
   * Données des skills Claude de planification (travel-context, travel-planner) :
   * CONTEXT.md à la racine et le dossier de travail caché .trip-planner.
   * Ils sont déplacés dans .trash, suffixés du nom du voyage (mêmes noms que ceux utilisés par les skills).
   * Renvoie le nombre d'éléments déplacés.
   */
  async resetSkillData() {
    const adapter = this.app.vault.adapter;
    const tag = U.sanitizeFileName(this.settings.trip.name || 'ancien voyage');
    const free = async (base, ext) => {
      let p = normalizePath(`.trash/${base}${ext}`);
      for (let i = 2; await adapter.exists(p); i++) p = normalizePath(`.trash/${base} ${i}${ext}`);
      return p;
    };
    const move = async (from, base, ext) => {
      try {
        if (!(await adapter.exists(from))) return 0;
        if (!(await adapter.exists('.trash'))) await adapter.mkdir('.trash');
        await adapter.rename(from, await free(base, ext));
        return 1;
      } catch (e) {
        console.error(e);
        try { await adapter.trashLocal(from); return 1; } catch (e2) { console.error(e2); return 0; }
      }
    };
    let n = 0;
    n += await move(SKILL_DATA.context, `CONTEXT - ${tag}`, '.md');
    n += await move(SKILL_DATA.workdir, `trip-planner - ${tag}`, '');
    return n;
  }
}

module.exports = TripBuddyPlugin;
