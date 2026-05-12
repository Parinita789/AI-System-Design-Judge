#!/usr/bin/env python3
"""
Flatten a graphify symbol-level graph to file-level + render a tree HTML.

Background: `graphify extract` produces a graph where every TypeScript
symbol (class, function, type, const) is a node. For a module of even
modest size this puts dozens of nodes per file and produces a force-
directed `graph.html` that's unreadable. This helper:

  1. Reads `<out-dir>/graphify-out/graph.json`
  2. Keeps only "file" nodes (label ending in .ts/.tsx/.js/.jsx),
     dropping *.test.* and *.spec.* by default.
  3. Re-aggregates the symbol-level edges into file-level edges
     using each symbol's `source_file` attribute.
  4. Writes `<out-dir>/graphify-out/graph.file-level.json`.
  5. Calls `graphify tree` against that filtered graph to produce
     `<out-dir>/graphify-out/GRAPH_TREE_files.html`.

Nothing here is graphify-the-tool. The HTML rendering is still done
by `graphify tree`; this just shrinks the input it sees.

Usage:
  agents/graphify/flatten.py <out-dir>
    e.g.   agents/graphify/flatten.py agents/graphify/llm

  agents/graphify/flatten.py <out-dir> --include-tests
    keeps *.test.* and *.spec.* files in the file-level graph.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


SOURCE_EXTS = ('.ts', '.tsx', '.js', '.jsx')
TEST_RE = re.compile(r'\.(test|spec)\.(tsx?|jsx?)$')

# "High-level" suffixes: files that participate in the runtime control
# flow of a NestJS app (or this codebase's agent layer). Everything
# else — types, dto, constants, helpers, validators, prompts — is
# treated as supporting data and dropped when --high-level is set.
HIGH_LEVEL_SUFFIXES = (
    '.module.ts',
    '.controller.ts',
    '.service.ts',
    '.repository.ts',
    '.provider.ts',
    '.agent.ts',
    '.guard.ts',
    '.factory.ts',
    '.handler.ts',
)


def is_high_level(label: str) -> bool:
    return label.endswith(HIGH_LEVEL_SUFFIXES)


def flatten(
    graph_path: Path,
    out_path: Path,
    include_tests: bool,
    high_level: bool,
) -> tuple[int, int]:
    g = json.load(graph_path.open())

    file_nodes = [
        n for n in g['nodes']
        if n['label'].endswith(SOURCE_EXTS)
        and (include_tests or not TEST_RE.search(n['label']))
        and (not high_level or is_high_level(n['label']))
    ]
    keep_ids = {n['id'] for n in file_nodes}

    # Each non-file (symbol) node has a `source_file` pointing at the
    # filename it was declared in. Map symbol id -> owning file id.
    file_ids_by_path = {n['source_file']: n['id'] for n in file_nodes}
    sym_to_file: dict[str, str] = {}
    for n in g['nodes']:
        if n['id'] in keep_ids:
            continue
        owning = file_ids_by_path.get(n.get('source_file'))
        if owning:
            sym_to_file[n['id']] = owning

    # Re-aggregate edges with edge-weight = count of symbol-level edges
    # collapsed into this file-pair. Self-loops dropped (a file that
    # imports from itself = noise).
    file_edges: dict[tuple[str, str], int] = {}
    for e in g.get('links', []):
        s_raw, t_raw = e.get('source'), e.get('target')
        s = sym_to_file.get(s_raw, s_raw if s_raw in keep_ids else None)
        t = sym_to_file.get(t_raw, t_raw if t_raw in keep_ids else None)
        if s and t and s != t and s in keep_ids and t in keep_ids:
            file_edges[(s, t)] = file_edges.get((s, t), 0) + 1

    g['nodes'] = file_nodes
    g['links'] = [
        {'source': s, 'target': t, 'weight': w}
        for (s, t), w in file_edges.items()
    ]
    json.dump(g, out_path.open('w'), indent=2)
    return len(file_nodes), len(file_edges)


def run_tree(filtered_json: Path, output_html: Path, label: str) -> None:
    cmd = [
        'graphify', 'tree',
        '--graph', str(filtered_json),
        '--output', str(output_html),
        '--label', label,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        sys.stderr.write(
            f'graphify tree failed (exit {result.returncode}):\n'
            f'  stdout: {result.stdout.strip()}\n'
            f'  stderr: {result.stderr.strip()}\n'
        )
        sys.exit(result.returncode)
    # graphify tree's stdout is informational ("wrote X.html"); echo it.
    if result.stdout.strip():
        print(result.stdout.strip())
    apply_style_overrides(output_html)


# Override stylesheet appended after graphify's own CSS so it wins
# via cascade order. Shrinks the header, controls margin, and button
# padding so more of the viewport belongs to the graph itself.
STYLE_OVERRIDE = """
    <style>
      /* flatten.py — smaller header + controls so the graph has more room */
      h1 { font-size: 1rem !important; margin: 8px 0 0 16px !important; font-weight: 600 !important; }
      .controls { margin: 6px 0 8px 16px !important; }
      button { padding: 3px 10px !important; font-size: 0.8rem !important; margin-right: 6px !important; }
    </style>"""


def apply_style_overrides(html_path: Path) -> None:
    text = html_path.read_text()
    # Idempotent — running flatten.py twice in a row won't stack
    # duplicate <style> blocks.
    if 'flatten.py — smaller header' in text:
        return
    if '</head>' not in text:
        return  # unknown HTML shape; leave it alone
    text = text.replace('</head>', f'{STYLE_OVERRIDE}\n  </head>', 1)
    html_path.write_text(text)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Flatten graphify symbol-level graph to file-level + render tree HTML.',
    )
    parser.add_argument(
        'out_dir',
        type=Path,
        help='Directory containing graphify-out/ (e.g. agents/graphify/llm)',
    )
    parser.add_argument(
        '--include-tests',
        action='store_true',
        help='Keep *.test.* and *.spec.* files (default: drop them)',
    )
    parser.add_argument(
        '--high-level',
        action='store_true',
        help=(
            'Keep only behavioral files (*.module.ts, *.controller.ts, '
            '*.service.ts, *.repository.ts, *.provider.ts, *.agent.ts, '
            '*.guard.ts, *.factory.ts, *.handler.ts). Drops types, '
            'dto, constants, helpers, validators, prompts. Best for '
            'understanding the control-flow shape of a module.'
        ),
    )
    parser.add_argument(
        '--label',
        default=None,
        help='Tree HTML title (default derived from --out-dir and mode)',
    )
    args = parser.parse_args()

    graphify_out = args.out_dir / 'graphify-out'
    graph_json = graphify_out / 'graph.json'
    if not graph_json.is_file():
        sys.stderr.write(f'no graph.json at {graph_json}\n')
        sys.exit(1)

    if args.high_level:
        filtered_json = graphify_out / 'graph.high-level.json'
        output_html = graphify_out / 'GRAPH_TREE_high-level.html'
        default_label = f'{args.out_dir.name} (high-level)'
    else:
        filtered_json = graphify_out / 'graph.file-level.json'
        output_html = graphify_out / 'GRAPH_TREE_files.html'
        default_label = f'{args.out_dir.name} (file-level)'

    label = args.label or default_label

    n_nodes, n_edges = flatten(
        graph_json, filtered_json, args.include_tests, args.high_level,
    )
    print(f'wrote {filtered_json} ({n_nodes} nodes, {n_edges} edges)')

    run_tree(filtered_json, output_html, label)


if __name__ == '__main__':
    main()
