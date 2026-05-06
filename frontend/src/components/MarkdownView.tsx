import { isValidElement, ReactNode } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { MermaidBlock } from './MermaidBlock';

function isMermaidPreChild(children: ReactNode): boolean {
  if (!isValidElement(children)) {
    if (Array.isArray(children) && children.length === 1) {
      return isMermaidPreChild(children[0]);
    }
    return false;
  }
  const props = children.props as { className?: string };
  return typeof props.className === 'string' && /\blanguage-mermaid\b/.test(props.className);
}

export const MARKDOWN_COMPONENTS: Components = {
  code: ({ className, children }) => {
    if (typeof className === 'string' && /\blanguage-mermaid\b/.test(className)) {
      const source = String(children ?? '').replace(/\n$/, '');
      return <MermaidBlock source={source} />;
    }
    if (className) {
      return (
        <code className={`${className} font-mono text-[12px]`}>
          {children}
        </code>
      );
    }
    return (
      <code className="font-mono text-[12px] bg-gray-100 px-1 py-0.5 rounded">
        {children}
      </code>
    );
  },
  pre: ({ children, ...rest }) => {
    if (isMermaidPreChild(children)) {
      return <>{children}</>;
    }
    return (
      <pre
        {...rest}
        className="rounded border border-gray-200 bg-gray-50 p-2 text-[11px] font-mono whitespace-pre-wrap overflow-x-auto my-2"
      >
        {children}
      </pre>
    );
  },
  h1: ({ children }) => (
    <h1 className="text-base font-semibold mt-4 mb-2 text-gray-900">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold mt-4 mb-2 text-gray-900">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-3 mb-2 text-gray-900">{children}</h3>
  ),
  p: ({ children }) => (
    <p className="text-sm leading-relaxed mb-3 text-gray-800">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-gray-400 bg-gray-50 px-3 py-2 my-3 text-sm italic text-gray-700">
      {children}
    </blockquote>
  ),
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-gray-800">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-gray-800">{children}</ol>
  ),
  li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
  strong: ({ children }) => (
    <strong className="font-semibold text-gray-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
};

export function MarkdownView({ markdown }: { markdown: string }) {
  return (
    <div className="text-sm text-gray-800">
      <ReactMarkdown components={MARKDOWN_COMPONENTS}>{markdown}</ReactMarkdown>
    </div>
  );
}
