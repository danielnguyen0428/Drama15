import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
lines = p.read_text(encoding="utf-8").splitlines()
# Lines 1022-1023 (0-indexed 1021-1022) are the ManuscriptContent function
# Replace them entirely
new_fn = [
  'function ManuscriptContent({ activeChapterData, storyTitle, configTitle, activeDraft, onResume }: { activeChapterData?: ChapterResult; storyTitle: string; configTitle: string; activeDraft?: DraftEntry; onResume?: (d: DraftEntry) => void }): JSX.Element {',
  '  if (!activeChapterData && activeDraft && onResume) {',
  '    return <div className="resume-card"><strong>{activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng \u2022 B\u1ecb ng\u1eaft</span><button type="button" className="primary-button" onClick={() => onResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button></div>;',
  '  }',
  '  return <>{<p className="document-kicker">B\u1ea3n th\u1ea3o ch\u00ednh</p>}<h2>{activeChapterData?.title ?? storyTitle ?? configTitle ?? \'Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng\'}</h2>{activeChapterData ? <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /> : <div className="empty-state"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span></div>}</>;',
  '}',
]
# Find the function start
for i, l in enumerate(lines):
    if l.startswith('function ManuscriptContent('):
        # Find end of function (next line with just "}")
        end = i + 1
        while end < len(lines) and lines[end] != '}':
            end += 1
        end += 1  # include the closing }
        print(f"Replacing lines {i+1}-{end}")
        lines = lines[:i] + new_fn + lines[end:]
        break
p.write_text('\n'.join(lines) + '\n', encoding='utf-8')
print('done')
