/* ==========================================================================
 * Trip Buddy — onglet de réglages
 * ========================================================================== */
class TripBuddySettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  save() { this.plugin.saveSettings(); }

  /** Numéro de version du module + vérification d'une version plus récente sur GitHub */
  versionBox(parent) {
    const box = parent.createDiv('tb-set-version');
    const render = (u, busy) => {
      box.empty();
      box.createSpan({ cls: 'tb-set-version-num', text: `Version ${this.plugin.manifest.version}` });
      const st = box.createSpan('tb-set-update');
      const recheck = () => { render(null, true); this.plugin.checkUpdate(true).then((r) => render(r)); };
      if (busy || !u) {
        st.setText('Recherche de mise à jour…');
        st.addClass('is-busy');
        return;
      }
      if (!u.ok) {
        st.setText('⚠️ Impossible de vérifier les mises à jour');
        st.setAttr('title', u.error);
        st.addClass('is-error');
      } else if (u.newer) {
        st.addClass('is-new');
        st.appendText(`🆕 Version ${u.latest} disponible`);
        const links = box.createDiv('tb-set-update-links');
        if (u.bundle) {
          const go = links.createEl('button', { cls: 'mod-cta tb-btn-sm', text: `⬇️ Mettre à jour vers ${u.latest}` });
          go.addEventListener('click', (e) => { e.preventDefault(); this.plugin.confirmUpdate(u, go); });
        }
        links.createEl('a', { text: 'Voir les nouveautés', href: u.url });
        links.createDiv({
          cls: 'setting-item-description',
          text: u.bundle
            ? 'Met à jour le module Trip Buddy et les skills IA (.claude/skills). Vos notes, documents, journal, budget et réglages ne sont pas modifiés.'
            : 'Cette version ne propose pas de mise à jour automatique : remplacez le dossier .obsidian/plugins/trip-buddy de ce coffre par celui du paquet, puis désactivez / réactivez Trip Buddy. Vos notes et vos réglages sont conservés.',
        });
        if (!u.bundle && u.download) links.createEl('a', { text: 'Télécharger le paquet', href: u.download });
      } else {
        st.setText('✅ À jour');
        st.addClass('is-ok');
      }
      const again = box.createEl('button', { cls: 'tb-btn-link tb-set-update-check', text: 'Vérifier' });
      again.setAttr('title', 'Rechercher une nouvelle version sur GitHub');
      again.addEventListener('click', (e) => { e.preventDefault(); recheck(); });
    };
    render(null, true);
    this.plugin.checkUpdate(false).then((u) => { if (box.isConnected) render(u); });

    // liens permanents : dépôt du projet et dernière version publiée
    const links = parent.createDiv('tb-set-links');
    const link = (text, href, title) => {
      const a = links.createEl('a', { text, href });
      a.setAttr('title', title);
      a.setAttr('target', '_blank');
      a.setAttr('rel', 'noopener');
    };
    link('🐙 Dépôt GitHub', REPO_URL, `Code source, documentation et suivi du projet (${REPO})`);
    link('🏷️ Dernière version', `${REPO_URL}/releases/latest`, 'Notes de version et paquet téléchargeable de la dernière version publiée');
  }

  /** Titre de section ; `id` permet d'y accéder directement (plugin.openSettings(id)) */
  heading(c, text, desc, id) {
    const h = c.createDiv('tb-set-heading');
    if (id) h.dataset.tbSection = id;
    h.createEl('h3', { text });
    if (desc) h.createDiv({ cls: 'setting-item-description', text: desc });
  }

  text(c, name, desc, get, set, opts = {}) {
    return new Setting(c).setName(name).setDesc(desc || '').addText((t) => {
      t.setValue(String(get() ?? '')).onChange((v) => { set(v); this.save(); });
      if (opts.type) t.inputEl.type = opts.type;
      if (opts.placeholder) t.setPlaceholder(opts.placeholder);
      if (opts.width) t.inputEl.style.width = opts.width;
    });
  }

  display() {
    const c = this.containerEl;
    const s = this.plugin.settings;
    c.empty();
    c.addClass('tb-settings');

    const intro = c.createDiv('tb-set-intro');
    intro.createDiv({ cls: 'tb-set-logo', text: s.trip.emoji || '✈️' });
    const it = intro.createDiv();
    it.createEl('h2', { text: 'Trip Buddy' });
    it.createDiv({ cls: 'setting-item-description', text: 'Tout le paramétrage du voyage est ici. Les modifications sont appliquées immédiatement à toutes les pages.' });
    this.versionBox(it);

    /* ------------------------------------------------------------ voyage */
    this.heading(c, '✈️ Le voyage');
    this.text(c, 'Nom du voyage', '', () => s.trip.name, (v) => { s.trip.name = v; });
    this.text(c, 'Destination', 'Ville, région ou pays.', () => s.trip.destination, (v) => { s.trip.destination = v; });
    const emo = new Setting(c).setName('Emoji').setDesc('Affiché sur la page d’accueil et en tête des réglages.');
    const emoBtn = emo.controlEl.createEl('button', { cls: 'tb-emoji-btn', text: s.trip.emoji || '✈️' });
    emoBtn.setAttr('aria-label', 'Choisir un emoji');
    emo.addButton((b) => b.setButtonText('Choisir…').onClick(() => openEmo()));
    const openEmo = () => new EmojiPickerModal(this.plugin, s.trip.emoji, (e) => {
      s.trip.emoji = e;
      emoBtn.setText(e);
      const logo = c.querySelector('.tb-set-logo');
      if (logo) logo.setText(e);
      this.save();
    }, '✈️ Emoji du voyage').open();
    emoBtn.addEventListener('click', openEmo);
    this.text(c, 'Date de début', '', () => s.trip.start, (v) => { s.trip.start = U.normDate(v); }, { type: 'date' });
    this.text(c, 'Date de fin', '', () => s.trip.end, (v) => { s.trip.end = U.normDate(v); }, { type: 'date' });
    this.text(c, 'Voyageurs', 'Séparés par des virgules (utilisés pour « Payé par » et l’équilibre des dépenses).',
      () => (s.trip.travelers || []).join(', '),
      (v) => { s.trip.travelers = v.split(',').map((x) => x.trim()).filter(Boolean); });
    this.text(c, 'Devise principale', 'Code ISO (EUR, USD, JPY…).', () => s.trip.currency,
      (v) => { s.trip.currency = (v || 'EUR').trim().toUpperCase(); }, { width: '6em' });
    this.text(c, 'Budget total', 'Laissez 0 pour utiliser la somme des budgets par catégorie.', () => s.trip.budget,
      (v) => { s.trip.budget = U.parseAmount(v); }, { width: '8em' });

    /* --------------------------------------------------- catégories POI */
    this.heading(c, '📍 Catégories de lieux', 'L’identifiant est la valeur écrite dans le champ « category » des notes POI. Le modifier ne renomme pas les notes existantes.');
    this.listEditor(c, s.poiCategories, [
      { key: 'icon', type: 'emoji' },
      { key: 'label', ph: 'Libellé', w: '10em', autoId: true },
      { key: 'id', ph: 'identifiant', w: '8em', cls: 'tb-mono' },
      { key: 'color', type: 'color' },
    ], () => ({ id: '', label: '', icon: '📍', color: '#3b82f6' }));

    /* ----------------------------------------------- catégories dépenses */
    this.heading(c, '💰 Catégories de dépenses', 'Le budget prévu par catégorie alimente les barres de progression.');
    this.listEditor(c, s.expenseCategories, [
      { key: 'icon', type: 'emoji' },
      { key: 'label', ph: 'Libellé', w: '10em', autoId: true },
      { key: 'id', ph: 'identifiant', w: '8em', cls: 'tb-mono' },
      { key: 'budget', ph: 'Budget', w: '6em', type: 'number' },
      { key: 'color', type: 'color' },
    ], () => ({ id: '', label: '', icon: '💸', color: '#64748b', budget: 0 }));

    /* ----------------------------------------------------------- devises */
    this.heading(c, '💱 Devises', `Taux de conversion : 1 unité de la devise = x ${s.trip.currency}.`);
    this.listEditor(c, s.currencies, [
      { key: 'code', ph: 'USD', w: '5em', upper: true },
      { key: 'rate', ph: 'Taux', w: '7em', type: 'number' },
    ], () => ({ code: '', rate: 1 }));

    /* ------------------------------------------------------------- carte */
    this.heading(c, '🗺️ Carte');
    new Setting(c).setName('Fond de carte par défaut').setDesc('Les autres fonds restent disponibles via le sélecteur de couches de la carte.')
      .addDropdown((d) => {
        Object.entries(TILE_PRESETS).forEach(([k, p]) => d.addOption(k, p.name));
        d.addOption('custom', 'Personnalisé (URL ci-dessous)');
        d.setValue(s.map.tiles).onChange((v) => { s.map.tiles = v; U.storeSet('baselayer', null); this.save(); });
      });
    this.text(c, 'URL de tuiles personnalisée', 'Format {z}/{x}/{y}.', () => s.map.customUrl, (v) => { s.map.customUrl = v.trim(); },
      { placeholder: 'https://tile.example.org/{z}/{x}/{y}.png', width: '22em' });
    this.text(c, 'Centre par défaut — latitude', 'Utilisé quand aucun lieu n’est géolocalisé.', () => s.map.lat, (v) => { s.map.lat = U.toNum(v) || 0; }, { width: '8em' });
    this.text(c, 'Centre par défaut — longitude', '', () => s.map.lon, (v) => { s.map.lon = U.toNum(v) || 0; }, { width: '8em' });
    this.text(c, 'Zoom par défaut', '', () => s.map.zoom, (v) => { s.map.zoom = parseInt(v, 10) || 12; }, { width: '5em' });
    const nGeo = this.plugin.data.pois().filter((p) => p.hasCoords).length;
    new Setting(c).setName('Centrer sur les lieux géolocalisés')
      .setDesc(nGeo
        ? `Calcule le centre et le zoom par défaut à partir des ${nGeo} lieu${nGeo > 1 ? 'x' : ''} géolocalisé${nGeo > 1 ? 's' : ''} (les excursions à plus de 25 km du cœur du voyage sont ignorées).`
        : 'Aucun lieu géolocalisé pour l’instant : ajoutez des coordonnées à vos lieux pour utiliser ce bouton.')
      .addButton((b) => b.setButtonText('◎ Centrer automatiquement').setDisabled(!nGeo).onClick(() => {
        const v = this.poiDefaultView();
        if (!v) { new Notice('Aucun lieu géolocalisé.'); return; }
        Object.assign(s.map, v);
        this.save();
        new Notice(`🗺️ Centre par défaut : ${v.lat}, ${v.lon} · zoom ${v.zoom}`);
        const top = c.scrollTop;
        this.display();
        c.scrollTop = top;
      }));
    new Setting(c).setName('Afficher les traces GPX sur les cartes')
      .setDesc('Les lieux qui ont une trace (propriété « gpx ») la montrent sur la carte, colorée selon la catégorie. Le bouton 🥾 de la carte bascule aussi ce réglage. Les traces importées sont rangées dans « ' + this.plugin.gpxFolder() + ' ».')
      .addToggle((t) => t.setValue(s.map.showTracks !== false).onChange((v) => { s.map.showTracks = v; this.save(); }));
    this.offlineSection(c);
    this.transitSection(c);
    this.heading(c, '🔎 Recherche d’adresses');
    this.text(c, 'Langue du géocodage', 'Code langue pour les adresses (fr, en, pt…).', () => s.geocoder.lang, (v) => { s.geocoder.lang = v.trim(); }, { width: '5em' });
    this.text(c, 'Limiter la recherche aux pays', 'Codes pays séparés par des virgules (ex. pt,es). Vide = monde entier.', () => s.geocoder.countryCodes, (v) => { s.geocoder.countryCodes = v.trim().toLowerCase(); }, { width: '8em' });

    /* ------------------------------------------------- liens vers les cartes */
    const ml = s.mapLinks;
    this.heading(c, '🧭 Itinéraire et « Ouvrir dans »', 'Service utilisé par les boutons « Itinéraire » / « Y aller » et « Ouvrir dans » des fiches et de la carte.');
    const provOptions = (d) => {
      Object.entries(this.plugin.mapProviders()).forEach(([id, p]) => d.addOption(id, `${p.icon || '🗺️'} ${p.label || id}`));
    };
    new Setting(c).setName('Service pour « Itinéraire »')
      .addDropdown((d) => { provOptions(d); d.setValue(this.plugin.mapProviders()[ml.directions] ? ml.directions : 'osm').onChange((v) => { ml.directions = v; this.save(); }); });
    new Setting(c).setName('Service pour « Ouvrir dans »')
      .addDropdown((d) => { provOptions(d); d.setValue(this.plugin.mapProviders()[ml.open] ? ml.open : 'osm').onChange((v) => { ml.open = v; this.save(); }); });
    const help = c.createDiv('setting-item-description tb-set-help');
    help.appendText('Autres fournisseurs : indiquez un nom et les adresses (URL) à ouvrir. Variables disponibles : ');
    ['{lat}', '{lon}', '{name}', '{address}', '{query}'].forEach((v, i) => { if (i) help.appendText(' '); help.createEl('code', { text: v }); });
    help.appendText('. Exemple Apple Plans : https://maps.apple.com/?daddr={lat},{lon}&dirflg=w');
    this.providerEditor(c, ml);

    /* ---------------------------------------------------- menu principal */
    this.heading(c, '🧭 Menu principal', 'Ordre des rubriques de la barre de navigation affichée en haut des pages ; 👁 / 🙈 pour afficher ou masquer une rubrique (ses pages restent accessibles).');
    this.navOrderEditor(c);

    /* -------------------------------------------------- dossiers / fichiers */
    this.heading(c, '📂 Dossiers et pages', 'Emplacements utilisés pour créer les nouvelles notes et pour la navigation.');
    const F = [
      ['folders', 'documents', 'Dossier des documents'], ['folders', 'journal', 'Dossier du journal'],
      ['folders', 'poi', 'Dossier des POI'], ['folders', 'programme', 'Dossier des programmes'],
      ['folders', 'templates', 'Dossier des modèles'],
      ['files', 'home', 'Page d’accueil'], ['files', 'programme', 'Page Programme'], ['files', 'map', 'Page Carte'],
      ['files', 'pois', 'Index des POI'], ['files', 'journal', 'Page Journal'], ['files', 'budget', 'Fichier Budget'],
      ['files', 'packing', 'Fichier Packing list'], ['files', 'documents', 'Page Documents'],
      ['templates', 'poi', 'Modèle de POI'], ['templates', 'journal', 'Modèle de journal'], ['templates', 'programme', 'Modèle de programme'],
    ];
    F.forEach(([grp, key, name]) => this.text(c, name, '', () => s[grp][key], (v) => { s[grp][key] = v.trim(); }, { width: '18em' }));

    /* --------------------------------------------------- affichage des notes */
    const disp = s.display;
    this.heading(c, '🧾 Affichage des notes', 'Ces options sont gérées par le module : elles ne dépendent pas des réglages d’Obsidian (ni de leur synchronisation).');
    const themeSet = new Setting(c).setName('Thème de Trip Buddy')
      .setDesc('Appliqué aux pages du voyage, aux fenêtres et aux cartes. « Par défaut » suit le thème d’Obsidian (clair ou sombre). Commande rapide : « Changer de thème ».')
      .addDropdown((d) => d.addOption('default', '🎨 Par défaut (suit Obsidian)').addOption('dark', '🌙 Sombre')
        .setValue(disp.theme || 'default').onChange((v) => { disp.theme = v; this.save(); }));
    themeSet.settingEl.addClass('tb-theme-setting');
    new Setting(c).setName('Style des pictogrammes')
      .setDesc('« Traits » : icônes fines et monochromes, qui suivent la couleur du thème. « Emoji » : pictogrammes colorés. Les catégories dont l’emoji n’a pas d’équivalent gardent leur emoji.')
      .addDropdown((d) => d.addOption('line', 'Traits (sobre)').addOption('emoji', 'Emoji (coloré)')
        .setValue(disp.iconStyle || 'line').onChange(async (v) => { disp.iconStyle = v; await this.plugin.saveSettings(); this.plugin.rerenderViews(); this.display(); }));
    new Setting(c).setName('Masquer les propriétés en tête des notes')
      .setDesc('Les propriétés restent modifiables via la fiche du lieu, le panneau « Propriétés du fichier » ou le mode source. Commande rapide : « Afficher / masquer les propriétés des notes ».')
      .addToggle((t) => t.setValue(!!disp.hideProperties).onChange((v) => { disp.hideProperties = v; this.save(); }));
    new Setting(c).setName('Masquer le titre en haut des notes')
      .setDesc('Masque le grand titre (nom du fichier) affiché au-dessus du contenu.')
      .addToggle((t) => t.setValue(!!disp.hideInlineTitle).onChange((v) => { disp.hideInlineTitle = v; this.save(); }));
    new Setting(c).setName('Saisie rapide (journal, accueil, programmes, idées, « Mes notes » des lieux)')
      .setDesc('En mode lecture, affiche une zone de texte sous chaque section des entrées de journal, des « Notes rapides » de l’accueil et de la section « Mes notes » des fiches de lieux, pour ajouter, modifier ou supprimer du texte et des photos sans passer en mode édition. Dans les fiches de lieux, tout le texte se modifie ou se supprime ; l’ajout se fait dans « Mes notes ».')
      .addToggle((t) => t.setValue(!!disp.journalQuickAdd).onChange((v) => { disp.journalQuickAdd = v; this.save(); }));
    new Setting(c).setName('Signaler les mises à jour au-dessus du menu')
      .setDesc('Quand une nouvelle version de Trip Buddy est publiée, affiche un panneau au-dessus du menu principal, avec un bouton pour mettre à jour. Vérification sur GitHub au plus toutes les 6 heures.')
      .addToggle((t) => t.setValue(disp.updateBanner !== false).onChange((v) => { disp.updateBanner = v; this.save(); }));
    new Setting(c).setName('Largeur des pages du voyage')
      .setDesc('Appliquée à toutes les pages du voyage (accueil, lieux, journal, programme, budget, valise…), en lecture comme en édition.')
      .addDropdown((d) => d.addOption('normal', 'Standard (largeur de lecture Obsidian)').addOption('wide', 'Large (1 180 px)').addOption('full', 'Pleine largeur')
        .setValue(disp.pageWidth || 'wide').onChange((v) => { disp.pageWidth = v; this.save(); }));
    new Setting(c).setName('Ouvrir les notes en mode lecture')
      .setDesc('Les pages du voyage s’affichent comme une application ; passez en édition avec le crayon (ou Ctrl/Cmd + E). Réappliqué à chaque démarrage, même si la configuration d’Obsidian est réinitialisée.')
      .addToggle((t) => t.setValue(!!disp.readingMode).onChange((v) => { disp.readingMode = v; this.save(); }));
    new Setting(c).setName('Dossier des images et fichiers collés')
      .setDesc('Les pièces jointes ajoutées dans les notes (photos du journal…) y sont rangées et apparaissent dans la page Documents. Laissez vide pour ne pas modifier le réglage d’Obsidian.')
      .addText((t) => {
        t.inputEl.style.width = '16em';
        t.setPlaceholder('01 Documents/Photos').setValue(disp.attachmentFolder || '');
        // appliqué à la validation (sortie du champ / Entrée) pour ne pas créer de dossiers partiels
        t.inputEl.addEventListener('change', () => { disp.attachmentFolder = t.inputEl.value.trim(); this.save(); });
      });
    new Setting(c).setName('Afficher les fichiers et dossiers masqués')
      .setDesc('Montre dans l’explorateur de fichiers les éléments du coffre dont le nom commence par un point (ex. « .claude »). Le dossier de configuration d’Obsidian (.obsidian) reste toujours caché. Les fichiers ne sont ni déplacés ni modifiés.')
      .addToggle((t) => t.setValue(!!disp.showHiddenFiles).onChange(async (v) => {
        disp.showHiddenFiles = v;
        await this.plugin.saveSettings();
        await TBHiddenFiles.sync();
        this.display();
      }));
    if (disp.showHiddenFiles) {
      new Setting(c).setName('Éléments masqués à ne pas afficher')
        .setDesc('Noms ou chemins séparés par des virgules (ex. « .git, .trash, .DS_Store »). Appliqué à la validation du champ.')
        .addText((t) => {
          t.inputEl.style.width = '16em';
          t.setPlaceholder('.git, .trash, .DS_Store').setValue(disp.hiddenExclude || '');
          t.inputEl.addEventListener('change', async () => {
            disp.hiddenExclude = t.inputEl.value.trim();
            await this.plugin.saveSettings();
            await TBHiddenFiles.sync();
          });
        });
    }

    /* ------------------------------------------------ colonnes latérales */
    const ah = s.autoHideSidebars;
    this.heading(c, '↔️ Colonnes latérales', 'Replie automatiquement les colonnes de gauche et de droite quand on ne s’en sert plus, pour laisser toute la place aux notes.');
    new Setting(c).setName('Masquer automatiquement les colonnes inactives')
      .setDesc('Une colonne se replie si vous n’avez pas interagi avec elle pendant le délai choisi (jamais pendant qu’elle est survolée ou en cours de saisie).')
      .addToggle((t) => t.setValue(!!ah.enabled).onChange((v) => { ah.enabled = v; this.plugin.sidebarAutoHide && this.plugin.sidebarAutoHide.reset(); this.save(); }));
    new Setting(c).setName('Délai d’inactivité').setDesc('En secondes (minimum 2).')
      .addText((t) => {
        t.inputEl.type = 'number';
        t.inputEl.min = '2';
        t.inputEl.style.width = '6em';
        t.setValue(String(ah.delay)).onChange((v) => { ah.delay = Math.max(2, parseInt(v, 10) || 10); this.save(); });
      });
    new Setting(c).setName('Colonnes concernées')
      .addDropdown((d) => d.addOption('both', 'Les deux').addOption('left', 'Gauche seulement').addOption('right', 'Droite seulement')
        .setValue(ah.sides || 'both').onChange((v) => { ah.sides = v; this.save(); }));

    /* -------------------------------------------------------- nouveau voyage */
    this.heading(c, '🏠 Démarrage');
    new Setting(c).setName('Ouvrir l’accueil à l’ouverture d’Obsidian')
      .setDesc('Affiche la page d’accueil du voyage à chaque démarrage (dans un nouvel onglet si d’autres notes sont déjà ouvertes).')
      .addToggle((t) => t.setValue(!!s.openHomeOnStartup).onChange((v) => { s.openHomeOnStartup = v; this.save(); }));
    new Setting(c).setName('Rouvrir l’accueil quand tous les onglets sont fermés')
      .setDesc('Dès que le dernier onglet est fermé, la page d’accueil du voyage s’affiche à la place de l’onglet vide.')
      .addToggle((t) => t.setValue(!!s.openHomeWhenEmpty).onChange((v) => { s.openHomeWhenEmpty = v; this.save(); if (v) this.plugin.openHomeIfEmpty(); }));

    this.heading(c, '📤 Exports PDF');
    new Setting(c).setName('Exporter le voyage en PDF')
      .setDesc('Un seul PDF A4 avec sommaire cliquable : programme, lieux visités, journal, carte des lieux visités, photos, budget et documents joints. Sans les pages de documentation du coffre.')
      .addButton((b) => b.setButtonText('📄 Exporter…').setCta().onClick(() => new VaultExportModal(this.plugin).open()));
    new Setting(c).setName('Carnet souvenir imprimable')
      .setDesc('Livret A6 à partir du journal et des lieux visités, imposé pour une impression recto-verso sur A4.')
      .addButton((b) => b.setButtonText('🖨️ Carnet…').onClick(() => new BookletModal(this.plugin).open()));

    this.heading(c, '🧹 Préparer un nouveau voyage', 'Après avoir dupliqué le coffre, videz le contenu d’exemple pour repartir de zéro.', 'reset');
    new Setting(c).setName('Vider les données d’exemple')
      .setDesc('Repart de zéro, définitivement : efface tout le contenu des dossiers Documents, Journal, POI, Programme et Guide (billets, photos, traces, programmes, entrées de journal, fiches de lieux, pages de guide ajoutées), le contexte du voyage (CONTEXT.md) et le travail des skills de planification, puis vide la corbeille du coffre (.trash) ; retire les réseaux de transports en commun et supprime les cartes hors ligne de cet appareil ; vide le tableau des dépenses et les sections libres (Notes rapides, Idées en vrac…), décoche la valise, remet le guide à blanc, renomme le voyage « My trip » 🧳 et efface participants, destination, dates et budgets. Les modèles, les pages d’accueil des rubriques et la devise sont conservés.')
      .addButton((b) => b.setButtonText('Vider…').setWarning().onClick(() => this.plugin.confirmReset()));
    if (this.icons) this.icons.disconnect();
    this.icons = TBIcons.watch(c);
  }

  /** Centre et zoom englobant les lieux géolocalisés (cœur du voyage, sans les excursions lointaines) */
  poiDefaultView() {
    const pts = this.plugin.data.pois().filter((p) => p.hasCoords).map((p) => ({ lat: Number(p.lat), lon: Number(p.lon) }));
    if (!pts.length) return null;
    const med = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor(arr.length / 2)];
    const mid = { lat: med(pts.map((p) => p.lat)), lon: med(pts.map((p) => p.lon)) };
    const near = pts.filter((p) => U.haversine(mid, p) <= 25);
    const set = near.length ? near : pts;
    const s = Math.min(...set.map((p) => p.lat)), n = Math.max(...set.map((p) => p.lat));
    const w = Math.min(...set.map((p) => p.lon)), e = Math.max(...set.map((p) => p.lon));
    const round = (x) => Math.round(x * 1e5) / 1e5;
    // zoom (Web Mercator) pour faire tenir la zone dans une carte d'environ 800 × 500 px, marges comprises
    const merc = (lat) => { const r = (Math.max(-85, Math.min(85, lat)) * Math.PI) / 180; return Math.log(Math.tan(Math.PI / 4 + r / 2)) / (2 * Math.PI); };
    const fx = Math.max((e - w) / 360, 1e-9), fy = Math.max(merc(n) - merc(s), 1e-9);
    let zoom = Math.floor(Math.min(Math.log2(730 / (256 * fx)), Math.log2(430 / (256 * fy))));
    zoom = set.length === 1 ? 15 : Math.max(3, Math.min(16, zoom));
    return { lat: round((s + n) / 2), lon: round((w + e) / 2), zoom };
  }

  /** Fonds de carte hors ligne : choix d'une zone, téléchargement, zones enregistrées */
  offlineSection(c) {
    const s = this.plugin.settings;
    const O = TBOffline;
    this.heading(c, '📥 Cartes hors ligne',
      'Téléchargez à l’avance le fond de carte d’une zone pour consulter les cartes sans connexion (avion, métro, forfait à l’étranger). Les tuiles sont stockées sur cet appareil uniquement, pas dans le coffre ni dans la synchronisation : lancez le téléchargement sur chaque appareil, de préférence en Wi-Fi. Au-delà du zoom téléchargé, la carte agrandit les tuiles disponibles.');

    // ---- choix de la zone, du fond et du niveau de détail
    const nPois = this.plugin.data.pois().filter((p) => p.hasCoords).length;
    const dest = U.slug(s.trip.destination || s.trip.name || '');
    const guess = TRANSIT_CITIES.find((x) => dest.includes(U.slug(x.name))) || null;
    const st = this.offlineState || (this.offlineState = {
      zone: nPois ? 'pois' : (guess ? guess.name : ''),
      layer: (TILE_PRESETS[s.map.tiles] || (s.map.tiles === 'custom' && s.map.customUrl)) ? s.map.tiles : 'osm',
      zoom: O.MAX_ZOOM, other: '', otherCity: null,
    });
    if (st.zone === 'view' && !TripMap.lastView) st.zone = nPois ? 'pois' : '';

    const zoneOf = () => {
      if (st.zone === 'pois') return nPois ? { name: 'Lieux du voyage', source: { type: 'pois' } } : null;
      if (st.zone === 'view') {
        const v = TripMap.lastView;
        if (!v) return null;
        const [so, w, n, e] = v.bbox;
        return { name: `Carte autour de ${((so + n) / 2).toFixed(3)}, ${((w + e) / 2).toFixed(3)}`, source: { type: 'bbox', bbox: v.bbox } };
      }
      if (st.zone === '__other') return st.otherCity ? { name: st.otherCity.name, source: { type: 'bbox', bbox: st.otherCity.bbox } } : null;
      const city = TRANSIT_CITIES.find((x) => x.name === st.zone);
      return city ? { name: city.name, source: { type: 'bbox', bbox: city.bbox } } : null;
    };

    let otherInput = null, goBtn = null, est = null;
    const zoneSet = new Setting(c).setName('Zone à télécharger')
      .setDesc('« Lieux du voyage » couvre tous les lieux géolocalisés (le cœur du voyage en entier, les excursions éloignées autour du lieu). « Zone de la dernière carte » reprend la partie visible de la dernière carte consultée.');
    zoneSet.settingEl.addClass('tb-transit-add');
    zoneSet.addDropdown((d) => {
      d.addOption('', 'Choisir une zone…');
      if (nPois) d.addOption('pois', `📍 Lieux du voyage (${nPois})`);
      if (TripMap.lastView) d.addOption('view', '🗺️ Zone de la dernière carte affichée');
      TRANSIT_CITIES.forEach((x) => d.addOption(x.name, `${x.name} (${x.country})`));
      d.addOption('__other', 'Autre ville…');
      d.setValue(st.zone).onChange((v) => {
        st.zone = v;
        otherInput.inputEl.toggleClass('tb-hidden', v !== '__other');
        if (v === '__other') otherInput.inputEl.focus();
        update();
      });
    });
    zoneSet.addText((tx) => {
      otherInput = tx;
      tx.setPlaceholder('Nom de la ville').setValue(st.other);
      tx.inputEl.style.width = '11em';
      tx.inputEl.toggleClass('tb-hidden', st.zone !== '__other');
      const search = async () => {
        const q = tx.getValue().trim();
        if (!q || (st.otherCity && q === st.other)) return;
        st.other = q;
        st.otherCity = null;
        est.setText(`Recherche de « ${q} »…`);
        try { st.otherCity = await TBTransit.searchCity(this.plugin, q); } catch (e) { st.otherCity = null; }
        if (!st.otherCity) { est.setText(`⚠️ Ville introuvable : « ${q} »`); goBtn.setDisabled(true); return; }
        update();
      };
      tx.inputEl.addEventListener('change', search);
      tx.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } });
    });

    new Setting(c).setName('Fond de carte à télécharger')
      .addDropdown((d) => {
        Object.entries(TILE_PRESETS).forEach(([k, p]) => d.addOption(k, p.name));
        if (s.map.customUrl) d.addOption('custom', 'Personnalisé');
        d.setValue(st.layer).onChange((v) => { st.layer = v; update(); });
      });
    new Setting(c).setName('Niveau de détail')
      .setDesc('Plus le zoom est élevé, plus le téléchargement est long et volumineux.')
      .addDropdown((d) => {
        [[13, 'Ville (zoom 13)'], [14, 'Quartiers (zoom 14)'], [15, 'Rues (zoom 15)'], [16, 'Détaillé, noms des rues (zoom 16)']]
          .forEach(([z, l]) => d.addOption(String(z), l));
        d.setValue(String(st.zoom)).onChange((v) => { st.zoom = Number(v); update(); });
      });

    const run = new Setting(c).setName('Télécharger');
    est = run.descEl;
    let cancelBtn = null;
    run.addButton((b) => {
      cancelBtn = b;
      b.setButtonText('Annuler').setWarning().onClick(() => O.cancel());
      b.buttonEl.toggleClass('tb-hidden', true);
    });
    run.addButton((b) => {
      goBtn = b;
      b.setButtonText('📥 Télécharger').setCta().onClick(async () => {
        const zone = zoneOf();
        if (!zone) return;
        const layer = O.layerInfo(st.layer);
        try {
          const area = await O.download({ name: zone.name, layerKey: st.layer, source: zone.source, maxZoom: st.zoom });
          const msg = area.partial
            ? `📥 ${area.name} : ${area.tiles} / ${area.planned} tuiles enregistrées (téléchargement incomplet, relancez-le pour compléter)`
            : `📥 ${area.name} (${layer.name}) disponible hors ligne · ${U.fileSize(area.bytes)}`;
          new Notice(msg);
        } catch (e) {
          console.error('[Trip Buddy] cartes hors ligne', e);
          new Notice(`⚠️ Cartes hors ligne : ${e.message || e}`);
        }
        if (c.isConnected) this.display();
      });
    });
    const bar = c.createDiv('tb-offline-progress tb-hidden');
    const fill = bar.createDiv('tb-offline-progress-fill');

    const update = () => {
      const job = O.job && O.job.running ? O.job : null;
      cancelBtn.buttonEl.toggleClass('tb-hidden', !job);
      goBtn.buttonEl.toggleClass('tb-hidden', !!job);
      bar.toggleClass('tb-hidden', !job);
      if (job) {
        const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;
        fill.style.width = pct + '%';
        est.setText(`${job.cancelled ? 'Arrêt en cours…' : 'Téléchargement de'} ${job.name} (${job.layerName}) : ${job.done.toLocaleString(LOCALE)} / ${job.total.toLocaleString(LOCALE)} tuiles · ${U.fileSize(job.bytes)}${job.errors ? ` · ${job.errors} erreur${job.errors > 1 ? 's' : ''}` : ''}`);
        return;
      }
      const zone = zoneOf();
      if (!zone) {
        est.setText(st.zone === '__other' ? 'Indiquez une ville puis validez (Entrée).' : 'Choisissez une zone.');
        goBtn.setDisabled(true);
        return;
      }
      const layer = O.layerInfo(st.layer);
      const maxZoom = Math.min(st.zoom, layer.maxZoom || 19);
      const e = O.estimate(O.rectsFor(zone.source, maxZoom));
      if (e.tooMany) {
        est.setText(`⚠️ ${zone.name} : plus de ${O.MAX_TILES.toLocaleString(LOCALE)} tuiles. Baissez le niveau de détail ou choisissez une zone plus petite.`);
        goBtn.setDisabled(true);
        return;
      }
      const existing = O.areas.find((a) => a.id === `${U.slug(zone.name) || 'zone'}@${st.layer}`);
      est.setText(`${zone.name} · ${layer.name} : ${e.tiles.toLocaleString(LOCALE)} tuiles, environ ${U.fileSize(e.bytes)}${existing ? ' · remplace la zone déjà téléchargée' : ''}.`);
      goBtn.setDisabled(false);
    };
    update();
    if (this.offlineOff) this.offlineOff();
    this.offlineOff = O.on(() => { if (est.isConnected) update(); });

    // ---- zones enregistrées sur cet appareil
    const list = c.createDiv('tb-transit-list');
    const render = () => {
      list.empty();
      const areas = O.areas.slice().sort((a, b) => a.name.localeCompare(b.name));
      for (const a of areas) {
        const date = a.fetched ? U.fmtShort(a.fetched.slice(0, 10)) : '';
        const row = new Setting(list)
          .setName(`${a.name} · ${a.layerName}`)
          .setDesc(`${a.tiles.toLocaleString(LOCALE)} tuiles · ${U.fileSize(a.bytes)} · zoom ${a.maxZoom}${date ? ` · téléchargé le ${date}` : ''}${a.partial ? ` · ⚠️ incomplet (${a.tiles}/${a.planned})` : ''}`);
        row.addExtraButton((b) => b.setIcon('refresh-cw').setTooltip(a.partial ? 'Compléter le téléchargement' : 'Mettre à jour les tuiles').onClick(async () => {
          if (O.job && O.job.running) { new Notice('Un téléchargement est déjà en cours.'); return; }
          if (!a.layerKey || (a.layerKey === 'custom' ? !s.map.customUrl : !TILE_PRESETS[a.layerKey])) { new Notice('Ce fond de carte n’est plus disponible.'); return; }
          O.download({ name: a.name, layerKey: a.layerKey, source: a.source, maxZoom: a.maxZoom, refresh: !a.partial })
            .then((n) => new Notice(`📥 ${n.name} mis à jour · ${U.fileSize(n.bytes)}`))
            .catch((e) => new Notice(`⚠️ ${a.name} : ${e.message || e}`))
            .finally(() => { if (c.isConnected) this.display(); });
        }));
        row.addExtraButton((b) => b.setIcon('trash-2').setTooltip('Supprimer cette zone de l’appareil').onClick(async () => {
          if (!window.confirm(`Supprimer la carte hors ligne « ${a.name} » de cet appareil ?`)) return;
          await O.remove(a.id);
          render();
        }));
      }
      if (!areas.length) list.createDiv({ cls: 'setting-item-description', text: 'Aucune zone téléchargée sur cet appareil.' });
      else {
        new Setting(list).setName(`Espace utilisé : ${U.fileSize(O.totalBytes())}`)
          .addButton((b) => b.setButtonText('Tout supprimer').setWarning().onClick(async () => {
            if (O.job && O.job.running) { new Notice('Attendez la fin du téléchargement en cours.'); return; }
            if (!window.confirm('Supprimer toutes les cartes hors ligne de cet appareil ?')) return;
            await O.clearAll();
            render();
          }));
      }
    };
    O.ready.then(() => { if (list.isConnected) { render(); update(); } });
    const credit = c.createDiv({ cls: 'setting-item-description', text: 'Fonds © contributeurs OpenStreetMap et fournisseurs des tuiles. Pour respecter leurs conditions d’usage, le téléchargement est limité au zoom 16 et à deux tuiles à la fois.' });
    credit.style.margin = '0 0 12px';
  }

  /** Éditeur des fournisseurs de carte personnalisés */
  /** Transports en commun : choix d'une ville, téléchargement, réseaux enregistrés */
  transitSection(c) {
    const s = this.plugin.settings;
    const t = s.transit;
    this.heading(c, '🚇 Transports en commun',
      `Lignes de métro, de tram et de funiculaire, avec leurs stations, issues d’OpenStreetMap. Rien n’est téléchargé tant que vous ne choisissez pas une ville ; le réseau est ensuite enregistré dans « ${this.plugin.transitFolder()} » et s’affiche hors ligne.`);
    new Setting(c).setName('Afficher les réseaux sur les cartes')
      .setDesc('Le bouton 🚇 de la carte bascule aussi ce réglage. Les stations apparaissent en zoomant (correspondances d’abord).')
      .addToggle((tg) => tg.setValue(t.show !== false).onChange((v) => { t.show = v; this.save(); }));

    // ---- ajout d'une ville
    const dest = U.slug(s.trip.destination || s.trip.name || '');
    const guess = TRANSIT_CITIES.find((x) => dest.includes(U.slug(x.name))) || null;
    let choice = guess && !t.networks.some((n) => n.id === U.slug(guess.name)) ? guess.name : '';
    let other = '';
    const add = new Setting(c).setName('Charger le réseau d’une ville')
      .setDesc('Choisissez une grande ville de la liste ou « Autre ville… » pour chercher n’importe quelle ville. Le téléchargement prend de quelques secondes à une minute selon la taille du réseau.');
    add.settingEl.addClass('tb-transit-add');
    let otherInput = null, goBtn = null;
    add.addDropdown((d) => {
      d.addOption('', 'Choisir une ville…');
      TRANSIT_CITIES.forEach((x) => d.addOption(x.name, `${x.name} (${x.country})`));
      d.addOption('__other', 'Autre ville…');
      d.setValue(choice).onChange((v) => {
        choice = v;
        otherInput.inputEl.toggleClass('tb-hidden', v !== '__other');
        goBtn.setDisabled(!v);
        if (v === '__other') otherInput.inputEl.focus();
      });
    });
    add.addText((tx) => {
      otherInput = tx;
      tx.setPlaceholder('Nom de la ville').onChange((v) => { other = v.trim(); });
      tx.inputEl.style.width = '11em';
      tx.inputEl.toggleClass('tb-hidden', true);
      tx.inputEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); goBtn.buttonEl.click(); } });
    });
    const status = c.createDiv('tb-transit-status');
    const run = async (city, btn) => {
      const label = btn.buttonEl.textContent;
      btn.setDisabled(true).setButtonText('Téléchargement…');
      try {
        const net = await this.plugin.downloadTransit(city, (msg) => { status.setText(msg); });
        new Notice(`🚇 ${net.name} : ${TBTransit.summary(net)}`);
        this.display();
      } catch (e) {
        console.error('[Trip Buddy] transports', e);
        status.setText(`⚠️ ${city.name} : ${e.message || e}`);
        btn.setDisabled(false).setButtonText(label);
      }
    };
    add.addButton((b) => {
      goBtn = b;
      b.setButtonText('Télécharger').setCta().setDisabled(!choice).onClick(async () => {
        let city = TRANSIT_CITIES.find((x) => x.name === choice);
        if (choice === '__other') {
          if (!other) { status.setText('Indiquez le nom de la ville.'); return; }
          status.setText(`Recherche de « ${other} »…`);
          try { city = await TBTransit.searchCity(this.plugin, other); } catch (e) { city = null; }
          if (!city) { status.setText(`⚠️ Ville introuvable : « ${other} »`); return; }
        }
        if (city) run(city, b);
      });
    });

    // ---- réseaux enregistrés
    const list = c.createDiv('tb-transit-list');
    for (const net of t.networks) {
      const date = net.fetched ? U.fmtShort(net.fetched.slice(0, 10)) : '';
      const row = new Setting(list)
        .setName(`${net.name}${net.country ? ` (${net.country})` : ''}`)
        .setDesc(`${TBTransit.summary(net)}${date ? ` · téléchargé le ${date}` : ''}`);
      const badges = row.descEl.createDiv('tb-transit-lines');
      TBTransit.load(this.plugin, net).then((d) => {
        if (!d) { badges.setText('⚠️ Fichier introuvable : téléchargez-le à nouveau.'); return; }
        d.lines.forEach((l) => {
          const b = badges.createSpan({ cls: 'tb-transit-ref', text: l.ref || TRANSIT_MODES[l.mode].label });
          b.style.setProperty('--tb-c', l.color);
          b.title = `${TRANSIT_MODES[l.mode].label}${l.name ? ' · ' + l.name : ''}`;
        });
      });
      row.addToggle((tg) => tg.setTooltip('Afficher sur les cartes').setValue(net.enabled !== false).onChange((v) => { net.enabled = v; this.save(); }));
      row.addExtraButton((b) => b.setIcon('refresh-cw').setTooltip('Mettre à jour depuis OpenStreetMap').onClick(async () => {
        status.setText(`Mise à jour de ${net.name}…`);
        try {
          const n = await this.plugin.downloadTransit({ name: net.name, country: net.country, bbox: net.bbox }, (msg) => status.setText(msg));
          new Notice(`🚇 ${n.name} mis à jour : ${TBTransit.summary(n)}`);
          this.display();
        } catch (e) { status.setText(`⚠️ ${net.name} : ${e.message || e}`); }
      }));
      row.addExtraButton((b) => b.setIcon('trash-2').setTooltip('Supprimer ce réseau').onClick(async () => {
        if (!window.confirm(`Supprimer le réseau de ${net.name} ? Le fichier part dans la corbeille du coffre.`)) return;
        await this.plugin.removeTransit(net.id);
        this.display();
      }));
    }
    if (!t.networks.length) list.createDiv({ cls: 'setting-item-description', text: 'Aucun réseau chargé pour l’instant.' });
    const credit = c.createDiv({ cls: 'setting-item-description', text: 'Données © contributeurs OpenStreetMap (ODbL), via l’API Overpass.' });
    credit.style.margin = '0 0 12px';
  }

  providerEditor(c, ml) {
    const box = c.createDiv('tb-listedit');
    const render = () => {
      box.empty();
      ml.custom.forEach((p, i) => {
        const row = box.createDiv('tb-listedit-row tb-prov-row');
        const top = row.createDiv('tb-prov-top');
        const ico = top.createEl('button', { cls: 'tb-emoji-btn tb-emoji-btn-sm', text: p.icon || '🗺️' });
        ico.addEventListener('click', () => new EmojiPickerModal(this.plugin, p.icon, (e) => { p.icon = e; ico.setText(e); this.save(); }).open());
        const name = top.createEl('input', { type: 'text', cls: 'tb-input' });
        name.placeholder = 'Nom (ex. Apple Plans)';
        name.value = p.label || '';
        name.style.flex = '1';
        name.addEventListener('change', () => { p.label = name.value.trim(); this.save(); });
        U.button(top, '✕', 'tb-btn-icon tb-btn-sm tb-btn-danger', () => {
          ml.custom.splice(i, 1);
          if (ml.open === p.id) ml.open = 'osm';
          if (ml.directions === p.id) ml.directions = 'osm';
          this.save(); this.display();
        }, 'Supprimer ce fournisseur');
        [['open', 'URL « Ouvrir dans »', 'https://…?q={lat},{lon}'], ['directions', 'URL « Itinéraire »', 'https://…?daddr={lat},{lon}']].forEach(([k, lbl, ph]) => {
          const line = row.createDiv('tb-prov-line');
          line.createSpan({ cls: 'tb-muted tb-small', text: lbl });
          const inp = line.createEl('input', { type: 'text', cls: 'tb-input tb-mono' });
          inp.placeholder = ph;
          inp.value = p[k] || '';
          inp.addEventListener('change', () => { p[k] = inp.value.trim(); this.save(); });
        });
      });
      U.button(box, '＋ Ajouter un fournisseur', 'tb-btn-sm', () => {
        ml.custom.push({ id: 'custom-' + Date.now().toString(36), label: '', icon: '🗺️', open: '', directions: '' });
        this.save(); render();
      });
      U.button(box, '↻ Mettre à jour les listes', 'tb-btn-sm', () => this.display(), 'Rafraîchir les choix ci-dessus après un ajout');
    };
    render();
  }

  /** Ordre et visibilité des rubriques du menu principal (↑ / ↓, 👁 / 🙈, réinitialisation) */
  navOrderEditor(c) {
    const s = this.plugin.settings;
    const box = c.createDiv('tb-listedit tb-navorder');
    const commit = (keys) => { s.navOrder = keys; this.save(); render(); };
    const render = () => {
      box.empty();
      const items = this.plugin.navItems({ all: true });
      const keys = items.map((it) => it[0]);
      const hidden = this.plugin.navHidden();
      items.forEach(([key, icon, label], i) => {
        const isHidden = hidden.has(key);
        const row = box.createDiv('tb-listedit-row' + (isHidden ? ' is-hidden' : ''));
        row.createSpan({ cls: 'tb-navorder-pos', text: String(i + 1) });
        row.createSpan({ cls: 'tb-navorder-ico', text: icon });
        row.createSpan({ cls: 'tb-navorder-lbl', text: label });
        const ctrl = row.createDiv('tb-listedit-ctrl');
        const swap = (j) => { const k = keys.slice(); [k[i], k[j]] = [k[j], k[i]]; commit(k); };
        const up = U.button(ctrl, '↑', 'tb-btn-icon tb-btn-sm', () => { if (i > 0) swap(i - 1); }, 'Monter');
        const down = U.button(ctrl, '↓', 'tb-btn-icon tb-btn-sm', () => { if (i < keys.length - 1) swap(i + 1); }, 'Descendre');
        if (i === 0) up.disabled = true;
        if (i === keys.length - 1) down.disabled = true;
        const eye = U.button(ctrl, isHidden ? '🙈' : '👁', 'tb-btn-icon tb-btn-sm tb-navorder-eye', () => {
          const h = this.plugin.navHidden();
          if (h.has(key)) h.delete(key);
          else if (keys.filter((k) => !h.has(k)).length <= 1) { new Notice('Le menu doit garder au moins une rubrique'); return; }
          else h.add(key);
          s.navHidden = keys.filter((k) => h.has(k));
          this.save();
          render();
        }, isHidden ? 'Afficher dans le menu' : 'Masquer du menu');
        eye.setAttr('aria-pressed', String(isHidden));
      });
      const btns = box.createDiv('tb-navorder-actions');
      const reset = U.button(btns, '↺ Ordre par défaut', 'tb-btn-sm', () => commit([]));
      if (!(s.navOrder || []).length) reset.disabled = true;
      const showAll = U.button(btns, '👁 Tout afficher', 'tb-btn-sm', () => { s.navHidden = []; this.save(); render(); });
      if (!hidden.size) showAll.disabled = true;
    };
    render();
  }

  listEditor(c, arr, fields, factory) {
    const box = c.createDiv('tb-listedit');
    const render = () => {
      box.empty();
      arr.forEach((item, i) => {
        const row = box.createDiv('tb-listedit-row');
        fields.forEach((f) => {
          if (f.type === 'emoji') {
            const b = row.createEl('button', { cls: 'tb-emoji-btn tb-emoji-btn-sm', text: item[f.key] || '·' });
            b.setAttr('title', 'Choisir un emoji');
            b.addEventListener('click', () => new EmojiPickerModal(this.plugin, item[f.key], (e) => {
              item[f.key] = e;
              b.setText(e);
              this.save();
            }, `Emoji de « ${item.label || item.code || 'la catégorie'} »`).open());
            return;
          }
          const inp = row.createEl('input', { cls: 'tb-input ' + (f.cls || '') });
          inp.type = f.type === 'color' ? 'color' : 'text';
          if (f.type === 'number') inp.setAttr('inputmode', 'decimal');
          if (f.ph) inp.placeholder = f.ph;
          if (f.w) inp.style.width = f.w;
          inp.value = item[f.key] ?? '';
          inp.addEventListener('change', () => {
            let v = inp.value;
            if (f.type === 'number') v = U.parseAmount(v);
            if (f.upper) v = v.toUpperCase().trim();
            item[f.key] = v;
            if (f.autoId && !item.id) { item.id = U.slug(v); render(); }
            this.save();
          });
        });
        const ctrl = row.createDiv('tb-listedit-ctrl');
        U.button(ctrl, '↑', 'tb-btn-icon tb-btn-sm', () => { if (i > 0) { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; this.save(); render(); } });
        U.button(ctrl, '↓', 'tb-btn-icon tb-btn-sm', () => { if (i < arr.length - 1) { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; this.save(); render(); } });
        U.button(ctrl, '✕', 'tb-btn-icon tb-btn-sm tb-btn-danger', () => { arr.splice(i, 1); this.save(); render(); }, 'Supprimer');
      });
      U.button(box, '＋ Ajouter', 'tb-btn-sm', () => { arr.push(factory()); this.save(); render(); });
    };
    render();
  }
}
