/* ==========================================================================
 * Trip Buddy — repli automatique des colonnes latérales après inactivité
 * Chaque colonne se replie si on n'a pas interagi avec elle pendant N secondes
 * (jamais pendant qu'elle est survolée ou qu'un champ y a le focus).
 * ========================================================================== */
class SidebarAutoHide {
  constructor(plugin) {
    this.plugin = plugin;
    this.ws = plugin.app.workspace;
    this.state = {
      left: { last: Date.now(), hover: false, collapsed: null },
      right: { last: Date.now(), hover: false, collapsed: null },
    };
  }

  get cfg() { return this.plugin.settings.autoHideSidebars || {}; }

  split(side) { return side === 'left' ? this.ws.leftSplit : this.ws.rightSplit; }

  watched(side) {
    const c = this.cfg;
    return !!c.enabled && (c.sides === 'both' || !c.sides || c.sides === side);
  }

  start() {
    ['left', 'right'].forEach((side) => {
      const sp = this.split(side);
      const el = sp && sp.containerEl;
      if (!el) return;
      const st = this.state[side];
      const bump = () => { st.last = Date.now(); };
      ['pointerdown', 'pointermove', 'keydown', 'wheel', 'focusin', 'touchstart'].forEach((ev) =>
        this.plugin.registerDomEvent(el, ev, bump, { passive: true }));
      this.plugin.registerDomEvent(el, 'pointerenter', () => { st.hover = true; bump(); });
      this.plugin.registerDomEvent(el, 'pointerleave', () => { st.hover = false; bump(); });
    });
    this.plugin.registerInterval(window.setInterval(() => this.tick(), 1000));
  }

  /** Remet les compteurs à zéro (ex. après un changement de réglage) */
  reset() { Object.values(this.state).forEach((st) => { st.last = Date.now(); }); }

  tick() {
    const delay = Math.max(2, Number(this.cfg.delay) || 10) * 1000;
    const now = Date.now();
    ['left', 'right'].forEach((side) => {
      const sp = this.split(side);
      if (!sp) return;
      const st = this.state[side];
      // une colonne qui vient d'être ouverte repart pour un délai complet
      if (st.collapsed === true && !sp.collapsed) st.last = now;
      st.collapsed = sp.collapsed;
      if (!this.watched(side) || sp.collapsed || st.hover) return;
      const el = sp.containerEl;
      if (el && el.contains(document.activeElement)) { st.last = now; return; }
      if (now - st.last >= delay) sp.collapse();
    });
  }
}
