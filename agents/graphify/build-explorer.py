#!/usr/bin/env python3
"""
Single-page interactive module explorer.

For each module in a package, embeds its 1-hop neighborhood diagram
into one HTML file. Click any module in a diagram (or in the
left-side list) to navigate to its neighborhood — all in the same
page, no separate files to juggle.

Output:
  agents/graphify/<package>-module-level/MODULE_EXPLORER.html

Usage:
  agents/graphify/build-explorer.py backend
  agents/graphify/build-explorer.py backend --include-infra
"""
from __future__ import annotations

import argparse
import html
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_ENTRY_EXCLUDES = ('_root', 'eval-harness', 'scripts')
DEFAULT_INFRA = ('database', 'common', 'config')
HUB_THRESHOLD = 5


def safe(mid: str) -> str:
    """ID-safe form of a module id (Mermaid + DOM ids don't like
    dashes or slashes)."""
    return mid.replace('-', '_').replace('/', '_')


def neighborhood_mermaid(focus: str, modules_by_id: dict[str, dict], drop: set[str]) -> str:
    """Build the mermaid block for one focus module. Click handlers
    on neighbor nodes call selectModule(<id>) so navigation works
    in-page."""
    m = modules_by_id[focus]
    deps_out = sorted(
        d for d in m.get('internalDepsOut', [])
        if d in modules_by_id and d not in drop
    )
    deps_in = sorted(
        d for d in m.get('internalDepsIn', [])
        if d in modules_by_id and d not in drop
    )

    lines: list[str] = ['flowchart LR']
    lines.append(f'  {safe(focus)}["{focus}"]')
    for d in deps_in:
        lines.append(f'  {safe(d)}["{d}"]')
    for d in deps_out:
        lines.append(f'  {safe(d)}["{d}"]')
    lines.append('')
    for d in deps_in:
        lines.append(f'  {safe(d)} --> {safe(focus)}')
    for d in deps_out:
        lines.append(f'  {safe(focus)} --> {safe(d)}')
    lines.append('')
    lines.append('  classDef focus fill:#dbeafe,stroke:#2563eb,stroke-width:3px,font-weight:bold;')
    lines.append('  classDef upstream fill:#fef3c7,stroke:#f59e0b;')
    lines.append('  classDef downstream fill:#dcfce7,stroke:#16a34a;')
    lines.append(f'  class {safe(focus)} focus;')
    if deps_in:
        lines.append(f'  class {",".join(safe(d) for d in deps_in)} upstream;')
    if deps_out:
        lines.append(f'  class {",".join(safe(d) for d in deps_out)} downstream;')
    # Click handlers: clicking the focus node is a no-op; clicking
    # any neighbor jumps to that module's view via selectModule().
    for d in deps_in + deps_out:
        # Quoted-string syntax: the second arg is a JS-callable name.
        # Mermaid 10 lets us pass an arbitrary URL OR call back into
        # a globally-defined function — we use callback form.
        lines.append(f'  click {safe(d)} call selectModule("{d}")')
    return '\n'.join(lines)


def build_explorer_html(package: str, mapper_data: dict, drop: set[str]) -> str:
    modules = [
        m for m in mapper_data['modules']
        if m.get('fileCount', 0) > 0 and m['id'] not in drop
    ]
    modules_by_id = {m['id']: m for m in mapper_data['modules'] if m.get('fileCount', 0) > 0}

    inbound = {m['id']: 0 for m in modules}
    for m in modules:
        for dep in m.get('internalDepsOut', []):
            if dep in inbound:
                inbound[dep] += 1

    # Build per-module mermaid blocks + metadata.
    blocks: list[tuple[str, str, dict]] = []  # (mid, mermaid_text, stats)
    for m in modules:
        mid = m['id']
        deps_in_real = [d for d in m.get('internalDepsIn', []) if d in modules_by_id and d not in drop]
        deps_out_real = [d for d in m.get('internalDepsOut', []) if d in modules_by_id and d not in drop]
        stats = {
            'fileCount': m.get('fileCount', 0),
            'testFileCount': m.get('testFileCount', 0),
            'depsInCount': len(deps_in_real),
            'depsOutCount': len(deps_out_real),
            'path': m.get('path', ''),
            'isHub': inbound.get(mid, 0) >= HUB_THRESHOLD,
            'isLeaf': not deps_in_real,
        }
        mermaid_text = neighborhood_mermaid(mid, modules_by_id, drop)
        blocks.append((mid, mermaid_text, stats))

    # Sort modules for the sidebar: hubs first, then alphabetical.
    blocks.sort(key=lambda b: (not b[2]['isHub'], b[0]))
    default_module = blocks[0][0] if blocks else None

    # Sidebar nav HTML.
    nav_items = []
    for mid, _, stats in blocks:
        marker = ''
        if stats['isHub']:
            marker = ' <span class="badge hub">hub</span>'
        elif stats['isLeaf']:
            marker = ' <span class="badge leaf">leaf</span>'
        sid = safe(mid)
        nav_items.append(
            f'<button data-mid="{html.escape(mid)}" id="nav_{sid}" '
            f'class="nav-item">{html.escape(mid)}{marker}</button>'
        )

    # Per-module diagram blocks + metadata.
    diagram_divs = []
    for mid, mermaid_text, stats in blocks:
        sid = safe(mid)
        meta_line = (
            f'<span><strong>Path:</strong> <code>{html.escape(stats["path"])}</code></span>'
            f'<span><strong>Files:</strong> {stats["fileCount"]} '
            f'({stats["testFileCount"]} tests)</span>'
            f'<span><strong>{stats["depsInCount"]}</strong> import this · '
            f'imports <strong>{stats["depsOutCount"]}</strong></span>'
        )
        diagram_divs.append(
            f'''<div class="diagram" id="d_{sid}" data-mid="{html.escape(mid)}">
  <h2>{html.escape(mid)} <span class="muted">— neighborhood</span></h2>
  <div class="meta">{meta_line}</div>
  <pre class="mermaid">
{mermaid_text}
  </pre>
</div>'''
        )

    package_safe = html.escape(package)
    nav_html = '\n      '.join(nav_items)
    diagrams_html = '\n'.join(diagram_divs)
    default_id_safe = safe(default_module) if default_module else ''

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{package_safe} module explorer</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0; color: #1f2937;
      display: grid; grid-template-columns: 240px 1fr; min-height: 100vh;
    }}
    nav {{
      background: #f9fafb; border-right: 1px solid #e5e7eb;
      padding: 12px 8px; overflow-y: auto; max-height: 100vh;
    }}
    nav h3 {{
      font-size: 0.85rem; margin: 0 8px 8px; text-transform: uppercase;
      letter-spacing: 0.04em; color: #6b7280;
    }}
    .nav-item {{
      display: block; width: 100%; text-align: left;
      padding: 5px 10px; margin: 1px 0;
      background: transparent; border: none; cursor: pointer;
      font-size: 0.85rem; color: #374151; border-radius: 3px;
      font-family: inherit;
    }}
    .nav-item:hover {{ background: #e5e7eb; }}
    .nav-item.active {{ background: #2563eb; color: white; font-weight: 600; }}
    .badge {{
      font-size: 0.65rem; padding: 1px 5px; border-radius: 3px;
      margin-left: 4px; vertical-align: middle; font-weight: 500;
    }}
    .badge.hub  {{ background: #fef3c7; color: #92400e; }}
    .badge.leaf {{ background: #dcfce7; color: #166534; }}
    .nav-item.active .badge {{ background: rgba(255,255,255,0.25); color: white; }}
    main {{
      padding: 16px 24px; overflow-x: auto; max-height: 100vh;
      overflow-y: auto;
    }}
    h2 {{ font-size: 1.1rem; margin: 4px 0 8px; }}
    h2 .muted {{ color: #9ca3af; font-weight: 400; font-size: 0.95rem; }}
    .meta {{
      display: flex; flex-wrap: wrap; gap: 24px;
      font-size: 0.8rem; color: #4b5563; margin-bottom: 14px;
    }}
    .meta code {{
      background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
      font-size: 0.8rem;
    }}
    .meta strong {{ color: #1f2937; }}
    .diagram {{ display: none; }}
    .diagram.active {{ display: block; }}
    .mermaid {{
      background: #fafafa; padding: 16px; border-radius: 6px;
      border: 1px solid #e5e7eb; overflow: auto;
    }}
    .mermaid svg .node:not(.focus) {{ cursor: pointer; }}
    .help {{
      font-size: 0.75rem; color: #6b7280; margin-top: 16px;
      padding-top: 12px; border-top: 1px solid #e5e7eb;
    }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body>
  <nav>
    <h3>{package_safe} modules</h3>
    {nav_html}
    <div class="help">
      <strong>Click a module</strong> in the list or in any diagram
      to jump to its neighborhood. <strong>Yellow</strong> = imports
      this · <strong>Green</strong> = imported by this.
    </div>
  </nav>
  <main>
    {diagrams_html}
  </main>
  <script>
    // Mermaid renders SVGs by measuring text + DOM, which gives the
    // wrong result (or nothing) when the container is display:none.
    // So we initialise WITHOUT startOnLoad and render each diagram
    // only when it becomes visible for the first time. Once rendered
    // it stays in the DOM — toggling .active is just CSS.
    mermaid.initialize({{
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',  // required for click-callback handlers
      flowchart: {{ htmlLabels: true, curve: 'basis' }},
    }});

    const rendered = new Set();
    async function ensureRendered(safeId) {{
      if (rendered.has(safeId)) return;
      const container = document.getElementById('d_' + safeId);
      if (!container) return;
      const block = container.querySelector('.mermaid');
      if (!block) {{ rendered.add(safeId); return; }}
      // Container must be in layout (display: block) for accurate
      // sizing. selectModule() activates it before calling us, but
      // be defensive in case of direct calls.
      const wasActive = container.classList.contains('active');
      container.classList.add('active');
      try {{
        await mermaid.run({{ nodes: [block] }});
      }} catch (e) {{
        console.error('Mermaid render failed for', safeId, e);
        block.textContent = 'Render failed: ' + (e && e.message || e);
      }} finally {{
        rendered.add(safeId);
        if (!wasActive) container.classList.remove('active');
      }}
    }}

    async function selectModule(mid) {{
      const safe = mid.replace(/-/g, '_').replace(/\\//g, '_');
      document.querySelectorAll('.diagram').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const diag = document.getElementById('d_' + safe);
      const nav  = document.getElementById('nav_' + safe);
      if (diag) {{
        diag.classList.add('active');
        await ensureRendered(safe);
      }}
      if (nav) {{
        nav.classList.add('active');
        nav.scrollIntoView({{ block: 'nearest' }});
      }}
      if (location.hash !== '#' + mid) {{
        history.replaceState(null, '', '#' + mid);
      }}
    }}
    window.selectModule = selectModule;

    // Wire up the sidebar buttons.
    document.querySelectorAll('.nav-item').forEach(btn => {{
      btn.addEventListener('click', () => selectModule(btn.dataset.mid));
    }});

    // Initial selection: URL hash if present, otherwise the first
    // module (hubs come first in the sidebar order).
    const initial = location.hash ? decodeURIComponent(location.hash.slice(1)) : '{default_module or ""}';
    if (initial) selectModule(initial);
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description='Interactive module explorer.')
    parser.add_argument('package', help='Package name (backend, frontend, cli)')
    parser.add_argument(
        '--include-entry',
        action='store_true',
        help='Keep _root, eval-harness, scripts (default: drop)',
    )
    parser.add_argument(
        '--include-infra',
        action='store_true',
        help='Keep database, common, config (default: drop)',
    )
    args = parser.parse_args()

    mapper_json = REPO_ROOT / 'agents' / 'codebase-map' / f'{args.package}.json'
    if not mapper_json.is_file():
        sys.exit(f'no mapper JSON at {mapper_json}')
    mapper = json.load(mapper_json.open())

    drop: set[str] = set()
    if not args.include_entry:
        drop |= set(DEFAULT_ENTRY_EXCLUDES)
    if not args.include_infra:
        drop |= set(DEFAULT_INFRA)

    html_text = build_explorer_html(args.package, mapper, drop)
    out_path = REPO_ROOT / 'agents' / 'graphify' / f'{args.package}-module-level' / 'MODULE_EXPLORER.html'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(html_text)
    print(f'wrote {out_path.relative_to(REPO_ROOT)}')


if __name__ == '__main__':
    main()
