/* ==========================================================================
 * Trip Buddy — détection des assistants IA installés (Claude, ChatGPT / Codex)
 *
 * Sert à l'encart « Trip Buddy + IA » de l'accueil. Vérification uniquement LOCALE : on regarde si
 * des applications, commandes ou dossiers de configuration connus existent sur cet ordinateur.
 * Rien n'est envoyé nulle part. Obsidian mobile : pas d'accès au système de fichiers → rien détecté.
 * ========================================================================== */
const TBAi = {
  /** { claude: [libellés trouvés], chatgpt: [libellés trouvés] } ; calculé une fois par session */
  detect() {
    if (TBAi.cache) return TBAi.cache;
    const found = { claude: new Set(), chatgpt: new Set() };
    try {
      if (!obsidian.Platform || !obsidian.Platform.isDesktopApp) throw new Error('mobile');
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      const home = os.homedir();
      const env = process.env || {};
      const win = process.platform === 'win32';
      const exists = (p) => { try { return !!p && fs.existsSync(p); } catch (e) { return false; } };
      const dirHas = (dir, re) => { try { return fs.readdirSync(dir).some((n) => re.test(n)); } catch (e) { return false; } };

      // applications de bureau
      const apps = [
        ['claude', 'Claude', ['/Applications/Claude.app', path.join(home, 'Applications/Claude.app'),
          env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'AnthropicClaude'), env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Claude')]],
        ['chatgpt', 'ChatGPT', ['/Applications/ChatGPT.app', path.join(home, 'Applications/ChatGPT.app'),
          env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'ChatGPT')]],
        ['chatgpt', 'Codex', ['/Applications/Codex.app', path.join(home, 'Applications/Codex.app')]],
      ];
      apps.forEach(([k, label, list]) => { if (list.some(exists)) found[k].add(label); });
      if (win && env.LOCALAPPDATA && dirHas(path.join(env.LOCALAPPDATA, 'Packages'), /^OpenAI\.ChatGPT/i)) found.chatgpt.add('ChatGPT');

      // agents en ligne de commande (Obsidian lancé depuis le Dock n'a pas tout le PATH : dossiers usuels ajoutés)
      const dirs = new Set(String(env.PATH || '').split(path.delimiter).filter(Boolean));
      ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', path.join(home, '.local/bin'), path.join(home, '.npm-global/bin'),
        path.join(home, '.bun/bin'), path.join(home, '.volta/bin'), path.join(home, '.claude/local'),
        env.APPDATA && path.join(env.APPDATA, 'npm')].forEach((d) => d && dirs.add(d));
      const onPath = (name) => [...dirs].some((d) => (win ? ['.exe', '.cmd', ''] : ['']).some((ext) => exists(path.join(d, name + ext))));
      if (onPath('claude') || exists(path.join(home, '.claude'))) found.claude.add('Claude Code');
      if (onPath('codex') || exists(path.join(home, '.codex'))) found.chatgpt.add('Codex');
    } catch (e) {
      /* mobile ou accès refusé : rien de détecté */
    }
    TBAi.cache = { claude: [...found.claude], chatgpt: [...found.chatgpt] };
    return TBAi.cache;
  },

  any() {
    const d = TBAi.detect();
    return d.claude.length > 0 || d.chatgpt.length > 0;
  },

  /** Ouvre la documentation des skills : section « Skills IA » du README du coffre (sinon sur GitHub) */
  async openDocs(plugin) {
    const app = plugin.app;
    const readme = app.vault.getAbstractFileByPath('README.md');
    if (readme instanceof TFile) {
      const cache = app.metadataCache.getFileCache(readme);
      const h = cache && (cache.headings || []).find((x) => /skills ia/i.test(x.heading));
      const leaf = app.workspace.getLeaf(false);
      await leaf.openFile(readme, h ? { eState: { line: h.position.start.line } } : {});
      return;
    }
    window.open(`${REPO_URL}#-skills-ia--préparer-le-voyage-avec-claude-ou-chatgpt`);
  },
};
