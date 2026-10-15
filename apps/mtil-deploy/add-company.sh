#!/bin/sh
# Add (or re-apply) one company's MTIL harness instance on the harness host.
#
#   sudo apps/mtil-deploy/add-company.sh <company> <port> <odoo-domain> <admin-domain>
#   sudo apps/mtil-deploy/add-company.sh mtil 3081 mtil.mtil.vn mtilai.mtil.mtil.vn
#
# Creates the Linux user mtil-<company> (home /srv/mtil/<company>), the unit
# environment /etc/mtil-harness/<company>.env, the instance overlay with a
# fresh Ticket Secret and launch token, and the two nginx Host -> port map
# files; installs the mtil-harness@.service template, reloads nginx, and
# starts mtil-harness@<company>. Re-running keeps an existing env file and
# overlay (their secrets) and rewrites everything else. Prints the values to
# enter in that company's Odoo (Settings > MTIL). docs/MTIL-DEPLOY.md.
set -eu

usage() {
  echo "usage: $0 <company> <port> <odoo-domain> <admin-domain>" >&2
  exit 2
}

[ "$#" -eq 4 ] || usage
COMPANY=$1
PORT=$2
SPA_HOST=$3
ADMIN_HOST=$4

[ "$(id -u)" -eq 0 ] || { echo "error: run as root (sudo)" >&2; exit 1; }
echo "$COMPANY" | grep -Eq '^[a-z][a-z0-9-]{0,23}$' \
  || { echo "error: company must match ^[a-z][a-z0-9-]{0,23}\$ (it names the Linux user mtil-<company>)" >&2; exit 2; }
echo "$PORT" | grep -Eq '^[0-9]+$' && [ "$PORT" -ge 1024 ] && [ "$PORT" -le 65535 ] \
  || { echo "error: port must be a number from 1024 to 65535" >&2; exit 2; }
for host in "$SPA_HOST" "$ADMIN_HOST"; do
  echo "$host" | grep -Eq '^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$' \
    || { echo "error: '$host' is not a lowercase domain name" >&2; exit 2; }
done
[ "$SPA_HOST" != "$ADMIN_HOST" ] || { echo "error: the Odoo domain and the admin domain must differ" >&2; exit 2; }

REPO=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
DEPLOY=$REPO/apps/mtil-deploy
TEMPLATE=$REPO/apps/frontend/deploy/harness-web-lan.patch.yml
ODOO_MCP_SERVER=$REPO/apps/odoo-mcp/server.mjs
CLI=$REPO/apps/cli/lib/bin.js
USER_NAME=mtil-$COMPANY
HOME_DIR=/srv/mtil/$COMPANY
ENV_DIR=/etc/mtil-harness
ENV_FILE=$ENV_DIR/$COMPANY.env
OVERLAY=$HOME_DIR/.dsh/profiles/web/cordis.patch.yml
MAP_DIR=/etc/nginx/mtil

for required in "$TEMPLATE" "$ODOO_MCP_SERVER" "$CLI" /etc/nginx/conf.d/mtil-harness.conf; do
  [ -e "$required" ] || { echo "error: missing $required (see docs/MTIL-DEPLOY.md, base install)" >&2; exit 1; }
done
[ "$REPO" = /opt/mtil/deepseek-harness ] \
  || echo "warning: the unit runs /opt/mtil/deepseek-harness, but this script lives in $REPO" >&2

# A port or domain already owned by another company is a fatal mix-up.
mkdir -p "$ENV_DIR" "$MAP_DIR/spa-hosts" "$MAP_DIR/admin-hosts"
for other in "$ENV_DIR"/*.env; do
  [ -e "$other" ] && [ "$other" != "$ENV_FILE" ] || continue
  if grep -Fxq "MTIL_PORT=$PORT" "$other"; then
    echo "error: port $PORT is already used by $other" >&2; exit 1
  fi
  for line in "MTIL_SPA_HOST=$SPA_HOST" "MTIL_SPA_HOST=$ADMIN_HOST" \
    "MTIL_ADMIN_HOST=$SPA_HOST" "MTIL_ADMIN_HOST=$ADMIN_HOST"; do
    if grep -Fxq "$line" "$other"; then
      echo "error: ${line#*=} is already used by $other" >&2; exit 1
    fi
  done
done

if ! id -u "$USER_NAME" >/dev/null 2>&1; then
  mkdir -p /srv/mtil
  useradd --system --user-group --create-home --home-dir "$HOME_DIR" --shell /bin/bash "$USER_NAME"
fi
chmod 750 "$HOME_DIR"

if [ -e "$ENV_FILE" ]; then
  echo "keeping $ENV_FILE"
  sed -i -e "s|^MTIL_PORT=.*|MTIL_PORT=$PORT|" \
    -e "s|^MTIL_SPA_HOST=.*|MTIL_SPA_HOST=$SPA_HOST|" \
    -e "s|^MTIL_ADMIN_HOST=.*|MTIL_ADMIN_HOST=$ADMIN_HOST|" "$ENV_FILE"
else
  cat > "$ENV_FILE" <<EOF
# mtil-harness@$COMPANY — read by systemd (EnvironmentFile).
MTIL_PORT=$PORT
MTIL_SPA_HOST=$SPA_HOST
MTIL_ADMIN_HOST=$ADMIN_HOST
# This company's model provider key; or enter it later in Odoo > Credentials.
DEEPSEEK_API_KEY=
EOF
fi
chown root:"$USER_NAME" "$ENV_FILE"
chmod 640 "$ENV_FILE"

if [ -e "$OVERLAY" ]; then
  echo "keeping $OVERLAY (its Ticket Secret and launch token)"
else
  TICKET_SECRET=$(openssl rand -hex 32)
  LAUNCH_TOKEN=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n')
  install -d -o "$USER_NAME" -g "$USER_NAME" -m 700 "$HOME_DIR/.dsh" "$HOME_DIR/.dsh/profiles" "$HOME_DIR/.dsh/profiles/web"
  sed -e "s|'__TICKET_SECRET__'|'$TICKET_SECRET'|g" \
    -e "s|'__LAUNCH_TOKEN__'|'$LAUNCH_TOKEN'|g" \
    -e "s|'__ODOO_MCP_SERVER__'|'$ODOO_MCP_SERVER'|g" "$TEMPLATE" > "$OVERLAY"
  if grep -q "^[^#]*'__[A-Z_]*__'" "$OVERLAY"; then
    rm -f "$OVERLAY"
    echo "error: $TEMPLATE has a placeholder this script does not fill" >&2; exit 1
  fi
  chown "$USER_NAME":"$USER_NAME" "$OVERLAY"
  chmod 600 "$OVERLAY"
fi

printf '%s %s;\n' "$SPA_HOST" "$PORT" > "$MAP_DIR/spa-hosts/$COMPANY.map"
printf '%s %s;\n' "$ADMIN_HOST" "$PORT" > "$MAP_DIR/admin-hosts/$COMPANY.map"
nginx -t
systemctl reload nginx

install -m 644 "$DEPLOY/systemd/mtil-harness@.service" /etc/systemd/system/mtil-harness@.service
systemctl daemon-reload
systemctl enable "mtil-harness@$COMPANY"
systemctl restart "mtil-harness@$COMPANY"

TICKET_SECRET=$(sed -n "s/^ *ticketSecret: '\(.*\)'\$/\1/p" "$OVERLAY" | head -n 1)
LAUNCH_TOKEN=$(sed -n "s/^ *launchToken: '\(.*\)'\$/\1/p" "$OVERLAY" | head -n 1)
cat <<EOF

mtil-harness@$COMPANY: 127.0.0.1:$PORT, user $USER_NAME, home $HOME_DIR
  status:  systemctl status mtil-harness@$COMPANY
  logs:    journalctl -u mtil-harness@$COMPANY -f

Enter in this company's Odoo (Settings > MTIL):
  Base URL       https://$ADMIN_HOST
  API Token      $LAUNCH_TOKEN
  Ticket Secret  $TICKET_SECRET

Gateway 192.168.9.56: include snippets/mtil-spa.locations in the $SPA_HOST
server block and add the LAN-only $ADMIN_HOST server block (gateway.conf).
EOF
