import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# Insert modern compact timeline CSS before old gen-steps styles
anchor = "  .gen-steps {"
idx = text.find(anchor)
css = """
  .gen-timeline {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid rgba(72, 43, 24, 0.1);
    border-radius: 18px;
    background: rgba(96, 53, 28, 0.035);
  }

  .timeline-phase {
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: 12px;
  }

  .timeline-phase-label {
    color: #7e5134;
    font-size: 11px;
    font-weight: 850;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .timeline-dots {
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
  }

"""
if idx != -1:
    text = text[:idx] + css + text[idx:]
    print("timeline css added")
else:
    print("anchor not found")

p.write_text(text, encoding="utf-8")
print("done")
