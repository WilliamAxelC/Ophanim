import React, { useState } from 'react';
import { Copy, Check, Terminal, Table as TableIcon } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content }) => {
  // Parse blocks: code blocks vs standard text/markdown blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-xs font-mono leading-relaxed select-text">
      {parts.map((part, index) => {
        if (part.startsWith('```') && part.endsWith('```')) {
          const lines = part.slice(3, -3).trim().split('\n');
          const firstLine = lines[0].trim();
          const hasLang = /^[a-zA-Z0-9_-]+$/.test(firstLine);
          const language = hasLang ? firstLine : 'text';
          const codeContent = hasLang ? lines.slice(1).join('\n') : lines.join('\n');

          return (
            <CodeBlock key={index} code={codeContent} language={language} />
          );
        }

        return <FormattedParagraph key={index} text={part} />;
      })}
    </div>
  );
};

const CodeBlock: React.FC<{ code: string; language: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl overflow-hidden border border-border bg-surfaceLight/90 shadow-sm">
      <div className="flex items-center justify-between px-3 py-1.5 bg-inset/80 border-b border-border text-[10px] font-mono text-muted">
        <div className="flex items-center space-x-1.5">
          <Terminal className="w-3 h-3 text-gold" />
          <span className="uppercase font-bold tracking-wider text-sepia">{language}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 hover:text-ink text-muted transition-colors px-1.5 py-0.5 rounded bg-surface border border-border"
          title="Copy code"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald" />
              <span className="text-emerald font-bold">COPIED</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>COPY</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-ink leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
};

interface TableData {
  headers: string[];
  alignments: ('left' | 'center' | 'right')[];
  rows: string[][];
}

function parseTableRow(line: string): string[] {
  let cleaned = line.trim();
  if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
  return cleaned.split('|').map((cell) => cell.trim());
}

function isTableDelimiter(line: string): boolean {
  const cleaned = line.trim();
  if (!cleaned.includes('-')) return false;
  const cells = parseTableRow(cleaned);
  if (cells.length === 0) return false;
  return cells.every((c) => /^:?-+:?$/.test(c));
}

function getAlignments(delimiterLine: string): ('left' | 'center' | 'right')[] {
  const cells = parseTableRow(delimiterLine);
  return cells.map((c) => {
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

const TableBlock: React.FC<{ table: TableData }> = ({ table }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const headerLine = table.headers.join('\t');
    const rowLines = table.rows.map((r) => r.join('\t')).join('\n');
    navigator.clipboard.writeText(`${headerLine}\n${rowLines}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl overflow-hidden border border-border/80 bg-surfaceLight/80 shadow-xs">
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-inset/80 border-b border-border text-[10px] font-mono text-muted">
        <div className="flex items-center space-x-1.5">
          <TableIcon className="w-3.5 h-3.5 text-gold" />
          <span className="font-serif font-bold text-ink uppercase tracking-wider">
            Tabular Telemetry ({table.rows.length} rows)
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 hover:text-ink text-muted transition-colors px-2 py-0.5 rounded-lg bg-surface border border-border text-[10px] font-mono font-bold"
          title="Copy table as TSV / CSV"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald" />
              <span className="text-emerald font-bold">COPIED</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>COPY TABLE</span>
            </>
          )}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead className="bg-surfaceLight/95 border-b border-border text-muted font-serif uppercase text-[10px] tracking-wider font-bold">
            <tr>
              {table.headers.map((h, hIdx) => {
                const align = table.alignments[hIdx] || 'left';
                return (
                  <th
                    key={hIdx}
                    className={`py-2.5 px-3.5 whitespace-nowrap text-sepia ${
                      align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {renderInline(h)}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {table.rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-gold/5 transition-colors">
                {row.map((cell, cIdx) => {
                  const align = table.alignments[cIdx] || 'left';
                  return (
                    <td
                      key={cIdx}
                      className={`py-2 px-3.5 text-ink whitespace-nowrap text-[11px] ${
                        align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {renderInline(cell)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const FormattedParagraph: React.FC<{ text: string }> = ({ text }) => {
  const lines = text.split('\n');

  // Parse lines into structured blocks (paragraphs, lists, headers, and markdown tables)
  type BlockItem =
    | { type: 'table'; table: TableData; key: number }
    | { type: 'header'; level: number; text: string; key: number }
    | { type: 'bullet'; text: string; key: number }
    | { type: 'number'; num: string; text: string; key: number }
    | { type: 'quote'; text: string; key: number }
    | { type: 'empty'; key: number }
    | { type: 'line'; text: string; key: number };

  const blocks: BlockItem[] = [];
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    // Check if start of a Markdown Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
      const headers = parseTableRow(trimmed);
      const alignments = getAlignments(lines[i + 1]);
      const rows: string[][] = [];
      let j = i + 2;

      while (j < lines.length) {
        const rowTrimmed = lines[j].trim();
        if (!rowTrimmed || !rowTrimmed.includes('|')) break;
        rows.push(parseTableRow(rowTrimmed));
        j++;
      }

      blocks.push({
        type: 'table',
        table: { headers, alignments, rows },
        key: i,
      });
      i = j;
      continue;
    }

    if (!trimmed) {
      blocks.push({ type: 'empty', key: i });
      i++;
      continue;
    }

    if (trimmed.startsWith('### ') || trimmed.startsWith('#### ')) {
      blocks.push({
        type: 'header',
        level: 3,
        text: trimmed.replace(/^#{3,4}\s+/, ''),
        key: i,
      });
      i++;
      continue;
    }

    if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
      blocks.push({
        type: 'header',
        level: 1,
        text: trimmed.replace(/^#{1,2}\s+/, ''),
        key: i,
      });
      i++;
      continue;
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({
        type: 'bullet',
        text: trimmed.slice(2),
        key: i,
      });
      i++;
      continue;
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) {
      blocks.push({
        type: 'number',
        num: numMatch[1],
        text: numMatch[2],
        key: i,
      });
      i++;
      continue;
    }

    if (trimmed.startsWith('> ')) {
      blocks.push({
        type: 'quote',
        text: trimmed.slice(2),
        key: i,
      });
      i++;
      continue;
    }

    blocks.push({
      type: 'line',
      text: rawLine,
      key: i,
    });
    i++;
  }

  return (
    <div className="space-y-1.5">
      {blocks.map((block) => {
        switch (block.type) {
          case 'table':
            return <TableBlock key={block.key} table={block.table} />;
          case 'empty':
            return <div key={block.key} className="h-1" />;
          case 'header':
            return block.level >= 3 ? (
              <div key={block.key} className="font-serif font-bold text-xs pt-1.5 text-gold">
                {renderInline(block.text)}
              </div>
            ) : (
              <div key={block.key} className="font-serif font-bold text-xs pt-2 text-gold border-b border-border/50 pb-0.5">
                {renderInline(block.text)}
              </div>
            );
          case 'bullet':
            return (
              <div key={block.key} className="flex items-start space-x-2 pl-2">
                <span className="text-gold font-bold leading-none select-none mt-1">•</span>
                <span className="flex-1 text-ink">{renderInline(block.text)}</span>
              </div>
            );
          case 'number':
            return (
              <div key={block.key} className="flex items-start space-x-2 pl-2">
                <span className="text-gold font-bold select-none text-[10px] mt-0.5">{block.num}.</span>
                <span className="flex-1 text-ink">{renderInline(block.text)}</span>
              </div>
            );
          case 'quote':
            return (
              <div key={block.key} className="border-l-2 border-gold/60 pl-3 py-1 bg-surfaceLight/50 text-sepia italic rounded-r-lg my-1">
                {renderInline(block.text)}
              </div>
            );
          case 'line':
            return (
              <p key={block.key} className="text-ink">
                {renderInline(block.text)}
              </p>
            );
        }
      })}
    </div>
  );
};

// Render bold, italics, inline code, and links
function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);

  return tokens.map((token, i) => {
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code key={i} className="px-1.5 py-0.5 rounded bg-inset border border-border text-gold font-mono text-[11px] font-bold">
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={i} className="font-bold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={i} className="italic text-sepia">
          {token.slice(1, -1)}
        </em>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a 
          key={i} 
          href={linkMatch[2]} 
          target="_blank" 
          rel="noopener noreferrer" 
          className="text-lapis hover:text-lapis/80 underline font-semibold"
        >
          {linkMatch[1]}
        </a>
      );
    }

    return token;
  });
}
