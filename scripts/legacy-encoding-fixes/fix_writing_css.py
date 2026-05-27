import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# Add writing indicator styles before the @media queries
media_idx = text.find("@media (prefers-reduced-motion")

css_addition = """
  .writing-indicator {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 28px;
    border: 1px solid rgba(72, 43, 24, 0.14);
    border-radius: 22px;
    background: rgba(96, 53, 28, 0.04);
  }

  .writing-indicator strong {
    display: block;
    color: #3d2010;
    font-size: 16px;
    font-weight: 800;
  }

  .writing-indicator span:last-child {
    display: block;
    margin-top: 4px;
    color: rgba(54, 40, 32, 0.64);
    font-size: 13px;
  }

  .writing-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    padding: 8px 14px;
    border-radius: 999px;
    color: #6b3a1a;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    background: rgba(214, 148, 64, 0.14);
  }

  .writing-spinner {
    display: block;
    width: 28px;
    height: 28px;
    border: 3px solid rgba(72, 43, 24, 0.16);
    border-top-color: #b86e2a;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  .writing-spinner.sm {
    width: 14px;
    height: 14px;
    border-width: 2px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

"""

text = text[:media_idx] + css_addition + text[media_idx:]
p.write_text(text, encoding="utf-8")
print("CSS patched")
