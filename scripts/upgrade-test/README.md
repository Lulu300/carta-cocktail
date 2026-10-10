# Upgrade test bench

Replays Carta Cocktail upgrades with Docker on a copy of a real production database, then checks that the instance still works after each jump. Run it on the last pre-release before tagging a final release (see "Releases" in `docs/plan/README.md`).

```bash
node scripts/upgrade-test/run.mjs --fixture ~/carta-fixtures/ami --layout friend --path 1.4.0,1.5.0,1.6.0-rc.1
node scripts/upgrade-test/run.mjs --fixture ~/carta-fixtures/ami --layout official --path 1.4.0,1.6.0-rc.1 --mode conformant
node scripts/upgrade-test/run.mjs --fixture ~/carta-fixtures/ami --layout friend --path 1.6.0-rc.1,local
node scripts/upgrade-test/run.mjs --clean-all      # remove what a --keep run left behind
node --test scripts/upgrade-test/test/*.test.mjs  # unit tests of the bench
```

Needs Node 20 or newer and Docker with Compose v2. No npm dependency. The published images are `linux/amd64` only: on Apple Silicon they run under emulation, so a full path takes several minutes.

## Fixture

A folder, **never stored in this repository** (it holds personal data), with:

| File | Content |
|---|---|
| `carta_cocktail.db` | the production database, copied while the backend was stopped |
| `uploads.tgz` | the photos: a flat `uploads/` folder, files named as in `Cocktail.imagePath` |

The bench never writes to the fixture. It works on copies in the system temp folder (`$TMPDIR/carta-upgrade-test/`). In the copy, it replaces the admin email with `admin@example.test` and the password hash with a bcrypt hash of a random test password, so the real credentials are never used nor shown.

## Options

| Option | Meaning |
|---|---|
| `--fixture <dir>` | fixture folder (required) |
| `--layout <name>` | `friend` or `official`, see below (required) |
| `--path <list>` | versions in order, e.g. `1.4.0,1.5.0,1.6.0-rc.1` (required). `local` builds the backend and frontend images from the checkout |
| `--mode <mode>` | `naive`, `conformant` or `both` (default) |
| `--local-version <v>` | release notes followed by a `local` step (default: the newest hook file) |
| `--report-dir <dir>` | default `<fixture>/../upgrade-test-reports/<date>/` |
| `--timeout <s>` | wait for each backend start, default 300 |
| `--keep` | keep the containers, volumes and work folder of a run that failed |

Exit code: `0` when every check gives the expected result, `1` when a check or a required action fails unexpectedly, `2` for a setup error (wrong option, missing fixture, image not found).

## Layouts

A layout is a folder in `layouts/` with a `layout.mjs`, one compose template per compose file generation (`compose-<version>.yml`) and an env file template. Placeholders (`{{BACKEND_IMAGE}}`…) are filled in by the bench; ports are published on `127.0.0.1` with free host ports.

- **`friend`**: a self-hosted setup seen in the field. Bind mounts `./data:/app/data` and `./uploads:/uploads` (photos where v1.4.0 wrote them), secrets in an `env_file` holding only `JWT_SECRET` (46 characters) and `ADMIN_PASSWORD` (6 characters), `ADMIN_EMAIL` and `DATABASE_URL` in `environment`, an external network, `:latest` images. The bench uses random values of the same lengths.
- **`official`**: `docker-compose.prod.yml` as published, with the named volumes `db-data` and `uploads`, and a `.env` with `JWT_SECRET`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`. As with a real v1.4.0 install, the photos start inside the backend container, in `/uploads`.

## Modes and hook files

- **naive**: only the image tags change.
- **conformant**: before and after each jump, the bench applies the required actions of the release notes of every version crossed by the jump, oldest first (1.4.0 → 1.6.0-rc.1 applies the 1.5.0 then the 1.6.0 actions). A pre-release follows the notes of its target version.

`hooks/<version>.mjs` describes one release:

- `profile`: how the version behaves (upload folder, migrations, journal mode, expected log lines, known bugs). A version without a hook file inherits the profile of the previous one.
- `before` / `after`: the required actions, each linked to its step in the notes. Actions are implemented in `lib/actions.mjs`: `rescueUploads`, `restoreUploads`, `ensureJwtSecret`, `updateCompose` (switch to another compose template of the layout), `requireStarted`, `copyDatabase`, `checkDatabaseCopy`, `checkDefaultAdminPassword`, `manual` (reported, not automated).
- `naiveMayFail`: what the notes say breaks when the actions are skipped. In naive mode, these failures, and the ones already present at the previous step, are reported as expected and do not change the exit code.

Add a hook file for each release that has required actions, in the same pull request as its release notes.

## Checks

After each start or jump:

| Check | How |
|---|---|
| Start, or clean refusal | API ready line, or container stopped/restarting; a refusal must print the refusal message and leave the database file unchanged |
| Log lines | `profile.startupLogs`, plus `profile.baselineLogs` on the first start of a database created by `db push` (backup `pre-migrate-*`, `0_init` baseline) |
| `prisma migrate status` | versions with migrations |
| Admin login | `POST /api/auth/login` then `/api/auth/me`. v1.4.0 rewrites the admin password from `ADMIN_PASSWORD` at each start: from then on the bench expects that password, and checks it still works after each jump |
| Public API | menu list, each public menu, each cocktail recipe of a public menu |
| Photos | each `Cocktail.imagePath`, through the backend and through the frontend nginx of the same version |
| Upload folder | the upload folder of the version is on a mount, so photos survive a container recreation |
| Database | backend stopped: row count of each table vs the fixture (no loss), `PRAGMA integrity_check`, journal mode, `pre-migrate-*` backup |

## Report and cleanup

The Markdown report has a summary table, then one table per step and per mode. It holds counts and statuses only: no email, hash, name or other data read from the database. Raw container logs stay in the work folder, which is deleted with the rest.

Containers, volumes and networks are prefixed with `carta-ut-` and removed at the end of each run, unless the run failed with `--keep`. The helper image `carta-upgrade-test-sqlite:1` (Alpine with `sqlite3`) and the `local` images are kept between runs.
