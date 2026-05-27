import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Patch handleSuggest to set suggestResult and switch to chapters view
old_suggest_end = """      setProgressLabel('\u0110\u00e3 n\u1ea1p g\u1ee3i \u00fd c\u1ed1t truy\u1ec7n');
    } catch {
      setError('Ki\u1ec3m tra k\u1ebft n\u1ed1i API r\u1ed3i th\u1eed l\u1ea1i.');
    } finally {
      setPhase('idle');
    }
  };"""

new_suggest_end = """      setProgressLabel('\u0110\u00e3 n\u1ea1p g\u1ee3i \u00fd c\u1ed1t truy\u1ec7n');
      setSuggestResult({ title: data.title ?? '', seed: data.seed ?? '' });
      setActiveNav('chapters');
    } catch {
      setError('Ki\u1ec3m tra k\u1ebft n\u1ed1i API r\u1ed3i th\u1eed l\u1ea1i.');
    } finally {
      setPhase('idle');
    }
  };"""

if old_suggest_end not in text:
    print("WARN: suggest end not found, trying fallback")
else:
    text = text.replace(old_suggest_end, new_suggest_end)
    print("Patched handleSuggest")

# 2. Patch handleCreate to clear suggestResult
old_create_start = """  const handleCreate = async (): Promise<void> => {
    setPhase('creating');"""
new_create_start = """  const handleCreate = async (): Promise<void> => {
    setSuggestResult(null);
    setPhase('creating');"""
if old_create_start in text:
    text = text.replace(old_create_start, new_create_start)
    print("Patched handleCreate")

# 3. Replace the manuscript chapters panel with new flow
old_chapters_panel = """          {activeNav === 'chapters' && (
            <article className=\"document-page\">
              <p className=\"document-kicker\">B\u1ea3n th\u1ea3o ch\u00ednh</p>
              <h2>{activeChapterData?.title ?? storyTitle ?? config.title ?? 'Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng'}</h2>
              {isBusy && !activeChapterData && (
                <div className=\"writing-indicator\" aria-live=\"polite\">
                  <span className=\"writing-spinner\" aria-hidden=\"true\" />
                  <div>
                    <strong>Generating\u2026</strong>
                    <span>{progressLabel}</span>
                  </div>
                </div>
              )}
              {isBusy && activeChapterData && (
                <div className=\"writing-badge\" aria-live=\"polite\">
                  <span className=\"writing-spinner sm\" aria-hidden=\"true\" />
                  Writing\u2026
                </div>
              )}
              {activeChapterData ? (
                <div className=\"prose-block\">{activeChapterData.content}</div>
              ) : (
                !isBusy && (
                  <div className=\"empty-state\">
                    <strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong>
                    <span>\u0110i\u1ec1n creative brief, b\u1ea5m \"B\u1eaft \u0111\u1ea7u vi\u1ebft\", ch\u01b0\u01a1ng m\u1edbi s\u1ebd xu\u1ea5t hi\u1ec7n t\u1ea1i \u0111\u00e2y.</span>
                  </div>
                )
              )}
            </article>
          )}"""

new_chapters_panel = """          {activeNav === 'chapters' && (
            <article className=\"document-page\">
              {/* --- SUGGEST RESULT STATE --- */}
              {suggestResult && !storyId && !isBusy && (
                <div className=\"suggest-result\">
                  <p className=\"document-kicker\">G\u1ee3i \u00fd c\u1ed1t truy\u1ec7n</p>
                  <h2>{suggestResult.title || config.title || 'Ch\u01b0a c\u00f3 t\u1ef1a'}</h2>
                  <div className=\"seed-block\">
                    <span className=\"seed-label\">Seed c\u1ea3m x\u00fac</span>
                    <p>{suggestResult.seed || config.seed}</p>
                  </div>
                  <button
                    type=\"button\"
                    className=\"primary-button start-cta\"
                    onClick={() => void handleCreate()}
                    disabled={isBusy}
                  >
                    B\u1eaft \u0111\u1ea7u vi\u1ebft
                  </button>
                </div>
              )}

              {/* --- SUGGEST GENERATING STATE --- */}
              {phase === 'suggesting' && (
                <div className=\"writing-indicator\" aria-live=\"polite\">
                  <span className=\"writing-spinner\" aria-hidden=\"true\" />
                  <div>
                    <strong>\u0110ang t\u1ea1o g\u1ee3i \u00fd\u2026</strong>
                    <span>AI \u0111ang ph\u00e2n t\u00edch niche v\u00e0 t\u1ea1o seed c\u1ea3m x\u00fac</span>
                  </div>
                </div>
              )}

              {/* --- WRITING PROGRESS STATE --- */}
              {(phase === 'creating' || phase === 'streaming') && (
                <div className=\"gen-progress\" aria-live=\"polite\">
                  <div className=\"gen-progress-header\">
                    <span className=\"writing-spinner\" aria-hidden=\"true\" />
                    <strong>\u0110ang vi\u1ebft truy\u1ec7n\u2026</strong>
                  </div>
                  <div className=\"gen-steps\">
                    <div className={`gen-step ${progress >= 4 ? 'done' : 'active'}`}>
                      <span className=\"step-dot\" />
                      <span>D\u1ef1ng ph\u00f2ng bi\u00ean k\u1ecbch</span>
                    </div>
                    <div className={`gen-step ${progress >= 12 ? 'done' : progress >= 4 ? 'active' : ''}`}>
                      <span className=\"step-dot\" />
                      <span>T\u1ed5ng quan truy\u1ec7n</span>
                    </div>
                    <div className={`gen-step ${progress >= 22 ? 'done' : progress >= 12 ? 'active' : ''}`}>
                      <span className=\"step-dot\" />
                      <span>Beat sheet / K\u1ebf ho\u1ea1ch ch\u01b0\u01a1ng</span>
                    </div>
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((ch) => (
                      <div key={ch} className={`gen-step ${
                        result.chapters.some((c) => c.index === ch) ? 'done' :
                        progress >= 22 + (ch - 1) * 7 ? 'active' : ''
                      }`}>
                        <span className=\"step-dot\" />
                        <span>Ch\u01b0\u01a1ng {ch}{result.chapters.find((c) => c.index === ch)?.title ? ` \u2014 ${result.chapters.find((c) => c.index === ch)!.title}` : ''}</span>
                      </div>
                    ))}
                  </div>
                  <p className=\"gen-label\">{progressLabel}</p>
                </div>
              )}

              {/* --- CHAPTER CONTENT --- */}
              {phase !== 'suggesting' && phase !== 'creating' && phase !== 'streaming' && !suggestResult && (
                <>
                  <p className=\"document-kicker\">B\u1ea3n th\u1ea3o ch\u00ednh</p>
                  <h2>{activeChapterData?.title ?? storyTitle ?? config.title ?? 'Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng'}</h2>
                  {activeChapterData ? (
                    <div className=\"prose-block\">{activeChapterData.content}</div>
                  ) : (
                    <div className=\"empty-state\">
                      <strong>Ch\u01b0a c\u00f3 ch\u01b0\u01a1ng n\u00e0o.</strong>
                      <span>\u0110i\u1ec1n creative brief, b\u1ea5m \"T\u1ea1o g\u1ee3i \u00fd\" ho\u1eb7c \"B\u1eaft \u0111\u1ea7u vi\u1ebft\" \u0111\u1ec3 b\u1eaft \u0111\u1ea7u.</span>
                    </div>
                  )}
                </>
              )}

              {/* Show chapter content while streaming (after first chapter arrives) */}
              {(phase === 'streaming') && activeChapterData && (
                <>
                  <div className=\"writing-badge\" aria-live=\"polite\">
                    <span className=\"writing-spinner sm\" aria-hidden=\"true\" />
                    Writing ch\u01b0\u01a1ng {activeChapter}\u2026
                  </div>
                  <div className=\"prose-block\">{activeChapterData.content}</div>
                </>
              )}
            </article>
          )}"""

if old_chapters_panel not in text:
    print("WARN: chapters panel not found")
else:
    text = text.replace(old_chapters_panel, new_chapters_panel)
    print("Patched chapters panel")

# 4. Replace director-panel with history panel
old_director_start = "        <aside className=\"director-panel\" aria-label=\"Tr\u1ee3 l\u00fd bi\u00ean t\u1eadp\">"
old_director_end = "        </aside>\n\n      {accountOpen"

dir_start_idx = text.find(old_director_start)
dir_end_idx = text.find("        </aside>\n\n      {accountOpen")

if dir_start_idx == -1 or dir_end_idx == -1:
    print(f"WARN: director panel bounds not found: start={dir_start_idx} end={dir_end_idx}")
else:
    new_history_panel = """        <aside className=\"history-panel\" aria-label=\"L\u1ecbch s\u1eed truy\u1ec7n\">
          <div className=\"panel-heading\">
            <span>Th\u01b0 vi\u1ec7n</span>
            <strong>\u0110ang vi\u1ebft / \u0110\u00e3 vi\u1ebft</strong>
          </div>
          {drafts.length === 0 ? (
            <div className=\"history-empty\">
              <span>Ch\u01b0a c\u00f3 truy\u1ec7n n\u00e0o.</span>
              <small>Truy\u1ec7n s\u1ebd xu\u1ea5t hi\u1ec7n \u1edf \u0111\u00e2y sau khi b\u1ea1n b\u1eaft \u0111\u1ea7u vi\u1ebft.</small>
            </div>
          ) : (
            <ul className=\"history-list\">
              {drafts.map((draft) => (
                <li
                  key={draft.storyId}
                  className={`history-item${draft.storyId === storyId ? ' active' : ''}`}
                >
                  <button
                    type=\"button\"
                    className=\"history-item-btn\"
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
                    <span className=\"history-title\">{draft.title}</span>
                    <span className=\"history-meta\">
                      {draft.result.chapters.length} ch\u01b0\u01a1ng
                      {draft.phase === 'completed' ? ' \u2022 Xong' : draft.phase === 'streaming' || draft.phase === 'creating' ? ' \u2022 \u0110ang vi\u1ebft' : ''}
                    </span>
                  </button>
                  <button
                    type=\"button\"
                    className=\"history-delete\"
                    aria-label=\"X\u00f3a\"
                    onClick={() => {
                      removeDraft(draft.storyId);
                      setDrafts(loadDrafts());
                    }}
                  >\u00d7</button>
                </li>
              ))}
            </ul>
          )}

          {/* Rewrite panel - only show when a story is loaded */}
          {storyId && (
            <>
              <div className=\"panel-divider\" />
              <div className=\"panel-heading\">
                <span>Director Notes</span>
                <strong>Rewrite</strong>
              </div>
              <div className=\"chapter-strip\">
                {Array.from({ length: Math.max(10, result.chapters.length) }, (_, index) => index + 1).map((chapterNumber) => {
                  const exists = result.chapters.some((chapter) => chapter.index === chapterNumber);
                  return (
                    <button
                      key={chapterNumber}
                      type=\"button\"
                      className={chapterNumber === activeChapter ? 'active' : ''}
                      disabled={!exists}
                      onClick={() => setActiveChapter(chapterNumber)}
                    >
                      {chapterNumber}
                    </button>
                  );
                })}
              </div>
              <label className=\"rewrite-field\">
                Ch\u1ebf \u0111\u1ed9 vi\u1ebft l\u1ea1i
                <select value={rewriteMode} onChange={(event) => setRewriteMode(event.target.value)}>
                  <option value=\"full_chapter\">Vi\u1ebft l\u1ea1i to\u00e0n ch\u01b0\u01a1ng</option>
                  <option value=\"opening_hook\">Hook m\u1edf \u0111\u1ea7u</option>
                  <option value=\"closing_beat\">Nh\u1ecbp k\u1ebft ch\u01b0\u01a1ng</option>
                  <option value=\"dialogue_tone\">Gi\u1ecdng tho\u1ea1i</option>
                  <option value=\"class_humiliation\">T\u0103ng s\u1ec9 nh\u1ee5c giai c\u1ea5p</option>
                  <option value=\"retaliation_sharpness\">T\u0103ng \u0111\u1ed9 tr\u1ea3 \u0111\u0169a</option>
                </select>
              </label>
              <label className=\"rewrite-field\">
                Ghi ch\u00fa bi\u00ean t\u1eadp
                <textarea
                  value={rewriteInstruction}
                  onChange={(event) => setRewriteInstruction(event.target.value)}
                  placeholder=\"V\u00ed d\u1ee5: gi\u1eef plot, t\u0103ng c\u0103ng th\u1eb3ng, gi\u1ea3m tho\u1ea1i gi\u1ea3i th\u00edch.\"
                />
              </label>
              <button type=\"button\" className=\"primary-button full\" onClick={() => void handleRewrite()} disabled={rewriteBusy || !activeChapterData}>
                {rewriteBusy ? '\u0110ang vi\u1ebft l\u1ea1i' : `Vi\u1ebft l\u1ea1i ch\u01b0\u01a1ng ${activeChapter}`}
              </button>
              <div className=\"export-card\">
                <strong>Xu\u1ea5t b\u1ea3n th\u1ea3o</strong>
                <p>Markdown cho bi\u00ean t\u1eadp, ho\u1eb7c PDF qua tr\u00ecnh in.</p>
                <button type=\"button\" className=\"secondary-button full\" onClick={exportMd} disabled={result.chapters.length === 0}>L\u01b0u Markdown</button>
                <button type=\"button\" className=\"secondary-button full\" onClick={exportPdf} disabled={result.chapters.length === 0}>In / Xu\u1ea5t PDF</button>
              </div>
            </>
          )}
        </aside>\n\n      {accountOpen"""

    text = text[:dir_start_idx] + new_history_panel + text[dir_end_idx + len("        </aside>\n\n      {accountOpen"):]
    print("Patched director -> history panel")

p.write_text(text, encoding="utf-8")
print("Step 2 done")
