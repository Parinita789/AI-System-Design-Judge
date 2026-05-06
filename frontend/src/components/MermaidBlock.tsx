import { useEffect, useId, useState } from 'react';

export function MermaidBlock({ source }: { source: string }) {
  const id = useId();
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setError(null);
    (async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({ startOnLoad: false, theme: 'default', securityLevel: 'strict' });
        const renderId = `mmd-${id.replace(/:/g, '_')}`;
        const result = await mermaid.render(renderId, source);
        if (!cancelled) setSvg(result.svg);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? 'unknown render error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  if (error) {
    return (
      <div className="my-3">
        <div className="text-[10px] text-red-700 mb-1 font-medium">
          Mermaid render error: {error}
        </div>
        <pre className="rounded border border-red-200 bg-red-50/30 p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto text-gray-700">
          {source}
        </pre>
      </div>
    );
  }
  if (!svg) {
    return (
      <pre className="my-3 rounded border border-gray-200 bg-gray-50 p-2 text-[11px] font-mono text-gray-500">
        rendering diagram…
      </pre>
    );
  }
  return (
    <div
      className="my-3 rounded border border-gray-200 bg-white p-3 overflow-x-auto"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
