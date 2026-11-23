/* ==========================================================================
 * Trip Buddy — mise à jour du module et des skills IA depuis GitHub
 *
 * Chaque version publie, à côté du coffre zippé, un paquet de mise à jour
 * « trip-buddy-update-vX.Y.Z.json » : { format: 1, version, files: [{ path, size, sha256, data }] }
 *   path « plugin/… » → dossier du module (.obsidian/plugins/trip-buddy/…)
 *   path « skills/… » → .claude/skills/…  (data : contenu en base64)
 *
 * Périmètre : le dossier du module (sauf data.json) et, dans .claude/skills, les seuls dossiers
 * de skills livrés. Les notes, documents, trip-buddy.json et les autres skills ne sont jamais touchés.
 * Avant d'écrire, l'ancienne version est copiée dans .trash/trip-buddy-<version>-<date>/ ;
 * en cas d'erreur pendant l'écriture, elle est remise en place.
 * ========================================================================== */
const UPDATE_SKILLS_DIR = '.claude/skills';
const UPDATE_KEEP = ['data.json']; // fichiers du module propres à l'appareil, jamais remplacés

class TBUpdater {
  /** @param adapter DataAdapter d'Obsidian (exists, list, readBinary, writeBinary, mkdir, remove)
   *  @param pluginDir dossier du module dans le coffre (manifest.dir) */
  constructor(adapter, pluginDir) {
    this.fs = adapter;
    this.pluginDir = String(pluginDir).replace(/\/+$/, '');
  }

  /** Chemin du coffre pour une entrée du paquet ; refuse tout chemin qui sortirait du périmètre */
  target(path) {
    const i = String(path).indexOf('/');
    const root = path.slice(0, i);
    const rel = path.slice(i + 1);
    if (i < 1 || !rel || rel.split('/').some((p) => !p || p === '.' || p === '..')) throw new Error(`chemin refusé : ${path}`);
    if (root === 'plugin') {
      if (UPDATE_KEEP.includes(rel)) throw new Error(`fichier protégé : ${path}`);
      return `${this.pluginDir}/${rel}`;
    }
    if (root === 'skills') {
      if (!rel.includes('/')) throw new Error(`chemin refusé : ${path}`); // toujours dans un dossier de skill
      return `${UPDATE_SKILLS_DIR}/${rel}`;
    }
    throw new Error(`chemin refusé : ${path}`);
  }

  static decode(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  static async sha256(bytes) {
    const c = globalThis.crypto;
    if (!c || !c.subtle) return null; // pas de vérification possible : la taille reste contrôlée
    const h = new Uint8Array(await c.subtle.digest('SHA-256', bytes));
    return Array.from(h, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  static buffer(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }

  async listFiles(dir) {
    const out = [];
    const walk = async (d) => {
      const l = await this.fs.list(d);
      out.push(...l.files);
      for (const f of l.folders) await walk(f);
    };
    if (await this.fs.exists(dir)) await walk(dir);
    return out;
  }

  async mkdirp(dir) {
    const parts = dir.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const d = parts.slice(0, i).join('/');
      if (d && !(await this.fs.exists(d))) await this.fs.mkdir(d);
    }
  }

  async put(path, bytes) {
    const slash = path.lastIndexOf('/');
    if (slash > 0) await this.mkdirp(path.slice(0, slash));
    await this.fs.writeBinary(path, bytes instanceof Uint8Array ? TBUpdater.buffer(bytes) : bytes);
  }

  /** Vérifie le paquet en entier (avant toute écriture) ; renvoie [{ path, bytes }] */
  async verify(bundle, expectedVersion) {
    if (!bundle || bundle.format !== 1 || bundle.name !== 'trip-buddy' || !Array.isArray(bundle.files)) {
      throw new Error('paquet de mise à jour invalide');
    }
    if (expectedVersion && U.semverCmp(bundle.version, expectedVersion) !== 0) {
      throw new Error(`le paquet est en version ${bundle.version}, ${expectedVersion} attendue`);
    }
    const files = [];
    for (const f of bundle.files) {
      const path = this.target(f.path);
      const bytes = TBUpdater.decode(f.data || '');
      if (bytes.length !== f.size) throw new Error(`fichier tronqué : ${f.path}`);
      const h = await TBUpdater.sha256(bytes);
      if (h && f.sha256 && h !== f.sha256) throw new Error(`empreinte incorrecte : ${f.path}`);
      files.push({ path, bytes });
    }
    const has = (p) => files.some((f) => f.path === `${this.pluginDir}/${p}`);
    if (!has('main.js') || !has('manifest.json')) throw new Error('paquet incomplet (main.js / manifest.json)');
    return files;
  }

  /** Installe le paquet. Renvoie { written, removed, backup } */
  async install(bundle, opts = {}) {
    const files = await this.verify(bundle, opts.expectedVersion);

    // fichiers actuellement en place dans le périmètre (module + skills livrés)
    const skillDirs = [...new Set(files.map((f) => f.path)
      .filter((p) => p.startsWith(UPDATE_SKILLS_DIR + '/'))
      .map((p) => p.split('/').slice(0, 3).join('/')))];
    const keep = new Set(UPDATE_KEEP.map((k) => `${this.pluginDir}/${k}`));
    const old = [];
    for (const d of [this.pluginDir, ...skillDirs]) old.push(...(await this.listFiles(d)));
    const current = old.filter((p) => !keep.has(p));
    const incoming = new Set(files.map((f) => f.path));

    // 1. sauvegarde de la version en place
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const backup = `.trash/trip-buddy-${opts.currentVersion || 'ancienne'}-${stamp}`;
    for (const p of current) await this.put(`${backup}/${p}`, await this.fs.readBinary(p));

    // 2. écriture de la nouvelle version, retrait des fichiers qui n'existent plus
    let removed = 0;
    try {
      for (const f of files) await this.put(f.path, f.bytes);
      for (const p of current) if (!incoming.has(p)) { await this.fs.remove(p); removed++; }
    } catch (e) {
      // 3. échec : remise en place de l'ancienne version
      for (const p of current) {
        try { await this.put(p, await this.fs.readBinary(`${backup}/${p}`)); } catch (er) { console.error('[Trip Buddy] restauration', p, er); }
      }
      for (const p of incoming) {
        if (!current.includes(p)) { try { if (await this.fs.exists(p)) await this.fs.remove(p); } catch (er) { /* ignoré */ } }
      }
      throw new Error(`échec de l'écriture (${(e && e.message) || e}) : l'ancienne version a été remise en place`);
    }
    return { written: files.length, removed, backup };
  }
}
