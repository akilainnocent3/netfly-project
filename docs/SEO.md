# Search engines: getting NETFLY's titles found

NETFLY's public pages are built to be indexed: every published title has a server-rendered page at
`/title/<slug>` with a descriptive `<title>`, a meta description, one `<h1>`, the cast, genres, year and
rating as visible text, a canonical URL and Movie / TVSeries structured data. `/titles` (A–Z) links to
every title in two clicks from the home page; `sitemap.xml` lists them all with their real last-modified
time; the favicon, app icons and `WebSite` structured data give results the right name and icon.

None of that matters until the site is live on its real domain and the search engines know about it.
This page is the owner's checklist. Settings live in **Studio → Settings → Search & sharing**.

## Checklist

1. **Deploy on the real domain** (see `docs/DEPLOY.md`), with HTTPS.
2. **Set `seo.site_url`** to the canonical origin, e.g. `https://watch.example.com` (no trailing slash),
   and make sure **`seo.indexing_enabled`** is on. Canonical links, the sitemap, `robots.txt` and the
   `WebSite` name in search results all use `seo.site_url`. Leave indexing off on staging.
   Optionally write `seo.default_description` (the home page's description, ~150 characters).
3. **Verify the domain.**
   * Google Search Console → *Add property* → *URL prefix* → *HTML tag*. Copy only the `content`
     value of the tag into `seo.google_site_verification`, then press *Verify*.
   * Bing Webmaster Tools → *Add site* → *HTML Meta Tag*. Paste the `content` value into
     `seo.bing_site_verification`. (Bing can also import the site from Search Console.)
   The tags appear on every page within a few seconds of saving.
4. **Submit the sitemap**: `https://<domain>/sitemap.xml` in Search Console (*Sitemaps*) and in Bing
   Webmaster Tools. New and changed titles appear in it as soon as they are published.
5. **Request indexing**: Search Console → *URL Inspection* → enter the home page, then
   *Request indexing*. Do the same for a few important title pages (`/title/<slug>`) and `/titles`.
6. **Check the rich result**: open the [Rich Results Test](https://search.google.com/test/rich-results)
   with a title URL. It should find a *Movie* (or *TV series*) item with no errors. A warning about a
   missing image means that title has no poster or backdrop yet: upload artwork in Studio.
7. **After a few days**, search `site:<domain> the rain` (only your pages; proves the page is indexed),
   then the plain query `the rain netfly`, and later just the title.

## What to expect

* **Timeline.** Discovery and the first indexed pages usually take a few days to two weeks after the
  sitemap is submitted; a full catalog can take several weeks. Search Console's *Pages* report shows
  progress and the reason for any page that isn't indexed.
* **Ranking.** Being indexed, eligible for rich results and well presented is what the site itself can
  guarantee. Ranking first for a bare title such as "the rain" — against Netflix, IMDb, Wikipedia and
  the studios — depends mostly on the domain's authority: links from other sites, brand searches, and
  how people engage with the results. Queries that include the brand ("the rain netfly") or are
  specific to what NETFLY offers (e.g. a translated version, a translator's name) are where a new
  service shows up first.
* **What helps.** Complete metadata in Studio (synopsis, cast, director, genres, year, artwork), unique
  synopses rather than copied ones, links to NETFLY from your own channels and partners, and keeping
  `seo.site_url` stable (changing domains resets most of this).

## Optional: IndexNow (Bing, Yandex, Seznam)

Google doesn't use IndexNow; it reads the sitemap's `lastmod`. Bing and others accept IndexNow pings,
which get new titles crawled within minutes. To turn it on, set **`seo.indexnow_key`** in Studio (any
8–128 letters, digits or dashes; Studio can generate one). The key file is then served at
`https://<domain>/<key>.txt`, and publishing or unpublishing a title notifies IndexNow (batched, at most
one request a minute, recorded in the audit log). Leave the key empty to keep it off.

## How it's verified in this repository

* `e2e/tests/seo.spec.ts`: every title in the sitemap answers a Googlebot request (no cookies, no
  JavaScript) with 200, a `<title>` and exactly one `<h1>` with its name, an absolute canonical, no
  `noindex`, and Movie / TVSeries JSON-LD; drafts are absent from the sitemap and 404; `robots.txt`
  allows the public pages and icons; icons and the manifest are served with the right types.
* `pnpm seo:audit` (stack running): crawls from `sitemap.xml` like a search engine, checks lengths,
  canonicals, headings, structured data, images and crawl depth from `/titles`, then runs a small
  search simulation ("the rain" → `/title/the-rain`). It proves the pages are indexable and match the
  query; it does not predict Google's ranking.
* Lighthouse's SEO category scores 100 on `/`, `/titles`, a title page and a genre page.
