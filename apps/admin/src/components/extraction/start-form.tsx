"use client";

import { ApiError, unwrap } from "@netfly/api-client";
import { cn } from "@netfly/ui";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Info, ScanSearch } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Input, Label, Switch } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { checkStartUrl } from "@/lib/extraction";

/**
 * Type a site address and press "Check links". Checking starts a crawl (it creates a record), so
 * it runs only on the button or Enter, never while typing (decisions 8 and 14).
 */
export function StartForm() {
  const router = useRouter();
  const toast = useToast();
  const ids = useId();
  const caps = useQuery({
    queryKey: ["extraction", "capabilities"],
    queryFn: () => unwrap(api.GET("/api/v1/admin/extraction/capabilities")),
    staleTime: 60_000,
  });
  const [url, setUrl] = useState("");
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [depth, setDepth] = useState<number | null>(null);
  const [pages, setPages] = useState<number | null>(null);
  const [sameDomain, setSameDomain] = useState(true);
  const [sameHost, setSameHost] = useState(false);
  const [renderJs, setRenderJs] = useState(false);
  const [robots, setRobots] = useState<boolean | null>(null);

  const maxDepth = caps.data?.max_depth ?? 2;
  const maxPages = caps.data?.max_pages ?? 200;
  const respectRobots = robots ?? caps.data?.respect_robots ?? true;
  const check = checkStartUrl(url);
  const shownError = serverError || (touched && check.error) || "";
  const canRender = !!caps.data?.render_js;

  const submit = async () => {
    setTouched(true);
    setServerError("");
    if (!url.trim() || check.error) {
      if (!url.trim()) setServerError("Enter the address of a site.");
      document.getElementById(`${ids}-url`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const job = await unwrap(
        api.POST("/api/v1/admin/extraction/jobs", {
          body: {
            url: url.trim(),
            options: {
              max_depth: depth ?? maxDepth,
              max_pages: pages ?? maxPages,
              same_domain_only: sameDomain,
              same_host_only: sameHost,
              render_js: renderJs && canRender,
              respect_robots: respectRobots,
            },
          },
        }),
      );
      router.push(`/extraction/${job.id}`);
    } catch (e) {
      setBusy(false);
      if (e instanceof ApiError && e.fields.url) setServerError(e.fields.url);
      else toast(e instanceof ApiError ? e.message : "Couldn't start the check.", "error");
    }
  };

  return (
    <Card className="p-5">
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Label htmlFor={`${ids}-url`} hint="http:// or https://">
          Website address
        </Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`${ids}-url`}
            type="url"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            placeholder="https://example.com/videos"
            value={url}
            invalid={!!shownError}
            aria-describedby={`${ids}-url-help`}
            onChange={(e) => {
              setUrl(e.target.value);
              setServerError("");
            }}
            onBlur={() => url.trim() && setTouched(true)}
            className="h-9 text-[14px]"
          />
          <Button type="submit" variant="primary" loading={busy} className="h-9 shrink-0">
            <ScanSearch className="size-4" aria-hidden /> Check links
          </Button>
        </div>
        <div id={`${ids}-url-help`} aria-live="polite" className="mt-1.5 min-h-5 text-[12.5px]">
          {check.suggestion ? (
            <p className="text-muted">
              {shownError && <span className="text-red-600 dark:text-red-400">{shownError} </span>}
              <button
                type="button"
                className="text-accent font-medium underline-offset-2 hover:underline"
                onClick={() => {
                  setUrl(check.suggestion!);
                  setServerError("");
                  document.getElementById(`${ids}-url`)?.focus();
                }}
              >
                Use {check.suggestion}?
              </button>
            </p>
          ) : shownError ? (
            <p className="text-red-600 dark:text-red-400">{shownError}</p>
          ) : (
            <p className="text-muted">
              NETFLY crawls the site and lists every link it finds: pages, video files, streams and
              embedded players.
            </p>
          )}
        </div>

        <button
          type="button"
          aria-expanded={advanced}
          aria-controls={`${ids}-advanced`}
          onClick={() => setAdvanced((v) => !v)}
          className="text-muted hover:text-fg mt-3 inline-flex items-center gap-1 text-[12.5px] font-medium"
        >
          <ChevronDown
            className={cn("size-3.5 transition-transform", !advanced && "-rotate-90")}
            aria-hidden
          />
          Advanced
        </button>
        {advanced && (
          <fieldset
            id={`${ids}-advanced`}
            className="border-line mt-3 grid gap-4 rounded-lg border p-4 sm:grid-cols-2"
          >
            <legend className="sr-only">Advanced options</legend>
            <div>
              <Label htmlFor={`${ids}-depth`} hint={`0–${maxDepth}`}>
                Depth (clicks from the start page)
              </Label>
              <Input
                id={`${ids}-depth`}
                type="number"
                min={0}
                max={maxDepth}
                value={depth ?? maxDepth}
                onChange={(e) =>
                  setDepth(Math.max(0, Math.min(maxDepth, Number(e.target.value) || 0)))
                }
              />
            </div>
            <div>
              <Label htmlFor={`${ids}-pages`} hint={`1–${maxPages}`}>
                Most pages to crawl
              </Label>
              <Input
                id={`${ids}-pages`}
                type="number"
                min={1}
                max={maxPages}
                value={pages ?? maxPages}
                onChange={(e) =>
                  setPages(Math.max(1, Math.min(maxPages, Number(e.target.value) || 1)))
                }
              />
            </div>
            <Toggle
              label="Stay on this site's domain"
              help="Pages on other sites aren't listed; their videos and players still are. Other sites are never crawled."
              checked={sameDomain}
              onChange={setSameDomain}
            />
            <Toggle
              label="This exact host only"
              help="www.example.com, not blog.example.com."
              checked={sameHost}
              onChange={setSameHost}
            />
            <Toggle
              label="Render JavaScript"
              help={
                canRender
                  ? "Slower: each page loads in a sandboxed browser, which finds players that load their video from scripts."
                  : caps.data?.render_js_reason ||
                    "Checking whether the extraction worker has a browser…"
              }
              checked={renderJs && canRender}
              onChange={setRenderJs}
              disabled={!canRender}
            />
            <Toggle
              label="Respect robots.txt"
              help="Skip pages the site asks bots not to crawl, and wait as long as it asks."
              checked={respectRobots}
              onChange={setRobots}
            />
          </fieldset>
        )}
      </form>
    </Card>
  );
}

function Toggle({
  label,
  help,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <div className="pt-0.5">
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          label={label}
          disabled={disabled}
          aria-describedby={`${id}-help`}
        />
      </div>
      <div className="min-w-0">
        <p className={cn("text-[13px] font-medium", disabled && "text-muted")}>{label}</p>
        <p id={`${id}-help`} className="text-muted flex gap-1 text-[12px]">
          {disabled && <Info className="mt-0.5 size-3 shrink-0" aria-hidden />}
          {help}
        </p>
      </div>
    </div>
  );
}
