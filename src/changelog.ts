// Nouveautés affichées aux joueurs : fragments récents (générés depuis `changelog.d/`, un
// fichier par contribution) suivis de l'historique figé. Voir docs/changelog.md.
import { HISTORY_CHANGELOG, type ChangelogEntry } from './changelog-history.ts';
import { RECENT_CHANGELOG } from './changelog-recent.ts';

export type { ChangelogEntry };
export const PLAYER_CHANGELOG: ChangelogEntry[] = [...RECENT_CHANGELOG, ...HISTORY_CHANGELOG];

// Utiliser uniquement du texte, jamais du HTML provenant du changelog.
export interface ChangelogMount {
  dialog: HTMLDialogElement;
  trigger: EventTarget;
  close: EventTarget;
  list: Element;
  document: Document;
  onOpen: () => void;
}
export function mountChangelog({
  dialog,
  trigger,
  close,
  list,
  document,
  onOpen,
}: ChangelogMount): void {
  const fragment = document.createDocumentFragment();
  for (const entry of PLAYER_CHANGELOG) {
    const section = document.createElement('section');
    const title = document.createElement('h3');
    title.textContent = 'Version ' + entry.version;
    const ul = document.createElement('ul');
    for (const change of entry.changes) {
      const li = document.createElement('li');
      li.textContent = change;
      ul.append(li);
    }
    section.append(title, ul);
    fragment.append(section);
  }
  list.replaceChildren(fragment);
  trigger.addEventListener('click', () => {
    if (dialog.open) return;
    onOpen();
    dialog.showModal();
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
}
