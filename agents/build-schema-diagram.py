#!/usr/bin/env python3
"""
Generate a Mermaid ER diagram + HTML viewer from backend/prisma/schema.prisma.

Reads the prisma schema, extracts each `model X { ... }` block, finds
its fields + their types, and identifies relations via `@relation`
attributes. Outputs:

  agents/schema/SCHEMA_DIAGRAM.html    Mermaid erDiagram + meta
  agents/schema/schema.md              source markdown (mermaid block)

Usage:
  agents/build-schema-diagram.py
"""
from __future__ import annotations

import html
import re
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCHEMA_PATH = REPO_ROOT / 'backend' / 'prisma' / 'schema.prisma'


# Prisma scalar types we'll show. Composite/enum types are shown as-is.
SCALAR_TYPES = {
    'String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean',
    'DateTime', 'Json', 'Bytes',
}


def strip_modifiers(t: str) -> tuple[str, str]:
    """Return (base_type, modifiers) for a field type expression.
    Modifiers: '' | '?' (optional) | '[]' (list)."""
    if t.endswith('?'):
        return t[:-1], '?'
    if t.endswith('[]'):
        return t[:-2], '[]'
    return t, ''


def parse_models(text: str) -> list[dict]:
    """Return list of model dicts: { name, fields: [{name, type, mod, attrs}] }."""
    models: list[dict] = []
    # Match each `model Name { ... }` block (non-greedy body).
    for m in re.finditer(r'^model\s+(\w+)\s*\{([^}]*)\}', text, flags=re.MULTILINE):
        name = m.group(1)
        body = m.group(2)
        fields: list[dict] = []
        for line in body.splitlines():
            line = line.strip()
            if not line or line.startswith('//') or line.startswith('@@'):
                continue
            # Field line: <name> <type>[?|[]] [attrs ...]
            parts = line.split(None, 2)
            if len(parts) < 2:
                continue
            fname = parts[0]
            ftype = parts[1]
            rest = parts[2] if len(parts) > 2 else ''
            base, mod = strip_modifiers(ftype)
            fields.append({
                'name': fname,
                'type': base,
                'mod': mod,
                'attrs': rest,
                'raw': line,
            })
        models.append({'name': name, 'fields': fields})
    return models


def find_relations(models: list[dict]) -> list[tuple[str, str, str]]:
    """Identify model-to-model relations.

    Strategy: a field whose type matches another model name represents
    a relation. The shape of the edge ('one-to-many' vs 'one-to-one')
    depends on the modifier:
      - X[]  → one (parent) to many (children)
      - X?   → optional one-to-one
      - X    → required one-to-one

    Returns [(from, to, kind)] tuples for the Mermaid erDiagram.
    """
    names = {m['name'] for m in models}
    edges: list[tuple[str, str, str]] = []
    seen: set[tuple[str, str]] = set()
    for m in models:
        for f in m['fields']:
            if f['type'] not in names:
                continue
            other = f['type']
            # Determine cardinality from this side.
            kind = 'one'
            if f['mod'] == '[]':
                # m has many `other`s; emit other --< m
                pair = (other, m['name'])
                if pair in seen:
                    continue
                seen.add(pair)
                edges.append((other, m['name'], 'one_many'))
            elif f['mod'] == '?':
                pair = (m['name'], other)
                # The non-optional side is the "owner".
                if pair in seen:
                    continue
                seen.add(pair)
                edges.append((m['name'], other, 'one_one'))
            else:
                pair = (m['name'], other)
                if pair in seen:
                    continue
                seen.add(pair)
                edges.append((m['name'], other, 'one_one'))
    return edges


def sanitize_field_name(name: str) -> str:
    """Mermaid erDiagram identifiers are conservative. Strip anything
    that isn't [A-Za-z0-9_], replacing with _."""
    out = re.sub(r'[^A-Za-z0-9_]', '_', name)
    if not out:
        return '_'
    return out


def build_mermaid(models: list[dict], relations: list[tuple[str, str, str]]) -> str:
    lines: list[str] = ['erDiagram']
    # Emit entities with their scalar fields. Skip fields whose type
    # is another model (those are the relation arrows themselves).
    #
    # Mermaid grammar for a field line:
    #   <type> <name> [PK|FK|UK ...] ["comment string"]
    #
    # The type and name columns are bare identifiers — no '?', '[]',
    # spaces, etc. We move the prisma optional/array modifier into the
    # trailing comment string so it stays visible without breaking
    # Mermaid's parser.
    model_names = {m['name'] for m in models}
    for m in models:
        def field_sort_key(f: dict) -> tuple[int, str]:
            if f['name'] == 'id':
                return (0, '')
            if 'Id' in f['name']:
                return (1, f['name'])
            if f['mod'] == '':
                return (2, f['name'])
            return (3, f['name'])
        sorted_fields = sorted(m['fields'], key=field_sort_key)
        lines.append(f'  {m["name"]} {{')
        for f in sorted_fields:
            if f['type'] in model_names:
                continue  # relation field — emitted as an edge below
            ftype = sanitize_field_name(f['type'])
            fname = sanitize_field_name(f['name'])
            tag = ''
            if f['name'] == 'id' or '@id' in f['attrs']:
                tag = ' PK'
            elif f['name'].endswith('Id') and f['type'] == 'String':
                tag = ' FK'
            # Show modifier in the comment string (Mermaid renders
            # this as a quoted description after the type/name).
            comment = ''
            if f['mod'] == '?':
                comment = ' "nullable"'
            elif f['mod'] == '[]':
                comment = ' "array"'
            lines.append(f'    {ftype} {fname}{tag}{comment}')
        lines.append('  }')

    # Edges. Mermaid cardinality:
    #   A ||--o{ B : has   one A has many B
    #   A ||--|| B : has   one A has one B
    for src, dst, kind in relations:
        if kind == 'one_many':
            lines.append(f'  {src} ||--o{{ {dst} : has')
        else:
            lines.append(f'  {src} ||--|| {dst} : has')
    return '\n'.join(lines)


def build_html(mermaid: str, model_count: int, relation_count: int) -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Database schema (Prisma)</title>
  <style>
    * {{ box-sizing: border-box; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 12px 24px; color: #1f2937;
    }}
    h1 {{ font-size: 1.1rem; font-weight: 600; margin: 4px 0 8px; }}
    .meta {{ font-size: 0.85rem; color: #4b5563; margin-bottom: 14px; }}
    .meta code {{ background: #f3f4f6; padding: 1px 5px; border-radius: 3px; }}
    .viewport {{
      position: relative;
      background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px;
      height: 82vh; overflow: hidden;
    }}
    .viewport .mermaid {{ width: 100%; height: 100%; margin: 0; }}
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
  </style>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/svg-pan-zoom@3/dist/svg-pan-zoom.min.js"></script>
</head>
<body>
  <h1>Database schema</h1>
  <div class="meta">
    Source: <code>backend/prisma/schema.prisma</code> ·
    <strong>{model_count}</strong> models ·
    <strong>{relation_count}</strong> relations ·
    Generated by <code>agents/build-schema-diagram.py</code>
  </div>
  <div class="viewport" id="vp">
    <div class="vp-controls">
      <button data-act="zin"  title="Zoom in">+</button>
      <button data-act="zout" title="Zoom out">−</button>
      <button data-act="fit"  title="Fit">⤢</button>
      <button data-act="reset" title="Reset">⟲</button>
    </div>
    <div class="vp-hint">scroll or drag to pan · ⌘/Ctrl + scroll to zoom · double-click to reset</div>
    <pre class="mermaid">
{mermaid}
    </pre>
  </div>
  <script>
    mermaid.initialize({{ startOnLoad: false, theme: 'default',
                          securityLevel: 'loose',
                          er: {{ useMaxWidth: false }} }});
    (async () => {{
      const block = document.querySelector('.mermaid');
      await mermaid.run({{ nodes: [block] }});
      await new Promise(r => requestAnimationFrame(r));
      const svg = document.querySelector('.viewport svg');
      if (!svg) return;
      svg.removeAttribute('width');
      svg.removeAttribute('height');
      const pz = svgPanZoom(svg, {{
        zoomEnabled: true, controlIconsEnabled: false,
        fit: true, center: true, minZoom: 0.2, maxZoom: 8,
        dblClickZoomEnabled: false, mouseWheelZoomEnabled: false,
        preventMouseEventsDefault: true,
      }});
      svg.addEventListener('dblclick', () => pz.reset());
      svg.addEventListener('wheel', (e) => {{
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {{
          const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
          pz.zoomAtPoint(factor, {{ x: e.offsetX, y: e.offsetY }});
        }} else {{
          pz.panBy({{ x: -e.deltaX, y: -e.deltaY }});
        }}
      }}, {{ passive: false }});
      document.querySelectorAll('.vp-controls button').forEach((btn) => {{
        btn.addEventListener('click', () => {{
          const a = btn.dataset.act;
          if (a === 'zin') pz.zoomIn();
          if (a === 'zout') pz.zoomOut();
          if (a === 'fit') pz.fit();
          if (a === 'reset') pz.reset();
        }});
      }});
    }})();
  </script>
</body>
</html>
"""


def main() -> None:
    if not SCHEMA_PATH.is_file():
        raise SystemExit(f'no schema at {SCHEMA_PATH}')
    text = SCHEMA_PATH.read_text()
    models = parse_models(text)
    relations = find_relations(models)
    mermaid = build_mermaid(models, relations)
    html_text = build_html(mermaid, len(models), len(relations))

    out_dir = REPO_ROOT / 'agents' / 'schema'
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / 'SCHEMA_DIAGRAM.html').write_text(html_text)
    (out_dir / 'schema.md').write_text(
        f'# Database schema\n\nGenerated from `backend/prisma/schema.prisma`.\n\n'
        f'```mermaid\n{mermaid}\n```\n'
    )
    print(f'wrote agents/schema/SCHEMA_DIAGRAM.html ({len(models)} models, {len(relations)} relations)')
    print(f'wrote agents/schema/schema.md')


if __name__ == '__main__':
    main()
