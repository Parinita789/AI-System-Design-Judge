#!/usr/bin/env python3
"""
Render a Mermaid module-relationship diagram from the mapper's JSON.

The output is a single markdown file with a mermaid code block showing
every cross-module import edge in the package. Renders inline in GitHub,
VS Code (with the mermaid extension), Obsidian, etc.

Modules are bucketed visually:
  - "leaf" (no inbound deps)
  - "hub" (>= 5 inbound deps — i.e. depended on by lots of others)
  - "entry" (synthetic _root, eval-harness, scripts)
  - everything else

Usage:
  agents/tools/graphify/build-mermaid.py <package> [--out <path>]

Examples:
  agents/tools/graphify/build-mermaid.py backend
  agents/tools/graphify/build-mermaid.py frontend --out /tmp/frontend.md
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
HUB_THRESHOLD = 5  # min inbound edges to qualify as a hub

# Dropped by default: they're Nest wiring or dev tooling, not part
# of the architectural picture. _root imports every module by design;
# eval-harness and scripts are tooling. Their fan-out is what makes
# the diagram look like spaghetti.
DEFAULT_ENTRY_EXCLUDES = ('_root', 'eval-harness', 'scripts')

# Optionally hideable: pure infrastructure modules that almost
# everything imports. database alone receives ~10 arrows; dropping
# it removes a lot of crossings without losing architectural meaning.
DEFAULT_INFRA = ('database', 'common', 'config')


def build_mermaid_block(
    mapper_data: dict,
    excludes: tuple[str, ...] = DEFAULT_ENTRY_EXCLUDES,
    hide_infra: bool = False,
    layout: str = 'LR',
) -> tuple[str, dict]:
    """Build just the mermaid flowchart block + summary stats.

    Returns (mermaid_text, stats_dict). Mermaid_text is everything
    between (and including) the leading 'flowchart LR' line and the
    trailing classDef lines — i.e. exactly what mermaid.live would
    accept. The markdown / HTML wrappers add their own framing.

    excludes: module ids dropped entirely from nodes + edges (defaults
        to entry points: _root, eval-harness, scripts).
    hide_infra: also drop database / common / config (defaults False).
        These are pure utility deps; hiding them makes the diagram
        about feature-to-feature flow.
    layout: 'LR' | 'TD' | 'BT' | 'RL' — Mermaid layout direction.
    """
    package = mapper_data['package']
    modules = [m for m in mapper_data['modules'] if m.get('fileCount', 0) > 0]

    # Apply exclusions.
    drop = set(excludes)
    if hide_infra:
        drop |= set(DEFAULT_INFRA)
    modules = [m for m in modules if m['id'] not in drop]

    inbound = {m['id']: 0 for m in modules}
    for m in modules:
        for dep in m.get('internalDepsOut', []):
            if dep in inbound:
                inbound[dep] += 1

    def bucket(m: dict) -> str:
        if m['id'] in ('_root', 'eval-harness', 'scripts'):
            return 'entry'
        if inbound[m['id']] >= HUB_THRESHOLD:
            return 'hub'
        if not m.get('internalDepsIn'):
            return 'leaf'
        return 'normal'

    buckets = {m['id']: bucket(m) for m in modules}

    def safe(mid: str) -> str:
        return mid.replace('-', '_').replace('/', '_')

    lines: list[str] = [f'flowchart {layout}']
    for m in modules:
        lines.append(f'  {safe(m["id"])}["{m["id"]}"]')
    lines.append('')
    for m in modules:
        for dep in sorted(m.get('internalDepsOut', [])):
            if dep in inbound:
                lines.append(f'  {safe(m["id"])} --> {safe(dep)}')
    lines.append('')
    lines.append('  classDef hub fill:#fef3c7,stroke:#f59e0b,stroke-width:2px;')
    lines.append('  classDef leaf fill:#dcfce7,stroke:#16a34a;')
    lines.append('  classDef entry fill:#e0e7ff,stroke:#6366f1,stroke-dasharray:4 2;')
    for cls in ('hub', 'leaf', 'entry'):
        members = [safe(m['id']) for m in modules if buckets[m['id']] == cls]
        if members:
            lines.append(f'  class {",".join(members)} {cls};')

    stats = {
        'package': package,
        'modules': modules,
        'inbound': inbound,
        'buckets': buckets,
        'total_edges': sum(len(m.get('internalDepsOut', [])) for m in modules),
        'hubs': [m['id'] for m in modules if buckets[m['id']] == 'hub'],
        'leaves': [m['id'] for m in modules if buckets[m['id']] == 'leaf'],
    }
    return '\n'.join(lines), stats


def build_mermaid(
    mapper_data: dict,
    excludes: tuple[str, ...] = DEFAULT_ENTRY_EXCLUDES,
    hide_infra: bool = False,
    layout: str = 'LR',
) -> str:
    """Markdown wrapper around the mermaid block. Renders on GitHub
    and in VS Code's markdown preview."""
    mermaid_text, stats = build_mermaid_block(
        mapper_data, excludes=excludes, hide_infra=hide_infra, layout=layout,
    )
    package = stats['package']
    modules = stats['modules']

    out: list[str] = []
    out.append(f'# {package} — module relationships')
    out.append('')
    out.append(
        f'Cross-module import graph for `{package}/`. '
        'Each box is a module, each arrow is "X imports from Y". '
        'Generated from `agents/data/codebase-map/' + package + '.json` '
        '(no LLM calls). See `agents/tools/graphify/build-mermaid.py`.'
    )
    out.append('')
    out.append(
        f'**{len(modules)} modules · {stats["total_edges"]} cross-module edges**'
    )
    if stats['hubs']:
        out.append(
            f'**Hubs (>= {HUB_THRESHOLD} inbound):** '
            + ', '.join(f'`{h}`' for h in stats['hubs'])
        )
    if stats['leaves']:
        out.append(
            f'**Leaves (no inbound):** '
            + ', '.join(f'`{leaf}`' for leaf in stats['leaves'])
        )
    out.append('')
    out.append('```mermaid')
    out.append(mermaid_text)
    out.append('```')
    out.append('')
    out.append('## Dependencies (text form)')
    out.append('')
    out.append('| Module | Depends on | Depended on by |')
    out.append('|---|---|---|')
    for m in sorted(modules, key=lambda x: x['id']):
        depsout = ', '.join(f'`{d}`' for d in m.get('internalDepsOut', [])) or '_none_'
        depsin = ', '.join(f'`{d}`' for d in m.get('internalDepsIn', [])) or '_none_'
        out.append(f'| **`{m["id"]}`** | {depsout} | {depsin} |')

    return '\n'.join(out) + '\n'


def build_mermaid_html(
    mapper_data: dict,
    excludes: tuple[str, ...] = DEFAULT_ENTRY_EXCLUDES,
    hide_infra: bool = False,
    layout: str = 'LR',
) -> str:
    """Self-contained HTML that loads Mermaid.js from a CDN and
    renders the flowchart inline. Open in any browser — no install.
    Matches the rest of agents/data/knowledge-graphs/ where output is HTML."""
    mermaid_text, stats = build_mermaid_block(
        mapper_data, excludes=excludes, hide_infra=hide_infra, layout=layout,
    )
    package = stats['package']
    # Escape characters that would break the inline script string.
    # mermaid_text is plain ASCII flowchart, so no escaping needed.
    rendered = mermaid_text
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{package} — module relationships</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            margin: 12px 24px; color: #1f2937; }}
    h1 {{ font-size: 1rem; font-weight: 600; margin: 8px 0 12px; }}
    .stats {{ font-size: 0.85rem; margin-bottom: 16px; color: #4b5563; }}
    .stats code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px;
                   font-size: 0.85rem; }}
    .mermaid {{ background: #fafafa; padding: 16px; border-radius: 6px;
                border: 1px solid #e5e7eb; overflow: auto; }}
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script>mermaid.initialize({{ startOnLoad: true, theme: 'default',
                                flowchart: {{ htmlLabels: true, curve: 'basis' }} }});</script>
</head>
<body>
  <h1>{package} — module relationships</h1>
  <div class="stats">
    <strong>{len(stats['modules'])}</strong> modules ·
    <strong>{stats['total_edges']}</strong> cross-module edges ·
    <strong>Hubs:</strong> {", ".join(f"<code>{h}</code>" for h in stats['hubs']) or '<em>none</em>'} ·
    <strong>Leaves:</strong> {", ".join(f"<code>{leaf}</code>" for leaf in stats['leaves']) or '<em>none</em>'}
  </div>
  <pre class="mermaid">
{rendered}
  </pre>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Render a Mermaid module-relationship diagram from mapper JSON.',
    )
    parser.add_argument('package', help='Package name (backend, frontend, cli)')
    parser.add_argument(
        '--out',
        type=Path,
        default=None,
        help=(
            'Output markdown path. Default: '
            'agents/data/knowledge-graphs/<package>-module-level/MODULE_RELATIONSHIPS.md'
        ),
    )
    parser.add_argument(
        '--include-entry',
        action='store_true',
        help=(
            f'Keep entry-point modules ({", ".join(DEFAULT_ENTRY_EXCLUDES)}). '
            'Dropped by default since they import every module by design '
            'and add nothing but spaghetti.'
        ),
    )
    parser.add_argument(
        '--hide-infra',
        action='store_true',
        help=(
            f'Also drop infrastructure modules ({", ".join(DEFAULT_INFRA)}). '
            'Useful when you only want feature-to-feature relationships.'
        ),
    )
    parser.add_argument(
        '--layout',
        choices=('LR', 'TD', 'BT', 'RL'),
        default='LR',
        help='Mermaid flowchart direction (default: LR — left to right).',
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
    excludes = () if args.include_entry else DEFAULT_ENTRY_EXCLUDES
    md = build_mermaid(mapper, excludes=excludes, hide_infra=args.hide_infra, layout=args.layout)
    html = build_mermaid_html(mapper, excludes=excludes, hide_infra=args.hide_infra, layout=args.layout)

    md_path = args.out or (
        REPO_ROOT / 'agents' / 'data' / 'knowledge-graphs' / f'{args.package}-module-level'
        / 'MODULE_RELATIONSHIPS.md'
    )
    html_path = md_path.with_suffix('.html')
    md_path.parent.mkdir(parents=True, exist_ok=True)
    md_path.write_text(md)
    html_path.write_text(html)
    print(f'wrote {md_path}')
    print(f'wrote {html_path}')


if __name__ == '__main__':
    main()
