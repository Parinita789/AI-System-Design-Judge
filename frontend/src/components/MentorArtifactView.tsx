import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { MentorArtifact } from '@/types/mentor';

// The mentor artifact arrives as one Markdown blob with `##` section
// headers. We split it on `^## ` boundaries so each section becomes a
// collapsible disclosure. All sections start collapsed — click a header
// to expand, or use the toggle in the corner.
export function MentorArtifactView({ artifact }: { artifact: MentorArtifact }) {
  const sections = useMemo(() => splitMarkdownSections(artifact.content), [artifact.content]);
  const [openSet, setOpenSet] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setOpenSet((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const expandAll = () => setOpenSet(new Set(sections.map((_, i) => i)));
  const collapseAll = () => setOpenSet(new Set());

  if (sections.length === 0) {
    // Defensive: if the LLM produced output without any `##` section
    // headers, fall back to rendering the whole blob as Markdown.
    return (
      <article className="prose prose-sm max-w-none">
        <ReactMarkdown components={MARKDOWN_COMPONENTS}>{artifact.content}</ReactMarkdown>
      </article>
    );
  }

  const allOpen = openSet.size === sections.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider font-semibold text-gray-500">
          {sections.length} sections
        </span>
        <button
          type="button"
          onClick={allOpen ? collapseAll : expandAll}
          className="text-[11px] text-indigo-700 hover:underline"
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="space-y-1.5">
        {sections.map((s, i) => (
          <CollapsibleSection
            key={i}
            index={i + 1}
            title={s.title}
            isOpen={openSet.has(i)}
            onToggle={() => toggle(i)}
            body={s.body}
          />
        ))}
      </div>
    </div>
  );
}

function CollapsibleSection({
  index,
  title,
  isOpen,
  onToggle,
  body,
}: {
  index: number;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  body: string;
}) {
  return (
    <section
      className={`rounded border ${
        isOpen ? 'border-indigo-200' : 'border-slate-200'
      } bg-white overflow-hidden transition-colors`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className={`w-full flex items-center gap-2 text-left px-3 py-2 text-sm font-medium ${
          isOpen
            ? 'bg-indigo-50 text-indigo-900'
            : 'text-gray-800 hover:bg-gray-50'
        }`}
      >
        <span
          className={`inline-block transition-transform text-gray-500 ${
            isOpen ? 'rotate-90' : ''
          }`}
          aria-hidden="true"
        >
          ▶
        </span>
        <span className="text-[11px] font-semibold text-gray-400 tabular-nums">
          {String(index).padStart(2, '0')}
        </span>
        <span className="flex-1">{title}</span>
      </button>
      {isOpen && (
        <div className="px-4 py-3 border-t border-gray-200">
          <article className="prose prose-sm max-w-none">
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>{body}</ReactMarkdown>
          </article>
        </div>
      )}
    </section>
  );
}

// react-markdown component overrides for Tailwind-friendly rendering.
const MARKDOWN_COMPONENTS = {
  // Demote inner ## headings (rare, since the body has the section's
  // header already split out) to a smaller weight so they don't compete
  // with the disclosure header.
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="text-sm font-semibold mt-4 mb-2 text-gray-900">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="text-sm font-semibold mt-3 mb-2 text-gray-900">{children}</h3>
  ),
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="text-sm leading-relaxed mb-3 text-gray-800">{children}</p>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="border-l-2 border-gray-400 bg-gray-50 px-3 py-2 my-3 text-sm italic text-gray-700">
      {children}
    </blockquote>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-gray-800">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-gray-800">{children}</ol>
  ),
  li: ({ children }: { children?: React.ReactNode }) => (
    <li className="text-sm leading-relaxed">{children}</li>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }: { children?: React.ReactNode }) => <em className="italic">{children}</em>,
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">{children}</code>
  ),
};

// Split a Markdown document on top-level `## ` headings. Returns one
// entry per section. Anything before the first `##` becomes an
// "Overview" pseudo-section so we don't drop preamble text.
function splitMarkdownSections(md: string): Array<{ title: string; body: string }> {
  const lines = md.split('\n');
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  const preamble: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (current) sections.push(current);
      current = { title: line.replace(/^##\s+/, '').trim(), body: [] };
    } else if (current) {
      current.body.push(line);
    } else {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);

  const result: Array<{ title: string; body: string }> = [];
  const preambleText = preamble.join('\n').trim();
  if (preambleText) {
    result.push({ title: 'Overview', body: preambleText });
  }
  for (const s of sections) {
    result.push({ title: s.title, body: s.body.join('\n').trim() });
  }
  return result;
}
