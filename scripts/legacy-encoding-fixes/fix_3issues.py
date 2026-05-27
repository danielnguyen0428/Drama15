import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

# --- Fix TSX: TimelinePhase show labels below dots ---
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Replace TimelinePhase component to show labels
old_tp = '''function TimelinePhase({ label, steps, currentStep }: { label: string; steps: string[]; currentStep: number }): JSX.Element {
  return (
    <div className="timeline-phase">
      <span className="timeline-phase-label">{label}</span>
      <div className="timeline-dots">
        {steps.map((step, i) => (
          <span
            key={step}
            className={`timeline-dot${i < currentStep ? ' done' : i === currentStep ? ' active' : ''}`}
            title={step}
            aria-label={step}
          />
        ))}
      </div>
    </div>
  );
}'''

new_tp = '''function TimelinePhase({ label, steps, currentStep }: { label: string; steps: string[]; currentStep: number }): JSX.Element {
  return (
    <div className="timeline-phase">
      <span className="timeline-phase-label">{label}</span>
      <div className="timeline-dots">
        {steps.map((step, i) => (
          <div
            key={step}
            className={`timeline-item${i < currentStep ? ' done' : i === currentStep ? ' active' : ''}`}
          >
            <span className="timeline-dot" />
            <span className="timeline-step-label">{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}'''

if old_tp in text:
    text = text.replace(old_tp, new_tp)
    print("TimelinePhase patched")
else:
    print("TimelinePhase NOT FOUND")

# Fix ManuscriptContent call at line 757 to also pass activeDraft/onResume
old_mc2 = "phase !== 'suggesting' && phase !== 'creating' && phase !== 'streaming' && !suggestResult && result.chapters.length === 0 && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} />"
new_mc2 = "phase !== 'suggesting' && phase !== 'creating' && phase !== 'streaming' && !suggestResult && result.chapters.length === 0 && <ManuscriptContent activeChapterData={activeChapterData} storyTitle={storyTitle} configTitle={config.title} activeDraft={!storyId ? activeDraft : undefined} onResume={handleResume} />"
if old_mc2 in text:
    text = text.replace(old_mc2, new_mc2)
    print("MC2 call patched")
else:
    print("MC2 call NOT FOUND")

p.write_text(text, encoding="utf-8")

# --- Fix CSS ---
c = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
css = c.read_text(encoding="utf-8")

# 1. Replace timeline-dots to be flex with labels
old_dots = '''  .timeline-dots {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(14px, 1fr);
    align-items: center;
    gap: 6px;
    position: relative;
  }

  .timeline-dots::before {
    content: "";
    position: absolute;
    left: 7px;
    right: 7px;
    top: 50%;
    height: 2px;
    transform: translateY(-50%);
    background: rgba(72, 43, 24, 0.12);
  }

  .timeline-dot {
    position: relative;
    z-index: 1;
    width: 12px;
    height: 12px;
    justify-self: center;
    border: 2px solid #d5c6b5;
    border-radius: 50%;
    background: #f4eadc;
    box-shadow: 0 0 0 4px #f4eadc;
  }

  .timeline-dot.done {
    border-color: #7b4b27;
    background: #7b4b27;
  }

  .timeline-dot.active {
    border-color: #b86e2a;
    background: #f4d29e;
    box-shadow: 0 0 0 4px rgba(184, 110, 42, 0.18);
    animation: timelinePulse 1.2s ease-in-out infinite;
  }

  @keyframes timelinePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.18); }
  }'''

new_dots = '''  .timeline-dots {
    display: flex;
    align-items: flex-start;
    gap: 4px;
    position: relative;
  }

  .timeline-dots::before {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    top: 6px;
    height: 2px;
    background: rgba(72, 43, 24, 0.12);
  }

  .timeline-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
  }

  .timeline-dot {
    position: relative;
    z-index: 1;
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    border: 2px solid #d5c6b5;
    border-radius: 50%;
    background: #f4eadc;
    box-shadow: 0 0 0 3px #f4eadc;
    transition: all 200ms;
  }

  .timeline-item.done .timeline-dot {
    border-color: #7b4b27;
    background: #7b4b27;
  }

  .timeline-item.active .timeline-dot {
    border-color: #b86e2a;
    background: #f4d29e;
    box-shadow: 0 0 0 4px rgba(184, 110, 42, 0.18);
    animation: timelinePulse 1.2s ease-in-out infinite;
  }

  .timeline-step-label {
    font-size: 9px;
    color: rgba(54, 40, 32, 0.4);
    text-align: center;
    line-height: 1.2;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .timeline-item.done .timeline-step-label {
    color: rgba(54, 40, 32, 0.7);
  }

  .timeline-item.active .timeline-step-label {
    color: #6b3a1a;
    font-weight: 700;
  }

  @keyframes timelinePulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.18); }
  }'''

if old_dots in css:
    css = css.replace(old_dots, new_dots)
    print("timeline CSS patched")
else:
    print("timeline CSS NOT FOUND")

# 2. Remove max-height from gen-preview .prose-block
old_preview = '''  .gen-preview .prose-block {
    margin-top: 12px;
    max-height: 320px;
    overflow-y: auto;
    font-size: 14px;
    line-height: 1.7;
  }'''
new_preview = '''  .gen-preview .prose-block {
    margin-top: 12px;
    font-size: 14px;
    line-height: 1.7;
  }'''
if old_preview in css:
    css = css.replace(old_preview, new_preview)
    print("preview max-height removed")
else:
    print("preview CSS NOT FOUND")

# 3. Make resume-card more visible
old_resume = '''  .resume-card {
    display: grid;
    gap: 8px;
    margin-top: 16px;
    padding: 16px;
    border: 1px solid rgba(184, 110, 42, 0.24);
    border-radius: 18px;
    background: rgba(184, 110, 42, 0.06);
  }'''
new_resume = '''  .resume-card {
    display: grid;
    gap: 10px;
    margin-top: 20px;
    padding: 20px;
    border: 2px solid rgba(184, 110, 42, 0.36);
    border-radius: 20px;
    background: rgba(184, 110, 42, 0.08);
    box-shadow: 0 8px 32px rgba(184, 110, 42, 0.1);
  }'''
if old_resume in css:
    css = css.replace(old_resume, new_resume)
    print("resume card CSS patched")
else:
    print("resume CSS NOT FOUND")

c.write_text(css, encoding="utf-8")
print("done")
