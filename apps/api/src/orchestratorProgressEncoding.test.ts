import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sourcePath = fileURLToPath(new URL('../../../src/modules/orchestrator/story-orchestrator.ts', import.meta.url));

test('story orchestrator progress text is valid Vietnamese, not mojibake', async () => {
  const source = await readFile(sourcePath, 'utf8');

  assert.doesNotMatch(source, /(?:Ä|Ã|Æ|Â|áº|á»|â”)/, 'progress source contains mojibake markers');
  assert.match(
    source,
    /Đang sửa "\$\{chapterPlanItem\.title\}" sau khi kiểm tra chất lượng\./,
    'repair progress detail should render Vietnamese diacritics correctly',
  );
});
