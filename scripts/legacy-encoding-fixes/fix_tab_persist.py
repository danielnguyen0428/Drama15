import pathlib, sys
sys.stdout.reconfigure(encoding="utf-8")
p = pathlib.Path(r"D:\CODEEEEE\ZZZ\apps\web\src\story\StoryWorkspace.tsx")
text = p.read_text(encoding="utf-8")

old_overview = '''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'overview' && (
                <div className="gen-preview">
                  {previewContent?.stage === 'overview' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng tổng quan…</strong><span>Nội dung sẽ xuất hiện khi AI hoàn thành bước này.</span></div>
                  )}
                </div>
              )}'''
new_overview = '''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'overview' && (
                <div className="gen-preview">
                  {result.concept ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(result.concept) }} />
                  ) : previewContent?.stage === 'overview' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatConceptHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng tổng quan…</strong><span>Nội dung sẽ xuất hiện khi AI hoàn thành bước này.</span></div>
                  )}
                </div>
              )}'''
if old_overview in text:
    text = text.replace(old_overview, new_overview)
    print("overview tab persistence patched")
else:
    print("overview block not found")

old_plan = '''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'summary' && (
                <div className="gen-preview">
                  {previewContent?.stage === 'plan' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng kế hoạch…</strong><span>Beat sheet sẽ xuất hiện sau khi AI hoàn thành tổng quan.</span></div>
                  )}
                </div>
              )}'''
new_plan = '''              {(phase === 'creating' || phase === 'streaming') && chapterTab === 'summary' && (
                <div className="gen-preview">
                  {result.plan ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(result.plan) }} />
                  ) : previewContent?.stage === 'plan' ? (
                    <div className="prose-block" dangerouslySetInnerHTML={{ __html: formatPlanHtml(previewContent.text) }} />
                  ) : (
                    <div className="empty-state"><strong>Đang dựng kế hoạch…</strong><span>Beat sheet sẽ xuất hiện sau khi AI hoàn thành tổng quan.</span></div>
                  )}
                </div>
              )}'''
if old_plan in text:
    text = text.replace(old_plan, new_plan)
    print("plan tab persistence patched")
else:
    print("plan block not found")

p.write_text(text, encoding="utf-8")
print("done")
