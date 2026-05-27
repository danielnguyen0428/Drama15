import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\formatChapterText.ts")
text = p.read_text(encoding="utf-8")

# Replace the catch-all "Any other string fields" block with a smarter version
old = '''      // Any other string fields
      for (const [key, value] of Object.entries(obj)) {
        if (['title', 'logline', 'promise', 'conflictEngine', 'titleCandidates'].includes(key)) continue;
        if (typeof value === 'string' && value.length > 0) {
          parts.push(`<div class="concept-field"><span class="concept-label">${escapeHtml(key)}</span><p>${escapeHtml(value)}</p></div>`);
        }
      }'''

new = '''      // Map known concept keys to Vietnamese labels; skip internal/technical keys
      const CONCEPT_LABELS: Record<string, string> = {
        coreConflict: 'Xung \u0111\u1ed9t ch\u00ednh',
        betrayalEngine: 'C\u01a1 ch\u1ebf ph\u1ea3n b\u1ed9i',
        shameEngine: 'C\u01a1 ch\u1ebf s\u1ec9 nh\u1ee5c',
        leverageObject: '\u0110\u00f2n b\u1ea9y',
        foreshadowSeed: 'M\u1ea7m m\u1ed1ng ph\u1ee5c b\u00fat',
        heroineStrength: 'S\u1ee9c m\u1ea1nh n\u1eef ch\u00ednh',
        rivalDynamic: '\u0110\u1ed1i th\u1ee7 / Rival',
        settingWorld: 'B\u1ed1i c\u1ea3nh',
        emotionalHook: 'C\u00e2u m\u00f3c c\u1ea3m x\u00fac',
        revengeShape: 'H\u00ecnh th\u1ee9c tr\u1ea3 th\u00f9',
        endingPromise: 'K\u1ebft th\u00fac h\u1ee9a h\u1eb9n',
      };
      const SKIP_KEYS = new Set(['title', 'logline', 'promise', 'conflictEngine', 'titleCandidates']);
      for (const [key, value] of Object.entries(obj)) {
        if (SKIP_KEYS.has(key)) continue;
        if (typeof value === 'string' && value.length > 0) {
          const label = CONCEPT_LABELS[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
          parts.push(`<div class="concept-field"><span class="concept-label">${escapeHtml(label)}</span><p>${escapeHtml(value)}</p></div>`);
        }
        // Skip objects/arrays that would render as raw JSON
      }'''

if old in text:
    text = text.replace(old, new)
    print("concept format patched")
else:
    print("old block NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
