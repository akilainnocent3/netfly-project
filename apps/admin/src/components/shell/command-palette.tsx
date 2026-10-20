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

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
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
        .GET("/api/v1/admin/titles", {
          params: { query: { search: query.trim(), page_size: 6 } },
          signal: controller.signal,
        })
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
        <Dialog.Content className="border-line bg-panel fixed top-[14vh] left-1/2 z-[151] w-[min(620px,92vw)] -translate-x-1/2 overflow-hidden rounded-xl border shadow-2xl">
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Command
            shouldFilter
            label="Command palette"
            className="[&_[cmdk-group-heading]]:text-subtle [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:uppercase"
          >
            <div className="border-line flex items-center gap-2 border-b px-3.5">
              <Search className="text-subtle size-4" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder="Jump to a page or search titles…"
                className="placeholder:text-subtle h-12 flex-1 bg-transparent text-[14px] outline-none"
              />
              <kbd className="border-line text-subtle rounded border px-1.5 text-[11px]">esc</kbd>
            </div>
            <Command.List className="max-h-[360px] overflow-y-auto p-1.5">
              <Command.Empty className="text-muted px-3 py-8 text-center text-[13px]">
                No results.
              </Command.Empty>
              {titles.length > 0 && (
                <Command.Group heading="Titles">
                  {titles.map((t) => (
                    <Item
                      key={t.id}
                      value={`title ${t.title} ${t.id}`}
                      onSelect={() => go(`/titles/${t.id}`)}
                    >
                      <span className="truncate">{t.title}</span>
                      <span className="text-subtle ml-auto text-[12px]">
                        {t.type} {t.year ?? ""}
                      </span>
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
                        <item.icon className="text-subtle size-4" />
                        {item.label}
                      </Item>
                    ))}
                </Command.Group>
              ))}
              <Command.Group heading="Actions">
                <Item value="new title create" onSelect={() => go("/titles/new")}>
                  New title
                </Item>
                <Item
                  value="toggle theme dark light"
                  onSelect={() => setMode(resolved === "dark" ? "light" : "dark")}
                >
                  {resolved === "dark" ? (
                    <Sun className="text-subtle size-4" />
                  ) : (
                    <Moon className="text-subtle size-4" />
                  )}
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

function Item({
  children,
  value,
  onSelect,
}: {
  children: React.ReactNode;
  value: string;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="data-[selected=true]:bg-hover flex h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[13px]"
    >
      {children}
    </Command.Item>
  );
}
