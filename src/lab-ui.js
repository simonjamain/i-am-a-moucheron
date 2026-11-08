// Issue #135: the room debug mode is a single toggle button, without a panel or
// test tools. One click enables it for the whole room, the next one disables it
// (the server then resets the game, as before). The server stays authoritative.
export class LabUI {
  constructor({ button, snapshot, command, accept, notify }) {
    Object.assign(this, { button, snapshot, command, accept, notify });
    this.busy = false;
    this.button.onclick = () => this.toggle();
    this.render();
  }
  enabled() {
    return !!this.snapshot()?.lab?.enabled;
  }
  render() {
    const on = this.enabled();
    this.button.textContent = on ? 'Debug : ON' : 'Debug : OFF';
    this.button.setAttribute('aria-pressed', String(on));
    this.button.classList.toggle('debugOn', on);
    this.button.disabled = this.busy || !this.snapshot()?.base?.epoch;
    this.button.title = on
      ? 'Mode debug actif pour toute la room · cliquer le désactive et réinitialise la partie'
      : 'Activer le mode debug pour toute la room';
  }
  async toggle() {
    const snap = this.snapshot();
    if (this.busy || !snap?.base?.epoch) return;
    const action = snap.lab?.enabled ? 'exit' : 'enable';
    this.busy = true;
    this.render();
    try {
      this.accept(await this.command({ epoch: snap.base.epoch, action }));
    } catch (error) {
      this.notify?.(error.message, 3);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
