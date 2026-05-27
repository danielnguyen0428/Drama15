import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p=pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text=p.read_text(encoding='utf-8')
old='''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'content' && (
                <div className="gen-preview">
                  {partialChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Đang viết chương {partialChapter.index}…</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : activeChapterData ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Chương {activeChapter} đã xong</div><div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /></>
                  ) : (
                    <div className="empty-state"><strong>Đang chuẩn bị viết chương…</strong><span>Bản thảo sẽ xuất hiện khi AI bắt đầu viết chương đầu tiên.</span></div>
                  )}
                </div>
              )}'''
new='''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'content' && (
                <div className="gen-preview">
                  {result.chapters.length > 0 && (
                    <div className="stream-chapter-list" aria-label="Chương đã viết">
                      {result.chapters.map((chapter) => (
                        <button
                          key={chapter.index}
                          type="button"
                          className={chapter.index === activeChapter ? 'active' : ''}
                          onClick={() => setActiveChapter(chapter.index)}
                        >
                          <span>Chương {chapter.index}</span>
                          <small>{chapter.title ?? 'Đã xong'}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {partialChapter && partialChapter.index === activeChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Đang viết chương {partialChapter.index}…</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : activeChapterData ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Chương {activeChapter} đã xong</div><div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /></>
                  ) : partialChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Đang viết chương {partialChapter.index}…</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : (
                    <div className="empty-state"><strong>Đang chuẩn bị viết chương…</strong><span>Bản thảo sẽ xuất hiện khi AI bắt đầu viết chương đầu tiên.</span></div>
                  )}
                </div>
              )}'''
if old in text:
 text=text.replace(old,new)
 print('stream chapter list added')
else:
 print('block not found')
p.write_text(text,encoding='utf-8')
