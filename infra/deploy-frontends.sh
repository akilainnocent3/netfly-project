#!/usr/bin/env bash
# Bare-metal deploy of the Next.js apps (systemd units netfly-client / netfly-admin behind nginx).
# Builds each app, publishes its static files to /var/www/netfly/<app> where nginx serves them
# directly, mirrors them into the standalone bundle as a fallback, then restarts the unit.
#
#   sudo infra/deploy-frontends.sh            # both apps
#   sudo infra/deploy-frontends.sh admin      # one app
set -euo pipefail

APP_ROOT=${APP_ROOT:-/srv/netfly/app}
WWW_ROOT=${WWW_ROOT:-/var/www/netfly}
[ $# -gt 0 ] || set -- client admin
DEPLOYMENT_ID=${NETFLY_DEPLOYMENT_ID:-$(date -u +%Y%m%d%H%M%S)}

for app in "$@"; do
  dir="$APP_ROOT/apps/$app"
  echo "==> building $app"
  (cd "$dir" && sudo -u netfly env NETFLY_BUILD_NO_CACHE=1 NETFLY_DEPLOYMENT_ID="$DEPLOYMENT_ID" NODE_OPTIONS=--max-old-space-size=1536 \
    NEXT_TELEMETRY_DISABLED=1 node_modules/.bin/next build)

  standalone="$dir/.next/standalone/apps/$app"
  # Keep the bundle self-sufficient in case nginx is bypassed.
  rm -rf "$standalone/.next/static" "$standalone/public"
  cp -a "$dir/.next/static" "$standalone/.next/static"
  cp -a "$dir/public" "$standalone/public"

  # Publish for nginx. No --delete on hashed chunks: browsers still holding the previous
  # HTML can keep loading its chunks until they reload.
  install -d -m 755 "$WWW_ROOT/$app/_next"
  cp -r --no-preserve=ownership "$dir/.next/static" "$WWW_ROOT/$app/_next/"
  rm -rf "$WWW_ROOT/$app/public"
  cp -r --no-preserve=ownership "$dir/public" "$WWW_ROOT/$app/public"
  chmod -R a+rX "$WWW_ROOT/$app"

  echo "==> restarting netfly-$app"
  systemctl restart "netfly-$app"
done
