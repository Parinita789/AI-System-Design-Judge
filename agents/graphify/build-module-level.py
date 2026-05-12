#!/usr/bin/env python3
"""
Build a module-level graph from the mapper's structural JSON output.

This is a different abstraction layer than `flatten.py`:
  - flatten.py:        symbol-level graph (graphify's output)
                       → file-level subset
                       → high-level (behavioral files only)
  - build-module-level.py: per-module summary (mapper's output)
                       → ONE node per module
                       → edges = cross-module imports (rich layer
                         the per-module graphify extracts can't see)

The result is a tiny graphify-format graph.json that renders cleanly
as a tree showing how modules in a package relate to each other.

Usage:
  agents/graphify/build-module-level.py <mapper-json> <out-dir>
    e.g. agents/graphify/build-module-level.py \\
            agents/codebase-map/backend.json \\
            agents/graphify/backend-module-level
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


def build_graph(mapper_data: dict) -> dict:
    """Convert mapper JSON → graphify-format graph.json."""
    pkg = mapper_data['package']
    modules = mapper_data['modules']

    nodes = []
    for m in modules:
        # Skip empty modules (no source files) — they pollute the
        # view with leaf nodes that have nothing in them.
        if m.get('fileCount', 0) == 0:
            continue
        nodes.append({
            'id': f'{pkg}::{m["id"]}',
            'label': m['id'],
            'file_type': 'module',
            'source_file': m['path'],
            'source_location': '',
            'norm_label': m['id'].lower(),
            'repo': pkg,
            'local_id': m['id'],
            # Decorate with file count so the tree HTML's count
            # column is meaningful.
            'file_count': m.get('fileCount', 0),
            'test_count': m.get('testFileCount', 0),
        })

    valid_ids = {m['id'] for m in modules if m.get('fileCount', 0) > 0}
    links = []
    for m in modules:
        if m.get('fileCount', 0) == 0:
            continue
        src = f'{pkg}::{m["id"]}'
        for dep in m.get('internalDepsOut', []):
            if dep not in valid_ids:
                continue
            links.append({
                'source': src,
                'target': f'{pkg}::{dep}',
                'weight': 1,
            })

    return {
        'directed': True,
        'multigraph': False,
        'graph': {'name': f'{pkg} module-level'},
        'nodes': nodes,
        'links': links,
    }


def run_tree(graph_path: Path, output_html: Path, label: str) -> None:
    cmd = [
        'graphify', 'tree',
        '--graph', str(graph_path),
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
    if result.stdout.strip():
        print(result.stdout.strip())


# Mirror flatten.py's style-override so the HTML matches the rest
# of the agents/graphify/ outputs.
STYLE_OVERRIDE = """
    <style>
      /* build-module-level.py — smaller header + controls for more graph room */
      h1 { font-size: 1rem !important; margin: 8px 0 0 16px !important; font-weight: 600 !important; }
      .controls { margin: 6px 0 8px 16px !important; }
      button { padding: 3px 10px !important; font-size: 0.8rem !important; margin-right: 6px !important; }
    </style>"""


def apply_style_overrides(html_path: Path) -> None:
    text = html_path.read_text()
    if 'build-module-level.py' in text:
        return
    if '</head>' not in text:
        return
    text = text.replace('</head>', f'{STYLE_OVERRIDE}\n  </head>', 1)
    html_path.write_text(text)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Render the mapper\'s per-module data as a module-level graphify tree.',
    )
    parser.add_argument(
        'mapper_json',
        type=Path,
        help='Path to mapper output (e.g. agents/codebase-map/backend.json)',
    )
    parser.add_argument(
        'out_dir',
        type=Path,
        help='Output directory (will create graphify-out/ inside)',
    )
    args = parser.parse_args()

    if not args.mapper_json.is_file():
        sys.stderr.write(f'no mapper JSON at {args.mapper_json}\n')
        sys.exit(1)

    mapper = json.load(args.mapper_json.open())
    g = build_graph(mapper)

    graphify_out = args.out_dir / 'graphify-out'
    graphify_out.mkdir(parents=True, exist_ok=True)
    graph_json = graphify_out / 'graph.json'
    output_html = graphify_out / 'GRAPH_TREE_module-level.html'

    json.dump(g, graph_json.open('w'), indent=2)
    print(f'wrote {graph_json} ({len(g["nodes"])} nodes, {len(g["links"])} edges)')

    label = f'{mapper["package"]} (module-level)'
    run_tree(graph_json, output_html, label)
    apply_style_overrides(output_html)


if __name__ == '__main__':
    main()
