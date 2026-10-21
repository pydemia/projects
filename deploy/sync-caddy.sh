#!/bin/sh
# Reapply the Projects site after the system Caddy service restarts. The
# existing root-owned Caddyfile and its imported sites remain the base.
set -eu

site=projects.pydemia.ai
home=/home/pydemia/git/projects

if curl -fsS --max-time 4 http://127.0.0.1:2019/config/ | grep -Fq "\"$site\""; then
    exit 0
fi

runtime=$(mktemp "$home/.secrets/caddy-runtime.XXXXXX")
trap 'rm -f "$runtime"' EXIT
cp /etc/caddy/Caddyfile "$runtime"
printf '\nimport %s/deploy/projects.caddy\n' "$home" >> "$runtime"
caddy validate --config "$runtime" --adapter caddyfile >/dev/null
caddy reload --config "$runtime" --adapter caddyfile >/dev/null
