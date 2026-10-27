# qits-system-platform-frontend

The system console: what the machine the platform runs on is doing.

It is an Angular 21 application and it ships no container image. `qits-system-platform-service` —
the repository behind the `qits-platform-system` application — carries this repository as a git
submodule at `service/src/main/webui` — Quinoa's ui-dir — and builds it into the service image, which serves it at `/` on its own host, `system.<env>.<domain>`. Everything on screen
is read live from the docker daemon that service holds; nothing here is stored.

**This is a `system` app.** What it shows is the machine the whole platform runs on, which belongs to
no project, so it routes no `/<projectSlug>/...` form — `provideQitsScope('system')` in
`app.config.ts` says so, and picking a project in the chrome's picker leaves for qits-projects
instead of rewriting an address this app does not serve. The API and the terminal socket keep their
`/system` segment and are path-routed on every host, so nothing they name changes.

## Screens

- **Overview** — a live `glances` terminal for the host, above a line of host facts (hostname, OS,
  CPUs, memory, docker version, swarm state and node count). The glances session is shared: this
  page finds or creates it and only detaches when you leave. `Stop glances` is the one way to end it.
- **Targets** (epic qits-1481) — the swarms `qits-system-runner-daemon` holds typed CI, workspace
  and desk slots on: each target's slots against its reservations, its claude/kimi sign-in, its
  quarantine and its last health check. Declare a target and the page shows its one-time install
  line; every target offers rotating its registration token, a health or login check, greenlight,
  delete (refused with `TARGET_BUSY` while it holds a live lease) and its own leases.
- **Swarm** — nodes, services (with their tasks), configs (with their data) and secrets (metadata
  only, because swarm does not expose the values).
- **A node** — its containers, images, volumes and networks, as child tabs. Every container row
  offers `bash` and `sh`, which open a terminal into it, and `logs`, which shows the last 200 lines.
  Only the node this service runs on is reachable in v1; another node answers `NODE_REMOTE` and the
  tab says so.
- **A terminal** — a full-height xterm.js attached to `WS /system/api/terminals/<id>`. It replays
  the scrollback on every attach, reconnects on a dirty close, and stops for good on a clean one.

## Development

```
npm ci
npm run lint && npm test && npm run build
npm start          # ng serve; proxy.conf.json sends /system/api, /system/q, /projects/api
                   # and /main-navigation to localhost:8080
```

`npm start` needs something answering at `http://localhost:8080` — the platform edge with
qits-platform-system deployed behind it, or the service's own dev mode.

## Registries

`.npmrc` routes installs at the platform's own registries and carries no credential; a developer's
`~/.npmrc` holds the workstation one. CI overrides both through the environment. The comments in
`.npmrc` and in `.config/qits/ci-event-release-request.yml` are where that arrangement is
explained.

A release is asked for as a release request on this repository in qits-projects: it folds the named
branches onto `release/<id>`, the pipeline above has to come back green on that fold, and Auto
Release stamps the CalVer and tags. `main` moves at the end of that and never by a push. The service
repository pins this SPA by its `service/src/main/webui` gitlink.
