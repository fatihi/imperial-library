# Imperial Library Deployment Design

**Goal:** Ship Imperial Library as a containerised service to a self-managed VPS, with a GitHub Actions push-to-deploy pipeline. Replace the unused MySQL telemetry dependency with SQLite as a prerequisite.

**Status:** Spec — ready for plan-writing.

## Scope

In: Dockerising the bot, GHCR + GitHub Actions CI/CD, VPS-side Docker Compose stack, SQLite telemetry refactor.

Out: healthchecks/uptime monitoring, rollback automation, staging environments, multi-host or multi-region setups, log aggregation, automated EmeraldDB freshness polling, a test suite.

## Architecture

The bot runs as a single container managed by Docker Compose on the operator's VPS. One service (`imperial-library`); no reverse proxy (the bot only opens an outbound WebSocket to Discord — nothing inbound). The container is built once per `main`-branch push and published to GitHub Container Registry (GHCR) as a public image. A GitHub Actions workflow then SSHes into the VPS and triggers `docker compose pull && up -d` to roll the new image.

Two named volumes carry mutable state across container recreations:

- `resources` mounted at `/app/resources` — `aliases.yml` and `serverWhitelist.yml`, both rewritten by the bot's superuser commands.
- `data` mounted at `/app/data` — the SQLite query-log database file.

Runtime configuration lives in a `.env` file on the host (not in the image, not in git, not in CI), mounted via the compose service's `env_file:`. The host is the source of truth for runtime config.

```
GitHub repo (push to main)
    │
    ▼
GitHub Actions workflow
    │  ├─ build image
    │  ├─ push ghcr.io/<owner>/imperial-library:latest + :sha-<short>
    │  └─ ssh user@vps "cd /path && docker compose pull && up -d"
    ▼
VPS
    docker compose
      └─ imperial-library
           ├─ env_file: .env (manual, host-managed)
           ├─ volumes: resources, data
           └─ restart: unless-stopped
```

## Prerequisite refactor: MySQL → SQLite

`src/Database/database.js` is the only consumer of MySQL today, and its only call site is `logQuery()` from `messageCreate.js`. The data is append-only telemetry; nothing in the bot reads from it. Switching to SQLite keeps the option of inspecting the log later without provisioning a database server.

Changes:

- Replace the `mysql` dependency with `better-sqlite3` in `package.json`.
- Rewrite `src/Database/database.js` to open a SQLite file at a hardcoded container path (`/app/data/queries.db`). Create the `Query` table on first boot if it doesn't exist (single-table schema, no migration tool needed).
- Drop the `DB_HOST` / `DB_USER` / `DB_PASSWORD` / `DB_NAME` env vars from `.env.example`. The DB path is internal to the container; the volume mount is the only configuration surface.
- The existing "skip if DB unavailable" branch becomes "skip if SQLite open failed" (still optional — the bot must boot even if telemetry is broken).

The MySQL→SQLite swap lands as Task 1 of the implementation plan, before any Docker work.

## Files added to the repo

```
Dockerfile                           # multi-stage build, alpine runtime
.dockerignore                        # excludes node_modules, .env, .git, docs/, resources/
docker-compose.yml                   # single service, two volumes, env_file
.github/workflows/deploy.yml         # build → push → SSH redeploy
```

**`Dockerfile`:** two stages.

- **Builder** (`node:lts-alpine` + `apk add python3 make g++`): copy `package*.json`, run `npm ci --omit=dev` *with* the build toolchain available so `better-sqlite3`'s native module compiles.
- **Runtime** (`node:lts-alpine`, no toolchain): copy `node_modules/` from the builder stage and the source. Sets `WORKDIR /app`, runs `node index.js`. Drops to a non-root user.

**`.dockerignore`:** `node_modules/`, `.env`, `.env.local`, `.git/`, `docs/`, `resources/` (volumes own this at runtime — should not be baked into the image), and `*.log`.

**`docker-compose.yml`:**

```yaml
services:
  imperial-library:
    image: ghcr.io/<owner>/imperial-library:latest
    container_name: imperial-library
    env_file: .env
    volumes:
      - resources:/app/resources
      - data:/app/data
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: 10m
        max-file: "3"

volumes:
  resources:
  data:
```

(Replace `<owner>` with the actual GitHub owner during implementation. Single-host file; no `version:` key needed for current Compose.)

## CI/CD pipeline

**Trigger:** push to `main`.

**Workflow `.github/workflows/deploy.yml`:**

1. **Job `build`**: checkout → `docker/login-action` against `ghcr.io` using the built-in `GITHUB_TOKEN` → `docker/build-push-action` builds and pushes both `:latest` and `:sha-<short>` tags. The image is public; consumers don't need GHCR auth to pull.
2. **Job `deploy`** (`needs: build`): `webfactory/ssh-agent` loads the deploy key from the `DEPLOY_SSH_KEY` secret; the workflow then runs:
   ```
   ssh -o StrictHostKeyChecking=accept-new $DEPLOY_USER@$DEPLOY_HOST \
     "cd $DEPLOY_PATH && docker compose pull && docker compose up -d"
   ```

**GitHub Secrets to configure (one-time, via the repo's Settings → Secrets):**

- `DEPLOY_SSH_KEY` — private half of an SSH key dedicated to this workflow.
- `DEPLOY_HOST` — VPS hostname or IP.
- `DEPLOY_USER` — non-root user on the VPS that owns the compose dir and is in the `docker` group.
- `DEPLOY_PATH` — absolute path on the VPS to the directory containing `docker-compose.yml` and `.env`.

**Image tags:** `:latest` is what the compose file pulls; `:sha-<short>` is published alongside for manual rollback (edit compose, re-deploy).

**Architecture:** single x86_64 image. (Assumption to confirm during implementation: the VPS is x86_64, not ARM. If ARM, the build job needs `docker/setup-qemu-action` + `platforms: linux/arm64`.)

## VPS one-time setup

Documented in the README, not automated:

1. Install Docker and the Compose plugin.
2. Create a non-root `bot` user (or whatever name) and add it to the `docker` group.
3. Create the deploy directory (e.g. `/srv/imperial-library/`), owned by that user.
4. Place `docker-compose.yml` and `.env` in that directory. The `.env` is built from `.env.example` with real values.
5. Append the deploy SSH key's public half to that user's `~/.ssh/authorized_keys`.
6. Run `docker compose up -d` once to bootstrap (subsequent updates come via the workflow).

## Operations

**Backups (operator responsibility, not in scope of this plan):**

- The `resources` and `data` volumes hold mutable state. The volume mountpoints under `/var/lib/docker/volumes/<volume>/_data` should be included in whatever VPS-level backup the operator already runs (host-level `rsync` cron, restic, etc.).
- The host `.env` should be backed up out-of-band. Losing it means re-issuing the Discord token via the developer portal.

**Logs:** `docker compose logs -f imperial-library`. Capped at 30 MB per container by the `logging:` block in compose. No external aggregation.

**EmeraldDB freshness:** card data loads once at boot. When EmeraldDB ships a new pack, manually run `docker compose restart imperial-library` on the VPS to pick it up. EL pack cadence makes a scheduled cron unnecessary.

**Secret rotation:** edit the host `.env`, then `docker compose restart`. For the Discord token specifically: rotate in the Discord developer portal first, then update `.env`.

**Rollback:** edit `docker-compose.yml` to pin a specific `:sha-<short>` instead of `:latest`, then `docker compose pull && up -d`. Manual but real.

## Open questions

- VPS architecture: assumed x86_64. If it's ARM, the workflow needs a multi-arch (or arm64-only) build.

## Acceptance criteria

- A push to `main` builds an image, publishes it to GHCR, and the running bot on the VPS picks up the new image without manual intervention.
- The bot's runtime data (`resources/aliases.yml`, `resources/serverWhitelist.yml`, the SQLite query log) survives `docker compose down && up`.
- A fresh VPS can be brought up by following the README's one-time setup, given a populated `.env` and the deploy SSH key authorized.
- MySQL is no longer a declared or installed dependency.
