// Issue #135: the room debug mode is a single toggle button, without a panel or
// test tools. One click enables it for the whole room, the next one disables it
// (the server then resets the game, as before). The server stays authoritative.
/** The part of the room snapshot the toggle reads. */
export interface LabSnapshot {
  lab?: { enabled?: boolean };
  base?: { epoch?: number | string };
}
export interface LabUIOptions {
  button: HTMLButtonElement;
  snapshot: () => LabSnapshot | null | undefined;
  command: (body: { epoch: number | string; action: 'exit' | 'enable' }) => Promise<unknown>;
  accept: (reply: unknown) => void;
  notify?: (message: string, seconds: number) => void;
}
export class LabUI {
  button: HTMLButtonElement;
  snapshot: LabUIOptions['snapshot'];
  command: LabUIOptions['command'];
  accept: LabUIOptions['accept'];
  notify: LabUIOptions['notify'];
  busy: boolean;
  constructor({ button, snapshot, command, accept, notify }: LabUIOptions) {
    this.button = button;
    this.snapshot = snapshot;
    this.command = command;
    this.accept = accept;
    this.notify = notify;
    this.busy = false;
    this.button.onclick = () => this.toggle();
    this.render();
  }
  enabled(): boolean {
    return !!this.snapshot()?.lab?.enabled;
  }
  render(): void {
    const on = this.enabled();
    this.button.textContent = on ? 'Debug : ON' : 'Debug : OFF';
    this.button.setAttribute('aria-pressed', String(on));
    this.button.classList.toggle('debugOn', on);
    this.button.disabled = this.busy || !this.snapshot()?.base?.epoch;
    this.button.title = on
      ? 'Mode debug actif pour toute la room · cliquer le désactive et réinitialise la partie'
      : 'Activer le mode debug pour toute la room';
  }
  async toggle(): Promise<void> {
    const snap = this.snapshot();
    if (this.busy || !snap?.base?.epoch) return;
    const action = snap.lab?.enabled ? 'exit' : 'enable';
    this.busy = true;
    this.render();
    try {
      this.accept(await this.command({ epoch: snap.base.epoch, action }));
    } catch (error) {
      this.notify?.((error as Error).message, 3);
    } finally {
      this.busy = false;
      this.render();
    }
  }
}
