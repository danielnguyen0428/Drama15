import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# 1. Make hero-progress-row compact, align items center
old = """  .hero-progress-row {
    display: flex;
    align-items: stretch;
    gap: 16px;
    flex-wrap: wrap;
  }"""
new = """  .hero-progress-row {
    display: flex;
    align-items: center;
    gap: 14px;
  }"""
if old in text:
    text = text.replace(old, new)
    print("row patched")

# 2. Shrink hero-card: less padding, smaller font, progress inline with %
old_card = """  .hero-card {
    flex: 1 1 280px;
    padding: 24px;
    border-radius: 32px;
  }"""
new_card = """  .hero-card {
    flex: 0 1 420px;
    padding: 16px 20px;
    border-radius: 22px;
  }"""
if old_card in text:
    text = text.replace(old_card, new_card)
    print("card patched")

# 3. Shrink the big % number
old_strong = """  .hero-card > div > strong {
    display: block;
    margin-top: 8px;
    font-size: 48px;
    line-height: 1;
    letter-spacing: -0.06em;
    color: #f4d29e;
  }"""
new_strong = """  .hero-card > div > strong {
    display: inline;
    margin-left: 10px;
    font-size: 28px;
    line-height: 1;
    letter-spacing: -0.04em;
    color: #f4d29e;
  }"""
if old_strong in text:
    text = text.replace(old_strong, new_strong)
    print("strong patched")

# 4. Progress bar less margin
old_track = """  .progress-track {
    display: block;
    width: 100%;
    height: 8px;
    margin-top: 18px;"""
new_track = """  .progress-track {
    display: block;
    width: 100%;
    height: 6px;
    margin-top: 10px;"""
if old_track in text:
    text = text.replace(old_track, new_track)
    print("track patched")

# 5. hero-card p smaller margin
old_p = """  .hero-card p {
    margin: 16px 0 0;
    color: rgba(249, 242, 233, 0.72);
  }"""
new_p = """  .hero-card p {
    margin: 8px 0 0;
    color: rgba(249, 242, 233, 0.6);
    font-size: 12px;
  }"""
if old_p in text:
    text = text.replace(old_p, new_p)
    print("p patched")

# 6. Hero-stats: square boxes, smaller
old_stats = """  .hero-stats {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, minmax(72px, 1fr));
    gap: 8px;
    align-content: stretch;
  }"""
new_stats = """  .hero-stats {
    flex: 0 0 auto;
    display: grid;
    grid-template-columns: repeat(3, 72px);
    gap: 8px;
  }"""
if old_stats in text:
    text = text.replace(old_stats, new_stats)
    print("stats grid patched")

# 7. Stats div: square aspect ratio
old_div = """  .hero-stats div {
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
new_div = """  .hero-stats div {
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
if old_div in text:
    text = text.replace(old_div, new_div)
    print("stats div patched")

p.write_text(text, encoding="utf-8")
print("done")
