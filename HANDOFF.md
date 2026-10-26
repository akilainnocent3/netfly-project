# NETFLY work handoff (Claude Code session, 2026-10-24)

Branch: `claude/eloquent-hamilton-wtgzsm` (checked out locally from origin; base commit `3a9d8a5`).
**Nothing is committed yet.** All work is uncommitted in the working tree (`git status`).
Do not commit this file. `package-lock.json` was untracked before this session; leave it out too.

## Phase 1: DONE and committed (2026-10-24, second session)

Commits on the branch (each passed ruff, black, makemigrations --check, pytest, typecheck, lint,
format:check, both builds; openapi + api-client regenerated per commit):
b9d082d A categories artwork · 19beb97 B titles↔category · dfa14e5 C autoplay · d1a379d D badges · eb4f79c E SMS.
Backup of the final state: `refs/backup/phase1-final` (can be deleted once pushed).

Full e2e on the final state: 155 passed, 3 failed, 16 skipped, 5 did not run. The iPad form-banner
failure (mobile.spec:139) also fails on the untouched base client (pre-existing). mobile.spec:244 (iPad)
and anonymous.spec:55 pass 2/2 when rerun alone (load-related flakes on this box).

Lesson: the first session's scratchpad (/tmp) was wiped by a codespace restart and Parts B–E were
rebuilt by replaying that session's transcript. Keep durable backups in git refs, not /tmp.

### Owner must do for Part E
1. Deploy, then Studio → Settings → SMS → **Send test SMS** to your own number and read the
   "Provider response". Code **111** = sender ID not registered/active in Beem (most likely);
   **102** = no credit; **valid 0** = Beem rejected the number.
2. Confirm the SMS arrives before calling this fixed.

## Phase 2 (Flutter app): committed (5e8354f), plus 7bbad90 mobile auth and 1431700 App Links

Integration journey passes on the Android 15 emulator (tool/run_integration.sh). 30 Flutter tests
pass, analyze is clean, and release APK + AAB build. Not done or verified: iOS (no macOS), push
notifications (no backend device-token model), audio-track switching (video_player limit, decision 63),
performance on a real device (the emulator renders in software), memory while scrolling 10 rows.
The branch is not pushed. refs/backup/phase1-final can be deleted after pushing.

Environment lessons (this box):
- /tmp is on a 118 GB disk; / and /workspaces share a 32 GB disk with ~6 GB free. Android SDK
  (/tmp/android-sdk), Gradle home (~/.gradle -> /tmp/gradle-home), AVD (/tmp/avd) and
  apps/mobile/build (symlink -> /tmp/netfly-mobile-build) live in /tmp. /tmp is wiped on restart.
- Gradle and the emulator don't fit in memory together: run_integration.sh builds first.
- An emulator started from an interactive command dies when that command ends; run it inside one
  background script (run_integration.sh).
- `sudo chmod 666 /dev/kvm` is needed after a restart.
- build_runner deletes *.g.dart it doesn't own: the brand geometry is geometry.brand.dart.

## Sandbox notes (not for the repo)
- Containers can't reach each other on bridge networks (DECISIONS 12). The stack runs with
  `docker compose -f docker-compose.yml -f <scratchpad>/compose.hostnet.yml up -d`.
- Next apps run from the host as production builds (`pnpm start` in `apps/client` and `apps/admin`);
  the dev servers got OOM-killed.
- Local S3 is moto in container `netfly-sandbox-s3` (port 5005, bucket `netfly-dev`). It is in-memory, so a
  restart loses media; reseed with `docker compose exec backend python manage.py seed_demo --reset --duration 6`.
- `worker-transcode` is stopped to save memory (`docker compose start worker-transcode` to resume).
- e2e uses the uncommitted `e2e/playwright.sandbox.config.ts` (it adds `--disable-dev-shm-usage`).
