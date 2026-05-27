import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Replace the entire creating/streaming block to show tabs + route preview
old_block = '''              {(phase === \'creating\' || phase === \'streaming\') && (
                <div className="gen-progress" aria-live="polite">
                  <div className="gen-progress-header"><span className="writing-spinner" aria-hidden="true" /><strong>\u0110ang vi\u1ebft truy\u1ec7n\u2026</strong></div>
                  <div className="gen-timeline">
                    <TimelinePhase label="Setup" steps={[\'Ph\u00f2ng bi\u00ean k\u1ecbch\', \'T\u1ed5ng quan\', \'Bible\', \'Beat sheet\']} currentStep={progress < 12 ? 0 : progress < 18 ? 1 : progress < 22 ? 2 : result.chapters.length === 0 ? 3 : 4} />
                    <TimelinePhase label={`Ch\u01b0\u01a1ng (${result.chapters.length}/10)`} steps={Array.from({ length: 10 }, (_, i) => `Ch.${i + 1}`)} currentStep={result.chapters.length > 0 ? result.chapters.length : -1} />
                  </div>
                  <p className="gen-label">{progressLabel}</p>
                  {previewContent && !partialChapter && (
                    <div className="gen-preview">
                      <div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />{previewContent.stage === \'overview\' ? \'T\u1ed5ng quan truy\u1ec7n\' : previewContent.stage === \'bible\' ? \'Story Bible\' : \'Beat Sheet\'}</div>
                      <div className="prose-block" dangerouslySetInnerHTML={{ __html: previewContent.stage === \'plan\' ? formatPlanHtml(previewContent.text) : formatConceptHtml(previewContent.text) }} />
                    </div>
                  )}
                </div>
              )}
              {phase === \'streaming\' && partialChapter && partialChapter.index === activeChapter && (
                <>
                  <div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />\u0110ang vi\u1ebft ch\u01b0\u01a1ng {activeChapter}\u2026</div>
                  <div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} />
                </>
              )}
              {phase === \'streaming\' && !partialChapter && activeChapterData && <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Writing ch\u01b0\u01a1ng {activeChapter}\u2026</div><div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /></>}'''

new_block = '''              {(phase === \'creating\' || phase === \'streaming\') && (
                <div className="gen-progress" aria-live="polite">
                  <div className="gen-progress-header"><span className="writing-spinner" aria-hidden="true" /><strong>\u0110ang vi\u1ebft truy\u1ec7n\u2026</strong><span className="gen-progress-label">{progressLabel}</span></div>
                  <div className="gen-timeline">
                    <TimelinePhase label="Setup" steps={[\'Ph\u00f2ng bi\u00ean k\u1ecbch\', \'T\u1ed5ng quan\', \'Bible\', \'Beat sheet\']} currentStep={progress < 12 ? 0 : progress < 18 ? 1 : progress < 22 ? 2 : result.chapters.length === 0 ? 3 : 4} />
                    <TimelinePhase label={`Ch\u01b0\u01a1ng (${result.chapters.length}/10)`} steps={Array.from({ length: 10 }, (_, i) => `Ch.${i + 1}`)} currentStep={result.chapters.length > 0 ? result.chapters.length : -1} />
                  </div>
                </div>
              )}
              {(phase === \'creating\' || phase === \'streaming\') && (
                <nav className="chapter-tabs" aria-label="Xem n\u1ed9i dung">
                  <button type="button" className={chapterTab === \'overview\' ? \'active\' : \'\'} onClick={() => setChapterTab(\'overview\')}>T\u1ed5ng quan</button>
                  <button type="button" className={chapterTab === \'summary\' ? \'active\' : \'\'} onClick={() => setChapterTab(\'summary\')}>K\u1ebf ho\u1ea1ch</button>
                  <button type="button" className={chapterTab === \'content\' ? \'active\' : \'\'} onClick={() => setChapterTab(\'content\')}>B\u1ea3n th\u1ea3o</button>
                </nav>
              )}
              {(phase === \'creating\' || phase === \'streaming\') && chapterTab === \'overview\' && (
                <div className="gen-preview">
                  {previewContent?.stage === \'overview\' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>\u0110ang d\u1ef1ng t\u1ed5ng quan\u2026</strong><span>N\u1ed9i dung s\u1ebd xu\u1ea5t hi\u1ec7n khi AI ho\u00e0n th\u00e0nh b\u01b0\u1edbc n\u00e0y.</span></div>
                  )}
                </div>
              )}
              {(phase === \'creating\' || phase === \'streaming\') && chapterTab === \'summary\' && (
                <div className="gen-preview">
                  {previewContent?.stage === \'plan\' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>\u0110ang d\u1ef1ng k\u1ebf ho\u1ea1ch\u2026</strong><span>Beat sheet s\u1ebd xu\u1ea5t hi\u1ec7n sau khi AI ho\u00e0n th\u00e0nh t\u1ed5ng quan.</span></div>
                  )}
                </div>
              )}
              {(phase === \'creating\' || phase === \'streaming\') && chapterTab === \'content\' && (
                <div className="gen-preview">
                  {partialChapter ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />\u0110ang vi\u1ebft ch\u01b0\u01a1ng {partialChapter.index}\u2026</div><div className="prose-block prose-block-streaming" dangerouslySetInnerHTML={{ __html: formatChapterText(partialChapter.text) }} /></>
                  ) : activeChapterData ? (
                    <><div className="writing-badge"><span className="writing-spinner sm" aria-hidden="true" />Ch\u01b0\u01a1ng {activeChapter} \u0111\u00e3 xong</div><div className="prose-block" dangerouslySetInnerHTML={{ __html: formatChapterText(activeChapterData.content) }} /></>
                  ) : (
                    <div className="empty-state"><strong>\u0110ang chu\u1ea9n b\u1ecb vi\u1ebft ch\u01b0\u01a1ng\u2026</strong><span>B\u1ea3n th\u1ea3o s\u1ebd xu\u1ea5t hi\u1ec7n khi AI b\u1eaft \u0111\u1ea7u vi\u1ebft ch\u01b0\u01a1ng \u0111\u1ea7u ti\u00ean.</span></div>
                  )}
                </div>
              )}'''

if old_block in text:
    text = text.replace(old_block, new_block)
    print("gen-progress block replaced")
else:
    print("block NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
