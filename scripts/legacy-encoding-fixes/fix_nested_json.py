import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p=pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\formatChapterText.ts")
text=p.read_text(encoding='utf-8')

# Insert helper functions after escapeHtml
anchor='''function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
'''
helper='''function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const READABLE_CONCEPT_LABELS: Record<string, string> = {
  coreConflict: 'Xung đột chính',
  hiddenLeverage: 'Đòn bẩy bí mật',
  foreshadowSeed: 'Mầm phục bút',
  heroineStrength: 'Sức mạnh nữ chính',
  shameMechanism: 'Cơ chế sỉ nhục',
  betrayalLogic: 'Logic phản bội',
  revengeMode: 'Cách lật kèo',
  endingShape: 'Dáng kết',
  betrayalEngine: 'Cơ chế phản bội',
  shameEngine: 'Cơ chế sỉ nhục',
  leverageObject: 'Đòn bẩy',
  settingWorld: 'Bối cảnh',
  emotionalHook: 'Móc cảm xúc',
  rivalDynamic: 'Đối thủ / Rival',
  conflictEngine: 'Động cơ xung đột',
};

function labelForConceptKey(key: string): string {
  return READABLE_CONCEPT_LABELS[key]
    ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function tryParseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function renderConceptValue(label: string, value: unknown): string {
  if (typeof value === 'string') {
    const parsed = tryParseJsonString(value);
    if (parsed !== value) return renderConceptValue(label, parsed);
    return `<div class="concept-field"><span class="concept-label">${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`;
  }
  if (Array.isArray(value)) {
    const items = value
      .map((item) => typeof item === 'string' ? item : JSON.stringify(item))
      .filter(Boolean)
      .map((item) => `<li>${escapeHtml(String(item))}</li>`)
      .join('');
    return `<div class="concept-field"><span class="concept-label">${escapeHtml(label)}</span><ul class="concept-list">${items}</ul></div>`;
  }
  if (value && typeof value === 'object') {
    const rows = Object.entries(value as Record<string, unknown>)
      .map(([childKey, childValue]) => renderConceptValue(labelForConceptKey(childKey), childValue))
      .join('\n');
    return rows || '';
  }
  return '';
}
'''
if anchor in text:
 text=text.replace(anchor,helper)
 print('helpers added')
else:
 print('escapeHtml anchor not found')

# Replace conflictEngine direct string block with renderConceptValue supporting object/json string
old_conf='''      // Conflict Engine
      if (obj.conflictEngine && typeof obj.conflictEngine === 'string') {
        parts.push(`<div class="concept-field"><span class="concept-label">Động cơ xung đột</span><p>${escapeHtml(obj.conflictEngine)}</p></div>`);
      }
'''
new_conf='''      // Conflict Engine / nested conflict object
      if (obj.conflictEngine) {
        parts.push(renderConceptValue('Động cơ xung đột', obj.conflictEngine));
      }
'''
if old_conf in text:
 text=text.replace(old_conf,new_conf)
 print('conflictEngine block patched')
else:
 print('conflictEngine block not found')

# Replace local label map + loop with global helpers and renderConceptValue
start=text.find('      // Map known concept keys to Vietnamese labels; skip internal/technical keys')
end=text.find('      if (parts.length > 0) return parts.join', start)
if start!=-1 and end!=-1:
 new_loop='''      // Map known concept keys to Vietnamese labels; parse nested JSON/object values
      const SKIP_KEYS = new Set(['title', 'logline', 'promise', 'conflictEngine', 'titleCandidates']);
      for (const [key, value] of Object.entries(obj)) {
        if (SKIP_KEYS.has(key)) continue;
        const rendered = renderConceptValue(labelForConceptKey(key), value);
        if (rendered) parts.push(rendered);
      }

'''
 text=text[:start]+new_loop+text[end:]
 print('catch-all loop patched')
else:
 print('catch-all loop bounds not found')

p.write_text(text,encoding='utf-8')
print('done')
