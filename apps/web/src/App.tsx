import { Analytics } from '@vercel/analytics/react';

import { I18nProvider } from './i18n/useI18n';
import { StoryWorkspace } from './story/StoryWorkspace';

export default function App(): JSX.Element {
  return (
    <I18nProvider>
      <StoryWorkspace />
      <Analytics />
    </I18nProvider>
  );
}
