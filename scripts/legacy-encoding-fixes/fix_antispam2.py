import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Add anti-spam guard at top of handleCreate
old_create = """  const handleCreate = async (): Promise<void> => {
    setSuggestResult(null);
    setPhase('creating');"""
new_create = """  const handleCreate = async (): Promise<void> => {
    if (activeDraft && activeDraft.storyId !== storyId) {
      setError(`B\u1ea1n \u0111ang c\u00f3 b\u1ed9 truy\u1ec7n ch\u01b0a ho\u00e0n th\u00e0nh: \"${activeDraft.title}\". Ho\u00e0n th\u00e0nh ho\u1eb7c x\u00f3a n\u00f3 tr\u01b0\u1edbc.`);
      return;
    }
    setSuggestResult(null);
    setPhase('creating');"""
if old_create in text:
    text = text.replace(old_create, new_create)
    print("anti-spam added")
else:
    print("handleCreate NOT FOUND")

# 2. Add resume card + activeDraft prop to ManuscriptContent
# Change ManuscriptContent to accept activeDraft and handleResume
old_mc = 'function ManuscriptContent({ activeChapterData, storyTitle, configTitle }: { activeChapterData?: ChapterResult; storyTitle: string; configTitle: string }): JSX.Element {'
new_mc = 'function ManuscriptContent({ activeChapterData, storyTitle, configTitle, activeDraft, onResume }: { activeChapterData?: ChapterResult; storyTitle: string; configTitle: string; activeDraft?: DraftEntry; onResume?: (d: DraftEntry) => void }): JSX.Element {'
if old_mc in text:
    text = text.replace(old_mc, new_mc)
    print("ManuscriptContent sig patched")
else:
    print("ManuscriptContent NOT FOUND")

# 3. Add resume card inside ManuscriptContent empty state
old_empty = '''<div className="empty-state"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>'''
new_empty = '''<div className="empty-state"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>{activeDraft && onResume && <div className="resume-card"><strong>Truy\u1ec7n \u0111ang d\u1edf: {activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng</span><button type="button" className="primary-button" onClick={() => onResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button></div>}'''
if old_empty in text:
    text = text.replace(old_empty, new_empty)
    print("resume card added")
else:
    print("empty-state NOT FOUND")

# 4. Pass activeDraft and handleResume to ManuscriptContent call
old_call = 'phase !== \'suggesting\' && phase !== \'creating\' && phase !== \'streaming\' && !suggestResult && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} />'
new_call = 'phase !== \'suggesting\' && phase !== \'creating\' && phase !== \'streaming\' && !suggestResult && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} activeDraft={!storyId ? activeDraft : undefined} onResume={handleResume} />'
if old_call in text:
    text = text.replace(old_call, new_call)
    print("call patched")
else:
    print("ManuscriptContent call NOT FOUND")

# 5. Also add resume button in the failed phase view
# When phase is failed and we have chapters, show resume
old_failed_check = "setPhase(draft.phase === 'creating' || draft.phase === 'streaming' ? 'failed' : draft.phase);"
if old_failed_check in text:
    print("loadDraft already marks interrupted as failed - good")

p.write_text(text, encoding="utf-8")
print("done")
