/**
 * UI locale (giao diện) — independent from output language of generated stories.
 *
 * Per Requirement 19.3, the UI language is fully separated from the output
 * language passed to the generation upstream (see `StorySetupConfig.outputLanguage`).
 */
export type UiLocale = 'vi' | 'en';
