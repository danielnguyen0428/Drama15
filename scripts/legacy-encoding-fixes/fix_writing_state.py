import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Replace the chapters panel section to add writing indicator
old = """          {activeNav === 'chapters' && (
            <article className="document-page">
              <p className="document-kicker">Bản thảo chính</p>
              <h2>{activeChapterData?.title ?? storyTitle ?? config.title ?? 'Chưa có chương'}</h2>
              {activeChapterData ? (
                <div className="prose-block">{activeChapterData.content}</div>
              ) : (
                <div className="empty-state">
                  <strong>Chưa có chương nào.</strong>
                  <span>Điền creative brief, bấm "Bắt đầu viết", chương mới sẽ xuất hiện tại đây.</span>
                </div>
              )}
            </article>
          )}"""

new = """          {activeNav === 'chapters' && (
            <article className="document-page">
              <p className="document-kicker">Bản thảo chính</p>
              <h2>{activeChapterData?.title ?? storyTitle ?? config.title ?? 'Chưa có chương'}</h2>
              {isBusy && !activeChapterData && (
                <div className="writing-indicator" aria-live="polite">
                  <span className="writing-spinner" aria-hidden="true" />
                  <div>
                    <strong>Generating…</strong>
                    <span>{progressLabel}</span>
                  </div>
                </div>
              )}
              {isBusy && activeChapterData && (
                <div className="writing-badge" aria-live="polite">
                  <span className="writing-spinner sm" aria-hidden="true" />
                  Writing…
                </div>
              )}
              {activeChapterData ? (
                <div className="prose-block">{activeChapterData.content}</div>
              ) : (
                !isBusy && (
                  <div className="empty-state">
                    <strong>Chưa có chương nào.</strong>
                    <span>Điền creative brief, bấm "Bắt đầu viết", chương mới sẽ xuất hiện tại đây.</span>
                  </div>
                )
              )}
            </article>
          )}"""

if old not in text:
    raise SystemExit("target block not found")
text = text.replace(old, new)
p.write_text(text, encoding="utf-8")
print("TSX patched")
