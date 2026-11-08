import { describe, test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

describe('Guía fiscal sin almacenamiento', () => {
  test('ningún módulo propio de la guía accede a almacenamiento o clientes de datos', () => {
    const root = process.cwd();
    const seen = new Set<string>();
    function visit(path: string) {
      if (seen.has(path)) return;
      seen.add(path);
      const source = readFileSync(path, 'utf8');
      assert.doesNotMatch(source, /supabase|useAuth|localStorage|sessionStorage|indexedDB|\bfetch\s*\(|XMLHttpRequest|\.storage\b/, path);
      for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
        const name = match[1];
        if (!name.startsWith('@/') && !name.startsWith('.')) continue;
        // Shared design controls are not fiscal data modules.
        if (name.startsWith('@/components/ui/')) continue;
        const base = name.startsWith('@/') ? resolve(root, 'src', name.slice(2)) : resolve(dirname(path), name);
        let dependency: string | undefined;
        for (const extension of ['.ts', '.tsx']) {
          try { readFileSync(base + extension); dependency = base + extension; break; } catch { /* try next extension */ }
        }
        assert.ok(dependency, `Unresolved guide dependency: ${name}`);
        visit(dependency);
      }
    }
    visit(resolve(root, 'src/pages/FormalizationGuide.tsx'));
    visit(resolve(root, 'src/components/formalization/FormalizationDialog.tsx'));
  });
});