#!/usr/bin/env python3
"""
Per-module 'neighborhood' relationship diagrams.

For each module M in the package, emit a focused diagram showing:
  - M itself (highlighted, center)
  - Every module M imports (depsOut, shown on the right)
  - Every module that imports M (depsIn, shown on the left)
  - Only edges that touch M (so the picture stays small)

The output lives at:
  agents/data/knowledge-graphs/<module>/MODULE_NEIGHBORHOOD.md
  agents/data/knowledge-graphs/<module>/MODULE_NEIGHBORHOOD.html

This is the "what does THIS module touch" view, complementing
build-mermaid.py's "show everything" diagram.

Usage:
  agents/tools/graphify/build-neighborhoods.py <package>
  agents/tools/graphify/build-neighborhoods.py <package> --module evaluations
  agents/tools/graphify/build-neighborhoods.py backend --include-infra
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]

# Same defaults as build-mermaid.py for consistency. For the
# neighborhood view, infra is hidden by default (database, common,
# config touch everyone — they crowd every diagram with a useless
# leaf). Use --include-infra to bring them back if you want them.
DEFAULT_ENTRY_EXCLUDES = ('_root', 'eval-harness', 'scripts')
DEFAULT_INFRA = ('database', 'common', 'config')


def safe(mid: str) -> str:
    return mid.replace('-', '_').replace('/', '_')


def build_neighborhood(
    focus: str,
    modules_by_id: dict[str, dict],
    drop: set[str],
) -> tuple[str, dict]:
    """Build a mermaid block focused on one module. Returns
    (mermaid_text, stats)."""
    m = modules_by_id[focus]
    deps_out = [d for d in m.get('internalDepsOut', []) if d in modules_by_id and d not in drop]
    deps_in = [d for d in m.get('internalDepsIn', []) if d in modules_by_id and d not in drop]

    lines: list[str] = ['flowchart LR']
    # Center node (focus).
    lines.append(f'  {safe(focus)}["{focus}"]')
    # Upstream (modules that import focus).
    for d in sorted(deps_in):
        lines.append(f'  {safe(d)}["{d}"]')
    # Downstream (modules focus imports).
    for d in sorted(deps_out):
        lines.append(f'  {safe(d)}["{d}"]')
    lines.append('')
    # Edges: incoming on the left, outgoing on the right.
    for d in sorted(deps_in):
        lines.append(f'  {safe(d)} --> {safe(focus)}')
    for d in sorted(deps_out):
        lines.append(f'  {safe(focus)} --> {safe(d)}')
    lines.append('')
    # Highlight the focus node + style classes for neighbors.
    lines.append('  classDef focus fill:#dbeafe,stroke:#2563eb,stroke-width:3px,font-weight:bold;')
    lines.append('  classDef upstream fill:#fef3c7,stroke:#f59e0b;')
    lines.append('  classDef downstream fill:#dcfce7,stroke:#16a34a;')
    lines.append(f'  class {safe(focus)} focus;')
    if deps_in:
        lines.append(f'  class {",".join(safe(d) for d in deps_in)} upstream;')
    if deps_out:
        lines.append(f'  class {",".join(safe(d) for d in deps_out)} downstream;')

    stats = {
        'focus': focus,
        'deps_in': deps_in,
        'deps_out': deps_out,
        'meta': m,
    }
    return '\n'.join(lines), stats


def build_md(mermaid: str, stats: dict, package: str) -> str:
    focus = stats['focus']
    m = stats['meta']
    out: list[str] = []
    out.append(f'# {focus} — neighborhood')
    out.append('')
    out.append(
        f'Within-package dependencies for `{focus}` in `{package}/`. '
        '**Yellow boxes (left) import this module.** '
        '**Green boxes (right) are imported by this module.** '
        f'Generated from `agents/data/codebase-map/{package}.json`.'
    )
    out.append('')
    out.append(f'**Path:** `{m.get("path", "?")}`')
    out.append(f'**Files:** {m.get("fileCount", 0)} ({m.get("testFileCount", 0)} tests)')
    if m.get('exports'):
        sample = ', '.join(f'`{e}`' for e in m['exports'][:6])
        extra = f', +{len(m["exports"]) - 6} more' if len(m['exports']) > 6 else ''
        out.append(f'**Key exports:** {sample}{extra}')
    out.append('')
    out.append(
        f'**{len(stats["deps_in"])}** module(s) depend on `{focus}` · '
        f'**`{focus}`** depends on **{len(stats["deps_out"])}** module(s)'
    )
    out.append('')
    out.append('```mermaid')
    out.append(mermaid)
    out.append('```')
    out.append('')
    if stats['deps_in']:
        out.append('## Imported by')
        out.append('')
        for d in sorted(stats['deps_in']):
            out.append(f'- `{d}`')
        out.append('')
    if stats['deps_out']:
        out.append('## Imports from')
        out.append('')
        for d in sorted(stats['deps_out']):
            out.append(f'- `{d}`')
        out.append('')
    return '\n'.join(out) + '\n'


def build_html(mermaid: str, stats: dict, package: str) -> str:
    focus = stats['focus']
    m = stats['meta']
    deps_in_html = ', '.join(f'<code>{d}</code>' for d in sorted(stats['deps_in'])) or '<em>none</em>'
    deps_out_html = ', '.join(f'<code>{d}</code>' for d in sorted(stats['deps_out'])) or '<em>none</em>'
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{focus} — neighborhood ({package})</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 12px 24px; color: #1f2937; max-width: 1400px; }}
    h1 {{ font-size: 1rem; font-weight: 600; margin: 8px 0 8px; }}
    .meta {{ font-size: 0.85rem; color: #4b5563; margin-bottom: 12px; }}
    .meta code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }}
    .meta strong {{ color: #1f2937; }}
    .deps {{ display: flex; gap: 32px; font-size: 0.85rem; margin: 8px 0 16px; }}
    .deps .col {{ flex: 1; }}
    .deps .col strong {{ display: block; margin-bottom: 4px; color: #1f2937; }}
    .deps code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }}
    .mermaid {{ background: #fafafa; padding: 16px; border-radius: 6px;
                border: 1px solid #e5e7eb; overflow: auto; }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({{ startOnLoad: true, theme: 'default',
                                flowchart: {{ htmlLabels: true, curve: 'basis' }} }});</script>
</head>
<body>
  <h1>{focus} — neighborhood</h1>
  <div class="meta">
    <strong>Path:</strong> <code>{m.get('path', '?')}</code> ·
    <strong>Files:</strong> {m.get('fileCount', 0)} ({m.get('testFileCount', 0)} tests) ·
    <strong>{len(stats['deps_in'])}</strong> imports this · imports <strong>{len(stats['deps_out'])}</strong>
  </div>
  <div class="deps">
    <div class="col"><strong>Imported by ({len(stats['deps_in'])})</strong>{deps_in_html}</div>
    <div class="col"><strong>Imports from ({len(stats['deps_out'])})</strong>{deps_out_html}</div>
  </div>
  <pre class="mermaid">
{mermaid}
  </pre>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Per-module neighborhood Mermaid diagrams.',
    )
    parser.add_argument('package', help='Package name (backend, frontend, cli)')
    parser.add_argument(
        '--module',
        default=None,
        help='Generate just one module (default: all modules in the package).',
    )
    parser.add_argument(
        '--include-entry',
        action='store_true',
        help=(
            f'Keep entry-point modules ({", ".join(DEFAULT_ENTRY_EXCLUDES)}) '
            'in the diagrams. Default: drop them.'
        ),
    )
    parser.add_argument(
        '--include-infra',
        action='store_true',
        help=(
            f'Keep infrastructure modules ({", ".join(DEFAULT_INFRA)}). '
            'Default: drop them so the neighborhood shows feature-to-feature flow.'
        ),
    )
    args = parser.parse_args()

    mapper_json = REPO_ROOT / 'agents' / 'data' / 'codebase-map' / f'{args.package}.json'
    if not mapper_json.is_file():
        sys.exit(
            f'no mapper JSON at {mapper_json}.\n'
            f'Regenerate with:\n'
            f'  node agents/packages/mapper/dist/index.js --no-with-llm --json '
            f'--package={args.package} --repo-root {REPO_ROOT}'
        )
    mapper = json.load(mapper_json.open())
    modules_by_id = {m['id']: m for m in mapper['modules'] if m.get('fileCount', 0) > 0}

    drop: set[str] = set()
    if not args.include_entry:
        drop |= set(DEFAULT_ENTRY_EXCLUDES)
    if not args.include_infra:
        drop |= set(DEFAULT_INFRA)

    # Target list: either one module or all non-dropped modules.
    if args.module:
        if args.module not in modules_by_id:
            sys.exit(f'no module "{args.module}" in {args.package}')
        targets = [args.module]
    else:
        targets = [mid for mid in modules_by_id if mid not in drop]

    wrote = 0
    for mid in targets:
        mermaid, stats = build_neighborhood(mid, modules_by_id, drop)
        out_dir = REPO_ROOT / 'agents' / 'data' / 'knowledge-graphs' / mid
        out_dir.mkdir(parents=True, exist_ok=True)
        md_path = out_dir / 'MODULE_NEIGHBORHOOD.md'
        html_path = out_dir / 'MODULE_NEIGHBORHOOD.html'
        md_path.write_text(build_md(mermaid, stats, args.package))
        html_path.write_text(build_html(mermaid, stats, args.package))
        wrote += 1
        print(f'wrote {md_path.relative_to(REPO_ROOT)} (and .html)')

    print(f'\n{wrote} neighborhood diagram(s) written.')


if __name__ == '__main__':
    main()
