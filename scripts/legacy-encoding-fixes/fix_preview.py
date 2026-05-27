import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Add previewContent state
old_state = "  const [partialChapter, setPartialChapter] = useState<{ index: number; text: string } | null>(null);"
new_state = old_state + "\n  const [previewContent, setPreviewContent] = useState<{ stage: string; text: string } | null>(null);"
if old_state in text:
    text = text.replace(old_state, new_state)
    print("state added")

# 2. Set previewContent on stream events
old_ov = """        if (event.stage === 'overview' && event.concept) {
          setResult((current) => ({ ...current, concept: event.concept }));
          setProgress(12);
          setProgressLabel('\u0110\u00e3 d\u1ef1ng t\u1ed5ng quan');
        }
        if (event.stage === 'bible') {
          setProgress(18);
          setProgressLabel('\u0110\u00e3 d\u1ef1ng story bible');
        }
        if (event.stage === 'plan' && event.plan) {
          setResult((current) => ({ ...current, plan: event.plan }));
          setProgress(22);
          setProgressLabel('\u0110\u00e3 kh\u00f3a beat sheet');
        }"""
new_ov = """        if (event.stage === 'overview' && event.concept) {
          setResult((current) => ({ ...current, concept: event.concept }));
          setPreviewContent({ stage: 'overview', text: event.concept ?? '' });
          setProgress(12);
          setProgressLabel('\u0110\u00e3 d\u1ef1ng t\u1ed5ng quan');
        }
        if (event.stage === 'bible' && event.content) {
          setPreviewContent({ stage: 'bible', text: event.content ?? '' });
          setProgress(18);
          setProgressLabel('\u0110\u00e3 d\u1ef1ng story bible');
        }
        if (event.stage === 'plan' && event.plan) {
          setResult((current) => ({ ...current, plan: event.plan }));
          setPreviewContent({ stage: 'plan', text: event.plan ?? '' });
          setProgress(22);
          setProgressLabel('\u0110\u00e3 kh\u00f3a beat sheet');
        }"""
if old_ov in text:
    text = text.replace(old_ov, new_ov)
    print("stream events patched")
else:
    print("stream events NOT FOUND")

# 3. Clear previewContent when first chapter arrives
old_ch = "        if (event.stage === 'chapter' && event.chapterIndex && event.content) {"
new_ch = "        if (event.stage === 'chapter' && event.chapterIndex && event.content) {\n          setPreviewContent(null);"
if old_ch in text:
    text = text.replace(old_ch, new_ch)
    print("chapter clear patched")

# 4. Clear on handleCreate
old_cr = "    setSuggestResult(null);"
new_cr = "    setSuggestResult(null);\n    setPreviewContent(null);"
if old_cr in text:
    text = text.replace(old_cr, new_cr, 1)
    print("create clear patched")

# 5. Add preview after gen-progress closing
old_label = '                  <p className="gen-label">{progressLabel}</p>'
new_label = '                  <p className="gen-label">{progressLabel}</p>\n                  {previewContent && !partialChapter && (\n                    <div className="gen-preview">\n                      <div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />{previewContent.stage === \'overview\' ? \'T\u1ed5ng quan truy\u1ec7n\' : previewContent.stage === \'bible\' ? \'Story Bible\' : \'Beat Sheet\'}</div>\n                      <div className="prose-block" dangerouslySetInnerHTML={{ __html: previewContent.stage === \'plan\' ? formatPlanHtml(previewContent.text) : formatConceptHtml(previewContent.text) }} />\n                    </div>\n                  )}'
if old_label in text:
    text = text.replace(old_label, new_label, 1)
    print("preview added")
else:
    print("gen-label NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
