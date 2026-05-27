import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Remove progress bar, keep only % + label in hero-card
old_hero_row = '''        <div className="hero-progress-row">
          <div className="hero-card">
            <div><span>Ti\u1ebfn \u0111\u1ed9</span><strong>{progress}%</strong></div>
            <progress className="progress-track" value={progress} max={100} aria-label={`Ti\u1ebfn \u0111\u1ed9 ${progress}%`} />
            <p>{progressLabel}</p>
          </div>
          <div className="hero-stats" aria-label="Th\u1ed1ng k\u00ea b\u1ea3n th\u1ea3o">
            <div><strong>{result.chapters.length}</strong><span>Ch\u01b0\u01a1ng</span></div>
            <div><strong>{totalWords.toLocaleString(\'vi-VN\')}</strong><span>T\u1eeb</span></div>
            <div><strong>{storyId ? \'Live\' : \'Draft\'}</strong><span>Phi\u00ean</span></div>
          </div>
        </div>'''

new_hero_row = '''        <div className="hero-card">
          <span>Ti\u1ebfn \u0111\u1ed9</span>
          <strong>{progress}%</strong>
          <p>{progressLabel}</p>
        </div>'''

if old_hero_row in text:
    text = text.replace(old_hero_row, new_hero_row)
    print("hero-row patched")
else:
    print("hero-row NOT FOUND")

# 2. Add stats block at top of history-panel (before panel-heading)
old_history_top = '''<aside className="history-panel" aria-label="L\u1ecbch s\u1eed truy\u1ec7n">
          <div className="panel-heading"><span>Th\u01b0 vi\u1ec7n</span><strong>\u0110ang vi\u1ebft / \u0110\u00e3 vi\u1ebft</strong></div>'''

new_history_top = '''<aside className="history-panel" aria-label="L\u1ecbch s\u1eed truy\u1ec7n">
          <div className="hero-stats sidebar-stats" aria-label="Th\u1ed1ng k\u00ea b\u1ea3n th\u1ea3o">
            <div><strong>{result.chapters.length}</strong><span>Ch\u01b0\u01a1ng</span></div>
            <div><strong>{totalWords.toLocaleString(\'vi-VN\')}</strong><span>T\u1eeb</span></div>
            <div><strong>{storyId ? \'Live\' : \'Draft\'}</strong><span>Phi\u00ean</span></div>
          </div>
          <div className="panel-heading"><span>Th\u01b0 vi\u1ec7n</span><strong>\u0110ang vi\u1ebft / \u0110\u00e3 vi\u1ebft</strong></div>'''

if old_history_top in text:
    text = text.replace(old_history_top, new_history_top)
    print("history stats patched")
else:
    print("history top NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
