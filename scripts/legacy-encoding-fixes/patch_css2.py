import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# Replace director-panel CSS with history-panel CSS
text = text.replace('.director-panel {', '.history-panel {')
text = text.replace('aria-label="Tr\u1ee3 l\u00fd bi\u00ean t\u1eadp"', '')

# Add new CSS before @media queries
media_idx = text.find('@media (prefers-reduced-motion')

new_css = """
  /* --- Suggest result --- */
  .suggest-result {
    padding: 8px 0 24px;
  }

  .seed-block {
    margin: 20px 0 28px;
    padding: 18px;
    border: 1px solid rgba(72, 43, 24, 0.18);
    border-radius: 18px;
    background: rgba(96, 53, 28, 0.06);
  }

  .seed-label {
    display: block;
    margin-bottom: 8px;
    color: #7e5134;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .seed-block p {
    margin: 0;
    color: #3d2010;
    font-size: 14px;
    line-height: 1.65;
    white-space: pre-wrap;
  }

  .start-cta {
    width: 100%;
    font-size: 16px;
    padding: 16px 24px;
  }

  /* --- Generation progress --- */
  .gen-progress {
    padding: 8px 0;
  }

  .gen-progress-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
  }

  .gen-progress-header strong {
    color: #3d2010;
    font-size: 16px;
    font-weight: 800;
  }

  .gen-steps {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding-left: 8px;
    border-left: 2px solid rgba(72, 43, 24, 0.14);
    margin-left: 12px;
  }

  .gen-step {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0 8px 16px;
    color: rgba(54, 40, 32, 0.4);
    font-size: 13px;
    transition: color 200ms;
  }

  .gen-step.active {
    color: #6b3a1a;
    font-weight: 700;
  }

  .gen-step.done {
    color: rgba(54, 40, 32, 0.72);
  }

  .step-dot {
    flex: 0 0 auto;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(72, 43, 24, 0.2);
    margin-left: -20px;
    transition: background 200ms;
  }

  .gen-step.active .step-dot {
    background: #b86e2a;
    box-shadow: 0 0 0 3px rgba(184, 110, 42, 0.22);
  }

  .gen-step.done .step-dot {
    background: #6b3a1a;
  }

  .gen-label {
    margin: 18px 0 0;
    color: rgba(54, 40, 32, 0.6);
    font-size: 12px;
    font-style: italic;
  }

  /* --- History panel --- */
  .history-panel {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .history-empty {
    display: grid;
    gap: 6px;
    padding: 20px;
    color: rgba(249, 242, 233, 0.48);
    font-size: 13px;
  }

  .history-empty small {
    color: rgba(249, 242, 233, 0.3);
    font-size: 11px;
    line-height: 1.5;
  }

  .history-list {
    list-style: none;
    margin: 0;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 320px;
    overflow-y: auto;
  }

  .history-item {
    display: flex;
    align-items: stretch;
    gap: 4px;
    border-radius: 14px;
    background: transparent;
    transition: background 160ms;
  }

  .history-item.active {
    background: rgba(244, 210, 158, 0.1);
  }

  .history-item-btn {
    flex: 1;
    display: grid;
    gap: 3px;
    padding: 10px 12px;
    border: 0;
    border-radius: 14px;
    text-align: left;
    background: transparent;
    cursor: pointer;
    transition: background 160ms;
  }

  .history-item-btn:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .history-title {
    display: block;
    overflow: hidden;
    color: #f4d29e;
    font-size: 13px;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .history-meta {
    display: block;
    color: rgba(249, 242, 233, 0.42);
    font-size: 11px;
  }

  .history-delete {
    flex: 0 0 auto;
    width: 28px;
    align-self: center;
    border: 0;
    border-radius: 8px;
    color: rgba(249, 242, 233, 0.3);
    background: transparent;
    cursor: pointer;
    font-size: 16px;
    transition: color 160ms, background 160ms;
  }

  .history-delete:hover {
    color: #ffd8cf;
    background: rgba(160, 34, 18, 0.22);
  }

  .panel-divider {
    height: 1px;
    margin: 8px 16px;
    background: rgba(255, 245, 228, 0.1);
  }

"""

text = text[:media_idx] + new_css + text[media_idx:]
p.write_text(text, encoding="utf-8")
print("CSS patched")
