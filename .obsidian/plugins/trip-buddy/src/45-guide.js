/* ==========================================================================
 * Trip Buddy — guide de voyage
 * Quelques pages de conseils propres à la destination (transports, nourriture,
 * langue, histoire, pourboires, sécurité, numéros utiles, formalités). Ce sont des notes Markdown normales
 * (propriété `type: guide`) ; le module fournit l'index, la navigation entre
 * pages et un squelette pour chaque nouveau voyage.
 * ========================================================================== */
const GUIDE_PAGES = [
  {
    key: 'transports', order: 1, icon: '🚇', title: 'Transports',
    summary: 'Se déplacer sur place : réseaux, billets et tarifs, liens, bons plans, ce qu’il faut anticiper.',
    sections: [
      ['🧭 L’essentiel', 'Arrivée et trajet jusqu’à l’hébergement, billet conseillé, horaires à retenir.'],
      ['🎫 Billets et tarifs', 'Tableau des titres de transport, prix, où les acheter, comment valider.'],
      ['🚇 Réseaux', 'Métro, tram, bus, train, bateaux… lignes utiles, horaires, plans.'],
      ['🚕 Taxis, VTC et aéroport', 'Tarifs, suppléments, navettes.'],
      ['💡 Bons plans', 'Cartes touristiques, gratuités, astuces.'],
      ['⚠️ À savoir et à anticiper', 'Grèves, travaux, jours fériés, accessibilité.'],
      ['🔗 Liens utiles', 'Sites officiels, applis.'],
    ],
  },
  {
    key: 'nourriture', order: 2, icon: '🍽️', title: 'Nourriture',
    summary: 'Habitudes et horaires des repas, traditions, spécialités à goûter, boissons, comment commander.',
    sections: [
      ['⏰ Horaires et habitudes', 'Heures des repas, déroulement, réservation.'],
      ['🥘 Spécialités à goûter', 'Plats, desserts, produits locaux.'],
      ['🍷 Boissons', 'Vins, bières, cafés, boissons locales.'],
      ['🎉 Traditions et saisons', 'Ce qu’on mange à cette période de l’année.'],
      ['🗣️ Commander', 'Vocabulaire du menu, formules, régimes particuliers.'],
      ['💡 Bons plans', 'Marchés, formules du midi, adresses à éviter.'],
    ],
  },
  {
    key: 'langue', order: 3, icon: '🗣️', title: 'La langue',
    summary: 'Langues parlées, prononciation, politesse et glossaire des mots les plus utiles.',
    sections: [
      ['🌍 Langues parlées', 'Langue(s) officielle(s), anglais, français.'],
      ['🔤 Prononciation', 'Quelques règles pour se faire comprendre.'],
      ['👋 Politesse', 'Salutations, tutoiement, usages.'],
      ['📖 Glossaire', 'Tableau : français / langue locale / prononciation.'],
    ],
  },
  {
    key: 'histoire', order: 4, icon: '🏛️', title: 'Histoire',
    summary: 'Les grandes étapes de l’histoire du lieu et le contexte utile pour comprendre ce que l’on visite.',
    sections: [
      ['📜 En quelques mots', 'Le résumé à connaître avant de partir.'],
      ['🕰️ Les grandes périodes', 'Chronologie commentée.'],
      ['🏗️ Ce que l’on voit aujourd’hui', 'Quartiers, monuments et ce qu’ils racontent.'],
      ['🧩 Pour comprendre l’actualité', 'Identité, politique, sujets sensibles.'],
    ],
  },
  {
    key: 'pourboires', order: 5, icon: '💶', title: 'Pourboires',
    summary: 'Usages du pourboire selon les situations, paiement, taxes et frais à prévoir.',
    sections: [
      ['💡 La règle générale', 'Obligatoire ou non, montants habituels.'],
      ['📋 Selon les situations', 'Restaurant, bar, taxi, hôtel, guide…'],
      ['💳 Payer sur place', 'Carte, espèces, monnaie, frais bancaires.'],
      ['🧾 Taxes et frais à prévoir', 'Taxe de séjour, couverts, suppléments.'],
    ],
  },
  {
    key: 'securite', order: 6, icon: '🛡️', title: 'Sécurité et arnaques',
    summary: 'Risques réels, quartiers et moments à surveiller, arnaques connues, numéros d’urgence.',
    sections: [
      ['🧭 Le niveau de risque', 'Ce qu’il faut vraiment craindre (et ce qui est exagéré).'],
      ['👜 Vols et pickpockets', 'Lieux et techniques, comment se protéger.'],
      ['🎭 Arnaques connues', 'Les scénarios classiques et comment réagir.'],
      ['🚑 Urgences et démarches', 'Que faire et où aller : commissariat, perte de papiers, consulat (les numéros sont dans « Numéros utiles »).'],
    ],
  },
  {
    key: 'numeros', order: 10, icon: '📞', title: 'Numéros utiles',
    summary: 'Urgences, ambassade ou consulat, opposition bancaire, assistance et contacts sur place.',
    sections: [
      ['🚨 Urgences', 'Tableau : 112, police, pompiers, secours médical, secours en mer ou en montagne.'],
      ['🏛️ Ambassade et consulat', 'Adresse, téléphone, horaires, en cas de perte ou de vol des papiers.'],
      ['💳 Banque et assurances', 'Opposition carte bancaire, assistance et rapatriement de l’assurance voyage.'],
      ['🏨 Sur place', 'Hébergement, hôte, loueur, taxis, pharmacie de garde.'],
    ],
  },
  {
    key: 'formalites', order: 11, icon: '🛂', title: 'Formalités',
    summary: 'Papiers d’identité, santé, assurances, douane et démarches à faire avant le départ.',
    sections: [
      ['🛂 Papiers d’identité', 'Carte d’identité ou passeport, visa, validité, mineurs.'],
      ['🩺 Santé', 'Carte européenne d’assurance maladie, vaccins, médicaments, pharmacies.'],
      ['🛡️ Assurances', 'Assurance voyage, rapatriement, garanties de la carte bancaire.'],
      ['🧳 Douane et règles d’entrée', 'Franchises, produits interdits, animaux.'],
      ['📋 À faire avant de partir', 'Copies des papiers, démarches et délais.'],
    ],
  },
];

const TBGuide = {
  /** Squelette Markdown d'une page du guide (nouveau voyage) */
  skeleton(def) {
    const body = def.sections.map(([h, hint]) => `## ${h}\n> *${hint}*\n\n`).join('');
    return `---
type: guide
guide: ${def.key}
order: ${def.order}
icon: "${def.icon}"
summary: "${def.summary.replace(/"/g, '\\"')}"
cssclasses:
  - tb-page
---
\`\`\`tripbuddy-nav
\`\`\`
\`\`\`tripbuddy-guide
mode: pager
\`\`\`

# ${def.icon} ${def.title}

${body}`;
  },

  indexPage() {
    return `---
cssclasses:
  - tb-page
  - tb-wide
---
\`\`\`tripbuddy-nav
\`\`\`

# 📚 Guide du voyage

\`\`\`tripbuddy-guide
\`\`\`
`;
  },
};

/* --------------------------------------------------------------------------
 * ```tripbuddy-guide``` — index des pages du guide (ou, avec `mode: pager`,
 * barre de navigation entre les pages en tête de chacune d'elles)
 * -------------------------------------------------------------------------- */
class GuideBlock extends TBBlock {
  mount() {
    this.root.addClass('tb-guide');
    return this.refresh();
  }

  relevant(f) { return !!f && this.data.fm(f).type === 'guide'; }

  pages() { return this.plugin.guidePages(); }


  async refresh() {
    const r = this.root;
    r.empty();
    const pages = await this.pages();
    if (String(this.opts.mode || '') === 'pager') return this.renderPager(r, pages);
    return this.renderIndex(r, pages);
  }

  renderPager(r, pages) {
    r.addClass('tb-guide-pager');
    const cur = this.sourceFile();
    const idx = pages.findIndex((p) => p.file === cur);
    const bar = r.createDiv('tb-guide-tabs');
    const home = bar.createEl('a', { cls: 'tb-guide-tab', href: '#', text: '📚 Guide' });
    home.addEventListener('click', (e) => { e.preventDefault(); this.plugin.openPath(this.s.files.guide); });
    pages.forEach((p) => {
      const a = bar.createEl('a', { cls: 'tb-guide-tab' + (p.file === cur ? ' is-active' : ''), href: '#' });
      a.createSpan({ text: `${p.icon} ` });
      a.createSpan({ cls: 'tb-guide-tab-lbl', text: p.title });
      a.title = p.title;
      a.addEventListener('click', (e) => { e.preventDefault(); this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(p.file); });
    });
    if (idx >= 0) {
      // page suivante en bas de la note : simple lien textuel dans la barre
      const next = pages[idx + 1];
      if (next) {
        const n = bar.createEl('a', { cls: 'tb-guide-next', href: '#', text: `${next.title} ▶` });
        n.title = 'Page suivante';
        n.addEventListener('click', (e) => { e.preventDefault(); this.app.workspace.getLeaf(false).openFile(next.file); });
      }
    }
  }

  renderIndex(r, pages) {
    const s = this.s;
    const head = r.createDiv('tb-guide-intro');
    head.createDiv({ cls: 'tb-kicker', text: `📚 ${s.trip.destination || s.trip.name || 'Destination'}` });
    head.createDiv({ cls: 'tb-guide-lead', text: 'Les conseils pratiques pour la destination, à lire avant de partir et à garder sous la main sur place.' });
    if (!pages.length) {
      U.empty(r, '📚', 'Aucune page dans le guide', 'Créez les pages de base (transports, nourriture, langue, histoire, pourboires, sécurité) puis complétez-les.');
    }
    const grid = r.createDiv('tb-guide-grid');
    for (const p of pages) {
      const card = grid.createEl('a', { cls: 'tb-card tb-guide-card', href: '#' });
      card.addEventListener('click', (e) => { e.preventDefault(); this.app.workspace.getLeaf(e.ctrlKey || e.metaKey).openFile(p.file); });
      const top = card.createDiv('tb-guide-card-top');
      top.createDiv({ cls: 'tb-guide-icon', text: p.icon });
      const tt = top.createDiv('tb-grow');
      tt.createDiv({ cls: 'tb-guide-title', text: p.title });
      if (p.draft) tt.createSpan({ cls: 'tb-chip tb-guide-draft', text: '✏️ À compléter' });
      if (p.summary) card.createDiv({ cls: 'tb-guide-summary', text: p.summary });
      if (p.headings.length) {
        const ul = card.createDiv('tb-guide-heads');
        p.headings.slice(0, 7).forEach((h) => ul.createSpan({ cls: 'tb-guide-head', text: h }));
      }
    }
    const missing = GUIDE_PAGES.filter((d) => !pages.some((p) => p.key === d.key));
    const tools = r.createDiv('tb-actions tb-guide-tools');
    if (missing.length) {
      U.button(tools, `＋ Créer ${missing.length > 1 ? `les ${missing.length} pages manquantes` : 'la page manquante'}`, 'mod-cta', async () => {
        const n = await this.plugin.ensureGuidePages();
        new Notice(`📚 ${n} page${n > 1 ? 's' : ''} ajoutée${n > 1 ? 's' : ''} au guide`);
      }, missing.map((m) => m.title).join(', '));
    }
    U.button(tools, '＋ Nouvelle page', '', () => this.plugin.newGuidePage());
  }
}

/* ------------------------------------------------- nouvelle page du guide */
class GuideNewPageModal extends TBModal {
  constructor(plugin) { super(plugin, '📚 Nouvelle page du guide'); }
  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    const icon = this.input('text', '💡', '');
    icon.style.width = '4em';
    const title = this.input('text', '', 'Ex. Shopping, Climat, Avec des enfants…');
    const row = c.createDiv('tb-row');
    this.field(row, 'Icône', icon);
    this.field(row, 'Titre', title).addClass('tb-grow');
    const go = async () => {
      const t = title.value.trim();
      if (!t) { title.focus(); return; }
      this.close();
      await this.plugin.createGuidePage({ icon: icon.value.trim() || '💡', title: t });
    };
    title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    this.footer([['Annuler', '', () => this.close()], ['Créer', 'mod-cta', go]]);
    setTimeout(() => title.focus(), 50);
  }
  onClose() { this.contentEl.empty(); }
}
