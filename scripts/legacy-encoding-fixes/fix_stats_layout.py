import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Move hero-stats out of hero-card, place them side by side
old = '''        <div className="hero-card">
          <div className="progress-summary">
            <div><span>Ti\u1ebfn \u0111\u1ed9</span><strong>{progress}%</strong></div>
            <div className="hero-stats" aria-label="Th\u1ed1ng k\u00ea b\u1ea3n th\u1ea3o">
              <div><strong>{result.chapters.length}</strong><span>Ch\u01b0\u01a1ng</span></div>
              <div><strong>{totalWords.toLocaleString('vi-VN')}</strong><span>T\u1eeb</span></div>
              <div><strong>{storyId ? 'Live' : 'Draft'}</strong><span>Phi\u00ean</span></div>
            </div>
          </div>
          <progress className="progress-track" value={progress} max={100} aria-label={`Ti\u1ebfn \u0111\u1ed9 ${progress}%`} />
          <p>{progressLabel}</p>
        </div>'''

new = '''        <div className="hero-progress-row">
          <div className="hero-card">
            <div><span>Ti\u1ebfn \u0111\u1ed9</span><strong>{progress}%</strong></div>
            <progress className="progress-track" value={progress} max={100} aria-label={`Ti\u1ebfn \u0111\u1ed9 ${progress}%`} />
            <p>{progressLabel}</p>
          </div>
          <div className="hero-stats" aria-label="Th\u1ed1ng k\u00ea b\u1ea3n th\u1ea3o">
            <div><strong>{result.chapters.length}</strong><span>Ch\u01b0\u01a1ng</span></div>
            <div><strong>{totalWords.toLocaleString('vi-VN')}</strong><span>T\u1eeb</span></div>
            <div><strong>{storyId ? 'Live' : 'Draft'}</strong><span>Phi\u00ean</span></div>
          </div>
        </div>'''

if old in text:
    text = text.replace(old, new)
    print("TSX patched")
else:
    print("NOT FOUND")

p.write_text(text, encoding="utf-8")
