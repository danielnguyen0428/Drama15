import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# Replace the entire gen-steps block with a compact horizontal timeline
old_steps = '''                  <div className="gen-steps">
                    <Step label="D\u1ef1ng ph\u00f2ng bi\u00ean k\u1ecbch" active={progress >= 4 && progress < 12} done={progress >= 12} />
                    <Step label="D\u1ef1ng t\u1ed5ng quan truy\u1ec7n" active={progress >= 12 && progress < 18} done={progress >= 18} />
                    <Step label="D\u1ef1ng story bible" active={progress >= 18 && progress < 22} done={progress >= 22} />
                    <Step label="Beat sheet / K\u1ebf ho\u1ea1ch ch\u01b0\u01a1ng" active={progress >= 22 && result.chapters.length === 0} done={result.chapters.length > 0} />
                    {Array.from({ length: 10 }, (_, index) => index + 1).map((chapterNumber) => (
                      <Step key={chapterNumber} label={`Ch\u01b0\u01a1ng ${chapterNumber}${result.chapters.find((item) => item.index === chapterNumber)?.title ? ` \u2014 ${result.chapters.find((item) => item.index === chapterNumber)?.title}` : ''}`} active={phase === 'streaming' && result.chapters.length > 0 && !result.chapters.some((item) => item.index === chapterNumber) && (chapterNumber === 1 || result.chapters.some((item) => item.index === chapterNumber - 1))} done={result.chapters.some((item) => item.index === chapterNumber)} />
                    ))}
                  </div>'''

new_steps = '''                  <div className="gen-timeline">
                    <TimelinePhase label="Setup" steps={['Ph\u00f2ng bi\u00ean k\u1ecbch', 'T\u1ed5ng quan', 'Bible', 'Beat sheet']} currentStep={progress < 12 ? 0 : progress < 18 ? 1 : progress < 22 ? 2 : result.chapters.length === 0 ? 3 : 4} />
                    <TimelinePhase label={`Ch\u01b0\u01a1ng (${result.chapters.length}/10)`} steps={Array.from({ length: 10 }, (_, i) => `Ch.${i + 1}`)} currentStep={result.chapters.length > 0 ? result.chapters.length : -1} />
                  </div>'''

if old_steps in text:
    text = text.replace(old_steps, new_steps)
    print("steps replaced")
else:
    print("steps NOT FOUND")

# Replace the Step component with TimelinePhase
old_step_fn = '''function Step({ label, active, done }: { label: string; active: boolean; done: boolean }): JSX.Element {
  return <div className={`gen-step${active ? ' active' : ''}${done ? ' done' : ''}`}><span className="step-dot" /><span className="step-label">{label}</span>{active && !done && <span className="step-active-badge"><span className="step-active-pulse" aria-hidden="true" />\u0110ang th\u1ef1c hi\u1ec7n</span>}</div>;
}'''

new_step_fn = '''function Step({ label, active, done }: { label: string; active: boolean; done: boolean }): JSX.Element {
  return <div className={`gen-step${active ? ' active' : ''}${done ? ' done' : ''}`}><span className="step-dot" /><span className="step-label">{label}</span>{active && !done && <span className="step-active-badge"><span className="step-active-pulse" aria-hidden="true" />\u0110ang th\u1ef1c hi\u1ec7n</span>}</div>;
}

function TimelinePhase({ label, steps, currentStep }: { label: string; steps: string[]; currentStep: number }): JSX.Element {
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

if old_step_fn in text:
    text = text.replace(old_step_fn, new_step_fn)
    print("Step fn replaced")
else:
    print("Step fn NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
