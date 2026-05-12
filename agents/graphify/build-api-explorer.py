#!/usr/bin/env python3
"""
Single-page interactive API endpoint explorer.

Renders the JSON emitted by agents/api-flow/src/extract.ts as one
HTML page with:
  - Sidebar: every endpoint grouped by module
  - Main pane: the selected endpoint's call-flow Mermaid flowchart
  - Click any node in the diagram (a Class.method) to view that
    method's source file path / context
  - URL hash deep links: API_EXPLORER.html#GET-evaluations-:id

Usage:
  agents/graphify/build-api-explorer.py
  agents/graphify/build-api-explorer.py --json <path>
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def safe_id(s: str) -> str:
    """Mermaid / DOM-safe id."""
    return re.sub(r'[^a-zA-Z0-9]+', '_', s).strip('_')


def hash_id(route: str) -> str:
    """URL-hash-friendly id for an endpoint. Keeps human-readable
    shape: 'GET /sessions/:id' -> 'GET-sessions-:id'."""
    return re.sub(r'[^a-zA-Z0-9:/]+', '-', route).strip('-').replace('/', '-')


VERB_COLOR = {
    'GET':    '#10b981',
    'POST':   '#3b82f6',
    'PUT':    '#f59e0b',
    'PATCH':  '#f59e0b',
    'DELETE': '#ef4444',
    'HEAD':   '#9ca3af',
    'OPTIONS': '#9ca3af',
}


def walk_tree(node: dict, parent_id: str | None, lines: list[str], classes: dict[str, str]) -> str:
    """Emit Mermaid `id["label"]` declarations + parent --> child
    edges. Returns the id of this node."""
    nid = safe_id(node['id']) + '_' + str(len(lines))  # unique even on duplicates
    raw_label = node['label']
    # Wrap long labels for readability — Mermaid uses <br/> for newlines.
    label = html.escape(raw_label).replace('.', '.​')  # zero-width allow break
    lines.append(f'  {nid}["{label}"]')
    classes[nid] = node['type']
    if parent_id is not None:
        lines.append(f'  {parent_id} --> {nid}')
    for child in node.get('children', []):
        walk_tree(child, nid, lines, classes)
    return nid


def mermaid_for_endpoint(ep: dict) -> str:
    lines: list[str] = ['flowchart TD']
    classes: dict[str, str] = {}

    # If the CLI hits this endpoint, prepend a CLI subgraph showing
    # the full chain from each command entry (runWatch/runFinish/...)
    # down to the ApiClient method that issues HTTP. Intermediate
    # nodes (drainBuffer, sendWithBackoff) are shared across chains
    # so common helpers appear once.
    callers = ep.get('cliCallers') or []
    api_method_ids: list[str] = []
    if callers:
        lines.append('  subgraph CLI [cli/ package]')
        cli_node_ids: dict[str, str] = {}
        next_cli_id = [0]  # mutable counter

        def get_cli_id(step: dict) -> str:
            key = f'{step.get("file", "")}::{step.get("className") or ""}.{step["name"]}'
            if key in cli_node_ids:
                return cli_node_ids[key]
            cid = f'cli_{next_cli_id[0]}'
            next_cli_id[0] += 1
            cli_node_ids[key] = cid
            full_name = (step['className'] + '.' if step.get('className') else '') + step['name']
            file_short = step.get('file', '').replace('cli/src/', '')
            label = html.escape(f'{full_name}()')
            if file_short:
                label += '<br/><small>' + html.escape(file_short) + '</small>'
            lines.append(f'    {cid}["{label}"]')
            classes[cid] = 'cli'
            return cid

        added_edges: set[str] = set()
        for caller in callers:
            for chain in caller.get('chains', []):
                prev_id: str | None = None
                for step in chain:
                    cid = get_cli_id(step)
                    if prev_id is not None:
                        edge_key = f'{prev_id}->{cid}'
                        if edge_key not in added_edges:
                            added_edges.add(edge_key)
                            lines.append(f'    {prev_id} --> {cid}')
                    prev_id = cid
                if prev_id and prev_id not in api_method_ids:
                    api_method_ids.append(prev_id)
        # Override style on terminal nodes (the ones that fire HTTP).
        for tid in api_method_ids:
            classes[tid] = 'cli-http'
        lines.append('  end')

    root_id = walk_tree(ep['callTree'], None, lines, classes)

    # Dashed HTTP edge from each ApiClient terminal to the controller
    # method, labeled with the verb + url so the boundary is clear.
    if callers and api_method_ids:
        for tid, caller in zip(api_method_ids, callers):
            label = f'HTTP {caller["verb"]} {caller["url"]}'
            lines.append(f'  {tid} -. "{html.escape(label)}" .-> {root_id}')

    lines.append('')
    lines.append('  classDef cli      fill:#fed7aa,stroke:#9a3412,color:#7c2d12;')
    lines.append('  classDef cli-http fill:#fff7ed,stroke:#ea580c,stroke-width:2px,color:#7c2d12,font-weight:bold;')
    lines.append('  classDef method   fill:#e0e7ff,stroke:#4f46e5;')
    lines.append('  classDef prisma   fill:#fce7f3,stroke:#db2777,font-weight:bold;')
    lines.append('  classDef unresolved fill:#f3f4f6,stroke:#9ca3af,color:#6b7280,stroke-dasharray:4 2;')
    lines.append('  classDef cycle    fill:#fef3c7,stroke:#f59e0b;')
    lines.append('  classDef truncated fill:#fef3c7,stroke:#f59e0b,stroke-dasharray:4 2;')
    lines.append('  classDef external fill:#dcfce7,stroke:#16a34a;')
    # Group nodes by class.
    by_cls: dict[str, list[str]] = {}
    for nid, cls in classes.items():
        by_cls.setdefault(cls, []).append(nid)
    for cls, ids in by_cls.items():
        lines.append(f'  class {",".join(ids)} {cls};')
    return '\n'.join(lines)


def build_html(data: dict) -> str:
    package = data['package']
    endpoints = data['endpoints']

    # Group endpoints by module.
    by_module: dict[str, list[dict]] = {}
    for ep in endpoints:
        by_module.setdefault(ep['module'], []).append(ep)

    nav_html_parts: list[str] = []
    for module in sorted(by_module):
        nav_html_parts.append(
            f'<details open class="module-group"><summary>{html.escape(module)} '
            f'<span class="count">{len(by_module[module])}</span></summary>'
        )
        for ep in by_module[module]:
            verb_color = VERB_COLOR.get(ep['httpVerb'], '#6b7280')
            route_path = ep['route'].split(' ', 1)[1] if ' ' in ep['route'] else ep['route']
            hid = hash_id(ep['route'])
            cli_badge = ''
            if ep.get('cliCallers'):
                cli_badge = '<span class="cli-badge" title="Called by cli/">CLI</span>'
            nav_html_parts.append(
                f'<button class="nav-item" data-hid="{html.escape(hid)}" '
                f'id="nav_{safe_id(hid)}">'
                f'<span class="verb" style="background:{verb_color}">'
                f'{html.escape(ep["httpVerb"])}</span> '
                f'<span class="route">{html.escape(route_path)}</span>'
                f'{cli_badge}'
                f'</button>'
            )
        nav_html_parts.append('</details>')

    diagram_blocks: list[str] = []
    for ep in endpoints:
        hid = hash_id(ep['route'])
        sid = safe_id(hid)
        verb_color = VERB_COLOR.get(ep['httpVerb'], '#6b7280')
        mermaid = mermaid_for_endpoint(ep)
        # Render method name + file path metadata.
        ctrl_file = ep['controllerFile']
        stats = ep['stats']
        callers = ep.get('cliCallers') or []
        cli_summary = ''
        if callers:
            # Collect all unique commands across all callers.
            cmds = []
            for c in callers:
                for cmd in c.get('triggeringCommands', []):
                    if cmd not in cmds:
                        cmds.append(cmd)
            cmd_chips = ' '.join(
                f'<code class="cmd">{html.escape(cmd)}</code>' for cmd in cmds
            )
            api_chips = ', '.join(
                f'<code>{html.escape(c["className"])}.{html.escape(c["method"])}</code>'
                for c in callers
            )
            cli_summary = (
                f'<div class="cli-summary">'
                f'<div><strong>Triggered by:</strong> {cmd_chips}</div>'
                f'<div style="margin-top:4px"><strong>HTTP fired by:</strong> {api_chips} '
                f'<span class="cli-file">in <code>{html.escape(callers[0]["file"])}</code></span></div>'
                f'</div>'
            )
        diagram_blocks.append(f"""<div class="diagram" id="d_{sid}" data-hid="{html.escape(hid)}">
  <h2>
    <span class="verb-big" style="background:{verb_color}">{html.escape(ep['httpVerb'])}</span>
    <span class="route-big">{html.escape(ep['route'].split(' ', 1)[1] if ' ' in ep['route'] else ep['route'])}</span>
  </h2>
  <div class="meta">
    <strong>Handler:</strong> <code>{html.escape(ep['controller'])}.{html.escape(ep['method'])}()</code>
    · <strong>File:</strong> <code>{html.escape(ctrl_file)}</code>
    · <strong>Calls:</strong> {stats['nodeCount']} nodes ·
    depth {stats['maxDepth']}{' · ' + str(stats['unresolvedCount']) + ' unresolved' if stats['unresolvedCount'] else ''}{' · ' + str(stats['cycleCount']) + ' cycle' if stats['cycleCount'] else ''}
  </div>
  {cli_summary}
  <div class="viewport" id="vp_{sid}">
    <div class="vp-controls">
      <button data-act="zin"  title="Zoom in (or scroll up)">+</button>
      <button data-act="zout" title="Zoom out (or scroll down)">−</button>
      <button data-act="fit"  title="Fit to viewport">⤢</button>
      <button data-act="reset" title="Reset (1:1, centered)">⟲</button>
    </div>
    <div class="vp-hint">scroll or drag to pan · ⌘/Ctrl + scroll to zoom · double-click to reset</div>
    <pre class="mermaid">
{mermaid}
    </pre>
  </div>
</div>""")

    default_hid = hash_id(endpoints[0]['route']) if endpoints else ''

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{html.escape(package)} API explorer</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0; color: #1f2937;
      display: grid; grid-template-columns: 320px 1fr; min-height: 100vh;
      transition: grid-template-columns 0.2s ease;
    }}
    body.nav-collapsed {{ grid-template-columns: 36px 1fr; }}
    nav {{
      background: #f9fafb; border-right: 1px solid #e5e7eb;
      padding: 8px 6px; overflow-y: auto; max-height: 100vh;
      position: relative;
    }}
    body.nav-collapsed nav > :not(.nav-toggle) {{ display: none; }}
    body.nav-collapsed nav {{ padding: 8px 0; overflow: hidden; }}
    .nav-toggle {{
      position: sticky; top: 0; z-index: 20; width: 100%;
      display: flex; justify-content: flex-end; margin-bottom: 6px;
    }}
    body.nav-collapsed .nav-toggle {{ justify-content: center; }}
    .nav-toggle button {{
      width: 24px; height: 24px; padding: 0;
      background: white; border: 1px solid #e5e7eb; border-radius: 3px;
      cursor: pointer; font-size: 0.85rem; color: #4b5563;
      line-height: 1;
    }}
    .nav-toggle button:hover {{ background: #f3f4f6; }}
    nav h3 {{
      font-size: 0.85rem; margin: 4px 8px 8px; text-transform: uppercase;
      letter-spacing: 0.04em; color: #6b7280;
    }}
    details.module-group {{ margin: 2px 0; }}
    details.module-group > summary {{
      cursor: pointer; font-size: 0.75rem; padding: 4px 8px;
      color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em;
      list-style: none;
    }}
    details.module-group > summary::-webkit-details-marker {{ display: none; }}
    details.module-group > summary::before {{ content: '▸'; margin-right: 4px; transition: transform 0.15s; display: inline-block; }}
    details.module-group[open] > summary::before {{ transform: rotate(90deg); }}
    .count {{ background: #e5e7eb; padding: 0 5px; border-radius: 8px;
              font-size: 0.7rem; font-weight: 600; margin-left: 4px; }}
    .nav-item {{
      display: flex; align-items: center; gap: 6px;
      width: 100%; text-align: left;
      padding: 4px 8px 4px 16px; margin: 1px 0;
      background: transparent; border: none; cursor: pointer;
      font-size: 0.78rem; color: #374151; border-radius: 3px;
      font-family: inherit; line-height: 1.3;
    }}
    .nav-item:hover {{ background: #e5e7eb; }}
    .nav-item.active {{ background: #2563eb; color: white; }}
    .nav-item.active .route {{ color: white; }}
    .nav-item.active .verb {{ filter: brightness(1.1); }}
    .verb {{
      font-size: 0.65rem; padding: 1px 5px; border-radius: 3px;
      color: white; font-weight: 700; flex-shrink: 0;
      min-width: 42px; text-align: center;
    }}
    .route {{ color: #1f2937; font-family: ui-monospace, Menlo, monospace; font-size: 0.75rem; word-break: break-all; }}
    main {{
      padding: 16px 24px; overflow-x: auto; max-height: 100vh;
      overflow-y: auto;
    }}
    h2 {{ font-size: 1.1rem; margin: 4px 0 8px; display: flex; align-items: center; gap: 10px; }}
    .verb-big {{ font-size: 0.85rem; padding: 3px 10px; border-radius: 4px;
                 color: white; font-weight: 700; }}
    .route-big {{ font-family: ui-monospace, Menlo, monospace; }}
    .meta {{
      font-size: 0.8rem; color: #4b5563; margin: 8px 0 8px;
    }}
    .cli-summary {{
      font-size: 0.8rem; margin: 0 0 14px; padding: 6px 10px;
      background: #fff7ed; border-left: 3px solid #ea580c;
      border-radius: 0 4px 4px 0;
    }}
    .cli-summary code {{ background: rgba(0,0,0,0.04); padding: 1px 4px; border-radius: 3px; }}
    .cli-summary code.cmd {{
      background: #ea580c; color: white; font-weight: 700;
      padding: 2px 8px; font-size: 0.78rem;
    }}
    .cli-summary .cli-file {{ color: #9a3412; font-family: ui-monospace, Menlo, monospace; font-size: 0.7rem; }}
    .cli-badge {{
      background: #ea580c; color: white; font-size: 0.55rem;
      padding: 1px 4px; border-radius: 3px; font-weight: 700;
      margin-left: auto; flex-shrink: 0; letter-spacing: 0.04em;
    }}
    .meta code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px; font-size: 0.8rem; }}
    .meta strong {{ color: #1f2937; }}
    .diagram {{ display: none; }}
    .diagram.active {{ display: block; }}
    .viewport {{
      position: relative;
      background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px;
      height: 78vh; overflow: hidden;
    }}
    .viewport .mermaid {{
      width: 100%; height: 100%; margin: 0;
    }}
    .viewport .mermaid svg {{
      width: 100% !important; height: 100% !important;
      max-width: none !important; cursor: grab;
    }}
    .viewport .mermaid svg:active {{ cursor: grabbing; }}
    .vp-controls {{
      position: absolute; top: 8px; right: 8px; z-index: 10;
      display: flex; gap: 4px;
      background: white; padding: 4px; border-radius: 4px;
      border: 1px solid #e5e7eb; box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    }}
    .vp-controls button {{
      width: 28px; height: 26px; padding: 0; border: 1px solid #e5e7eb;
      background: white; border-radius: 3px; cursor: pointer;
      font-size: 0.9rem; color: #374151;
    }}
    .vp-controls button:hover {{ background: #f3f4f6; }}
    .vp-hint {{
      position: absolute; bottom: 6px; left: 8px; z-index: 10;
      font-size: 0.65rem; color: #9ca3af;
      background: rgba(255,255,255,0.85); padding: 2px 6px; border-radius: 3px;
    }}
    .help {{
      font-size: 0.72rem; color: #6b7280; margin-top: 12px;
      padding: 8px; border-top: 1px solid #e5e7eb;
    }}
    .help .legend {{ display: flex; gap: 8px; margin-top: 4px; flex-wrap: wrap; }}
    .legend-swatch {{ display: inline-flex; align-items: center; gap: 3px; }}
    .legend-box {{ width: 10px; height: 10px; border-radius: 2px; border: 1px solid #aaa; }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3/dist/svg-pan-zoom.min.js"></script>
</head>
<body>
  <nav>
    <div class="nav-toggle">
      <button id="nav-toggle-btn" title="Toggle sidebar (Cmd/Ctrl+B)">⇔</button>
    </div>
    <h3>{html.escape(package)} endpoints</h3>
    {chr(10).join(nav_html_parts)}
    <div class="help">
      Click any endpoint to see its call flow. Mermaid renders on
      first view (lazy) so deep ones may take a moment.
      <div class="legend">
        <span class="legend-swatch"><span class="legend-box" style="background:#e0e7ff;border-color:#4f46e5"></span> method</span>
        <span class="legend-swatch"><span class="legend-box" style="background:#fce7f3;border-color:#db2777"></span> Prisma</span>
        <span class="legend-swatch"><span class="legend-box" style="background:#f3f4f6;border-color:#9ca3af"></span> unresolved</span>
        <span class="legend-swatch"><span class="legend-box" style="background:#fef3c7;border-color:#f59e0b"></span> cycle / depth cap</span>
      </div>
    </div>
  </nav>
  <main>
    {chr(10).join(diagram_blocks)}
  </main>
  <script>
    mermaid.initialize({{
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
      flowchart: {{ htmlLabels: true, curve: 'basis', nodeSpacing: 32, rankSpacing: 40 }},
    }});

    const rendered = new Set();
    const panZoomInstances = {{}};

    function bindPanZoom(sid) {{
      const vp = document.getElementById('vp_' + sid);
      if (!vp) return;
      const svg = vp.querySelector('svg');
      if (!svg || panZoomInstances[sid]) return;
      // Mermaid sets viewBox + width/height on its SVG; svg-pan-zoom
      // needs width/height in CSS pixels to compute its viewport.
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      const pz = svgPanZoom(svg, {{
        zoomEnabled: true,
        controlIconsEnabled: false,
        fit: true,
        center: true,
        minZoom: 0.2,
        maxZoom: 8,
        dblClickZoomEnabled: false,
        // Scroll-to-zoom turned off; we handle wheel ourselves so
        // plain scroll pans and Cmd/Ctrl+scroll zooms.
        mouseWheelZoomEnabled: false,
        preventMouseEventsDefault: true,
      }});
      panZoomInstances[sid] = pz;
      svg.addEventListener('dblclick', () => {{ pz.reset(); }});
      svg.addEventListener('wheel', (e) => {{
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {{
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          pz.zoomAtPoint(factor, {{ x: e.offsetX, y: e.offsetY }});
        }} else {{
          pz.panBy({{ x: -e.deltaX, y: -e.deltaY }});
        }}
      }}, {{ passive: false }});
      // Wire the control buttons.
      vp.querySelectorAll('.vp-controls button').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          const act = btn.dataset.act;
          if (act === 'zin')  pz.zoomIn();
          if (act === 'zout') pz.zoomOut();
          if (act === 'fit')  pz.fit();
          if (act === 'reset') pz.reset();
        }});
      }});
    }}

    async function ensureRendered(sid) {{
      if (rendered.has(sid)) return;
      const container = document.getElementById('d_' + sid);
      if (!container) return;
      const block = container.querySelector('.mermaid');
      if (!block) {{ rendered.add(sid); return; }}
      const wasActive = container.classList.contains('active');
      container.classList.add('active');
      try {{
        await mermaid.run({{ nodes: [block] }});
        // Mermaid needs the SVG in layout for measurements, so we
        // wait one tick before binding pan-zoom.
        await new Promise(r => requestAnimationFrame(r));
        bindPanZoom(sid);
      }} catch (e) {{
        console.error('Mermaid render failed for', sid, e);
        block.textContent = 'Render failed: ' + (e && e.message || e);
      }} finally {{
        rendered.add(sid);
        if (!wasActive) container.classList.remove('active');
      }}
    }}

    function safeId(s) {{
      return s.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
    }}

    async function selectEndpoint(hid) {{
      const sid = safeId(hid);
      document.querySelectorAll('.diagram').forEach(d => d.classList.remove('active'));
      document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
      const diag = document.getElementById('d_' + sid);
      const nav  = document.getElementById('nav_' + sid);
      if (diag) {{
        diag.classList.add('active');
        await ensureRendered(sid);
      }}
      if (nav) {{
        nav.classList.add('active');
        nav.scrollIntoView({{ block: 'nearest' }});
      }}
      if (location.hash !== '#' + hid) {{
        history.replaceState(null, '', '#' + hid);
      }}
    }}
    window.selectEndpoint = selectEndpoint;

    document.querySelectorAll('.nav-item').forEach(btn => {{
      btn.addEventListener('click', () => selectEndpoint(btn.dataset.hid));
    }});

    // Sidebar collapse — state persisted in localStorage so refresh
    // keeps your preference. Keyboard shortcut: Cmd/Ctrl+B.
    const NAV_KEY = 'apiExplorer.navCollapsed';
    function applyNavState() {{
      const collapsed = localStorage.getItem(NAV_KEY) === '1';
      document.body.classList.toggle('nav-collapsed', collapsed);
      // svg-pan-zoom needs to know the viewport resized after we
      // change the grid columns. Rebind dimensions on the currently
      // visible diagram.
      Object.values(panZoomInstances).forEach(pz => {{
        try {{ pz.resize(); pz.fit(); pz.center(); }} catch (e) {{ /* not mounted */ }}
      }});
    }}
    function toggleNav() {{
      const collapsed = !(localStorage.getItem(NAV_KEY) === '1');
      localStorage.setItem(NAV_KEY, collapsed ? '1' : '0');
      applyNavState();
    }}
    document.getElementById('nav-toggle-btn').addEventListener('click', toggleNav);
    document.addEventListener('keydown', (e) => {{
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {{
        e.preventDefault();
        toggleNav();
      }}
    }});
    applyNavState();

    const initial = location.hash ? decodeURIComponent(location.hash.slice(1)) : '{default_hid}';
    if (initial) selectEndpoint(initial);
  </script>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description='Build the API endpoint explorer HTML.')
    parser.add_argument(
        '--json',
        type=Path,
        default=REPO_ROOT / 'agents' / 'codebase-map' / 'backend-api-flow.json',
        help='Path to the api-flow JSON (default: agents/codebase-map/backend-api-flow.json)',
    )
    args = parser.parse_args()

    if not args.json.is_file():
        sys.exit(
            f'no JSON at {args.json}\n'
            f'Generate first with:\n'
            f'  cd agents/api-flow && npm run extract'
        )
    data = json.load(args.json.open())
    out_dir = REPO_ROOT / 'agents' / 'graphify' / f'{data["package"]}-api-flow'
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / 'API_EXPLORER.html'
    out_path.write_text(build_html(data))
    print(f'wrote {out_path.relative_to(REPO_ROOT)} ({len(data["endpoints"])} endpoints)')


if __name__ == '__main__':
    main()
