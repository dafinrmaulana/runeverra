# Self-hosted online play

Runeverra's "Online room" mode normally runs on the `room` capability that Claude provides
to published artifacts. That capability doesn't exist outside claude.ai, so a build served
from your own VPS needs this instead: a small, authoritative WebSocket relay that runs the
same rules engine (`src/engine/`) as the browser, so it can check every move is legal
before passing it on — a modified client can refuse to play, but it can never make an
illegal move happen, claim extra tokens, or act out of turn.

Everything lives in memory. There's no database: a room only needs to survive as long as
both players care about it, and idle rooms are dropped after 5 minutes with nobody
connected.

## 1. Run the relay

Needs Node 22.18 or newer: the relay imports the engine's TypeScript files directly. Check the
Node that systemd runs (`ExecStart` in `runeverra-ws.service`), not only the one in your shell.

```sh
npm install        # pulls in `ws`, used only by the server, never bundled into the client
npm run serve:ws    # listens on :8787 by default (set PORT to change it)
```

For production, keep it running with the included systemd unit rather than a second process
manager (PM2, Supervisor, …) — systemd is already running on any Linux VPS, so this adds no
extra background process:

```sh
sudo useradd -r -s /usr/sbin/nologin runeverra   # once
sudo cp server/runeverra-ws.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now runeverra-ws
```

Edit `WorkingDirectory` in the unit file to wherever you cloned the repo first.

## 2. Proxy it through Nginx

Add a WebSocket upgrade location to the same server block that serves the static build
(see the main deployment steps), on its own path:

```nginx
location /ws {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h; # keep long-lived connections alive
}
```

Because the site is already served over HTTPS, the browser will open this as `wss://`
automatically — nothing extra to configure for TLS.

## 3. Point the client at it

Set `VITE_WS_URL` at build time to your relay's public URL, then build as usual:

```sh
VITE_WS_URL=wss://yourdomain.com/ws npm run build
```

This one environment variable is what switches "Online room" from the Claude capability to
this relay — nothing else in the app needs to change, and a build without it (e.g. the one
published as a Claude artifact) keeps working exactly as before.

## Protocol, briefly

Client → server: `hello` (create/join/reconnect), `picks`, `map` (host only), `ready`,
`action` (an in-game move). Server → client: `joined`, `lobby`, `start`, `sync`
(full-state catch-up, used on reconnect), `move` (the opponent's validated move, replayed
through the normal commit path so it animates like any other move), `opponent`
(connect/disconnect), `error`, `full`, `notfound`.

A reconnecting client proves it owns its seat with a token handed out on join (kept in
`sessionStorage`, the same way the capability-based client keeps its own session) — so a
reload rejoins the same match, but a stranger can't guess their way into someone else's
seat.
