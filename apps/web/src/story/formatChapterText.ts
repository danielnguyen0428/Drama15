/**
 * Format raw chapter text (from LLM) into structured novel HTML.
 *
 * Handles:
 * 1. Strip JSON wrapper if the content is accidentally a JSON string
 * 2. Split into paragraphs by double newlines
 * 3. Wrap dialogue lines (starting with — or " or ") in <p class="dialogue">
 * 4. Wrap scene breaks (*** or ---) in <hr class="scene-break">
 * 5. Wrap normal paragraphs in <p>
 * 6. Preserve emphasis markers (*text* → <em>text</em>)
 *
 * No AI involved — pure string transformation.
 */

/**
 * Attempt to extract plain text from a value that might be JSON.
 * If the string looks like a JSON object with a "text" field, extract it.
 * Otherwise return the string as-is.
 */
function extractTextFromPossibleJson(raw: string): string {
  const trimmed = raw.trim();

  // Strip markdown code fences if present: ```json ... ``` or ``` ... ```
  let cleaned = trimmed;
  const fenceMatch = cleaned.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenceMatch && fenceMatch[1]) {
    cleaned = fenceMatch[1].trim();
  }

  // Quick check: does it look like JSON?
  if (!cleaned.startsWith('{') && !cleaned.startsWith('"')) {
    // Even if it doesn't start with JSON, strip trailing JSON artifacts
    // that may leak from streaming (e.g., trailing "}\n``` or just "} )
    return stripTrailingJsonArtifacts(raw);
  }

  try {
    const parsed = JSON.parse(cleaned);
    // Case 1: { "text": "..." } — chapter draft format (most common)
    if (typeof parsed === 'object' && parsed !== null) {
      if (typeof parsed.text === 'string' && parsed.text.length > 0) return parsed.text;
      if (typeof parsed.content === 'string' && parsed.content.length > 0) return parsed.content;
      // Case 2: { "chapter": { "text": "..." } }
      if (parsed.chapter && typeof parsed.chapter.text === 'string') return parsed.chapter.text;
      // Case 3: concept-like object — extract logline/promise as readable text
      if (typeof parsed.logline === 'string' || typeof parsed.title === 'string') {
        const parts: string[] = [];
        if (parsed.title) parts.push(parsed.title);
        if (parsed.logline) parts.push(parsed.logline);
        if (parsed.promise) parts.push(parsed.promise);
        if (parsed.conflictEngine) parts.push(parsed.conflictEngine);
        return parts.join('\n\n');
      }
    }
    // Case 4: just a JSON-encoded string "..."
    if (typeof parsed === 'string') return parsed;
  } catch {
    // Not valid JSON — might be partial JSON from streaming.
    // Try to extract text field content with regex as a fallback.
    const textFieldMatch = cleaned.match(/"text"\s*:\s*"([\s\S]+)/);
    if (textFieldMatch && textFieldMatch[1]) {
      let extracted = textFieldMatch[1];
      // Remove trailing JSON closure: "} or ", "otherField": "..." }
      extracted = extracted
        .replace(/\\?\s*"\s*,?\s*"[^"]*"\s*:\s*"[^"]*"\s*\}\s*$/s, '')
        .replace(/\\?\s*"\s*\}\s*$/s, '')
        .replace(/\\?\s*"\s*$/s, '');
      // Unescape JSON string escapes
      extracted = extracted.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      if (extracted.length > 20) return extracted;
    }
  }
  return stripTrailingJsonArtifacts(raw);
}

/**
 * Strip trailing JSON/code-fence artifacts that may leak from LLM streaming.
 * Handles patterns like:
 * - Trailing `"}` or `" }` (JSON object close after text field)
 * - Trailing ``` (markdown code fence)
 * - Trailing backslash before closing quote
 * - Trailing `", "fieldName": "value" }` (extra JSON fields after text)
 */
function stripTrailingJsonArtifacts(text: string): string {
  let result = text;
  // Remove trailing markdown code fences
  result = result.replace(/\s*```\s*$/s, '');
  // Remove trailing JSON object closure patterns
  result = result.replace(/\\?\s*"\s*,?\s*"[^"]*"\s*:\s*[^}]*\}\s*$/s, '');
  result = result.replace(/\\?\s*"\s*\}\s*$/s, '');
  // Remove a lone trailing backslash (escaped quote remnant)
  result = result.replace(/\\\s*$/s, '');
  return result;
}

/**
 * Detect if a line is dialogue.
 * Vietnamese novel dialogue typically starts with:
 * - Em dash (—)
 * - Quotation marks (" " « » or standard "")
 * - A character name followed by colon (Tên:)
 */
function isDialogueLine(line: string): boolean {
  const t = line.trim();
  if (t.startsWith('—') || t.startsWith('–')) return true;
  if (t.startsWith('"') || t.startsWith('"') || t.startsWith('«')) return true;
  if (t.startsWith('"') && t.includes('"')) return true;
  // "Name:" pattern at start (Vietnamese names are short)
  if (/^[A-ZÀ-Ỹ][a-zà-ỹ]+(\s+[A-ZÀ-Ỹ][a-zà-ỹ]+){0,2}\s*:/.test(t)) return true;
  return false;
}

/**
 * Detect scene break markers.
 */
function isSceneBreak(line: string): boolean {
  const t = line.trim();
  return /^(\*\s*\*\s*\*|---+|___+|•\s*•\s*•|⁂|§)$/.test(t);
}

/**
 * Apply inline formatting:
 * - *text* or _text_ → <em>text</em>
 * - **text** or __text__ → <strong>text</strong>
 */
function applyInlineFormatting(text: string): string {
  // Bold first (** or __)
  let result = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Then italic (* or _) — but not inside <strong> tags
  result = result.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  result = result.replace(/(?<!_)_(?!_)(.+?)(?<!_)_(?!_)/g, '<em>$1</em>');
  return result;
}

/**
 * Format raw chapter text into HTML suitable for novel reading.
 */
export function formatChapterText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  // Step 1: Extract text from JSON if needed
  const text = extractTextFromPossibleJson(raw);

  // Step 2: Unescape literal \\n sequences from LLM output, then normalize
  const normalized = text
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');

  // Split by double newlines (paragraph breaks) or single newlines
  // that separate distinct content blocks
  const blocks = normalized.split(/\n{2,}/);

  const htmlParts: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // Check for scene breaks
    if (isSceneBreak(trimmed)) {
      htmlParts.push('<hr class="scene-break" />');
      continue;
    }

    // A block might contain multiple single-newline-separated lines
    // (e.g., consecutive dialogue lines)
    const lines = trimmed.split('\n');

    for (const line of lines) {
      const lineTrimmed = line.trim();
      if (!lineTrimmed) continue;

      if (isSceneBreak(lineTrimmed)) {
        htmlParts.push('<hr class="scene-break" />');
      } else if (isDialogueLine(lineTrimmed)) {
        htmlParts.push(`<p class="dialogue">${applyInlineFormatting(escapeHtml(lineTrimmed))}</p>`);
      } else {
        htmlParts.push(`<p>${applyInlineFormatting(escapeHtml(lineTrimmed))}</p>`);
      }
    }
  }

  return htmlParts.join('\n');
}

/**
 * Escape HTML special characters to prevent XSS.
 */
function escapeHtml(text: string): string {
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
  emotionalCore: 'Lõi cảm xúc',
  readerFeeling: 'Cảm nhận của độc giả',
  tensionEngine: 'Cơ chế căng thẳng',
  dignityArc: 'Hành trình lấy lại phẩm giá',
  logline: 'Logline',
  promise: 'Lời hứa với độc giả',
  title: 'Tiêu đề',
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
      .filter(Boolean)
      .join('\n');
    if (!rows) return '';
    return `<div class="concept-field concept-field-group"><span class="concept-label">${escapeHtml(label)}</span><div class="concept-children">${rows}</div></div>`;
  }
  return '';
}

/**
 * Format chapter text for plain-text export (no HTML).
 * Strips JSON wrapper and normalizes whitespace.
 */
export function formatChapterPlainText(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const text = extractTextFromPossibleJson(raw);
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

/**
 * Format concept/plan JSON into readable HTML.
 * The API sends these as JSON.stringify'd objects. We parse them and
 * render key fields in a human-readable format.
 */
export function formatConceptHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // Try to parse as JSON
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed) as Record<string, unknown>;
      const parts: string[] = [];

      // Title
      if (obj.title && typeof obj.title === 'string') {
        parts.push(`<h3 class="concept-title">${escapeHtml(obj.title)}</h3>`);
      }

      // Logline (route through renderConceptValue so embedded JSON is parsed)
      if (obj.logline !== undefined) {
        const rendered = renderConceptValue('Logline', obj.logline);
        if (rendered) parts.push(rendered);
      }

      // Promise (route through renderConceptValue so embedded JSON is parsed)
      if (obj.promise !== undefined) {
        const rendered = renderConceptValue('Lời hứa với độc giả', obj.promise);
        if (rendered) parts.push(rendered);
      }

      // Conflict Engine / nested conflict object
      if (obj.conflictEngine) {
        parts.push(renderConceptValue('Động cơ xung đột', obj.conflictEngine));
      }

      // Title candidates
      if (Array.isArray(obj.titleCandidates) && obj.titleCandidates.length > 0) {
        const items = obj.titleCandidates
          .filter((t): t is string => typeof t === 'string')
          .map(t => `<li>${escapeHtml(t)}</li>`)
          .join('');
        parts.push(`<div class="concept-field"><span class="concept-label">Tựa đề gợi ý</span><ul class="concept-list">${items}</ul></div>`);
      }

      // Map known concept keys to Vietnamese labels; parse nested JSON/object values
      const SKIP_KEYS = new Set(['title', 'logline', 'promise', 'conflictEngine', 'titleCandidates']);
      for (const [key, value] of Object.entries(obj)) {
        if (SKIP_KEYS.has(key)) continue;
        const rendered = renderConceptValue(labelForConceptKey(key), value);
        if (rendered) parts.push(rendered);
      }

      if (parts.length > 0) return parts.join('\n');
    } catch {
      // Not valid JSON — fall through to plain text
    }
  }

  // Fallback: treat as plain text
  return raw.split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
}

/**
 * Format plan/beat-sheet JSON into readable HTML.
 */
export function formatPlanHtml(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);

      // Case: array of chapter plans
      if (Array.isArray(parsed)) {
        const items = parsed.map((item, idx) => {
          if (typeof item === 'string') {
            return `<li class="plan-item"><span class="plan-number">${idx + 1}</span><p>${escapeHtml(item)}</p></li>`;
          }
          if (typeof item === 'object' && item !== null) {
            const title = item.title || item.chapterTitle || `Chương ${(item.chapterNumber ?? idx + 1)}`;
            const beat = item.mainBeat || item.beat || item.summary || '';
            const hook = item.hook || '';
            return `<li class="plan-item"><span class="plan-number">${item.chapterNumber ?? idx + 1}</span><div><strong>${escapeHtml(String(title))}</strong>${beat ? `<p>${escapeHtml(String(beat))}</p>` : ''}${hook ? `<p class="plan-hook">${escapeHtml(String(hook))}</p>` : ''}</div></li>`;
          }
          return '';
        }).filter(Boolean).join('');
        return `<ol class="plan-list">${items}</ol>`;
      }

      // Case: object with chapters array
      if (typeof parsed === 'object' && parsed !== null) {
        const chapters = parsed.chapters || parsed.chapterPlans || parsed.plan;
        if (Array.isArray(chapters)) {
          return formatPlanHtml(JSON.stringify(chapters));
        }
        // Single object — render fields
        const parts: string[] = [];
        for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string') {
            parts.push(`<div class="concept-field"><span class="concept-label">${escapeHtml(key)}</span><p>${escapeHtml(value)}</p></div>`);
          } else if (Array.isArray(value)) {
            parts.push(`<div class="concept-field"><span class="concept-label">${escapeHtml(key)}</span><p>${escapeHtml(JSON.stringify(value))}</p></div>`);
          }
        }
        if (parts.length > 0) return parts.join('\n');
      }
    } catch {
      // Fall through
    }
  }

  // Fallback: plain text with paragraph splitting
  return raw.split(/\n{2,}/).map(p => `<p>${escapeHtml(p.trim())}</p>`).join('\n');
}
