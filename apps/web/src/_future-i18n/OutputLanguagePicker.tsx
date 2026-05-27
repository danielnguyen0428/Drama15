/**
 * Dropdown that lets the user pick the language in which generated
 * stories should be written.
 *
 * This control writes ONLY to the output-language store
 * (`output_language` in `localStorage`). It deliberately does not
 * import or call anything from `apps/web/src/i18n/`, so toggling it
 * cannot mutate `ui_locale` (Requirement 19.3).
 */

import { useState } from 'react';

import {
  getOutputLanguage,
  setOutputLanguage,
  type OutputLanguage,
} from './outputLanguage.legacy';

export interface OutputLanguagePickerProps {
  /**
   * Optional callback fired after the new language is persisted.
   * Useful for parent components that want to re-render dependent
   * pieces (e.g. a request preview).
   */
  onChange?: (lang: OutputLanguage) => void;
  /** Visible label for the control (no i18n catalog lookup here). */
  label?: string;
  /** Stable `id` for the underlying `<select>` element. */
  id?: string;
}

const OPTIONS: ReadonlyArray<{ value: OutputLanguage; label: string }> = [
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'en', label: 'English' },
];

export function OutputLanguagePicker({
  onChange,
  label = 'Output language',
  id = 'output-language-picker',
}: OutputLanguagePickerProps): JSX.Element {
  const [value, setValue] = useState<OutputLanguage>(() => getOutputLanguage());

  const handleChange = (event: React.ChangeEvent<HTMLSelectElement>): void => {
    const next = event.target.value as OutputLanguage;
    setOutputLanguage(next);
    setValue(next);
    onChange?.(next);
  };

  return (
    <label htmlFor={id} data-testid="output-language-picker-label">
      {label}
      <select
        id={id}
        data-testid="output-language-picker"
        value={value}
        onChange={handleChange}
      >
        {OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default OutputLanguagePicker;
