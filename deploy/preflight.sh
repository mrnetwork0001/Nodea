#!/usr/bin/env sh
#
# Read-only inspection of a VPS before installing the Nodea daemon.
#
# Changes nothing. Creates nothing. Needs no sudo. Run it, read it, and only then decide.
# It exists because the daemon is going onto a machine that is already earning its keep, and the
# only way to promise it will not disturb anything is to look first.
#
#   scp deploy/preflight.sh user@host:/tmp/ && ssh user@host 'sh /tmp/preflight.sh'

echo "==================== nodea preflight ===================="
echo

echo "--- host ---"
uname -srm
[ -r /etc/os-release ] && . /etc/os-release && echo "distro:  $PRETTY_NAME"
echo "uptime: $(uptime 2>/dev/null | sed 's/^ *//')"
echo

echo "--- init system ---"
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  echo "systemd: yes  (deploy/nodea-daemon.service will work)"
else
  echo "systemd: NO   (use the Docker path in deploy/README.md)"
fi
echo

echo "--- node ---"
if command -v node >/dev/null 2>&1; then
  echo "node:    $(node -v)   at $(command -v node)"
  major=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
  [ "$major" -lt 20 ] 2>/dev/null && echo "  WARNING: Nodea needs Node 20+. Do NOT upgrade the system node if other"
  [ "$major" -lt 20 ] 2>/dev/null && echo "           services depend on this one - install 22 alongside, or use Docker."
else
  echo "node:    not installed"
fi
command -v npm >/dev/null 2>&1 && echo "npm:     $(npm -v)"
command -v git >/dev/null 2>&1 && echo "git:     $(git --version | awk '{print $3}')" || echo "git:     not installed"
command -v docker >/dev/null 2>&1 && echo "docker:  $(docker --version 2>/dev/null)" || echo "docker:  not installed"
echo

echo "--- resources (the daemon is capped at 512M / 50% of one core) ---"
if command -v free >/dev/null 2>&1; then free -h | sed -n '1,2p'; else vm_stat 2>/dev/null | head -4; fi
echo "cores:   $(nproc 2>/dev/null || echo '?')"
echo "load:    $(cat /proc/loadavg 2>/dev/null | cut -d' ' -f1-3)"
echo
echo "disk on /opt (the checkout needs ~700MB with node_modules):"
df -h /opt 2>/dev/null || df -h /
echo

echo "--- what is already running (the daemon must not disturb any of it) ---"
if command -v systemctl >/dev/null 2>&1; then
  echo "active services:"
  systemctl list-units --type=service --state=running --no-legend --no-pager 2>/dev/null \
    | awk '{print "  " $1}' | head -40
fi
echo
echo "listening sockets (the daemon opens NONE, so nothing here can collide):"
if command -v ss >/dev/null 2>&1; then
  ss -tlnp 2>/dev/null | awk 'NR>1{print "  " $4}' | sort -u | head -30
elif command -v netstat >/dev/null 2>&1; then
  netstat -tln 2>/dev/null | awk 'NR>2{print "  " $4}' | sort -u | head -30
fi
echo

echo "--- collisions with what we are about to create ---"
id nodea >/dev/null 2>&1 && echo "  user 'nodea'      EXISTS  <- reuse it, do not recreate" || echo "  user 'nodea'      free"
[ -e /opt/nodea ] && echo "  /opt/nodea        EXISTS  <- inspect before cloning over it" || echo "  /opt/nodea        free"
[ -e /etc/nodea ] && echo "  /etc/nodea        EXISTS  <- keys may already be there" || echo "  /etc/nodea        free"
[ -e /etc/systemd/system/nodea-daemon.service ] && echo "  the unit           EXISTS" || echo "  the unit           free"
echo

echo "--- outbound reachability (the daemon dials these two, nothing else) ---"
for url in https://mainnet.coti.io/rpc https://router-api.0g.ai/v1/models; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 12 "$url" 2>/dev/null)
  echo "  $url  ->  ${code:-unreachable}"
done
echo
echo "======================= end preflight ======================="
