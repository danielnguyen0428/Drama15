import { Analytics } from '@vercel/analytics/react';

import { StoryWorkspace } from './story/StoryWorkspace';

export default function App(): JSX.Element {
  return (
    <>
      <StoryWorkspace />
      <Analytics />
    </>
  );
}
