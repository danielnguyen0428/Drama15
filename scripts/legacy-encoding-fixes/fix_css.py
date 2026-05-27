import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# Enhance support card layout for icons
text = text.replace(
"""  .support-card {
    display: grid;
    gap: 8px;""",
"""  .support-card {
    display: grid;
    grid-template-columns: 42px minmax(0, 1fr);
    gap: 8px 12px;"""
)

text = text.replace(
"""  .support-card strong {
    color: #f4d29e;
    font-size: 18px;
    letter-spacing: -0.03em;
  }

  .support-card span {
    color: rgba(249, 242, 233, 0.68);
    font-size: 14px;
    line-height: 1.45;
  }""",
"""  .support-icon {
    grid-row: span 2;
    width: 42px;
    height: 42px;
    box-sizing: border-box;
    border: 1px solid rgba(244, 210, 158, 0.28);
    border-radius: 16px;
    padding: 9px;
    color: #f4d29e;
    background: rgba(244, 210, 158, 0.1);
  }

  .support-card strong {
    min-width: 0;
    color: #f4d29e;
    font-size: 18px;
    letter-spacing: -0.03em;
  }

  .support-card span {
    grid-column: 2;
    min-width: 0;
    color: rgba(249, 242, 233, 0.68);
    font-size: 14px;
    line-height: 1.45;
  }"""
)

# Fix hero stats overflow: override broader .hero-card strong rule
text = text.replace(
"""  .hero-stats div {
    padding: 10px 8px;""",
"""  .hero-stats div {
    min-width: 0;
    overflow: hidden;
    padding: 10px 8px;"""
)

text = text.replace(
"""  .hero-stats strong {
    color: #f4d29e;
    font-size: 18px;
    line-height: 1;
  }

  .hero-stats span {
    margin-top: 4px;
    color: rgba(249, 242, 233, 0.5);
    font-size: 11px;
  }""",
"""  .hero-stats strong {
    margin-top: 0;
    overflow: hidden;
    color: #f4d29e;
    font-size: 16px;
    line-height: 1;
    letter-spacing: -0.02em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hero-stats span {
    margin-top: 4px;
    overflow: hidden;
    color: rgba(249, 242, 233, 0.5);
    font-size: 10px;
    letter-spacing: 0.08em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }"""
)

# Make broader hero-card strong not affect descendants too aggressively
text = text.replace(
"""  .hero-card strong {
    display: block;
    margin-top: 8px;
    font-size: 48px;
    line-height: 1;
    letter-spacing: -0.06em;
  }""",
"""  .hero-card > .progress-summary > div:first-child > strong {
    display: block;
    margin-top: 8px;
    font-size: 48px;
    line-height: 1;
    letter-spacing: -0.06em;
  }"""
)

# Mobile support icons alignment
text = text.replace(
"""    .action-row,
    .support-strip,
    .settings-grid,
    .studio-stats {
      grid-template-columns: 1fr;
    }""",
"""    .action-row,
    .support-strip,
    .settings-grid,
    .studio-stats {
      grid-template-columns: 1fr;
    }

    .support-card {
      grid-template-columns: 40px minmax(0, 1fr);
    }""")

p.write_text(text, encoding="utf-8")
print("CSS patched")
