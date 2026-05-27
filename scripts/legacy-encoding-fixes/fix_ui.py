import pathlib, sys, re
sys.stdout.reconfigure(encoding="utf-8")

p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

# 1. Fix account profile: change useState to use useEffect for reactivity
# Add useEffect import
text = text.replace(
    "import { useMemo, useRef, useState } from 'react';",
    "import { useEffect, useMemo, useRef, useState } from 'react';"
)

# Replace static useState with reactive state
text = text.replace(
    "const [accountProfile] = useState<AccountProfile>(readAccountProfile);",
    "const [accountProfile, setAccountProfile] = useState<AccountProfile>(readAccountProfile);"
)

# Add useEffect after streamRef line to listen for storage changes
old_stream_ref = "const streamRef = useRef<EventSource | null>(null);"
new_stream_ref = old_stream_ref + """\n
  useEffect(() => {
    const syncProfile = (): void => {
      setAccountProfile(readAccountProfile());
    };
    window.addEventListener('storage', syncProfile);
    // Also re-read on mount in case OAuth just completed
    syncProfile();
    return () => window.removeEventListener('storage', syncProfile);
  }, []);"""
text = text.replace(old_stream_ref, new_stream_ref)

# 2. Add SVG icons to support cards
DONATE_ICON = '<svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>'
TELEGRAM_ICON = '<svg className="support-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 2L11 13"/><path d="M22 2L15 22L11 13L2 9L22 2Z"/></svg>'

text = text.replace(
    '<strong>C\u00fang d\u01b0\u1eddng</strong>',
    DONATE_ICON + '\n              <strong>C\u00fang d\u01b0\u1eddng</strong>'
)
text = text.replace(
    '<strong>Tham gia Nh\u00f3m Chat</strong>',
    TELEGRAM_ICON + '\n              <strong>Tham gia Nh\u00f3m Chat</strong>'
)

p.write_text(text, encoding="utf-8")
print("TSX patched")
