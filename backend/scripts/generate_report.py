"""
Test Report Generator
=====================
Reads the most recent dda_*.json, rag_*.json, and e2e_*.json from
backend/test_reports/
and generates a single HTML report with formatted tables.

Usage:
    cd escape-the-core/backend
    python scripts/generate_report.py

Output:
    backend/test_reports/report_<YYYYMMDD_HHMMSS>.html
"""

import json
import datetime
import sys
from pathlib import Path
from reporting import default_results_dir, result_status

RESULTS_DIR = default_results_dir()

# ── Find the latest report files ─────────────────────────────────────────────

def latest(prefix):
    files = sorted(RESULTS_DIR.glob(f"{prefix}_*.json"), reverse=True)
    if not files:
        print(f"  ✗  No {prefix}_*.json found in {RESULTS_DIR}")
        return None
    return files[0]

dda_file = latest("dda")
rag_file = latest("rag")
e2e_file = latest("e2e")

if not dda_file and not rag_file and not e2e_file:
    print("No test result files found.")
    print("Run test_dda.py and test_rag.py first.")
    sys.exit(1)

dda_data = json.loads(dda_file.read_text(encoding="utf-8")) if dda_file else None
rag_data = json.loads(rag_file.read_text(encoding="utf-8")) if rag_file else None
e2e_data = json.loads(e2e_file.read_text(encoding="utf-8")) if e2e_file else None

print(f"  DDA report : {dda_file.name if dda_file else 'not found'}")
print(f"  RAG report : {rag_file.name if rag_file else 'not found'}")
print(f"  E2E report : {e2e_file.name if e2e_file else 'not found'}")

# ── HTML helpers ──────────────────────────────────────────────────────────────

def badge(status):
    normalized = str(status).upper()
    css = {"PASS": "pass", "FAIL": "fail", "SKIP": "skip", "ERROR": "error"}.get(
        normalized, "fail"
    )
    return f'<span class="badge {css}">{normalized}</span>'

def fmt_metrics(m):
    if not m:
        return ""
    parts = []
    for k, v in m.items():
        if v is None or v == [] or v == {}:
            continue
        if isinstance(v, float):
            parts.append(f"<code>{k}={v:.4f}</code>")
        elif isinstance(v, list) and len(v) == 0:
            continue
        else:
            parts.append(f"<code>{k}={v}</code>")
    return " &nbsp; ".join(parts)

def section_table(results, title):
    rows = ""
    for r in results:
        m_html = fmt_metrics(r.get("metrics") or {})
        detail = r.get("detail") or r.get("got") or ""
        rows += f"""
        <tr>
          <td>{badge(result_status(r))}</td>
          <td class="label">{r['label']}</td>
          <td class="metrics">{m_html}</td>
          <td class="detail">{detail if result_status(r) != 'PASS' else ''}</td>
        </tr>"""
    return f"""
    <div class="section-block">
      <h3>{title}</h3>
      <table>
        <thead>
          <tr>
            <th style="width:70px">Result</th>
            <th>Test</th>
            <th>Metrics</th>
            <th>Failure detail</th>
          </tr>
        </thead>
        <tbody>{rows}
        </tbody>
      </table>
    </div>"""

def suite_summary(data):
    p = data["passed"]
    f = data["failed"]
    t = data["total"]
    pct = round(p / t * 100) if t else 0
    color = "#00c47a" if f == 0 else "#e53e3e"
    return f"""
    <div class="summary-card" style="border-left:4px solid {color}">
      <div class="suite-name">{data['suite']}</div>
      <div class="suite-ts">Run at: {data['timestamp']}</div>
      <div class="suite-stats">
        <span class="big-num" style="color:{color}">{p}/{t}</span>
        <span class="pct">({pct}%)</span>
        {'<span class="all-pass">✓ All passed</span>' if f == 0
         else f'<span class="some-fail">✗ {f} failed</span>'}
      </div>
    </div>"""

def dist_stats_table(stats):
    if not stats:
        return ""
    rows = ""
    for combo, vals in stats.get("by_combination", {}).items():
        d = vals["top_dist"]
        s = vals["sim_pct"]
        bar_w = max(0, min(100, int(s)))
        rows += f"""
        <tr>
          <td><code>{combo}</code></td>
          <td style="text-align:right"><code>{d:.4f}</code></td>
          <td style="text-align:right"><code>{s:.1f}%</code></td>
          <td>
            <div class="bar-bg">
              <div class="bar-fill" style="width:{bar_w}%"></div>
            </div>
          </td>
        </tr>"""
    a = stats.get("avg_dist", 0)
    return f"""
    <div class="section-block">
      <h3>RAG Distance Statistics</h3>
      <p class="dist-note">
        Distance is cosine distance between query and chunk vectors.
        0.00 = identical &nbsp;|&nbsp; 1.00 = unrelated.
        Similarity = (1 − dist) × 100%.
      </p>
      <div class="dist-summary">
        <span>Avg top-chunk distance: <b>{a:.4f}</b>
          &nbsp;(sim {stats.get('avg_sim_pct', 0):.1f}%)</span>
        &nbsp;&nbsp;
        <span>Best: <b>{stats.get('min_dist', 0):.4f}</b>
          &nbsp;({stats.get('min_sim_pct', 0):.1f}%)</span>
        &nbsp;&nbsp;
        <span>Worst: <b>{stats.get('max_dist', 0):.4f}</b>
          &nbsp;({stats.get('max_sim_pct', 0):.1f}%)</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Room / DDA state</th>
            <th style="text-align:right">Top dist</th>
            <th style="text-align:right">Similarity</th>
            <th style="min-width:160px">Visual</th>
          </tr>
        </thead>
        <tbody>{rows}
        </tbody>
      </table>
    </div>"""

# ── Assemble by section ───────────────────────────────────────────────────────

def group_by_section(results):
    sections = {}
    for r in results:
        s = r.get("section", "Other")
        sections.setdefault(s, []).append(r)
    return sections

def requirements_table(requirements):
    if not requirements:
        return ""
    rows = ""
    for requirement, outcome in requirements.items():
        if isinstance(outcome, bool):
            status = "PASS" if outcome else "FAIL"
        else:
            status = str(outcome).upper()
        rows += f"<tr><td>{badge(status)}</td><td class='label'>{requirement}</td></tr>"
    return f"""
    <div class="section-block">
      <h3>Requirement Coverage</h3>
      <table><thead><tr><th style="width:70px">Result</th><th>Requirement</th></tr></thead>
      <tbody>{rows}</tbody></table>
    </div>"""

# ── Build full HTML ───────────────────────────────────────────────────────────

ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
ts_display = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

summaries_html = ""
body_html = ""

if dda_data:
    summaries_html += suite_summary(dda_data)
    body_html += '<h2 class="suite-title">DDA State Machine Tests</h2>'
    body_html += requirements_table(dda_data.get("requirements"))
    for sec, items in group_by_section(dda_data["results"]).items():
        body_html += section_table(items, sec)

if rag_data:
    summaries_html += suite_summary(rag_data)
    body_html += '<h2 class="suite-title">RAG Dual-Track Retrieval Tests</h2>'
    body_html += requirements_table(rag_data.get("requirements"))
    dist_html = dist_stats_table(rag_data.get("distance_statistics") or {})
    if dist_html:
        body_html += dist_html
    for sec, items in group_by_section(rag_data["results"]).items():
        body_html += section_table(items, sec)

if e2e_data:
    summaries_html += suite_summary(e2e_data)
    body_html += '<h2 class="suite-title">End-to-End Integration Tests</h2>'
    body_html += requirements_table(e2e_data.get("requirements"))
    for sec, items in group_by_section(e2e_data["results"]).items():
        body_html += section_table(items, sec)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Escape the Core — Test Report</title>
<style>
  *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    font-size: 13px; color: #1a202c; background: #f7fafc;
    padding: 32px 40px;
  }}
  h1 {{ font-size: 22px; font-weight: 700; color: #1a2b4a; margin-bottom: 4px; }}
  .run-time {{ color: #718096; font-size: 12px; margin-bottom: 28px; }}
  .summary-row {{ display: flex; gap: 20px; margin-bottom: 36px; flex-wrap: wrap; }}
  .summary-card {{
    background: #fff; border-radius: 8px; padding: 16px 22px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.08); min-width: 240px;
  }}
  .suite-name {{ font-weight: 700; font-size: 14px; color: #2d3748; }}
  .suite-ts {{ font-size: 11px; color: #a0aec0; margin-top: 2px; margin-bottom: 8px; }}
  .suite-stats {{ display: flex; align-items: baseline; gap: 10px; }}
  .big-num {{ font-size: 26px; font-weight: 800; line-height: 1; }}
  .pct {{ font-size: 13px; color: #718096; }}
  .all-pass {{ color: #00c47a; font-size: 12px; font-weight: 600; }}
  .some-fail {{ color: #e53e3e; font-size: 12px; font-weight: 600; }}
  h2.suite-title {{
    font-size: 17px; font-weight: 700; color: #1a2b4a;
    margin: 36px 0 16px; padding-bottom: 6px;
    border-bottom: 2px solid #2e4d7b;
  }}
  .section-block {{
    background: #fff; border-radius: 8px; margin-bottom: 20px;
    box-shadow: 0 1px 4px rgba(0,0,0,0.06); overflow: hidden;
  }}
  .section-block h3 {{
    font-size: 13px; font-weight: 600; color: #4a5568;
    padding: 10px 16px; background: #edf2f7;
    border-bottom: 1px solid #e2e8f0;
  }}
  table {{ width: 100%; border-collapse: collapse; }}
  thead tr {{ background: #f0f4f8; }}
  th {{
    text-align: left; padding: 8px 12px;
    font-size: 11px; font-weight: 700; color: #718096;
    text-transform: uppercase; letter-spacing: 0.05em;
    border-bottom: 1px solid #e2e8f0;
  }}
  td {{
    padding: 7px 12px; border-bottom: 1px solid #f0f4f8;
    vertical-align: top;
  }}
  tr:last-child td {{ border-bottom: none; }}
  tr:hover td {{ background: #f7fafc; }}
  .label {{ font-size: 12px; color: #2d3748; }}
  .metrics {{ font-size: 11px; color: #4a5568; }}
  .detail {{ font-size: 11px; color: #e53e3e; font-style: italic; }}
  .badge {{
    display: inline-block; padding: 2px 8px; border-radius: 12px;
    font-size: 10px; font-weight: 700; letter-spacing: 0.05em;
  }}
  .pass {{ background: #c6f6d5; color: #22543d; }}
  .fail {{ background: #fed7d7; color: #742a2a; }}
  .skip {{ background: #fefcbf; color: #744210; }}
  .error {{ background: #e9d8fd; color: #44337a; }}
  code {{
    font-family: "SF Mono", "Fira Code", monospace;
    font-size: 10.5px; background: #edf2f7;
    padding: 1px 4px; border-radius: 3px; color: #2b6cb0;
  }}
  .dist-note {{ font-size: 11px; color: #718096; padding: 8px 16px 0; }}
  .dist-summary {{
    font-size: 12px; color: #4a5568; padding: 8px 16px 12px;
  }}
  .bar-bg {{
    background: #e2e8f0; border-radius: 4px; height: 8px;
    width: 160px; overflow: hidden;
  }}
  .bar-fill {{
    background: linear-gradient(90deg, #2e4d7b, #00a3e0);
    height: 100%; border-radius: 4px;
  }}
</style>
</head>
<body>
  <h1>Escape the Core — Test Report</h1>
  <div class="run-time">Generated: {ts_display}</div>

  <div class="summary-row">
    {summaries_html}
  </div>

  {body_html}
</body>
</html>
"""

out_file = RESULTS_DIR / f"report_{ts}.html"
RESULTS_DIR.mkdir(exist_ok=True)
out_file.write_text(html, encoding="utf-8")

print(f"\n  OK Report generated: {out_file}")
print(f"     Open in your browser to view the table.")
