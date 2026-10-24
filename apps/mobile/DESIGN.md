# NETFLY mobile: design mapping

The app looks and behaves like the NETFLY viewer web app (`apps/client`) at phone width. The
specification is the web itself, photographed by `tool/design_reference.mjs` into
`design-reference/<device>/` (iPhone 13, 390 × 844, and Pixel 7, 412 × 915). The app's own
screenshots from the integration run are in `screenshots/android/`, under the same names.

Brand: NETFLY's ribbon wordmark, ribbon-diamond mark and colours only. The app uses Netflix's
*patterns* (tab bar, billboard, rows, title sheet, player), never its name, artwork or sounds.

## Tokens

All colours, the font and feature switches come from `GET /api/public/config` at runtime, the same
source the web reads, and are cached on the device for offline cold starts (`core/public_config.dart`).
`NetflyTheme.fromConfig` (`core/theme.dart`) maps them:

| Token | Web source | Default | Flutter |
|---|---|---|---|
| accent | `branding.accent_color` / `--accent` | `#E50914` | `NetflyTheme.accent` (text on it: `contrastOn`) |
| background | `branding.background_color` / `--bg` | `#141414` | `bg` |
| surface | `branding.surface_color` / `--surface` | `#181818` | `surface` |
| elevated | `globals.css --elevated` | `#232323` | `elevated` |
| text / muted / subtle | `--text`, `#b3b3b3`, `#808080` | | `text`, `muted`, `subtle` |
| hairline | `ring-white/10` | `#FFFFFF1A` | `line` |
| "match" green | `#46d369` | | `match` |
| secondary button | `rgb(109 109 110 / .7)` | | `secondaryButton` |
| font | `branding.font_family` | Inter Tight | `google_fonts`; Inter Tight is bundled in `assets/fonts/` (no download) |

Type scale (`NetflyType`, from `packages/ui/src/theme.ts` and the Tailwind `text-*` utilities):
display 40/0.92 black, title 30, h1 26, h3 22 bold, h2 17 bold, lead 18, body 15/1.5, meta 13,
caption 12, card 12 extra-bold, Top 10 numeral 90 black, badge 9.5 bold +0.04em (decision 52a).

Spacing and shape (`NetflySpace`): 16 px gutter (`px-[max(4vw,16px)]` at phone width), 64 px tab bar
plus the safe area, 56 px header, 8 px row gap, radius 6 (cards, dialogs), 4 (buttons), 2 (badges),
44 × 44 minimum touch targets (decision 52).

Motion (`NetflyMotion`): ease-out-expo `cubic(0.16, 1, 0.3, 1)`; 150 / 220 / 400 ms; loader loop
1.6 s, shown after 200 ms, kept at least 400 ms (decision 51 and the web's `LoaderPresence`). With
reduced motion (`MediaQuery.disableAnimations`), loaders only pulse their opacity and previews
don't autoplay.

## Components

| Web (`apps/client/src/components/…`) | Flutter (`lib/…`) |
|---|---|
| `brand/logo.tsx`, `packages/ui/src/wordmark.tsx` | `brand/logo_mark.dart` (`LogoMark`, `Wordmark`; geometry generated from `packages/ui/src/logo-geometry.json` by `tool/sync_brand.dart`) |
| `packages/ui` `LogoLoader`, `loader-presence.tsx` | `brand/netfly_loader.dart` (`NetflyLoader`, `LoaderPresence`, `LoaderScreen`) |
| `brand/intro-splash.tsx` | native splash (`flutter_native_splash`) + `features/start/start_screen.dart` |
| `ui/button.tsx` | `widgets/buttons.dart` (`NetflyButton`: play / accent / secondary / ghost) |
| `ui/confirm-dialog.tsx` | `widgets/confirm_dialog.dart` (`confirm`) |
| `ui/badge.tsx` | `widgets/badge.dart` |
| `ui/skeleton.tsx` | `widgets/skeleton.dart` (brand-tinted shimmer) |
| `ui/state-message.tsx`, `fatal-error.tsx` | `widgets/state_message.dart`, `widgets/offline_banner.dart` |
| `ui/netfly-image.tsx` | `widgets/netfly_image.dart` (blur-up placeholder, `/api/v1/img/…/w<width>`) |
| `browse/header.tsx`, `translation-switcher.tsx`, `notifications.tsx` | `features/home/header.dart`, `features/notifications/notifications_screen.dart` (`NotificationsBell`) |
| `browse/tab-bar.tsx` | `features/shell/shell.dart` (one navigation stack per tab; re-tap scrolls to top) |
| `browse/hero.tsx`, `preview-video.tsx` | `features/home/hero.dart`, `widgets/preview_player.dart` |
| `browse/row.tsx`, `card.tsx`, `continue-menu.tsx` | `widgets/title_row.dart`, `widgets/title_card.dart` |
| `browse/home-feed.tsx` | `features/home/home_screen.dart` |
| `title/title-modal.tsx`, `title-view.tsx`, `episodes.tsx` | `features/title/title_sheet.dart` |
| `browse/my-list-button.tsx`, `rating-button.tsx`, `remind-button.tsx` | `data/engagement.dart` + the title sheet's actions |
| `browse/title-grid.tsx` | `features/categories/category_screen.dart`, `features/my_list/my_list_screen.dart` |
| `profiles/profile-gate.tsx`, `profile-editor.tsx`, `avatar.tsx` | `features/profiles/profile_gate.dart`, `widgets/avatar.dart` |
| `player/player.tsx`, `scrubber.tsx`, `overlays.tsx`, `episode-drawer.tsx`, `intro-preroll.tsx` | `features/player/` (`player_screen.dart`, `scrubber.dart`, `episode_drawer.dart`, `thumbnails.dart`, `subtitles.dart`, `tracker.dart`, `pip.dart`) |
| `auth/auth-shell.tsx`, `poster-wall.tsx` | `widgets/form.dart` (`AuthScaffold`), `features/auth/welcome_screen.dart` |
| `billing/plan-picker.tsx`, `checkout/approval.tsx` | `features/billing/plans_screen.dart`, `checkout_screen.dart` |
| `account/membership-card.tsx` | `features/account/membership_screen.dart` |
| `account/settings.tsx` (Playback) | `features/account/playback_settings_screen.dart` |
| `account/account-nav.tsx` + Account overview | `features/account/account_screen.dart` (the Profile tab) |

## Where the app differs from the web, on purpose

- **Data saver** ("autoplay on Wi-Fi only") exists only in the app, because a browser can't
  reliably tell Wi-Fi from mobile data. It's on by default and stored per device.
- **Account** is the Profile tab: one list (Membership, Playback, Notifications, Categories, Sign
  out) instead of the web's account side navigation.
- **Picture-in-Picture** on Android (auto-enter when leaving the app while playing).
- **Haptics** on Play, My List, Rate and tab changes.
