import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const projectRoot = path.resolve(import.meta.dirname, '..', '..', '..');
const stylesRoot = path.join(projectRoot, 'presets', 'styles');

const REMOVED_STYLE_IDS = new Set([
  'austen_social_knife',
  'bronte_gothic_romance_wound',
  'du_maurier_psychological_shadow',
  'fitzgerald_glittering_decay',
  'gu_man_sunshine_romance',
  'highsmith_cold_paranoia',
  'wharton_class_shame_elegance',
]);

const AUTHOR_STYLE_IDS = new Set([
  'co_man_warm_modern_blueprint',
  'phi_nga_tu_ton_silent_heartbreak_blueprint',
  'diep_lac_vo_tam_intense_power_blueprint',
  'dong_hoa_epic_fate_blueprint',
  'tan_di_o_youth_regret_blueprint',
  'an_tam_romantic_mystery_blueprint',
  'co_tay_tuoc_gentle_youth_blueprint',
  'cuu_lo_phi_huong_comic_xianxia_blueprint',
  'quan_tu_di_trach_mythic_poetic_blueprint',
  'lam_bach_sac_mature_realist_blueprint',
  'dinh_mac_romantic_suspense_blueprint',
  'nhat_do_quan_hoa_ornate_tragedy_blueprint',
  'bat_nguyet_truong_an_youth_memory_blueprint',
  'thanh_yeu_possessive_power_blueprint',
  'cuu_nguyet_hi_realist_psychology_blueprint',
]);

test('style presets are replaced by author-derived style blueprints', async () => {
  const files = (await readdir(stylesRoot)).filter((file) => file.endsWith('.json'));
  const presets = await Promise.all(files.map(async (file) => JSON.parse(await readFile(path.join(stylesRoot, file), 'utf8'))));
  const ids = new Set(presets.map((preset) => preset.id));

  assert.equal(presets.length, AUTHOR_STYLE_IDS.size);
  for (const id of AUTHOR_STYLE_IDS) assert.ok(ids.has(id), `missing style blueprint: ${id}`);
  for (const id of REMOVED_STYLE_IDS) assert.ok(!ids.has(id), `old style should be removed: ${id}`);

  for (const preset of presets) {
    assert.equal(preset.blueprintVersion, 1, `${preset.id} should declare blueprint version`);
    assert.ok(preset.sourceGuide, `${preset.id} should point to a source guide`);
    assert.ok(Array.isArray(preset.narrativeDistance), `${preset.id} should define narrative distance`);
    assert.ok(Array.isArray(preset.sentenceMusic), `${preset.id} should define sentence music`);
    assert.ok(Array.isArray(preset.dialoguePolicy), `${preset.id} should define dialogue policy`);
    assert.ok(Array.isArray(preset.emotionRendering), `${preset.id} should define emotion rendering`);
    assert.ok(Array.isArray(preset.chapterCadence), `${preset.id} should define chapter cadence`);
    assert.ok(Array.isArray(preset.doNotUse), `${preset.id} should define style guardrails`);
  }
});
