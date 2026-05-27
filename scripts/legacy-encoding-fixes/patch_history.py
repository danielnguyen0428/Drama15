import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p=pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text=p.read_text(encoding="utf-8")
start=text.find('<aside className="director-panel"')
end=text.find('</aside>', start)+len('</aside>')
if start==-1 or end==-1:
    raise SystemExit('director panel not found')
new='''<aside className="history-panel" aria-label="Lịch sử truyện">
          <div className="panel-heading">
            <span>Thư viện</span>
            <strong>Đang viết / Đã viết</strong>
          </div>
          {drafts.length === 0 ? (
            <div className="history-empty">
              <span>Chưa có truyện nào.</span>
              <small>Truyện sẽ xuất hiện ở đây sau khi bạn bắt đầu viết.</small>
            </div>
          ) : (
            <ul className="history-list">
              {drafts.map((draft) => (
                <li key={draft.storyId} className={`history-item${draft.storyId === storyId ? ' active' : ''}`}>
                  <button
                    type="button"
                    className="history-item-btn"
                    onClick={() => {
                      setStoryId(draft.storyId);
                      setStoryTitle(draft.title);
                      setResult(draft.result);
                      setConfig(draft.config);
                      setPhase(draft.phase === 'streaming' || draft.phase === 'creating' ? 'completed' : draft.phase);
                      setActiveNav('chapters');
                      setShowSetup(false);
                      setSuggestResult(null);
                    }}
                  >
                    <span className="history-title">{draft.title}</span>
                    <span className="history-meta">
                      {draft.result.chapters.length} chương
                      {draft.phase === 'completed' ? ' • Xong' : draft.phase === 'streaming' || draft.phase === 'creating' ? ' • Đang viết' : ''}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="history-delete"
                    aria-label="Xóa"
                    onClick={() => {
                      removeDraft(draft.storyId);
                      setDrafts(loadDrafts());
                    }}
                  >×</button>
                </li>
              ))}
            </ul>
          )}

          {storyId && (
            <>
              <div className="panel-divider" />
              <div className="panel-heading">
                <span>Director Notes</span>
                <strong>Rewrite</strong>
              </div>

              <div className="chapter-strip">
                {Array.from({ length: Math.max(10, result.chapters.length) }, (_, index) => index + 1).map((chapterNumber) => {
                  const exists = result.chapters.some((chapter) => chapter.index === chapterNumber);
                  return (
                    <button
                      key={chapterNumber}
                      type="button"
                      className={chapterNumber === activeChapter ? 'active' : ''}
                      disabled={!exists}
                      onClick={() => setActiveChapter(chapterNumber)}
                    >
                      {chapterNumber}
                    </button>
                  );
                })}
              </div>

              <label className="rewrite-field">
                Chế độ viết lại
                <select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}>
                  <option value="full_chapter">Viết lại toàn chương</option>
                  <option value="opening_hook">Hook mở đầu</option>
                  <option value="closing_beat">Nhịp kết chương</option>
                  <option value="dialogue_tone">Giọng thoại</option>
                  <option value="class_humiliation">Tăng sỉ nhục giai cấp</option>
                  <option value="retaliation_sharpness">Tăng độ trả đũa</option>
                </select>
              </label>

              <label className="rewrite-field">
                Ghi chú biên tập
                <textarea
                  value={rewriteInstruction}
                  onChange={(event) => setRewriteInstruction(event.target.value)}
                  placeholder="Ví dụ: giữ plot, tăng căng thẳng, giảm thoại giải thích."
                />
              </label>

              <button type="button" className="primary-button full" onClick={() => void handleRewrite()} disabled={rewriteBusy || !activeChapterData}>
                {rewriteBusy ? 'Đang viết lại' : `Viết lại chương ${activeChapter}`}
              </button>

              <div className="export-card">
                <strong>Xuất bản thảo</strong>
                <p>Markdown cho biên tập, hoặc PDF qua trình in.</p>
                <button type="button" className="secondary-button full" onClick={exportMd} disabled={result.chapters.length === 0}>Lưu Markdown</button>
                <button type="button" className="secondary-button full" onClick={exportPdf} disabled={result.chapters.length === 0}>In / Xuất PDF</button>
              </div>
            </>
          )}
        </aside>'''
text=text[:start]+new+text[end:]
p.write_text(text,encoding='utf-8')
print('history panel patched')
