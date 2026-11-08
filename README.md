# KM Tracker

A small self-hosted web application for a group of people who share one car. Drivers record the odometer after their trips, and every time the tank is filled to full, KM Tracker splits the money spent on fuel between everyone who travelled, in proportion to the distance each one covered, and shows who has to pay whom.

The interface is available in Polish and English, works on phones and desktops, and amounts are in Polish złoty.

## Contents

- [How it works](#how-it-works)
- [Features](#features)
- [Requirements](#requirements)
- [Deployment](#deployment)
  - [Docker or Podman, building from the repository](#docker-or-podman-building-from-the-repository)
  - [Docker or Podman, with an image from a registry](#docker-or-podman-with-an-image-from-a-registry)
  - [systemd, without containers](#systemd-without-containers)
- [First start](#first-start)
- [Configuration](#configuration)
- [Operations](#operations)
- [Development](#development)
- [Limitations](#limitations)

## How it works

KM Tracker settles costs **from full tank to full tank**. The period between two refuels to full is a **cycle**.

1. With the tank full, someone enters the car's current odometer. This starts the first cycle.
2. After each trip, the driver records the odometer. The distance since the previous reading is credited to the people who took part in the trip and split equally between them. A passenger can be someone without an account, for example a friend who only shares a trip.
3. Whenever someone buys fuel, they record the amount and who paid.
   - **Not to full:** the amount is added to the cost of the current cycle.
   - **To full:** the cycle is settled. Its cost is the sum of all refuels in the cycle, and it is split by distance.
4. The settlement shows each person's share and balance (what they paid minus their share) and the transfers that even the balances out, with as few transfers as possible.

### Example

The cycle starts at 100,000 km. Kate has no account.

| Action | Participants | Odometer | Distance credited |
| --- | --- | --- | --- |
| Reading | Alice | 100,300 km | Alice 300 km |
| Partial refuel, 100 zł, paid by Tom | Tom | 100,400 km | Tom 100 km |
| Reading (shared trip) | Tom, Kate | 100,600 km | Tom 100 km, Kate 100 km |
| Refuel to full, 250 zł, paid by Alice | Alice | 100,700 km | Alice 100 km |

The cycle cost is 350 zł for 700 km.

| Person | Distance | Share | Paid | Balance |
| --- | --- | --- | --- | --- |
| Alice | 400 km | 200.00 zł | 250.00 zł | +50.00 zł |
| Tom | 200 km | 100.00 zł | 100.00 zł | 0.00 zł |
| Kate | 100 km | 50.00 zł | 0.00 zł | −50.00 zł |

Transfer: **Kate → Alice: 50.00 zł**. The next cycle starts at 100,700 km.

The tank can be filled to full at any time, even at half a tank: the cycle is simply shorter, and its cost still matches the distance driven in it.

## Features

The application has two parts that share the same accounts and data, each with its own sign-in and session.

### Client application (`/`)

Used by every driver, designed mostly for phones.

- **Dashboard:** the last odometer with a quick entry field, a preview of the added distance, and a warning for implausible values.
- **Participants:** the trip's participants, including new people without an account.
- **Undo:** a user can undo their own latest reading.
- **Refuels:** partial refuels, and refuels to full with a confirmation that shows the resulting shares and transfers before the cycle is settled.
- **Active cycle:** distance, refuels, each person's distance and percentage, and estimated costs based on the average cost per kilometre of the last three cycles.
- **History:** every closed cycle with its refuels, shares, balances, transfers, and readings.
- **Corrections visible to everyone:** when an administrator changes a cycle, it shows a note with the values before and after, and a dot in the navigation marks corrections the user hasn't seen yet.
- **Settings:** password change, accent colour, language, and light or dark theme.

### Administrator panel (`/admin`)

- **Overview:** a summary of the active cycle, recent events, and warnings, for example about one-time passwords that are about to expire.
- **Activity log:** sign-ins, records, settlements, and changes, with the values before and after. Entries can be filtered and can't be edited or deleted.
- **Users:** create accounts, edit names, change roles, reset passwords, and deactivate or delete accounts.
  - Accounts get a generated one-time password that is valid for 7 days and must be replaced at the first sign-in.
- **People:** rename people, merge duplicates (for example "Kate" and "Katie"), and create an account for someone who has been travelling without one. The person keeps their history.
- **Cycles:** correct readings, refuels, and cycle boundaries in any cycle, insert missing readings, change the starting odometer, and undo the latest settlement. Affected cycles are recalculated automatically.
- **Application settings:** the time zone used to display all dates.

### Security

- **Accounts:** there is no self-registration. Accounts are created only by an administrator.
- **Sessions:** client sessions last 7 days and panel sessions 12 hours.
- **Ending sessions:** changing or resetting a password ends the account's other sessions.
- **Login limits:** after 10 failed attempts on a username within 15 minutes, further sign-ins are refused, and errors don't reveal whether a username exists.
- **Protected `admin` account:** it can't be deleted, deactivated, or demoted from the panel.
- **Network:** the application doesn't restrict clients by IP address and has no TLS of its own. **Run it on a private network or behind a VPN**, or put a reverse proxy with HTTPS in front of it.

## Requirements

One of:

- **Docker** with Docker Compose, or **Podman** with `podman compose`.
- **Node.js 26**, for running directly on the host, for example with systemd.

The application is a single Node process listening on one port (3000 by default). All data lives in one SQLite file, so no separate database server is needed.

## Deployment

### Docker or Podman, building from the repository

The image is built on the host, so the host needs no Node.js.

```bash
git clone <repository-url> kmtracker
cd kmtracker
cp .env.example .env        # optional: change PORT or other settings
docker compose up -d --build
docker compose logs         # shows the setup code, see "First start"
```

With Podman, use `podman compose` in place of `docker compose`.

The database is kept in `./data` on the host, so it survives rebuilding and replacing the container. The container runs as UID 1000, so this directory must be writable by that user:

- **Docker:** if your user's UID isn't 1000, run `sudo chown 1000:1000 data`.
- **Rootless Podman:** run `podman unshare chown 1000:1000 data` once.

**Upgrading:**

```bash
git pull
docker compose up -d --build
```

### Docker or Podman, with an image from a registry

This option builds the image once and pushes it to a container registry, so the server only pulls it.

**1. Build and push the image** from a machine with the repository and Node.js 26:

```bash
npm ci
npm run release -- registry.example.lan/kmtracker
```

The script uses Podman if it is installed, otherwise Docker. `--engine docker` or `--engine podman` chooses one explicitly. It tags the image with the version from `package.json` and with `latest`, pushes both, and prints the `KMT_IMAGE` line for the server's `.env`.

- **Signing in:** if the registry requires it, the script signs in with `REGISTRY_USERNAME` and `REGISTRY_PASSWORD` if they are set, and otherwise asks in the terminal.
- **Registries over HTTP or with a self-signed certificate:**
  - **Podman:** pass `--insecure` to the script.
  - **Docker:** add the registry to `insecure-registries` in `/etc/docker/daemon.json`, and also pass `--insecure` when using `--latest-only`.
- **Keeping only the latest image:** with `--latest-only`, the script pushes only `latest`, then deletes the previous `latest` from the registry and the previous local image, so old versions don't accumulate. See [Registry space](#registry-space).
- **Architecture:** the image is built for the architecture of the machine that builds it. For example, an image built on x86 doesn't run on an ARM board.

**2. Run it on the server.** Only three things are needed there:

```
kmtracker/
├── compose.yaml   # copied from the repository
├── .env           # with KMT_IMAGE set, see below
└── data/          # empty directory, writable by UID 1000
```

`.env`:

```bash
PORT=3000
KMT_IMAGE=registry.example.lan/kmtracker
# KMT_TAG=0.0.1    # pin a version; defaults to latest
```

```bash
docker compose pull
docker compose up -d
docker compose logs         # shows the setup code
```

**Upgrading** is the same `pull` and `up -d`. To go back to an earlier version, set `KMT_TAG` to that version and run them again. Each upgrade leaves the previous image on the server; remove it with `docker image prune -f`.

#### Registry space

By default, every release adds a versioned image to the registry, so you can go back to any version. If the registry has little space, release with `--latest-only` instead:

```bash
npm run release -- registry.example.lan/kmtracker --latest-only
```

For the previous image to be removed from the registry, the registry has to allow it. With the standard `registry:2`:

1. Start the registry with `REGISTRY_STORAGE_DELETE_ENABLED=true`.
2. Free the disk space regularly with its garbage collection, for example from cron on the registry host:

   ```bash
   docker exec <registry-container> registry garbage-collect --delete-untagged /etc/docker/registry/config.yml
   ```

With `--latest-only`, there is no older image to go back to. To return to a previous version, check out its Git tag and release it again.

### systemd, without containers

On a host with Node.js 26:

```bash
sudo useradd --system --home /opt/kmtracker kmtracker
sudo git clone <repository-url> /opt/kmtracker
cd /opt/kmtracker
sudo npm ci
sudo npm run build
sudo npm prune --omit=dev
sudo cp .env.example .env              # adjust if needed
sudo chown -R kmtracker:kmtracker data
sudo cp deploy/kmtracker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now kmtracker
journalctl -u kmtracker                # shows the setup code
```

The unit runs the server directly with Node as the `kmtracker` user and only allows it to write to `data/`. If Node isn't at `/usr/bin/node` or the application isn't in `/opt/kmtracker`, adjust `ExecStart`, `WorkingDirectory`, and `ReadWritePaths` in the unit.

**Upgrading:**

```bash
cd /opt/kmtracker
sudo git pull
sudo npm ci
sudo npm run build
sudo npm prune --omit=dev
sudo systemctl restart kmtracker
```

## First start

1. **Get the setup code.** On first start, the server prints a setup code to its log, for example:

   ```
   KM Tracker: initial setup
   Open http://<address>:3000/admin/setup and enter the code: 7KQM-4XWP-Z9RT
   ```

   Every page redirects to `/admin/setup` until setup is complete. A new code is generated at every restart, and only the latest one works.
2. **Run the setup wizard.** Open `http://<server>:3000/admin/setup` and enter the code, your first and last name, a password, and the time zone. This creates the protected `admin` account and signs you in to the panel.
3. **Create accounts.** In the panel, under **Users**, create an account for each driver. Each account gets a one-time password, which you pass on to its owner. It is shown only once; if it's lost, reset the password.
4. **Drivers sign in.** Each driver signs in at `http://<server>:3000/`, sets their own password, and can choose a language and accent colour in the settings.
5. **Set up the car.** With the tank full, any signed-in user enters the car's current odometer on the dashboard. This starts the first cycle, and from then on drivers record readings and refuels.

The administrator uses the client application like any other driver. The panel has its own sign-in at `/admin/login`, with the same username and password.

## Configuration

Settings come from environment variables, read from `.env` in the application directory if it exists. Copy `.env.example` to start.

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on. With Docker, also the port published on the host. |
| `HOST` | `0.0.0.0` | Address the server listens on. Fixed to `0.0.0.0` inside the container. |
| `DATA_DIR` | `./data` | Directory that holds the database. Fixed inside the container. |
| `COOKIE_SECURE` | `false` | Set to `true` when the application is served over HTTPS. |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, or `error`. |
| `KMT_IMAGE` | `kmtracker` | Docker Compose only: the image to run, when it comes from a registry. |
| `KMT_TAG` | `latest` | Docker Compose only: the image version. |

The time zone is stored in the database and changed in the administrator panel under **Application settings**.

## Operations

### Health check

`GET /api/health` returns the application's status and version. The Docker image uses it as its `HEALTHCHECK`.

### Backups

All data is in `data/kmtracker.db`. The database runs in WAL mode, so make the backup in one of two ways:

- Stop the application and copy the whole `data/` directory.
- Use SQLite's online backup while it is running:

  ```bash
  sqlite3 data/kmtracker.db ".backup 'kmtracker-backup.db'"
  ```

Before applying database migrations during an upgrade, the server automatically copies the database to `data/backups/`.

### Lost administrator password

If nobody can sign in to the panel, generate a new one-time password for any account, including `admin`, on the server:

```bash
# Docker / Podman
docker compose exec kmtracker node server/cli/reset-password.ts admin

# systemd (run as the service user, from the application directory)
cd /opt/kmtracker && sudo -u kmtracker npm run reset-password -- admin
```

The new password is printed to the terminal and must be changed at the next sign-in.

### Logs

The server logs in JSON to standard output: `docker compose logs -f` or `journalctl -u kmtracker -f`. The application's own activity log, with who did what, is in the administrator panel.

## Development

Requires Node.js 26.

```bash
npm ci
npm run dev        # backend and both frontends with hot reload
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server with hot reload. Vite forwards `/api` to the backend. |
| `npm run build` | Builds both frontends into `dist/web`. |
| `npm start` | Starts the production server, serving the built frontends. |
| `npm test` | Runs the tests (Vitest). |
| `npm run typecheck` | Type-checks the whole project. |
| `npm run reset-password -- <username>` | Generates a new one-time password for an account. |
| `npm run release -- <image>` | Builds the container image and pushes it to a registry. Options: `--engine podman\|docker`, `--insecure`, `--latest-only`. |

**Stack:** TypeScript everywhere, React with Vite and Tailwind CSS, a Fastify server, and SQLite through Node's built-in `node:sqlite` module.

| Folder | Contents |
| --- | --- |
| `shared/` | Settlement logic, validation, and formatting, shared by the server and the frontends. |
| `server/` | HTTP API, authentication, database, migrations, and command-line tools. |
| `web/client/` | The client application. |
| `web/admin/` | The administrator panel. |
| `web/common/` | Shared UI components, styles, and translations. |

## Limitations

KM Tracker currently doesn't support:

- more than one car,
- marking transfers as paid,
- settling a cycle without a refuel to full,
- recording fuel volume or consumption,
- exporting data or sending notifications.
