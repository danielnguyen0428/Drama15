import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Patch call site
old_call = "{chapterTab === 'content' && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} />}"
new_call = "{chapterTab === 'content' && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} activeDraft={!storyId ? activeDraft : undefined} onResume={handleResume} />}"
if old_call in text:
    text = text.replace(old_call, new_call)
    print("call patched")
else:
    print("call NOT FOUND")
    idx=text.find("ManuscriptContent activeChapterData")
    print(repr(text[idx:idx+200]))

# 2. Patch empty state inside ManuscriptContent
# Find the exact empty-state text in the function
idx = text.find("function ManuscriptContent")
fn_text = text[idx:idx+1000]
print("fn snippet:", repr(fn_text[200:500]))

# The empty state is a single-line JSX - find and replace within it
old_es = "<div className=\"empty-state\"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span></div>"
new_es = "<div className=\"empty-state\"><strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong><span>\u0110i\u1ec1n creative brief, b\u1ea5m \u201cT\u1ea1o g\u1ee3i \u00fd\u201d ho\u1eb7c \u201cB\u1eaft \u0111\u1ea7u vi\u1ebft\u201d \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>{activeDraft && onResume && <div className=\"resume-card\"><strong>Truy\u1ec7n d\u1edf: {activeDraft.title}</strong><span>{activeDraft.result.chapters.length}/10 ch\u01b0\u01a1ng</span><button type=\"button\" className=\"primary-button\" onClick={() => onResume(activeDraft)}>Ti\u1ebfp t\u1ee5c vi\u1ebft</button></div>}</div>"
if old_es in text:
    text = text.replace(old_es, new_es)
    print("empty-state patched")
else:
    print("empty-state NOT FOUND - showing raw")
    idx2=text.find("Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o")
    print(repr(text[idx2-50:idx2+300]))

p.write_text(text, encoding="utf-8")
print("done")
