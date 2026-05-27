import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# 1. Replace hero-card max-width and add strong rule for progress %
old_card = """  .hero-card {
    padding: 24px;
    border-radius: 32px;
    max-width: 480px;
  }

  .hero-card span,
  .panel-heading span {
    color: rgba(249, 242, 233, 0.58);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .hero-card > .progress-summary > div:first-child > strong {
    display: block;
    margin-top: 8px;
    font-size: 48px;
    line-height: 1;
    letter-spacing: -0.06em;
  }

  .hero-card p {
    margin: 16px 0 0;
    color: rgba(249, 242, 233, 0.72);
  }"""

new_card = """  .hero-progress-row {
    display: flex;
    align-items: stretch;
    gap: 16px;
    flex-wrap: wrap;
  }

  .hero-card {
    flex: 1 1 280px;
    padding: 24px;
    border-radius: 32px;
  }

  .hero-card span,
  .panel-heading span {
    color: rgba(249, 242, 233, 0.58);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .hero-card > div > strong {
    display: block;
    margin-top: 8px;
    font-size: 48px;
    line-height: 1;
    letter-spacing: -0.06em;
    color: #f4d29e;
  }

  .hero-card p {
    margin: 16px 0 0;
    color: rgba(249, 242, 233, 0.72);
  }

  .hero-stats {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    gap: 8px;
    align-content: stretch;
  }"""

if old_card in text:
    text = text.replace(old_card, new_card)
    print("hero-card + row patched")
else:
    print("hero-card NOT FOUND")

# 2. Remove old .hero-stats block (now moved above)
old_stats = """  .hero-stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(56px, 1fr));
    gap: 8px;
  }"""

if old_stats in text:
    text = text.replace(old_stats, "")
    print("old hero-stats removed")
else:
    print("old hero-stats not found (ok)")

# 3. Fix hero-stats div to be taller to match hero-card height
old_stats_div = """  .hero-stats div {
    min-width: 0;
    overflow: hidden;
    padding: 10px 8px;
    border: 1px solid rgba(255, 245, 228, 0.12);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.045);
    text-align: center;
  }"""

new_stats_div = """  .hero-stats div {
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px 8px;
    border: 1px solid rgba(255, 245, 228, 0.12);
    border-radius: 20px;
    background: rgba(28, 24, 20, 0.78);
    border: 1px solid rgba(255, 245, 228, 0.14);
    backdrop-filter: blur(28px);
    box-shadow: 0 24px 90px rgba(0, 0, 0, 0.34);
    text-align: center;
  }"""

if old_stats_div in text:
    text = text.replace(old_stats_div, new_stats_div)
    print("hero-stats div patched")
else:
    print("hero-stats div NOT FOUND")

p.write_text(text, encoding="utf-8")
print("CSS done")
