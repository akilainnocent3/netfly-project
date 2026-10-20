import { Fragment } from "react";

/** Minimal, safe Markdown (headings, paragraphs, lists, bold, links). No raw HTML. */
export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-4 leading-relaxed text-fg/90">
      {blocks.map((block, i) => {
        const heading = /^(#{1,3})\s+(.*)$/.exec(block);
        if (heading) {
          const level = heading[1]!.length;
          const cls = level === 1 ? "mt-4 text-4xl font-bold" : level === 2 ? "mt-6 text-2xl font-semibold" : "mt-4 text-xl font-semibold";
          const Tag = (`h${level}` as "h1" | "h2" | "h3");
          return <Tag key={i} className={cls}>{inline(heading[2]!)}</Tag>;
        }
        if (/^[-*]\s/.test(block)) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-6">
              {block.split("\n").map((line, j) => <li key={j}>{inline(line.replace(/^[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return <p key={i}>{inline(block)}</p>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g);
  return parts.map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part);
    if (bold) return <strong key={i}>{bold[1]}</strong>;
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (link && /^(https?:\/\/|\/)/.test(link[2]!)) {
      return <a key={i} href={link[2]} className="text-accent underline" rel="noopener noreferrer">{link[1]}</a>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}
