// Prévient les PR ouvertes qu'un push sur `main` les met en conflit.
//
// GitHub n'envoie aucun événement quand une PR devient conflictuelle : l'agent abonné
// à la PR attend alors une fusion automatique qui n'arrivera jamais. Ce script, lancé à
// chaque push sur `main` (.github/workflows/conflict-alert.yml), pose le label
// `conflit` et un commentaire (une fois par état de la PR) qui réveille l'agent ;
// il retire le label quand le conflit a disparu. Voir docs/operations.md.
import { pathToFileURL } from 'node:url';

export const LABEL = 'conflit';
export const MARKER = (sha: string): string => `<!-- conflict-alert:${sha} -->`;

export interface PullSummary {
  number: number;
  head: { sha: string };
  mergeable: boolean | null;
  mergeable_state: string;
  labels: { name: string }[];
  draft?: boolean;
}
export interface Api {
  openPulls(): Promise<{ number: number }[]>;
  pull(number: number): Promise<PullSummary>;
  comments(number: number): Promise<{ body: string }[]>;
  comment(number: number, body: string): Promise<void>;
  addLabel(number: number): Promise<void>;
  removeLabel(number: number): Promise<void>;
}

export function alertText(sha: string): string {
  return (
    `${MARKER(sha)}\n**Conflit avec \`main\`** : un commit fusionné depuis a modifié les mêmes ` +
    'fichiers que cette PR, donc l’auto-merge restera bloqué même si tous les contrôles ' +
    'sont verts. Intégrer `origin/main` dans la branche, résoudre les conflits, relancer les ' +
    'contrôles concernés puis pousser (voir CONTRIBUTING).\n\n' +
    '_Message automatique : workflow `conflict-alert`._'
  );
}

// `mergeable` est calculé à la demande par GitHub : null signifie « pas encore ».
async function settle(api: Api, number: number, tries: number, wait: () => Promise<void>) {
  let pull = await api.pull(number);
  for (let i = 0; i < tries && pull.mergeable === null; i++) {
    await wait();
    pull = await api.pull(number);
  }
  return pull;
}

export async function alertConflicts(
  api: Api,
  { tries = 6, wait = () => new Promise<void>((r) => setTimeout(r, 5000)) } = {},
): Promise<{ alerted: number[]; cleared: number[]; unknown: number[] }> {
  const result = { alerted: [] as number[], cleared: [] as number[], unknown: [] as number[] };
  for (const { number } of await api.openPulls()) {
    const pull = await settle(api, number, tries, wait);
    const labelled = pull.labels.some((l) => l.name === LABEL);
    if (pull.mergeable === null) result.unknown.push(number);
    else if (pull.mergeable_state === 'dirty' || pull.mergeable === false) {
      if (!labelled) await api.addLabel(number);
      const marker = MARKER(pull.head.sha);
      if (!(await api.comments(number)).some((c) => c.body.includes(marker))) {
        await api.comment(number, alertText(pull.head.sha));
        result.alerted.push(number);
      }
    } else if (labelled) {
      await api.removeLabel(number);
      result.cleared.push(number);
    }
  }
  return result;
}

export function githubApi(repo: string, token: string): Api {
  const base = `https://api.github.com/repos/${repo}`;
  const call = async (path: string, init: RequestInit = {}) => {
    const response = await fetch(base + path, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
    });
    if (!response.ok && response.status !== 404 && response.status !== 422)
      throw Error(`${init.method ?? 'GET'} ${path} : ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
  return {
    openPulls: () => call('/pulls?state=open&per_page=100'),
    pull: (n) => call(`/pulls/${n}`),
    comments: (n) => call(`/issues/${n}/comments?per_page=100`),
    comment: async (n, body) => {
      await call(`/issues/${n}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    },
    addLabel: async (n) => {
      // Crée le label s'il manque (422 si déjà présent : sans conséquence).
      await call('/labels', {
        method: 'POST',
        body: JSON.stringify({
          name: LABEL,
          color: 'b60205',
          description: 'PR en conflit avec main',
        }),
      });
      await call(`/issues/${n}/labels`, {
        method: 'POST',
        body: JSON.stringify({ labels: [LABEL] }),
      });
    },
    removeLabel: async (n) => {
      await call(`/issues/${n}/labels/${LABEL}`, { method: 'DELETE' });
    },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { GITHUB_REPOSITORY: repo, GITHUB_TOKEN: token } = process.env;
  if (!repo || !token) throw Error('GITHUB_REPOSITORY et GITHUB_TOKEN sont requis.');
  const result = await alertConflicts(githubApi(repo, token));
  console.log(JSON.stringify(result));
}
