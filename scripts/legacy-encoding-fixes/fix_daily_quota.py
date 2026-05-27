import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Add daily quota helpers after removeDraft function
quota_code = '''
const DAILY_QUOTA_KEY = "drama15_daily_quota";
const MAX_STORIES_PER_DAY = 2;

interface DailyQuota {
  date: string;
  count: number;
}

function getDailyQuota(): DailyQuota {
  try {
    const raw = localStorage.getItem(DAILY_QUOTA_KEY);
    if (!raw) return { date: todayStr(), count: 0 };
    const q = JSON.parse(raw) as DailyQuota;
    if (q.date !== todayStr()) return { date: todayStr(), count: 0 };
    return q;
  } catch {
    return { date: todayStr(), count: 0 };
  }
}

function incrementDailyQuota(): void {
  const q = getDailyQuota();
  q.count += 1;
  q.date = todayStr();
  try { localStorage.setItem(DAILY_QUOTA_KEY, JSON.stringify(q)); } catch {}
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function canCreateStory(): { allowed: boolean; remaining: number } {
  const q = getDailyQuota();
  const remaining = Math.max(0, MAX_STORIES_PER_DAY - q.count);
  return { allowed: remaining > 0, remaining };
}
'''

# Insert after removeDraft function
anchor = "function wordCount(text: string): number {"
idx = text.find(anchor)
if idx != -1:
    text = text[:idx] + quota_code + "\n" + text[idx:]
    print("quota helpers added")
else:
    print("anchor NOT FOUND")

# 2. Add quota check in handleCreate (after activeDraft check)
old_guard = '''    if (activeDraft && activeDraft.storyId !== storyId) {
      setError(`B\u1ea1n \u0111ang c\u00f3 b\u1ed9 truy\u1ec7n ch\u01b0a ho\u00e0n th\u00e0nh: "${activeDraft.title}". Ho\u00e0n th\u00e0nh ho\u1eb7c x\u00f3a n\u00f3 tr\u01b0\u1edbc.`);
      return;
    }'''
new_guard = '''    if (activeDraft && activeDraft.storyId !== storyId) {
      setError(`B\u1ea1n \u0111ang c\u00f3 b\u1ed9 truy\u1ec7n ch\u01b0a ho\u00e0n th\u00e0nh: "${activeDraft.title}". Ho\u00e0n th\u00e0nh ho\u1eb7c x\u00f3a n\u00f3 tr\u01b0\u1edbc.`);
      return;
    }
    const quota = canCreateStory();
    if (!quota.allowed) {
      setError(`\u0110\u00e3 \u0111\u1ea1t gi\u1edbi h\u1ea1n ${MAX_STORIES_PER_DAY} b\u1ed9/ng\u00e0y. Quay l\u1ea1i v\u00e0o ng\u00e0y mai ho\u1eb7c n\u00e2ng c\u1ea5p t\u00e0i kho\u1ea3n.`);
      return;
    }'''
if old_guard in text:
    text = text.replace(old_guard, new_guard)
    print("quota guard added")
else:
    print("guard NOT FOUND")

# 3. Call incrementDailyQuota after successful story creation (after setStoryId)
old_set_story = "      setStoryId(nextStoryId);\n      setStoryTitle(data.title ?? config.title ?? 'B\u1ea3n th\u1ea3o m\u1edbi');\n      startStream(nextStoryId);"
new_set_story = "      setStoryId(nextStoryId);\n      setStoryTitle(data.title ?? config.title ?? 'B\u1ea3n th\u1ea3o m\u1edbi');\n      incrementDailyQuota();\n      startStream(nextStoryId);"
if old_set_story in text:
    text = text.replace(old_set_story, new_set_story)
    print("incrementDailyQuota added")
else:
    print("setStoryId block NOT FOUND")

p.write_text(text, encoding="utf-8")
print("done")
