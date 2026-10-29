import { createServer } from 'node:http';
import { localDB } from './local-db.mjs';
import { mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
execFileSync(process.execPath, ['scripts/assemble.mjs']);
const { default: worker } = await import('../worker/index.js');
mkdirSync('.local', { recursive: true });
const DB = localDB('.local/preview.sqlite');
const idx = process.argv.indexOf('--port'),
  port = Number(process.env.PORT || (idx >= 0 ? process.argv[idx + 1] : 3000));
createServer(async (req, res) => {
  try {
    let body = '';
    for await (const chunk of req) body += chunk;
    const url = 'http://' + req.headers.host + req.url;
    const r = await worker.fetch(
      new Request(url, {
        method: req.method,
        headers: req.headers,
        ...(req.method !== 'GET' && req.method !== 'HEAD' ? { body } : {}),
      }),
      { DB },
    );
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  } catch (e) {
    console.error(e);
    res.writeHead(500);
    res.end('Preview error');
  }
}).listen(port, '0.0.0.0', () => console.log('Preview running on port ' + port));
