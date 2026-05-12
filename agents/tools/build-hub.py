#!/usr/bin/env python3
"""
Single-page hub for all the codebase-exploration views.

Generates agents/HUB.html — a single file that loads any of the
other views inside an iframe, navigated by a hamburger-drawer menu.

The menu is built dynamically from what's currently on disk:
  - Architecture (Module relationships, per-package)
  - Schema (Prisma ER diagram)
  - APIs (the API_EXPLORER)
  - Modules (the MODULE_EXPLORER, per-package)
  - Knowledge graphs (per-module GRAPH_TREE_high-level pages)

Missing views are silently skipped, so partial setups still produce
a usable hub.

Usage:
  agents/tools/build-hub.py
  open agents/HUB.html
"""
from __future__ import annotations

import html
import json
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
AGENTS_DIR = REPO_ROOT / 'agents'
DATA_DIR = AGENTS_DIR / 'data'
KG_DIR = DATA_DIR / 'knowledge-graphs'


def rel(path: Path) -> str:
    """Path relative to agents/HUB.html for use in src attributes."""
    return str(path.relative_to(AGENTS_DIR))


def discover_items() -> list[dict]:
    """Inspect agents/data/ and build a list of available views,
    grouped by category. Each item is { category, label, href, badge? }."""
    items: list[dict] = []

    # ---- Architecture: the curated end-to-end system diagram ----
    arch = DATA_DIR / 'architecture' / 'ARCHITECTURE.html'
    if arch.exists():
        items.append({
            'category': 'Architecture',
            'label': 'System architecture (end-to-end)',
            'href': rel(arch),
            'badge': '★',
        })

    # ---- Schema (Prisma ER) ----
    schema_html = DATA_DIR / 'schema' / 'SCHEMA_DIAGRAM.html'
    if schema_html.exists():
        items.append({
            'category': 'Schema',
            'label': 'Database (Prisma ER)',
            'href': rel(schema_html),
        })

    # ---- APIs: the per-package API_EXPLORER ----
    for pkg in ('backend',):
        api = KG_DIR / f'{pkg}-api-flow' / 'API_EXPLORER.html'
        if api.exists():
            items.append({
                'category': 'API flow',
                'label': f'{pkg} — endpoint explorer',
                'href': rel(api),
                'badge': '⭐',  # the daily-driver view
            })

    # ---- Modules: per-package interactive explorer + Mermaid diagrams ----
    for pkg in ('backend', 'frontend', 'cli'):
        ex = KG_DIR / f'{pkg}-module-level' / 'MODULE_EXPLORER.html'
        if ex.exists():
            items.append({
                'category': 'Modules',
                'label': f'{pkg} — explorer (click-to-navigate)',
                'href': rel(ex),
            })
        d = KG_DIR / f'{pkg}-module-level'
        mod_rel = d / 'MODULE_RELATIONSHIPS.html'
        if mod_rel.exists():
            items.append({
                'category': 'Modules',
                'label': f'{pkg} — relationship diagram',
                'href': rel(mod_rel),
            })
        feat = d / 'MODULE_RELATIONSHIPS_features-only.html'
        if feat.exists():
            items.append({
                'category': 'Modules',
                'label': f'{pkg} — features only (no infra)',
                'href': rel(feat),
            })

    # ---- Knowledge graphs (unified, per-package) ----
    # These come first so the "all modules in one tree" view is the
    # top of the Knowledge graphs section — that's the natural
    # starting point before drilling into individual modules.
    if KG_DIR.is_dir():
        for pkg in ('backend', 'frontend', 'cli'):
            unified = KG_DIR / f'{pkg}-unified' / 'graphify-out'
            high = unified / 'GRAPH_TREE_unified-high.html'
            file_lvl = unified / 'GRAPH_TREE_unified-file.html'
            if high.exists():
                items.append({
                    'category': 'Knowledge graphs',
                    'label': f'{pkg} — all modules (high-level)',
                    'href': rel(high),
                    'badge': '★',
                })
            if file_lvl.exists():
                items.append({
                    'category': 'Knowledge graphs',
                    'label': f'{pkg} — all modules (file-level)',
                    'href': rel(file_lvl),
                })

    # ---- Knowledge graphs per module ----
    if KG_DIR.is_dir():
        for sub in sorted(KG_DIR.iterdir()):
            if not sub.is_dir():
                continue
            if (
                sub.name.endswith('-module-level')
                or sub.name.endswith('-unified')
                or sub.name.endswith('-api-flow')
                or sub.name == 'backend-all'
                or sub.name.startswith('_')
            ):
                continue
            high = sub / 'graphify-out' / 'GRAPH_TREE_high-level.html'
            files = sub / 'graphify-out' / 'GRAPH_TREE_files.html'
            tree = sub / 'graphify-out' / 'GRAPH_TREE.html'
            target = high if high.exists() else files if files.exists() else tree
            if target and target.exists():
                items.append({
                    'category': 'Knowledge graphs',
                    'label': sub.name,
                    'href': rel(target),
                })

    return items


def build_html(items: list[dict]) -> str:
    # Group items by category for the drawer.
    by_cat: dict[str, list[dict]] = {}
    order: list[str] = []
    for it in items:
        c = it['category']
        if c not in by_cat:
            by_cat[c] = []
            order.append(c)
        by_cat[c].append(it)

    # Pick a default item: prefer the API explorer if present, else
    # the first module explorer, else the first item overall.
    default = None
    for it in items:
        if 'endpoint explorer' in it['label']:
            default = it
            break
    if not default:
        for it in items:
            if 'explorer' in it['label']:
                default = it
                break
    if not default and items:
        default = items[0]

    drawer_html_parts: list[str] = []
    for cat in order:
        drawer_html_parts.append(f'<div class="cat"><span class="cat-label">{html.escape(cat)}</span><ul>')
        for it in by_cat[cat]:
            badge = it.get('badge') or ''
            drawer_html_parts.append(
                f'<li><button class="menu-item" '
                f'data-href="{html.escape(it["href"])}" '
                f'data-label="{html.escape(it["label"])}">'
                f'{html.escape(it["label"])} '
                f'<span class="badge">{html.escape(badge)}</span>'
                f'</button></li>'
            )
        drawer_html_parts.append('</ul></div>')

    default_href = default['href'] if default else ''
    default_label = default['label'] if default else 'no views available'
    items_json = json.dumps([{'href': it['href'], 'label': it['label']} for it in items])

    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Codebase Hub</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0; color: #1f2937;
      display: grid;
      grid-template-areas:
        "header header"
        "drawer main";
      grid-template-rows: 44px 1fr;
      grid-template-columns: 290px 1fr;
      height: 100vh; overflow: hidden;
      transition: grid-template-columns 0.2s ease;
    }}
    body.drawer-collapsed {{ grid-template-columns: 36px 1fr; }}

    header {{
      grid-area: header;
      background: #1f2937; color: white;
      display: flex; align-items: center; padding: 0 12px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
      gap: 12px;
    }}
    .hamburger {{
      background: transparent; border: none; color: white;
      cursor: pointer; padding: 6px 8px; font-size: 1.2rem;
      border-radius: 4px;
    }}
    .hamburger:hover {{ background: rgba(255,255,255,0.1); }}
    .title {{ font-weight: 600; font-size: 0.95rem; }}
    .title small {{ opacity: 0.7; font-weight: 400; margin-left: 8px; }}
    .current {{ margin-left: auto; font-size: 0.85rem; opacity: 0.9; }}

    .drawer {{
      grid-area: drawer;
      background: #f9fafb; border-right: 1px solid #e5e7eb;
      overflow-y: auto; padding: 8px 0;
    }}
    body.drawer-collapsed .drawer {{
      overflow: hidden; padding: 8px 0;
    }}
    body.drawer-collapsed .drawer > * {{ display: none; }}

    main {{
      grid-area: main; position: relative; overflow: hidden;
    }}
    iframe {{
      width: 100%; height: 100%; border: none; background: white;
    }}

    .cat {{ margin: 8px 0 12px; }}
    .cat-label {{
      display: block; padding: 0 16px 4px;
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
      color: #6b7280; font-weight: 600;
    }}
    .cat ul {{ list-style: none; margin: 0; padding: 0; }}
    .cat li {{ margin: 0; }}
    .menu-item {{
      width: 100%; text-align: left;
      padding: 6px 16px; background: transparent;
      border: none; cursor: pointer; font-family: inherit;
      font-size: 0.85rem; color: #374151;
      display: flex; align-items: center; gap: 6px;
    }}
    .menu-item:hover {{ background: #e5e7eb; }}
    .menu-item.active {{ background: #2563eb; color: white; }}
    .badge {{ margin-left: auto; font-size: 0.8rem; }}

    .empty {{
      padding: 12px 16px; font-size: 0.85rem; color: #6b7280;
    }}
  </style>
</head>
<body>
  <header>
    <button class="hamburger" id="hamburger" title="Collapse sidebar (Cmd/Ctrl+B)">☰</button>
    <span class="title">Codebase Hub <small>agents/</small></span>
    <span class="current" id="current-view">{html.escape(default_label)}</span>
  </header>

  <aside class="drawer" id="drawer">
    {''.join(drawer_html_parts) if items else '<div class="empty">No views built yet. Run the build scripts under agents/ first.</div>'}
  </aside>

  <main>
    <iframe id="frame" name="frame" src="{html.escape(default_href)}"></iframe>
  </main>

  <script>
    const ITEMS = {items_json};
    const hamb = document.getElementById('hamburger');
    const frame = document.getElementById('frame');
    const current = document.getElementById('current-view');

    // Sidebar collapse — visible by default, persisted in localStorage,
    // toggled via the hamburger button or Cmd/Ctrl+B.
    const DRAWER_KEY = 'codebaseHub.drawerCollapsed';
    function applyDrawerState() {{
      const collapsed = localStorage.getItem(DRAWER_KEY) === '1';
      document.body.classList.toggle('drawer-collapsed', collapsed);
    }}
    function toggleDrawer() {{
      const collapsed = !(localStorage.getItem(DRAWER_KEY) === '1');
      localStorage.setItem(DRAWER_KEY, collapsed ? '1' : '0');
      applyDrawerState();
    }}
    hamb.addEventListener('click', toggleDrawer);
    document.addEventListener('keydown', (e) => {{
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'b') {{
        e.preventDefault();
        toggleDrawer();
      }}
    }});
    applyDrawerState();

    function selectView(href, label) {{
      frame.src = href;
      current.textContent = label;
      document.querySelectorAll('.menu-item').forEach(b => {{
        b.classList.toggle('active', b.dataset.href === href);
      }});
      if (location.hash !== '#' + encodeURIComponent(href)) {{
        history.replaceState(null, '', '#' + encodeURIComponent(href));
      }}
    }}

    // Clicking a menu item loads the view in the iframe but leaves
    // the sidebar visible — user controls collapse explicitly.
    document.querySelectorAll('.menu-item').forEach(btn => {{
      btn.addEventListener('click', () => {{
        selectView(btn.dataset.href, btn.dataset.label);
      }});
    }});

    // Initial selection: URL hash if present, else the default href.
    const hashHref = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    if (hashHref) {{
      const match = ITEMS.find(it => it.href === hashHref);
      if (match) selectView(match.href, match.label);
    }} else {{
      const btn = document.querySelector(`.menu-item[data-href="{html.escape(default_href)}"]`);
      if (btn) btn.classList.add('active');
    }}
  </script>
</body>
</html>
"""


def main() -> None:
    items = discover_items()
    if not items:
        print('No views found. Build something first:')
        print('  agents/tools/build-schema-diagram.py')
        print('  agents/tools/graphify/build-mermaid.py backend')
        print('  agents/tools/graphify/build-explorer.py backend')
        print('  cd agents/packages/api-flow && npm run extract && cd ../../../.. && agents/tools/graphify/build-api-explorer.py')
    out = AGENTS_DIR / 'HUB.html'
    out.write_text(build_html(items))
    print(f'wrote agents/HUB.html ({len(items)} views)')
    if items:
        # Print a quick summary of categories + counts.
        from collections import Counter
        counts = Counter(it['category'] for it in items)
        for cat, n in counts.items():
            print(f'  {cat}: {n}')


if __name__ == '__main__':
    main()
