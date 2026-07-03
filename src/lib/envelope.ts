/**
 * Tolerant envelope unwrapping for model JSON output.
 *
 * Models wrap the real payload inconsistently: sometimes bare, sometimes under
 * the requested key, sometimes double-wrapped (`{seedPackage:{seedPackage:…}}`),
 * and sometimes under a generic wrapper key (`data`, `result`, `story`,
 * `package`). A naive one-level, exact-key unwrap fails all but the first two
 * shapes, which surfaces as "every field is undefined" schema errors even
 * though the model produced a valid object one level deeper.
 *
 * `unwrapEnvelope` peels wrappers up to `maxDepth` times:
 * 1. If the object has the requested key, descend into it.
 * 2. Otherwise, if the object is a single-key wrapper whose value is an object
 *    or array, descend into that value (covers renamed wrapper keys).
 * 3. Otherwise return the current value (it is the payload, or genuinely wrong).
 */
export function unwrapEnvelope(value: unknown, key: string, maxDepth = 4): unknown {
  let current = value;
  for (let depth = 0; depth < maxDepth; depth += 1) {
    if (!current || typeof current !== "object" || Array.isArray(current)) {
      return current;
    }

    const record = current as Record<string, unknown>;
    if (key in record) {
      current = record[key];
      continue;
    }

    const keys = Object.keys(record);
    if (keys.length === 1) {
      const soleValue = record[keys[0] as string];
      if (soleValue && typeof soleValue === "object") {
        current = soleValue;
        continue;
      }
    }

    return current;
  }

  return current;
}

/**
 * Convert a snake_case / kebab-case key to camelCase (e.g. `setting_seed` →
 * `settingSeed`, `story-controls` → `storyControls`). Leaves already-camelCase
 * keys untouched.
 */
function toCamelCase(key: string): string {
  return key.replace(/[_-]([a-z0-9])/gi, (_match, char: string) => char.toUpperCase());
}

/**
 * Recursively rewrite object keys to camelCase so models that emit snake_case or
 * kebab-case JSON (common with Claude and some OpenAI-compatible providers) still
 * satisfy the camelCase schemas. Arrays and primitives pass through unchanged.
 * When a camelCase collision occurs, an existing camelCase key wins (we do not
 * overwrite a value the model already put under the correct name).
 */
export function normalizeModelKeys(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeModelKeys(item));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const record = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [rawKey, rawValue] of Object.entries(record)) {
    const camelKey = toCamelCase(rawKey);
    const normalizedValue = normalizeModelKeys(rawValue);
    // Do not clobber a key the model already supplied in the canonical form.
    if (camelKey in result && result[camelKey] !== undefined && result[camelKey] !== null && result[camelKey] !== "") {
      continue;
    }
    result[camelKey] = normalizedValue;
  }
  return result;
}

/**
 * Fill a canonical field from the first non-empty alias present on the object.
 * Mirrors the tolerant `firstDefined` approach the outline parsers use, so a
 * strict schema field (e.g. `settingSeed`) still resolves when the model named
 * it with a synonym (`seed`, `setup`, `world`). Returns a new object; never
 * overwrites an existing canonical value.
 */
export function coerceAlias(
  value: unknown,
  canonicalKey: string,
  aliases: readonly string[],
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const record = value as Record<string, unknown>;
  const existing = record[canonicalKey];
  if (typeof existing === "string" && existing.trim()) {
    return value;
  }
  for (const alias of aliases) {
    const candidate = record[alias];
    if (typeof candidate === "string" && candidate.trim()) {
      return { ...record, [canonicalKey]: candidate };
    }
  }
  return value;
}

/**
 * Normalize an array-bearing envelope to `{ [key]: array }`.
 *
 * Handles bare arrays, the exact `{ [key]: array }` shape, and generic
 * single-key wrappers around the array (e.g. `{ data: [...] }`,
 * `{ chapters: [...] }`) so array parsers see a consistent shape regardless of
 * how the model wrapped its output.
 */
export function unwrapArrayEnvelope(value: unknown, key: string): unknown {
  if (Array.isArray(value)) {
    return { [key]: value };
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record[key])) {
      return value;
    }

    // Unwrap a generic single-key wrapper, then re-normalize the inner value.
    const keys = Object.keys(record);
    if (keys.length === 1) {
      const soleValue = record[keys[0] as string];
      if (Array.isArray(soleValue)) {
        return { [key]: soleValue };
      }
      if (soleValue && typeof soleValue === "object") {
        return unwrapArrayEnvelope(soleValue, key);
      }
    }
  }

  return value;
}
