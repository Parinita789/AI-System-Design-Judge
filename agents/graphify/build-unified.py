#!/usr/bin/env python3
"""
Build a single unified tree showing every module's files (high-level
or file-level) across a whole package, with cross-module edges
sourced from the mapper.

This is the "everything in one place" view. Hierarchy:
    <package>
      <module>
        <file>.module.ts
        <file>.service.ts
        agents/<file>.agent.ts        # subdirs preserved
        ...
      <other-module>
        ...

Cross-module dependency edges are added between each module's
`*.module.ts` files using the mapper's internalDepsOut data. Modules
without a `.module.ts` are connected via the first node found.

Usage:
  agents/graphify/build-unified.py <package> [--level=high|file]

Examples:
  agents/graphify/build-unified.py backend
  agents/graphify/build-unified.py backend --level=file
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]


def find_module_files(repo_root: Path, package: str) -> list[str]:
    """List per-module subdirs that have a graph for this level."""
    base = repo_root / 'agents' / 'graphify'
    return sorted(
        d.name for d in base.iterdir()
        if d.is_dir()
        and not d.name.startswith('_')
        and not d.name.endswith('-module-level')
        and d.name not in ('backend-all',)
        and (d / 'graphify-out' / 'graph.json').is_file()
    )


def load_per_module(repo_root: Path, module: str, level: str) -> dict | None:
    """Load <module>'s graph.<level>-level.json if it exists."""
    path = repo_root / 'agents' / 'graphify' / module / 'graphify-out' / f'graph.{level}-level.json'
    if not path.is_file():
        return None
    return json.load(path.open())


def pick_module_anchor(nodes: list[dict], module: str) -> dict | None:
    """Pick a representative node for cross-module edges. Prefer the
    *.module.ts file; fall back to the first node otherwise."""
    for n in nodes:
        if n['label'].endswith('.module.ts'):
            return n
    return nodes[0] if nodes else None


def build_unified(repo_root: Path, package: str, level: str) -> dict:
    mapper_path = repo_root / 'agents' / 'codebase-map' / f'{package}.json'
    if not mapper_path.is_file():
        sys.exit(
            f'no mapper JSON at {mapper_path}.\n'
            f'Regenerate with:\n'
            f'  node agents/mapper/dist/index.js --no-with-llm --json '
            f'--package={package} --repo-root {repo_root}'
        )
    mapper = json.load(mapper_path.open())
    modules_meta = {m['id']: m for m in mapper['modules']}

    modules = find_module_files(repo_root, package)

    all_nodes: list[dict] = []
    all_links: list[dict] = []
    # Per-module anchor node (the file we attach cross-module edges to).
    anchors: dict[str, str] = {}

    for module in modules:
        if module not in modules_meta:
            continue
        g = load_per_module(repo_root, module, level)
        if g is None:
            continue
        # Re-prefix node IDs and source_file paths so the merged graph
        # has a stable per-module namespace and graphify's tree groups
        # everything under <module>/.
        new_nodes = []
        id_remap: dict[str, str] = {}
        for n in g['nodes']:
            new_id = f'{module}::{n["id"]}'
            id_remap[n['id']] = new_id
            new_nodes.append({
                **n,
                'id': new_id,
                'source_file': f'{module}/{n["source_file"]}',
                'repo': module,
                'local_id': n['id'],
            })
        all_nodes.extend(new_nodes)
        anchor = pick_module_anchor(new_nodes, module)
        if anchor:
            anchors[module] = anchor['id']
        # Keep intra-module edges.
        for e in g.get('links', []):
            s = id_remap.get(e['source'])
            t = id_remap.get(e['target'])
            if s and t:
                all_links.append({
                    'source': s,
                    'target': t,
                    'weight': e.get('weight', 1),
                })

    # Add cross-module edges from mapper's internalDepsOut: each
    # A → B link in the mapper becomes anchor(A) → anchor(B).
    for module_id, meta in modules_meta.items():
        if module_id not in anchors:
            continue
        src_anchor = anchors[module_id]
        for dep in meta.get('internalDepsOut', []):
            tgt_anchor = anchors.get(dep)
            if not tgt_anchor:
                continue
            all_links.append({
                'source': src_anchor,
                'target': tgt_anchor,
                'weight': 2,  # heavier so cross-module ties stand out
                'cross_module': True,
            })

    return {
        'directed': True,
        'multigraph': False,
        'graph': {'name': f'{package} unified ({level}-level)'},
        'nodes': all_nodes,
        'links': all_links,
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


STYLE_OVERRIDE = """
    <style>
      /* build-unified.py — smaller header + controls for more graph room */
      h1 { font-size: 1rem !important; margin: 8px 0 0 16px !important; font-weight: 600 !important; }
      .controls { margin: 6px 0 8px 16px !important; }
      button { padding: 3px 10px !important; font-size: 0.8rem !important; margin-right: 6px !important; }
    </style>"""


def apply_style_overrides(html_path: Path) -> None:
    text = html_path.read_text()
    if 'build-unified.py' in text:
        return
    if '</head>' not in text:
        return
    text = text.replace('</head>', f'{STYLE_OVERRIDE}\n  </head>', 1)
    html_path.write_text(text)


def main() -> None:
    parser = argparse.ArgumentParser(
        description='Build a unified per-package tree across all per-module graphs.',
    )
    parser.add_argument('package', help='Package name (backend, frontend, cli)')
    parser.add_argument(
        '--level',
        choices=('high', 'file'),
        default='high',
        help='Granularity inside each module (default: high)',
    )
    args = parser.parse_args()

    g = build_unified(REPO_ROOT, args.package, args.level)
    out_dir = REPO_ROOT / 'agents' / 'graphify' / f'{args.package}-unified'
    graphify_out = out_dir / 'graphify-out'
    graphify_out.mkdir(parents=True, exist_ok=True)

    graph_json = graphify_out / 'graph.json'
    output_html = graphify_out / f'GRAPH_TREE_unified-{args.level}.html'

    json.dump(g, graph_json.open('w'), indent=2)
    print(f'wrote {graph_json} ({len(g["nodes"])} nodes, {len(g["links"])} edges)')

    label = f'{args.package} unified ({args.level}-level)'
    run_tree(graph_json, output_html, label)
    apply_style_overrides(output_html)


if __name__ == '__main__':
    main()
