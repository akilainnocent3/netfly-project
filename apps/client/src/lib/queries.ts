"use client";

import { unwrap } from "@netfly/api-client";
import {
  keepPreviousData,
  useIsMutating,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { useInitialMode } from "@/components/providers/initial-mode";
import { useToast } from "@/components/ui/toast";
import { useTranslation } from "@/stores/translation";
import { api } from "./api";
import type { BillboardItem, HomePage, TitleCard, TranslationMode } from "./types";

export function useMode(): TranslationMode {
  const initial = useInitialMode();
  return useTranslation((s) => s.mode) ?? initial;
}

export const keys = {
  home: (mode: string) => ["home", mode] as const,
  billboard: (mode: string, kind?: string) => ["billboard", mode, kind ?? "all"] as const,
  title: (slug: string, mode: string) => ["title", slug, mode] as const,
  episodes: (slug: string, season: number) => ["episodes", slug, season] as const,
  genres: (mode: string) => ["genres", mode] as const,
  genre: (slug: string, sort: string, mode: string) => ["genre", slug, sort, mode] as const,
  search: (q: string, mode: string) => ["search", q, mode] as const,
  myList: (mode: string) => ["my-list", mode] as const,
};

export function useHome(kind?: "movie" | "series") {
  const mode = useMode();
  return useInfiniteQuery({
    queryKey: kind ? [...keys.home(mode), kind] : keys.home(mode),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/browse/home", {
          params: { query: { translation: mode, cursor: pageParam, type: kind } },
        }),
      ),
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useBillboard(
  initial?: { mode: string; items: BillboardItem[] },
  kind?: "movie" | "series",
) {
  const mode = useMode();
  return useQuery({
    queryKey: keys.billboard(mode, kind),
    initialData: initial && initial.mode === mode ? initial.items : undefined,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/browse/billboard", {
          params: { query: { translation: mode, type: kind } },
        }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useTitlePage(slug: string | null) {
  const mode = useMode();
  return useQuery({
    queryKey: keys.title(slug ?? "", mode),
    enabled: !!slug,
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/titles/{slug}", {
          params: { path: { slug: slug! }, query: { translation: mode } },
        }),
      ),
    staleTime: 30_000,
  });
}

export function useEpisodes(slug: string, season: number | null) {
  return useInfiniteQuery({
    queryKey: keys.episodes(slug, season ?? 0),
    enabled: season !== null,
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/titles/{slug}/seasons/{number}/episodes", {
          params: { path: { slug, number: season! }, query: { offset: pageParam, limit: 30 } },
        }),
      ),
    getNextPageParam: (last) => last.next ?? undefined,
  });
}

export function useGenres() {
  const mode = useMode();
  return useQuery({
    queryKey: keys.genres(mode),
    queryFn: () => unwrap(api.GET("/api/v1/genres", { params: { query: { translation: mode } } })),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
}

export function useGenreTitles(slug: string, sort: "suggested" | "newest" | "az" | "year") {
  const mode = useMode();
  return useInfiniteQuery({
    queryKey: keys.genre(slug, sort, mode),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      unwrap(
        api.GET("/api/v1/genres/{slug}/titles", {
          params: { path: { slug }, query: { sort, translation: mode, cursor: pageParam } },
        }),
      ),
    getNextPageParam: (last) => last.next ?? undefined,
    placeholderData: keepPreviousData,
  });
}

export function useSearch(q: string) {
  const mode = useMode();
  return useQuery({
    queryKey: keys.search(q, mode),
    enabled: q.length > 0,
    queryFn: ({ signal }) =>
      unwrap(api.GET("/api/v1/search", { params: { query: { q, translation: mode } }, signal })),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useSearchSuggestions() {
  return useQuery({
    queryKey: ["search-suggestions"],
    queryFn: () => unwrap(api.GET("/api/v1/search/suggestions")),
    staleTime: 60_000,
  });
}

export function useMyList() {
  const mode = useMode();
  return useQuery({
    queryKey: keys.myList(mode),
    queryFn: () => unwrap(api.GET("/api/v1/my-list", { params: { query: { translation: mode } } })),
  });
}

/** Remove a title from every row currently in the home cache (used by "Not for me"). */
export function removeFromHome(queryClient: ReturnType<typeof useQueryClient>, titleId: number) {
  queryClient.setQueriesData<InfiniteData<HomePage>>({ queryKey: ["home"] }, (data) =>
    data
      ? {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            rows: page.rows
              .map((row) => ({ ...row, items: row.items.filter((item) => item.id !== titleId) }))
              .filter((row) => row.items.length > 0),
          })),
        }
      : data,
  );
}

type RatingValue = -1 | 1 | 2 | null;
type TitleRef = Pick<TitleCard, "id" | "slug" | "title">;

/** Per-title pending flag (for rendering the spinner). */
export function usePendingFor(
  kind: "rate" | "mylist" | "reminder" | "cw-hide",
  titleId: number,
): boolean {
  return useIsMutating({ mutationKey: [kind, titleId] }) > 0;
}

// Synchronous single-flight guard: React state lags a fast double-click, this set doesn't.
const inflight = new Set<string>();
function claim(key: string): boolean {
  if (inflight.has(key)) return false;
  inflight.add(key);
  return true;
}
function release(key: string): void {
  inflight.delete(key);
}

/**
 * Optimistic rating. Keyed per title: callers check usePendingFor("rate", id)
 * and ignore taps while a request is in flight. Errors roll back and offer Retry.
 */
export function useRate(title: TitleRef) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationKey: ["rate", title.id],
    mutationFn: ({ value }: { value: RatingValue; previous: RatingValue }) =>
      value === null
        ? unwrap(
            api.DELETE("/api/v1/ratings/{title_id}", { params: { path: { title_id: title.id } } }),
          )
        : unwrap(
            api.PUT("/api/v1/ratings/{title_id}", {
              params: { path: { title_id: title.id } },
              body: { value },
            }),
          ),
    onMutate: ({ value }) => {
      queryClient.setQueriesData<{ viewer: { rating: number | null } | null }>(
        { queryKey: ["title", title.slug] },
        (d) => (d?.viewer ? { ...d, viewer: { ...d.viewer, rating: value } } : d),
      );
      queryClient.setQueryData<Record<number, number | null>>(["ratings"], (r) => ({
        ...(r ?? {}),
        [title.id]: value,
      }));
    },
    onError: (_error, variables) => {
      const { previous } = variables;
      queryClient.setQueriesData<{ viewer: { rating: number | null } | null }>(
        { queryKey: ["title", title.slug] },
        (d) => (d?.viewer ? { ...d, viewer: { ...d.viewer, rating: previous } } : d),
      );
      queryClient.setQueryData<Record<number, number | null>>(["ratings"], (r) => ({
        ...(r ?? {}),
        [title.id]: previous,
      }));
      toast({
        message: `Couldn't save your rating for ${title.title}.`,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => claim(`rate:${title.id}`) && mutation.mutate(variables),
        },
      });
    },
    onSettled: () => {
      release(`rate:${title.id}`);
      // Recommendations changed server-side: refetch the feed in the background.
      void queryClient.invalidateQueries({ queryKey: ["home"], refetchType: "active" });
      void queryClient.invalidateQueries({ queryKey: ["billboard"], refetchType: "active" });
    },
  });
  /** Ignored while this title's previous rating request is in flight. */
  const rateNow = (vars: { value: RatingValue; previous: RatingValue }) => {
    if (claim(`rate:${title.id}`)) mutation.mutate(vars);
  };
  return { ...mutation, rateNow };
}

export function useRatings() {
  return useQuery<Record<number, number | null>>({
    queryKey: ["ratings"],
    queryFn: () => ({}),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/** Optimistic My List toggle with the same per-title single-flight + rollback rules. */
export function useMyListToggle(title: TitleRef) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationKey: ["mylist", title.id],
    mutationFn: ({ add }: { add: boolean }) =>
      add
        ? unwrap(
            api.PUT("/api/v1/my-list/{title_id}", { params: { path: { title_id: title.id } } }),
          )
        : unwrap(
            api.DELETE("/api/v1/my-list/{title_id}", { params: { path: { title_id: title.id } } }),
          ),
    onMutate: ({ add }) => {
      queryClient.setQueryData<Record<number, boolean>>(["in-list"], (m) => ({
        ...(m ?? {}),
        [title.id]: add,
      }));
      queryClient.setQueriesData<{ viewer: { in_my_list: boolean } | null }>(
        { queryKey: ["title", title.slug] },
        (d) => (d?.viewer ? { ...d, viewer: { ...d.viewer, in_my_list: add } } : d),
      );
    },
    onSuccess: (_d, { add }) =>
      toast(
        {
          message: add ? `Added ${title.title} to My List` : `Removed ${title.title} from My List`,
          tone: "success",
        },
        2200,
      ),
    onError: (_e, variables) => {
      const before = !variables.add;
      queryClient.setQueryData<Record<number, boolean>>(["in-list"], (m) => ({
        ...(m ?? {}),
        [title.id]: before,
      }));
      queryClient.setQueriesData<{ viewer: { in_my_list: boolean } | null }>(
        { queryKey: ["title", title.slug] },
        (d) => (d?.viewer ? { ...d, viewer: { ...d.viewer, in_my_list: before } } : d),
      );
      toast({
        message: `Couldn't update My List.`,
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => claim(`mylist:${title.id}`) && mutation.mutate(variables),
        },
      });
    },
    onSettled: () => {
      release(`mylist:${title.id}`);
      void queryClient.invalidateQueries({ queryKey: ["my-list"] });
      void queryClient.invalidateQueries({ queryKey: ["home"], refetchType: "active" });
    },
  });
  /** Ignored while this title's previous My List request is in flight. */
  const toggleNow = (add: boolean) => {
    if (claim(`mylist:${title.id}`)) mutation.mutate({ add });
  };
  return { ...mutation, toggleNow };
}

export function useInList() {
  return useQuery<Record<number, boolean>>({
    queryKey: ["in-list"],
    queryFn: () => ({}),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    queryFn: () => unwrap(api.GET("/api/v1/notifications")),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useMarkNotificationsSeen() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ["notifications-seen"],
    mutationFn: () => unwrap(api.POST("/api/v1/notifications/seen")),
    onMutate: () =>
      queryClient.setQueryData<{ unread: number; results: { unread: boolean }[] }>(
        ["notifications"],
        (d) => (d ? { ...d, unread: 0 } : d),
      ),
  });
}

export function useNewAndPopular() {
  const mode = useMode();
  return useQuery({
    queryKey: ["new-and-popular", mode],
    queryFn: () =>
      unwrap(
        api.GET("/api/v1/browse/new-and-popular", { params: { query: { translation: mode } } }),
      ),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

type ReminderRef = Pick<TitleCard, "id" | "title">;

/** "Remind me" with the same single-flight + rollback + Retry rules as My List. */
export function useReminder(title: ReminderRef) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const setReminded = (on: boolean) =>
    queryClient.setQueriesData<{ coming_soon: { id: number; reminded?: boolean | null }[] }>(
      { queryKey: ["new-and-popular"] },
      (d) =>
        d
          ? {
              ...d,
              coming_soon: d.coming_soon.map((t) =>
                t.id === title.id ? { ...t, reminded: on } : t,
              ),
            }
          : d,
    );
  const mutation = useMutation({
    mutationKey: ["reminder", title.id],
    mutationFn: ({ on }: { on: boolean }) =>
      on
        ? unwrap(
            api.PUT("/api/v1/reminders/{title_id}", { params: { path: { title_id: title.id } } }),
          )
        : unwrap(
            api.DELETE("/api/v1/reminders/{title_id}", {
              params: { path: { title_id: title.id } },
            }),
          ),
    onMutate: ({ on }) => setReminded(on),
    onSuccess: (_d, { on }) =>
      toast(
        {
          message: on
            ? `We'll let you know when ${title.title} is out`
            : `Reminder for ${title.title} removed`,
          tone: "success",
        },
        2400,
      ),
    onError: (_e, variables) => {
      setReminded(!variables.on);
      toast({
        message: "Couldn't update the reminder.",
        tone: "error",
        action: {
          label: "Retry",
          onClick: () => claim(`reminder:${title.id}`) && mutation.mutate(variables),
        },
      });
    },
    onSettled: () => release(`reminder:${title.id}`),
  });
  const toggleNow = (on: boolean) => {
    if (claim(`reminder:${title.id}`)) mutation.mutate({ on });
  };
  return { ...mutation, toggleNow };
}

/** "Remove from row" on Continue Watching: optimistic, with Undo-free rollback on error. */
export function useHideFromContinueWatching(title: ReminderRef) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const mutation = useMutation({
    mutationKey: ["cw-hide", title.id],
    mutationFn: () =>
      unwrap(
        api.DELETE("/api/v1/continue-watching/{title_id}", {
          params: { path: { title_id: title.id } },
        }),
      ),
    onMutate: () => {
      const snapshot = queryClient.getQueriesData<InfiniteData<HomePage>>({ queryKey: ["home"] });
      queryClient.setQueriesData<InfiniteData<HomePage>>({ queryKey: ["home"] }, (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((page) => ({
                ...page,
                rows: page.rows
                  .map((row) =>
                    row.kind === "continue_watching"
                      ? { ...row, items: row.items.filter((i) => i.id !== title.id) }
                      : row,
                  )
                  .filter((row) => row.items.length > 0),
              })),
            }
          : data,
      );
      return { snapshot };
    },
    onSuccess: () =>
      toast({ message: `Removed ${title.title} from Continue Watching`, tone: "success" }, 2400),
    onError: (_e, _v, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast({
        message: "Couldn't remove it from the row.",
        tone: "error",
        action: { label: "Retry", onClick: () => claim(`cw:${title.id}`) && mutation.mutate() },
      });
    },
    onSettled: () => release(`cw:${title.id}`),
  });
  const hideNow = () => {
    if (claim(`cw:${title.id}`)) mutation.mutate();
  };
  return { ...mutation, hideNow };
}
