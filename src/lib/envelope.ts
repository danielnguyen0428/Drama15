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
