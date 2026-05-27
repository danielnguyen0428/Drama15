import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Add quotaStatus computed near activeDraft
old = "  const activeDraft = drafts.find((d) => d.phase === 'streaming' || d.phase === 'creating');"
new = """  const quotaStatus = canCreateStory();
  const activeDraft = drafts.find((d) => d.phase === 'streaming' || d.phase === 'creating');"""
if old in text:
    text = text.replace(old, new)
    print("quotaStatus added")
else:
    print("activeDraft line not found")

# Add UI under creative brief panel-heading
old2 = '''          <div className="panel-heading">
            <span>Creative Brief</span>
            <button type="button" className="panel-toggle" onClick={() => setShowSetup((current) => !current)}>{showSetup ? 'Thu g\u1ecdn' : 'M\u1edf'}</button>
          </div>'''
new2 = '''          <div className="panel-heading">
            <span>Creative Brief</span>
            <button type="button" className="panel-toggle" onClick={() => setShowSetup((current) => !current)}>{showSetup ? 'Thu g\u1ecdn' : 'M\u1edf'}</button>
          </div>
          <div className="quota-pill">C\u00f2n {quotaStatus.remaining}/{MAX_STORIES_PER_DAY} b\u1ed9 h\u00f4m nay</div>'''
if old2 in text:
    text = text.replace(old2, new2)
    print("quota UI added")
else:
    print("panel heading not found")

p.write_text(text, encoding="utf-8")
print("done")
