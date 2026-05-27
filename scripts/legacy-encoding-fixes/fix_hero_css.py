import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.css")
text = p.read_text(encoding="utf-8")

# 1. Change hero-band from 2-col to single column
old_hero = """  .hero-band {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: 32px;
    width: min(1440px, calc(100% - 48px));
    margin: 56px auto 42px;
    align-items: end;
  }"""

new_hero = """  .hero-band {
    display: grid;
    grid-template-columns: 1fr;
    gap: 24px;
    width: min(1440px, calc(100% - 48px));
    margin: 56px auto 42px;
  }"""

if old_hero in text:
    text = text.replace(old_hero, new_hero)
    print("hero-band patched")
else:
    print("hero-band NOT FOUND")

# 2. Change support-strip from 2 cols to 3 cols, remove max-width
old_strip = """  .support-strip {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 28px;
    max-width: 760px;
  }"""

new_strip = """  .support-strip {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    margin: 0 0 28px;
  }"""

if old_strip in text:
    text = text.replace(old_strip, new_strip)
    print("support-strip patched")
else:
    print("support-strip NOT FOUND")

# 3. Make hero-card full width (no longer constrained to 320px col)
old_card = """  .hero-card {
    padding: 24px;
    border-radius: 32px;
  }"""

new_card = """  .hero-card {
    padding: 24px;
    border-radius: 32px;
    max-width: 480px;
  }"""

if old_card in text:
    text = text.replace(old_card, new_card)
    print("hero-card patched")
else:
    print("hero-card NOT FOUND")

p.write_text(text, encoding="utf-8")
print("CSS done")
