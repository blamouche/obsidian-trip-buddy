/* ==========================================================================
 * Trip Buddy — vue « Carte du voyage » (onglet plein écran)
 * ========================================================================== */
class MapView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return VIEW_TYPE_MAP; }
  getDisplayText() { return 'Carte du voyage'; }
  getIcon() { return 'map'; }

  async onOpen() {
    const c = this.contentEl;
    c.empty();
    c.addClass('tb-mapview');
    this.containerEl.addClass('tb-mapview-leaf');
    this.panel = new MapPanel(this.plugin, c, { fill: true });
    this.icons = TBIcons.watch(c);
    this.panel.refresh();
    const refresh = debounce(() => this.panel && this.panel.refresh(), 400, true);
    this.registerEvent(this.app.metadataCache.on('changed', (f) => {
      const t = this.plugin.data.fm(f).type;
      if (t === 'poi' || t === 'programme') refresh();
    }));
    this.registerEvent(this.app.vault.on('delete', refresh));
    this.registerEvent(this.app.vault.on('rename', refresh));
    this.registerEvent(this.app.workspace.on(EVT_REFRESH, refresh));
  }

  focus(path) {
    if (!this.panel) return;
    // s'assure que le POI est visible malgré les filtres
    this.panel.filters.cats.clear();
    this.panel.filters.status = 'all';
    this.panel.refresh();
    setTimeout(() => this.panel.map.focus(path), 300);
  }

  async onClose() {
    if (this.icons) this.icons.disconnect();
    this.panel && this.panel.destroy();
    this.panel = null;
  }
}
