"use client";

import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { Moon, Search, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../providers/auth";
import { useTheme } from "../providers/theme";
import { NAV } from "./nav";

interface TitleHit {
  id: number;
  title: string;
  type: string;
  year: number | null;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const { can } = useAuth();
  const { resolved, setMode } = useTheme();
  const [query, setQuery] = useState("");
  const [titles, setTitles] = useState<TitleHit[]>([]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setTitles([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      const { data } = await api
        .GET("/api/v1/admin/titles", { params: { query: { search: query.trim(), page_size: 6 } }, signal: controller.signal })
        .catch(() => ({ data: undefined }));
      setTitles((data?.results as TitleHit[] | undefined) ?? []);
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open]);

  const go = (href: string) => {
    onOpenChange(false);
    setQuery("");
    router.push(href);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[150] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content className="fixed left-1/2 top-[14vh] z-[151] w-[min(620px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-panel shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command shouldFilter label="Command palette" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-subtle">
            <div className="flex items-center gap-2 border-b border-line px-3.5">
              <Search className="size-4 text-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a page or search titles…"
                className="h-12 flex-1 bg-transparent text-[14px] outline-none placeholder:text-subtle"
              />
              <kbd className="rounded border border-line px-1.5 text-[11px] text-subtle">esc</kbd>
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-8 text-center text-[13px] text-muted">No results.</Command.Empty>
              {titles.length > 0 && (
                <Command.Group heading="Titles">
                  {titles.map((t) => (
                    <Item key={t.id} value={`title ${t.title} ${t.id}`} onSelect={() => go(`/titles/${t.id}`)}>
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto text-[12px] text-subtle">{t.type} {t.year ?? ""}</span>
                    </Item>
                  ))}
                </Command.Group>
              )}
              {NAV.map((group) => (
                <Command.Group key={group.section} heading={group.section}>
                  {group.items
                    .filter((i) => !i.roles || can(...i.roles))
                    .map((item) => (
                      <Item key={item.href} value={item.label} onSelect={() => go(item.href)}>
                        <item.icon className="size-4 text-subtle" />
                        {item.label}
                      </Item>
                    ))}
                </Command.Group>
              ))}
              <Command.Group heading="Actions">
                <Item value="new title create" onSelect={() => go("/titles/new")}>New title</Item>
                <Item value="toggle theme dark light" onSelect={() => setMode(resolved === "dark" ? "light" : "dark")}>
                  {resolved === "dark" ? <Sun className="size-4 text-subtle" /> : <Moon className="size-4 text-subtle" />}
                  Switch to {resolved === "dark" ? "light" : "dark"} mode
                </Item>
              </Command.Group>
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Item({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px] data-[selected=true]:bg-hover"
    >
      {children}
    </Command.Item>
  );
}
