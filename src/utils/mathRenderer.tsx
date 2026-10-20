import React from 'react';
import katex from 'katex';

interface MathTextProps {
  text: string;
  className?: string;
}

/**
 * Renders Vietnamese text mixed with LaTeX math expressions ($...$ or $$...$$ or \(...\))
 */
export const MathText: React.FC<MathTextProps> = ({ text, className = '' }) => {
  if (!text) return null;

  // Match $$...$$, $...$, \[...\], \(...\)
  const tokenRegex = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\))/g;
  const parts = text.split(tokenRegex);

  return (
    <span className={`leading-relaxed break-words ${className}`}>
      {parts.map((part, index) => {
        if (!part) return null;

        const isDisplayDoubleDollar = part.startsWith('$$') && part.endsWith('$$');
        const isDisplayBracket = part.startsWith('\\[') && part.endsWith('\\]');
        const isInlineDollar =
          !isDisplayDoubleDollar && part.startsWith('$') && part.endsWith('$');
        const isInlineParen = part.startsWith('\\(') && part.endsWith('\\)');

        if (
          isDisplayDoubleDollar ||
          isDisplayBracket ||
          isInlineDollar ||
          isInlineParen
        ) {
          const displayMode = isDisplayDoubleDollar || isDisplayBracket;
          const rawFormula =
            isDisplayDoubleDollar || isDisplayBracket || isInlineParen
              ? part.slice(2, -2)
              : part.slice(1, -1);

          try {
            const html = katex.renderToString(rawFormula.trim(), {
              displayMode,
              throwOnError: false,
              strict: false,
            });
            return (
              <span
                key={index}
                className={displayMode ? 'block my-2 overflow-x-auto' : 'inline-block mx-0.5'}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            );
          } catch {
            return (
              <code
                key={index}
                className="px-1 py-0.5 bg-slate-100 text-slate-800 rounded text-sm font-mono"
              >
                {part}
              </code>
            );
          }
        }

        // Preserve line breaks in regular text
        const lines = part.split('\n');
        return (
          <React.Fragment key={index}>
            {lines.map((line, lineIdx) => (
              <React.Fragment key={lineIdx}>
                {line}
                {lineIdx < lines.length - 1 && <br />}
              </React.Fragment>
            ))}
          </React.Fragment>
        );
      })}
    </span>
  );
};
