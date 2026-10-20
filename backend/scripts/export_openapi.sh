#!/bin/sh
# Regenerate the OpenAPI schema consumed by packages/api-client (then run `pnpm api:generate`).
set -e
cd "$(dirname "$0")/.."
python manage.py spectacular --format openapi-json --fail-on-warn --file ../packages/api-client/openapi.json
