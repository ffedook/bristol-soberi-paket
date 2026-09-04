import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  cpSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
const root = process.cwd();
const run = (cmd, args, cwd = root) =>
  execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
const repo = run('gh', [
  'repo',
  'view',
  '--json',
  'nameWithOwner',
  '--jq',
  '.nameWithOwner',
]);
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error('Invalid repository');
const origin = run('git', ['remote', 'get-url', 'origin']);
mkdirSync('work', { recursive: true });
const target = mkdtempSync(resolve('work/pages-'));
const exists =
  spawnSync(
    'git',
    ['ls-remote', '--exit-code', '--heads', origin, 'gh-pages'],
    { stdio: 'ignore' },
  ).status === 0;
if (exists) {
  run('git', [
    'clone',
    '--single-branch',
    '--branch',
    'gh-pages',
    origin,
    target,
  ]);
} else {
  run('git', ['init', '-b', 'gh-pages'], target);
  run('git', ['remote', 'add', 'origin', origin], target);
}
for (const entry of readdirSync(target)) {
  if (entry !== '.git')
    rmSync(join(target, entry), { recursive: true, force: true });
}
cpSync(resolve('dist'), target, { recursive: true });
writeFileSync(join(target, '.nojekyll'), '');
run(
  'git',
  ['config', 'user.name', run('git', ['config', 'user.name'])],
  target,
);
run(
  'git',
  ['config', 'user.email', run('git', ['config', 'user.email'])],
  target,
);
run(
  'git',
  ['config', 'credential.https://github.com.helper', '!gh auth git-credential'],
  target,
);
run('git', ['add', '.'], target);
if (run('git', ['status', '--porcelain'], target)) {
  run(
    'git',
    ['commit', '-m', 'Deploy ' + run('git', ['rev-parse', '--short', 'HEAD'])],
    target,
  );
  run('git', ['push', '-u', 'origin', 'gh-pages'], target);
}
const pages = spawnSync('gh', ['api', `repos/${repo}/pages`], {
  encoding: 'utf8',
});
if (pages.status !== 0) {
  console.log(
    run('gh', [
      'api',
      '--method',
      'POST',
      `repos/${repo}/pages`,
      '-f',
      'source[branch]=gh-pages',
      '-f',
      'source[path]=/',
      '--jq',
      '.html_url',
    ]),
  );
} else {
  console.log(JSON.parse(pages.stdout).html_url);
}
console.log(
  'GitHub Pages publication requested. Check the Pages build before sharing.',
);
