import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# We need to:
# 1. Add localStorage draft persistence helpers
# 2. Change suggest flow: show result in manuscript panel
# 3. Change right panel from rewrite to history
# 4. Add step-by-step progress in manuscript during streaming

# Lets find key sections and rebuild
# First, add draft persistence types and helpers after the existing helpers

# Find position after readAccountProfile function
insert_after = text.find("const DEFAULT_CONFIG")

draft_helpers = '''// --- Draft persistence (localStorage) ---
interface DraftEntry {
  storyId: string;
  title: string;
  seed: string;
  niche: string;
  createdAt: string;
  updatedAt: string;
  phase: Phase;
  result: StoryResult;
  config: StoryConfig;
}

const DRAFTS_KEY = "drama15_drafts";

function loadDrafts(): DraftEntry[] {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DraftEntry[];
  } catch {
    return [];
  }
}

function saveDraft(draft: DraftEntry): void {
  try {
    const drafts = loadDrafts().filter((d) => d.storyId !== draft.storyId);
    drafts.unshift(draft);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts.slice(0, 30)));
  } catch {
    // quota exceeded or restricted
  }
}

function removeDraft(storyId: string): void {
  try {
    const drafts = loadDrafts().filter((d) => d.storyId !== storyId);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {}
}

'''

text = text[:insert_after] + draft_helpers + text[insert_after:]
print("Added draft helpers")

# Now add drafts state + auto-save effect
# Find after streamRef line
stream_ref_end = text.find("const streamRef = useRef<EventSource | null>(null);") + len("const streamRef = useRef<EventSource | null>(null);")

# Find the useEffect for account sync
account_effect = text.find("useEffect(() => {\n    const syncProfile")

# Add drafts state before account effect
drafts_state = '''\n  const [drafts, setDrafts] = useState<DraftEntry[]>(loadDrafts);
  const [suggestResult, setSuggestResult] = useState<{title: string; seed: string} | null>(null);
'''

text = text[:account_effect] + drafts_state + text[account_effect:]
print("Added drafts state")

# Add auto-save effect after the account sync useEffect
# Find end of account sync useEffect
account_effect_end = text.find("return () => window.removeEventListener('storage', syncProfile);\n  }, []);")
account_effect_end = text.find("];", account_effect_end) + 2

auto_save_effect = '''\n
  // Auto-save draft to localStorage
  useEffect(() => {
    if (!storyId) return;
    const draft: DraftEntry = {
      storyId,
      title: storyTitle || config.title || 'B\u1ea3n th\u1ea3o m\u1edbi',
      seed: config.seed,
      niche: config.niche,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      phase,
      result,
      config,
    };
    saveDraft(draft);
    setDrafts(loadDrafts());
  }, [storyId, phase, result.chapters.length]);
'''

text = text[:account_effect_end] + auto_save_effect + text[account_effect_end:]
print("Added auto-save effect")

p.write_text(text, encoding="utf-8")
print("Step 1 done - helpers and state")
