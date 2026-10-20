"use client";

import { X } from "lucide-react";
import { useState } from "react";

export function TagInput({
  value,
  onChange,
  placeholder,
  id,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) onChange([...value, ...parts.filter((p) => !value.includes(p))]);
    setDraft("");
  };
  return (
    <div className="border-line bg-panel focus-within:border-accent focus-within:ring-accent/20 flex min-h-8 flex-wrap items-center gap-1 rounded-md border px-1.5 py-1 focus-within:ring-2">
      {value.map((tag) => (
        <span
          key={tag}
          className="bg-raised inline-flex h-6 items-center gap-1 rounded px-2 text-[12.5px]"
        >
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((t) => t !== tag))}
            className="text-subtle hover:text-fg"
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
      <input
        id={id}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? "" : placeholder}
        className="placeholder:text-subtle h-6 min-w-24 flex-1 bg-transparent px-1 text-[13px] outline-none"
      />
    </div>
  );
}
