import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture rules', () => {
  it('src/sim and src/data have no Phaser, Preact or DOM dependencies', () => {
    const offenders: string[] = [];
    for (const f of [...files('src/sim'), ...files('src/data')]) {
      const src = readFileSync(f, 'utf8');
      if (/from ['"](phaser|preact)/.test(src)) offenders.push(`${f}: imports phaser/preact`);
      if (/\b(window|document|localStorage)\./.test(src)) offenders.push(`${f}: touches the DOM`);
      if (/Math\.random\(/.test(src)) offenders.push(`${f}: uses Math.random`);
      if (/from ['"]\.\.\/(render|ui|save|game)/.test(src)) offenders.push(`${f}: imports a non-sim layer`);
    }
    expect(offenders).toEqual([]);
  });
});
