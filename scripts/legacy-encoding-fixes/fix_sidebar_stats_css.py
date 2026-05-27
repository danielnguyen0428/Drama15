import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# 1. Remove hero-progress-row (no longer used)
old_row = """  .hero-progress-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }"""
if old_row in text:
    text = text.replace(old_row, "")
    print("removed hero-progress-row")

# 2. Update hero-stats for sidebar context
old_stats = """  .hero-stats {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 8px;
  }"""
new_stats = """  .hero-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .sidebar-stats {
    padding: 14px 12px;
    border-bottom: 1px solid rgba(255, 245, 228, 0.1);
  }"""
if old_stats in text:
    text = text.replace(old_stats, new_stats)
    print("stats patched")

# 3. Update hero-stats div: equal height, no aspect-ratio (let grid handle)
old_div = """  .hero-stats div {
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    aspect-ratio: 1;
    padding: 8px;
    border: 1px solid rgba(255, 245, 228, 0.14);
    border-radius: 18px;
    background: rgba(28, 24, 20, 0.78);
    backdrop-filter: blur(28px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.28);
    text-align: center;
  }"""
new_div = """  .hero-stats div {
    min-width: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 14px 8px;
    border: 1px solid rgba(255, 245, 228, 0.12);
    border-radius: 16px;
    background: rgba(255, 255, 255, 0.045);
    text-align: center;
  }"""
if old_div in text:
    text = text.replace(old_div, new_div)
    print("stats div patched")

# 4. hero-card: simpler now (just % + label)
old_card = """  .hero-card {
    flex: 0 1 420px;
    padding: 16px 20px;
    border-radius: 22px;
  }"""
new_card = """  .hero-card {
    display: inline-flex;
    align-items: baseline;
    gap: 10px;
    flex-wrap: wrap;
    padding: 16px 22px;
    border-radius: 22px;
  }"""
if old_card in text:
    text = text.replace(old_card, new_card)
    print("hero-card patched")

# 5. hero-card strong: inline with span
old_strong = """  .hero-card > div > strong {
    display: inline;
    margin-left: 10px;
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #f4d29e;
  }"""
new_strong = """  .hero-card > strong {
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #f4d29e;
  }"""
if old_strong in text:
    text = text.replace(old_strong, new_strong)
    print("strong patched")

# 6. hero-card p: inline label
old_p = """  .hero-card p {
    margin: 8px 0 0;
    color: rgba(249, 242, 233, 0.6);
    font-size: 12px;
  }"""
new_p = """  .hero-card p {
    width: 100%;
    margin: 4px 0 0;
    color: rgba(249, 242, 233, 0.6);
    font-size: 12px;
  }"""
if old_p in text:
    text = text.replace(old_p, new_p)
    print("p patched")

p.write_text(text, encoding="utf-8")
print("CSS done")
