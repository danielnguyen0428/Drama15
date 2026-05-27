import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Add helper to check if there is an active (unfinished) draft
# Add after loadDraft function
old_load = "  const loadDraft = (draft: DraftEntry): void => {"
new_load = """  const activeDraft = drafts.find((d) => d.phase === 'streaming' || d.phase === 'creating');

  const handleResume = (draft: DraftEntry): void => {
    loadDraft(draft);
    // Re-trigger stream from server using existing storyId
    setPhase('creating');
    setProgress(22 + draft.result.chapters.length * 7);
    setProgressLabel(`Ti\u1ebfp t\u1ee5c t\u1eeb ch\u01b0\u01a1ng ${draft.result.chapters.length + 1}`);
    startStream(draft.storyId);
  };

  const loadDraft = (draft: DraftEntry): void => {"""
if old_load in text:
    text = text.replace(old_load, new_load)
    print("activeDraft + handleResume added")
else:
    print("loadDraft NOT FOUND")

# 2. Block handleCreate if activeDraft exists
old_create = """  const handleCreate = async (): Promise<void> => {
    setSuggestResult(null);
    setPreviewContent(null);
    setPhase('creating');"""
new_create = """  const handleCreate = async (): Promise<void> => {
    if (activeDraft && activeDraft.storyId !== storyId) {
      setError(`B\u1ea1n \u0111ang c\u00f3 b\u1ed9 truy\u1ec7n ch\u01b0a ho\u00e0n th\u00e0nh: "${activeDraft.title}". H\u00e3y ho\u00e0n th\u00e0nh ho\u1eb7c x\u00f3a n\u00f3 tr\u01b0\u1edbc khi vi\u1ebft b\u1ed9 m\u1edbi.`);
      return;
    }
    setSuggestResult(null);
    setPreviewContent(null);
    setPhase('creating');"""
if old_create in text:
    text = text.replace(old_create, new_create)
    print("anti-spam guard added")
else:
    print("handleCreate NOT FOUND")

# 3. Add resume button in the manuscript panel for interrupted drafts
# After the empty-state block, add a resume section
old_empty = '''                    <div className="empty-state">\n                      <strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong>\n                      <span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>\n                    </div>'''
new_empty = '''                    <div className="empty-state">\n                      <strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong>\n                      <span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>\n                    </div>\n                    {activeDraft && !storyId && (\n                      <div className="resume-card">\n                        <strong>Truy\u1ec7n \u0111ang d\u1edf: {activeDraft.title}</strong>\n                        <span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng</span>\n                        <button type="button" className="primary-button" onClick={() => handleResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button>\n                      </div>\n                    )}'''
if old_empty in text:
    text = text.replace(old_empty, new_empty)
    print("resume card added")
else:
    print("empty-state NOT FOUND")

# 4. Also add resume in history panel items for interrupted drafts
# In history-item-btn, add a resume indicator
old_hist_meta = '''<span className="history-meta">{draft.result.chapters.length} ch\u01b0\u01a1ng \u2022 {draft.phase === 'completed' ? 'Xong' : '\u0110ang vi\u1ebft'}</span>'''
new_hist_meta = '''<span className="history-meta">{draft.result.chapters.length} ch\u01b0\u01a1ng \u2022 {draft.phase === 'completed' ? 'Xong' : draft.phase === 'failed' ? 'L\u1ed7i' : '\u0110ang vi\u1ebft'}</span>'''
if old_hist_meta in text:
    text = text.replace(old_hist_meta, new_hist_meta)
    print("history meta patched")

# 5. When loading a draft that was interrupted, show resume option
# In loadDraft, mark interrupted drafts as failed so user can resume
old_loadfn = """  const loadDraft = (draft: DraftEntry): void => {
    setStoryId(draft.storyId);
    setStoryTitle(draft.title);
    setConfig(draft.config);
    setResult(draft.result);
    setPhase(draft.phase === 'creating' || draft.phase === 'streaming' ? 'completed' : draft.phase);"""
new_loadfn = """  const loadDraft = (draft: DraftEntry): void => {
    setStoryId(draft.storyId);
    setStoryTitle(draft.title);
    setConfig(draft.config);
    setResult(draft.result);
    setPhase(draft.phase === 'creating' || draft.phase === 'streaming' ? 'failed' : draft.phase);"""
if old_loadfn in text:
    text = text.replace(old_loadfn, new_loadfn)
    print("loadDraft phase patched")
else:
    print("loadDraft fn NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
