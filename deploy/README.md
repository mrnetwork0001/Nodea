# Deployment

Two independent pieces. The web app is stateless and holds no keys; the daemon holds one key and
must stay up. They do not need to live in the same place, and the daemon should not live on Vercel.

---

## The web app - Vercel

The build needs no environment variables. `deployments/cotiMainnet.json` and the generated
`src/lib/nodea/abi.ts` are committed, so the contract addresses ship with the build and nothing has
to be compiled on the host. Verified: `next build` succeeds with `artifacts/` absent, which is the
state Vercel sees.

1. Import the repository on Vercel. It detects Next.js; leave the defaults.
2. Deploy.
3. Re-run the browser walkthrough in [`../docs/PREFLIGHT.md`](../docs/PREFLIGHT.md) §6 against the
   public URL, on a desktop and a real phone.

**Do not add `NODEA_*` or `ZEROG_*` to the Vercel environment.** The web app never reads them -
every private key in this project belongs to the CLI and the daemon. A key in a hosting
environment variable is a key in a build log, and in every future deployment of that project.

The only variables the app understands are the optional `NEXT_PUBLIC_NODEA_*` address overrides,
for pointing a deployment at different contracts.

---

## The daemon - your own machine

This is the part that must stay running. A node that stops answering while still advertising
`active` accrues SLA breaches, and each one is permanent in a public record.

### Running alongside other services

The daemon is designed to be a quiet guest:

- **No ports.** It dials out to COTI and to the 0G Router and never listens, so it cannot collide
  with anything already bound.
- **No global installs.** Everything lives under `/opt/nodea`.
- **No root.** It runs as a dedicated `nodea` user that owns nothing else.
- **Hard ceilings.** The unit caps it at 512 MB and 50% of one CPU, so a leak or a runaway loop
  cannot starve your other services. It idles far below that - one poll every 6 seconds.

The one genuine resource question is **Node's version**. If other services on the box depend on an
older Node, do not change the system default. Either install Node 22 alongside and point the unit's
`ExecStart` at that absolute path, or use the Docker option below, which brings its own.

### Install

```bash
# Dedicated user and group that own nothing else and cannot log in.
sudo groupadd --system nodea
sudo useradd --system --gid nodea --home-dir /opt/nodea --shell /usr/sbin/nologin nodea

# Note: no --create-home. useradd would populate the directory from /etc/skel, and `git clone`
# refuses a destination that is not empty. Make it empty and owned, then clone into it.
sudo install -d -o nodea -g nodea -m 755 /opt/nodea
sudo -u nodea git clone https://github.com/mrnetwork0001/Nodea.git /opt/nodea
sudo -H -u nodea npm --prefix /opt/nodea ci
```

### Keys, kept outside the checkout

```bash
sudo mkdir -p /etc/nodea
sudo tee /etc/nodea/nodea.env > /dev/null <<'ENV'
NODEA_NETWORK=cotiMainnet
NODEA_NODE_OPERATOR_KEY=0x...
ZEROG_ROUTER_KEY=...
ENV
sudo chown root:nodea /etc/nodea/nodea.env
sudo chmod 640 /etc/nodea/nodea.env
```

**The daemon needs exactly one key: the node operator's.** Do not copy the deployer or agent keys
onto this machine. Neither has any use here, and each one present is exposure you did not need to
accept.

Keeping the file outside `/opt/nodea` means a `git pull` can never touch it and it is in no build
context.

### Start

```bash
sudo cp /opt/nodea/deploy/nodea-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now nodea-daemon
sudo journalctl -u nodea-daemon -f
```

Expect the node ids it serves, the prompt channel address, and then a quiet poll. When a job
arrives you will see the prompt decrypted, the model that served it, the verdict, and the amount
earned.

### Prove the restart works before you rely on it

```bash
sudo systemctl kill -s SIGKILL nodea-daemon
sudo systemctl status nodea-daemon      # active again within ~10s
```

Do this once. A restart policy nobody has watched is an assumption, not a guarantee.

---

## Docker instead

If the box already runs Docker, this is the stronger isolation and sidesteps the Node version
question entirely.

```bash
cd /opt/nodea
docker build -f deploy/Dockerfile -t nodea-daemon .
docker run -d --name nodea-daemon --restart unless-stopped \
  --memory 512m --cpus 0.5 \
  --env-file /etc/nodea/nodea.env \
  nodea-daemon

docker logs -f nodea-daemon
```

No ports are published. The image carries no keys - they arrive at run time.

Verified: it builds clean and the daemon starts inside it, failing only on the absent key, which is
the correct keyless outcome. It lands at ~600 MB because `tsx` and `dotenv` are devDependencies and
`npm ci` therefore pulls the whole tree, hardhat included. That is disk, not memory - the running
container sits far below its 512 MB cap.

---

## Watch these two numbers

Both produce the same failure, and it is the one that actually costs you something: jobs stall
escrowed, and **every node takes an SLA breach** - permanently, in a public record.

### Operator gas

`deploy/nodea-health.sh` reads the balance over public JSON-RPC. It needs the operator's *address*,
never its key, so it is safe to put in a crontab.

```bash
sudo cp /opt/nodea/deploy/nodea-health.sh /usr/local/bin/nodea-health
sudo chmod +x /usr/local/bin/nodea-health
sudo crontab -e
#   0 * * * * NODEA_OPERATOR_ADDRESS=0x... /usr/local/bin/nodea-health
```

Silent while healthy, so cron mails you only when it drops below 0.25 COTI - about 50 more
settlements at ~0.005 each. Override with `NODEA_MIN_COTI`.

(`npm run fund -- --dry` shows the same thing, but it wants the deployer key. Run that on your
workstation, not here.)

### 0G Router balance

There is no public endpoint for it; check [pc.0g.ai](https://pc.0g.ai). What the VPS *can* see is
the daemon hitting a `402` once it empties:

```bash
journalctl -u nodea-daemon --since "1 hour ago" | grep -c "0G Router 402"
```

## What the daemon does when a job fails

It retries three times, then abandons that job and moves on, logging why. The escrow is not lost -
the agent reclaims it after the deadline - but **that node takes the breach**, so a repeated failure
is worth investigating rather than leaving to accumulate.

An error while listing jobs (an RPC blip, a chain reorg) is treated as transient: it backs off 30
seconds and continues rather than exiting. The process only dies on something systemd should
restart it for.
