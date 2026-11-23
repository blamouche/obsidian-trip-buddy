/* ==========================================================================
 * Trip Buddy — sélecteur d'emoji (recherche en français + drapeaux)
 * ========================================================================== */
const EMOJI_GROUPS = [
  ['✈️', 'Voyage', [
    '✈️ avion vol aeroport', '🛫 decollage depart avion', '🛬 atterrissage arrivee', '🧳 valise bagage', '🎒 sac a dos backpack',
    '🗺️ carte plan', '🧭 boussole orientation', '🌍 monde terre europe afrique', '🌎 monde amerique', '🌏 monde asie oceanie',
    '🏖️ plage vacances', '🏝️ ile tropique', '🏔️ montagne neige', '⛰️ montagne', '🌋 volcan', '🏕️ camping tente',
    '⛺ tente camping', '🚢 bateau croisiere paquebot', '⛴️ ferry bateau', '⛵ voilier bateau', '🚤 bateau rapide',
    '🚆 train gare', '🚄 tgv train grande vitesse', '🚇 metro', '🚊 tram tramway', '🚋 tram', '🚌 bus car', '🚐 van minibus',
    '🚗 voiture road trip', '🚙 4x4 suv voiture', '🏍️ moto', '🛵 scooter', '🚲 velo', '🛴 trottinette', '🚕 taxi', '🚡 telepherique',
    '🚠 telecabine', '🚁 helicoptere', '🛶 canoe kayak', '🎫 billet ticket', '🛂 passeport douane', '🏨 hotel', '🛏️ lit hebergement',
    '🗽 statue liberte new york', '🗼 tour tokyo', '🗻 fuji mont', '🏯 chateau japonais', '🏰 chateau', '🕌 mosquee', '⛩️ torii japon',
    '🛕 temple hindou', '⛪ eglise', '🕍 synagogue', '🏛️ monument musee antique', '🎡 grande roue', '🎢 montagnes russes', '🌉 pont nuit',
    '🌁 brouillard pont', '🏙️ ville gratte ciel', '🌃 nuit ville', '🌆 coucher soleil ville', '🌇 lever soleil ville', '🏜️ desert',
  ]],
  ['🌴', 'Nature & météo', [
    '☀️ soleil beau temps', '🌤️ soleil nuage', '⛅ nuageux', '🌥️ couvert', '☁️ nuage', '🌦️ averse', '🌧️ pluie', '⛈️ orage',
    '🌩️ eclair', '❄️ neige flocon', '🌨️ neige', '🌬️ vent', '🌫️ brouillard brume', '🌈 arc en ciel', '🌊 vague mer ocean surf',
    '🌅 lever soleil', '🌄 montagne soleil', '🌙 lune nuit', '⭐ etoile', '🌌 voie lactee', '🔥 feu chaud', '🌴 palmier',
    '🌵 cactus desert', '🌲 sapin foret', '🌳 arbre parc', '🍁 erable automne canada', '🍂 feuilles automne', '🌸 fleur cerisier sakura',
    '🌻 tournesol', '🌷 tulipe', '🌺 hibiscus', '🐚 coquillage', '🐠 poisson', '🐬 dauphin', '🐳 baleine', '🐢 tortue', '🦜 perroquet',
    '🐘 elephant safari', '🦁 lion safari', '🦒 girafe', '🐨 koala australie', '🦘 kangourou', '🐼 panda chine', '🐧 pingouin',
  ]],
  ['🍽️', 'Nourriture', [
    '🍽️ restaurant repas', '🍴 couverts', '☕ cafe', '🍵 the', '🧋 bubble tea', '🍷 vin', '🍺 biere', '🍻 trinquer bieres',
    '🥂 champagne', '🍸 cocktail', '🍹 cocktail tropical', '🥐 croissant boulangerie', '🥖 baguette pain', '🧀 fromage', '🍕 pizza italie',
    '🍝 pates', '🍣 sushi japon', '🍜 ramen nouilles', '🍱 bento', '🥟 ravioli dim sum', '🍛 curry inde', '🌮 taco mexique',
    '🌯 burrito', '🍔 burger', '🍟 frites', '🥗 salade', '🥘 paella plat', '🦐 crevette fruits de mer', '🦞 homard', '🦀 crabe',
    '🐟 poisson', '🍦 glace', '🍨 glace', '🧁 cupcake', '🍰 gateau', '🥧 tarte pastel', '🍫 chocolat', '🍓 fraise', '🍉 pasteque',
    '🍍 ananas', '🥭 mangue', '🍋 citron', '🍇 raisin', '🫒 olive', '🥑 avocat', '🌶️ piment', '🛒 courses supermarche',
  ]],
  ['🎟️', 'Activités', [
    '🎟️ billet activite', '🎭 theatre spectacle', '🎨 art peinture', '🖼️ musee tableau', '🎶 musique', '🎵 musique', '🎤 concert karaoke',
    '🎸 guitare', '🎬 cinema', '📸 photo appareil', '📷 photo', '🏊 natation piscine', '🤿 plongee snorkeling', '🏄 surf', '🚣 aviron',
    '🧗 escalade', '🥾 randonnee', '🚴 velo cyclisme', '⛷️ ski', '🏂 snowboard', '⛸️ patin', '🎣 peche', '🧘 yoga detente', '💆 massage spa',
    '🛍️ shopping', '🎁 cadeau souvenir', '🎉 fete', '🎊 fete', '🎂 anniversaire', '💍 mariage', '💒 mariage', '❤️ amour coeur', '🥰 amoureux',
    '🏟️ stade', '⚽ football', '🏀 basket', '🎾 tennis', '⛳ golf', '🎰 casino', '🎪 cirque', '🎠 manege', '🏰 chateau disney',
  ]],
  ['🧾', 'Objets & budget', [
    '💰 argent budget', '💸 depense', '💳 carte bancaire', '💶 euro billet', '💵 dollar', '💷 livre sterling', '💴 yen', '🪙 piece monnaie',
    '🧾 ticket recu facture', '📄 document', '📑 documents', '📁 dossier', '🗂️ classeur', '📝 note', '📔 journal carnet', '📓 carnet',
    '📚 livres guide', '📅 calendrier date', '🗓️ agenda planning', '⏰ reveil', '⌛ temps', '🔑 cle', '🔒 cadenas', '🩺 sante medecin',
    '💊 medicament', '🩹 pansement', '🧴 creme solaire', '🪥 brosse a dents', '🧼 savon', '👕 vetement t-shirt', '👗 robe', '🩳 short',
    '🩱 maillot de bain', '👟 chaussures baskets', '🥾 chaussures marche', '🩴 tongs', '🧢 casquette', '👒 chapeau', '🕶️ lunettes de soleil',
    '🧥 manteau', '🧣 echarpe', '🧤 gants', '☂️ parapluie', '🔌 prise electricite', '🔋 batterie', '📱 telephone', '💻 ordinateur',
    '🎧 ecouteurs casque', '🔦 lampe torche', '🧸 doudou enfant', '👶 bebe', '🐶 chien', '🐱 chat',
  ]],
  ['📍', 'Symboles', [
    '📍 lieu poi epingle', '📌 punaise', '🚩 drapeau', '🏁 arrivee', '⭐ favori', '🌟 etoile brillante', '✨ magie', '💎 pepite',
    '❤️ coeur', '💜 coeur violet', '💙 coeur bleu', '💚 coeur vert', '🧡 coeur orange', '💛 coeur jaune', '✅ fait valide', '☑️ case cochee',
    '❌ non', '⚠️ attention', '❓ question', '💡 idee astuce', 'ℹ️ info', '🔥 populaire', '🆕 nouveau', '🔝 top', '💯 cent',
    '🏠 maison accueil', '🏘️ quartier', '🏢 immeuble', '🏪 boutique', '🏬 centre commercial', '🏦 banque', '🏥 hopital', '🏫 ecole',
    '⛽ essence station', '🅿️ parking', '🚻 toilettes', '♿ accessible', '🚭 non fumeur', '📶 wifi reseau', '🔔 rappel',
  ]],
];

/* Drapeaux : générés depuis les codes pays ISO, noms en français via Intl */
const FLAG_CODES = ('FR BE CH LU MC CA US MX BR AR CL PE CO CU GB IE IS NO SE FI DK DE AT NL PT ES AD IT MT VA SM GR HR SI ME AL MK RS BA BG RO HU CZ SK PL '
  + 'EE LV LT UA MD GE AM AZ TR CY IL JO LB EG MA DZ TN SN CI CM MG MU RE ZA KE TZ NA BW ET AE QA OM SA IR IN LK NP MV TH VN KH LA MM MY SG ID PH '
  + 'CN HK TW JP KR MN AU NZ FJ PF NC GP MQ GF').split(' ');
const flagOf = (cc) => String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

function emojiCatalog() {
  if (emojiCatalog.cache) return emojiCatalog.cache;
  let names = null;
  try { names = new Intl.DisplayNames([LOCALE], { type: 'region' }); } catch (e) { /* ancien moteur */ }
  const groups = EMOJI_GROUPS.map(([icon, label, list]) => ({
    icon, label,
    items: list.map((s) => {
      const i = s.indexOf(' ');
      return { e: s.slice(0, i), k: s.slice(i + 1) };
    }),
  }));
  groups.splice(1, 0, {
    icon: '🏳️', label: 'Drapeaux',
    items: FLAG_CODES.map((cc) => ({ e: flagOf(cc), k: `drapeau pays ${cc.toLowerCase()} ${names ? U.slug(names.of(cc) || '').replace(/-/g, ' ') : ''}` })),
  });
  emojiCatalog.cache = groups;
  return groups;
}

class EmojiPickerModal extends TBModal {
  /** @param onChoose (emoji) => void */
  constructor(plugin, current, onChoose, title) {
    super(plugin, title || '😀 Choisir un emoji');
    this.current = current || '';
    this.onChoose = onChoose;
    this.group = 0;
    this.q = '';
  }

  onOpen() {
    const c = this.contentEl;
    c.addClass('tb');
    this.modalEl.addClass('tb-modal-tall', 'tb-emoji-modal');

    const top = c.createDiv('tb-emoji-top');
    this.preview = top.createDiv({ cls: 'tb-emoji-preview', text: this.current || '·' });
    const search = top.createEl('input', { type: 'search', cls: 'tb-input tb-grow', attr: { placeholder: '🔎 Rechercher (ex. plage, train, japon, café…)' } });
    search.addEventListener('input', () => { this.q = U.slug(search.value).replace(/-/g, ' '); this.renderGrid(); });

    this.tabs = c.createDiv('tb-emoji-tabs');
    emojiCatalog().forEach((g, i) => {
      const b = this.tabs.createEl('button', { cls: 'tb-emoji-tab' + (i === this.group ? ' is-active' : ''), text: g.icon });
      b.setAttr('title', g.label);
      b.setAttr('aria-label', g.label);
      b.addEventListener('click', () => {
        this.group = i;
        search.value = ''; this.q = '';
        this.tabs.querySelectorAll('.tb-emoji-tab').forEach((x) => x.removeClass('is-active'));
        b.addClass('is-active');
        this.renderGrid();
      });
    });

    this.label = c.createDiv('tb-emoji-label');
    this.grid = c.createDiv('tb-emoji-grid');

    const foot = c.createDiv('tb-modal-footer');
    const own = foot.createDiv('tb-inline');
    own.createSpan({ cls: 'tb-muted tb-small', text: 'Ou collez le vôtre :' });
    const custom = own.createEl('input', { type: 'text', cls: 'tb-input tb-emoji-custom' });
    custom.value = this.current;
    custom.addEventListener('input', () => this.preview.setText(custom.value || '·'));
    foot.createDiv('tb-grow');
    U.button(foot, 'Annuler', '', () => this.close());
    U.button(foot, 'Valider', 'mod-cta', () => this.choose(custom.value.trim()));

    this.renderGrid();
    setTimeout(() => search.focus(), 50);
  }

  renderGrid() {
    const groups = emojiCatalog();
    let items;
    if (this.q) {
      const words = this.q.split(' ').filter(Boolean);
      const seen = new Set();
      items = groups.flatMap((g) => g.items).filter((it) => {
        if (seen.has(it.e)) return false;
        const ok = words.every((w) => it.k.includes(w));
        if (ok) seen.add(it.e);
        return ok;
      });
      this.label.setText(`${items.length} résultat${items.length > 1 ? 's' : ''}`);
      this.tabs.addClass('is-searching');
    } else {
      items = groups[this.group].items;
      this.label.setText(groups[this.group].label);
      this.tabs.removeClass('is-searching');
    }
    this.grid.empty();
    if (!items.length) { this.grid.createDiv({ cls: 'tb-muted', text: 'Aucun emoji trouvé — collez-le dans le champ ci-dessous.' }); return; }
    items.forEach((it) => {
      const b = this.grid.createEl('button', { cls: 'tb-emoji' + (it.e === this.current ? ' is-active' : ''), text: it.e });
      b.setAttr('title', it.k.split(' ').slice(0, 3).join(' '));
      b.addEventListener('click', () => this.choose(it.e));
    });
  }

  choose(e) {
    if (!e) { new Notice('Choisissez un emoji'); return; }
    this.close();
    this.onChoose(e);
  }

  onClose() { this.contentEl.empty(); }
}

/* --------------------------------------------------------------------------
 * Couleurs d'un emoji → dégradé de l'en-tête de l'accueil.
 * L'emoji est dessiné sur un petit canvas ; on regroupe ses pixels colorés par
 * teinte et on garde les 1 à 3 teintes dominantes, assombries juste ce qu'il faut
 * pour que le texte blanc reste lisible. Renvoie null pour un emoji sans couleur
 * (noir, blanc, gris, drapeau non rendu…) : l'en-tête garde alors son dégradé par défaut.
 * -------------------------------------------------------------------------- */
function emojiPalette(emoji) {
  const cache = emojiPalette.cache || (emojiPalette.cache = new Map());
  if (!emoji) return null;
  if (cache.has(emoji)) return cache.get(emoji);
  let res = null;
  try { res = emojiPalette.compute(emoji); } catch (e) { res = null; }
  cache.set(emoji, res);
  return res;
}

emojiPalette.compute = function (emoji) {
  const N = 56;
  const cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(N * 0.78)}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Twemoji Mozilla", sans-serif`;
  ctx.fillText(emoji, N / 2, N / 2 + N * 0.04);
  const px = ctx.getImageData(0, 0, N, N).data;

  // 24 secteurs de teinte (15°) : poids = chroma, moyennes circulaires de la teinte
  const B = 24;
  const bins = Array.from({ length: B }, () => ({ w: 0, x: 0, y: 0, s: 0, l: 0 }));
  let total = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 160) continue;
    const [h, s, l] = emojiPalette.hsl(px[i], px[i + 1], px[i + 2]);
    const chroma = s * (1 - Math.abs(2 * l - 1));
    if (chroma < 0.18) continue; // gris, blancs, noirs, contours
    const b = bins[Math.floor(h / (360 / B)) % B];
    b.w += chroma; b.x += Math.cos(h * Math.PI / 180) * chroma; b.y += Math.sin(h * Math.PI / 180) * chroma;
    b.s += s * chroma; b.l += l * chroma;
    total += chroma;
  }
  if (total < 12) return null; // trop peu de couleur

  // fusion avec les secteurs voisins pour lisser, puis choix de teintes bien distinctes
  const cand = bins.map((b, i) => {
    const p = bins[(i + B - 1) % B], n = bins[(i + 1) % B];
    const w = b.w + 0.5 * (p.w + n.w);
    const x = b.x + 0.5 * (p.x + n.x), y = b.y + 0.5 * (p.y + n.y);
    return { w, h: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360, s: b.w ? b.s / b.w : 0, l: b.w ? b.l / b.w : 0, own: b.w };
  }).filter((c) => c.own > 0).sort((a, b) => b.w - a.w);
  const dist = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };
  const picked = [];
  for (const c of cand) {
    if (picked.length >= 3) break;
    if (picked.length && c.w < picked[0].w * 0.12) break;
    if (picked.every((p) => dist(p.h, c.h) >= 35)) picked.push(c);
  }
  if (!picked.length) return null;

  // une ou deux teintes : on complète par des teintes voisines pour garder un vrai dégradé
  let hues = picked.map((p) => p.h);
  if (hues.length === 1) hues = [hues[0] - 22, hues[0], hues[0] + 22];
  else if (hues.length === 2) {
    let d = hues[1] - hues[0];
    if (d > 180) d -= 360; else if (d < -180) d += 360;
    const mid = ((hues[0] + d / 2) % 360 + 360) % 360;
    // un passage par le jaune-vert donnerait un kaki terne (rouge → vert) : on garde alors la 1re teinte
    hues = [hues[0], mid >= 45 && mid <= 110 ? hues[0] : mid, hues[1]];
  } else {
    // 3 teintes : ordre qui suit le cercle chromatique pour éviter un passage boueux
    const [a, b, c] = hues;
    const order = [[a, b, c], [a, c, b], [b, a, c]].sort((u, v) => (dist(u[0], u[1]) + dist(u[1], u[2])) - (dist(v[0], v[1]) + dist(v[1], v[2])))[0];
    hues = order;
  }
  const sat = Math.min(0.88, Math.max(0.6, picked[0].s));
  return hues.map((h, i) => emojiPalette.readable(((h % 360) + 360) % 360, sat, 0.56 - i * 0.04));
};

/** Couleur assez foncée pour du texte blanc (luminance relative plafonnée) */
emojiPalette.readable = function (h, s, l) {
  if (h >= 45 && h <= 75) h = 38 + (h - 45) * 0.25; // jaunes → ambre (un jaune foncé vire au kaki)
  let rgb = emojiPalette.rgb(h, s, l);
  while (emojiPalette.lum(rgb) > 0.28 && l > 0.28) { l -= 0.02; rgb = emojiPalette.rgb(h, s, l); }
  return '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
};

emojiPalette.hsl = function (r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
};

emojiPalette.rgb = function (h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
};

emojiPalette.lum = function ([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
