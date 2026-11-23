
/* ==========================================================================
 * Trip Buddy — fichiers et dossiers masqués dans l'explorateur
 *
 * Obsidian ignore tout chemin dont un élément commence par « . » : l'adaptateur
 * de fichiers traite ces chemins comme supprimés (reconcileDeletion). Quand
 * l'option est active, on intercepte cet appel : si le chemin existe sur le
 * disque et n'est pas exclu, il est indexé comme un fichier normal et apparaît
 * dans l'arborescence. Le dossier de configuration (.obsidian) n'est jamais
 * affiché. Rien n'est écrit ni supprimé sur le disque.
 * ========================================================================== */
const TBHiddenFiles = {
  plugin: null,
  adapter: null,
  orig: null,

  init(plugin) {
    this.plugin = plugin;
    const adapter = plugin.app.vault.adapter;
    if (!adapter || typeof adapter.reconcileDeletion !== 'function' || !adapter.files) return; // API interne absente
    this.adapter = adapter;
    this.orig = adapter.reconcileDeletion;
    const self = this;
    adapter.reconcileDeletion = async function (realPath, path, immediate) {
      if (self.allowed(path) && await self.reveal(this, realPath, path)) return;
      return self.orig.apply(this, arguments);
    };
  },

  /** Restaure le comportement d'Obsidian et retire les éléments masqués de l'arborescence */
  async unload() {
    const adapter = this.adapter;
    if (!adapter) return;
    adapter.reconcileDeletion = this.orig;
    this.adapter = null;
    await this.hideAll(adapter, () => true);
  },

  enabled() {
    const d = this.plugin && this.plugin.settings.display;
    return !!(d && d.showHiddenFiles);
  },

  /** Noms toujours ignorés (réglage « Exclure ») */
  excluded() {
    const raw = String((this.plugin.settings.display || {}).hiddenExclude || '');
    return new Set(raw.split(/[,\n]/).map((x) => x.trim().replace(/^\/+|\/+$/g, '')).filter(Boolean));
  },

  isHidden(path) {
    return String(path || '').split('/').some((seg) => seg.startsWith('.'));
  },

  /** Le chemin masqué doit-il apparaître dans l'arborescence ? */
  allowed(path) {
    if (!this.enabled() || !path || path === '/' || !this.isHidden(path)) return false;
    const config = this.plugin.app.vault.configDir || '.obsidian';
    if (path === config || path.startsWith(config + '/')) return false;
    const ex = this.excluded();
    if (ex.has(path)) return false;
    for (const seg of path.split('/')) {
      if (seg === '.' || seg === '..') return false;
      if (seg.startsWith('.') && ex.has(seg)) return false;
    }
    return true;
  },

  /** Indexe le chemin s'il existe sur le disque ; false s'il est introuvable */
  async reveal(adapter, realPath, path) {
    try {
      const i = path.lastIndexOf('/');
      if (i > 0) {
        const parent = path.slice(0, i);
        if (!adapter.files[parent]) {
          const j = realPath.lastIndexOf('/');
          await adapter.reconcileFile(j > 0 ? realPath.slice(0, j) : parent, parent);
          if (!adapter.files[parent]) return false;
        }
      }
      if (typeof adapter.reconcileFileInternal === 'function') {
        // bureau : lstat puis création du fichier / dossier (et parcours de son contenu)
        await adapter.reconcileFileInternal(realPath, path);
      } else if (adapter.fs && typeof adapter.fs.stat === 'function') {
        // mobile (Capacitor)
        const st = await adapter.fs.stat(adapter.getFullRealPath(realPath));
        if (st.type === 'file') adapter.reconcileFileChanged(realPath, path, st);
        else if (st.type === 'directory') await adapter.reconcileFolderCreation(realPath, path);
        else return false;
      } else {
        return false;
      }
      return !!adapter.files[path];
    } catch (e) {
      return false; // introuvable ou illisible : comportement normal d'Obsidian
    }
  },

  /** Retire de l'arborescence les éléments masqués qui ne doivent plus y figurer */
  async hideAll(adapter, shouldHide) {
    const paths = Object.keys(adapter.files)
      .filter((p) => this.isHidden(p) && shouldHide(p))
      .sort((a, b) => a.length - b.length);
    for (const p of paths) {
      const f = adapter.files[p];
      if (f) await adapter.queue(() => this.orig.call(adapter, f.realpath, p, true));
    }
  },

  /** Recherche sur le disque les éléments masqués à afficher */
  async scan(adapter) {
    const queue = [''];
    const seen = new Set();
    while (queue.length) {
      const dir = queue.shift();
      if (seen.has(dir)) continue;
      seen.add(dir);
      let list;
      try { list = await adapter.list(dir); } catch (e) { continue; }
      const entries = [...list.folders.map((p) => [p, true]), ...list.files.map((p) => [p, false])];
      for (const [p, isFolder] of entries) {
        const name = p.slice(p.lastIndexOf('/') + 1);
        if (name.startsWith('.')) {
          if (!adapter.files[p] && this.allowed(p)) {
            // un dossier masqué est parcouru en entier par Obsidian une fois indexé
            await adapter.queue(() => adapter.reconcileFile(adapter.getRealPath(p), p));
          }
        } else if (isFolder) {
          queue.push(p);
        }
      }
    }
  },

  /** Applique le réglage courant (à l'ouverture et à chaque modification) */
  async sync() {
    const adapter = this.adapter;
    if (!adapter) return;
    if (this.syncing) { this.again = true; return; }
    this.syncing = true;
    try {
      do {
        this.again = false;
        await this.hideAll(adapter, (p) => !this.allowed(p));
        if (this.enabled()) await this.scan(adapter);
      } while (this.again);
    } catch (e) {
      console.error('Trip Buddy : fichiers masqués', e);
    } finally {
      this.syncing = false;
    }
  },
};
