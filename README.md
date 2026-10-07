# XBR CRM

Private CRM product built on the [Frappe Framework](https://github.com/frappe/frappe). It is forked from a customised in-house fork of [Frappe CRM](https://github.com/frappe/crm), not from vanilla `frappe/crm`, and is licensed under the AGPLv3 (see [LICENSE](LICENSE)).

## Identity

| | |
| :-- | :-- |
| Python app | `xbr_crm` (`app_title = "XBR CRM"`) |
| Assets | `/assets/xbr_crm/` |
| API paths | `xbr_crm.api.…` |
| Module Defs | `FCRM`, `Lead Syncing`, `Domain Enrichment` — deliberately **not** renamed (renaming means rewriting the `module` field in every doctype JSON, and is only needed to run alongside Frappe CRM on one bench) |

## Running locally

The app has its own bench and is symlinked into it, so this directory is the only working copy.

| | |
| :-- | :-- |
| Bench | `~/xbr-bench` (Frappe v16, Python 3.14, MariaDB) |
| Site | `xbr.local` |
| Ports | web 8002, socketio 9002, redis queue 11002, redis cache 13002 |
| URL | http://localhost:8002 (`Administrator` / `admin`) |

```sh
cd ~/xbr-bench && bench start
```

### Building the frontend

The Vue SPA in `frontend/` builds into `xbr_crm/public/frontend/` and `xbr_crm/www/crm.html`. Both are build output and git-ignored, so a fresh checkout must be built before the app will load:

```sh
cd ~/xbr-bench
bench build                       # Frappe's own assets + the xbr_crm SPA
bench --site xbr.local clear-cache
```

`bench build --app xbr_crm` rebuilds only this app. For hot reload, run `yarn dev` in `frontend/` and open the Vite dev server.

## Features added on top of Frappe CRM

- **Multi-tenancy** — `crm_company` on every tenant-scoped doctype, `CRM Company Member` mapping users to companies, and a strict mode. See `xbr_crm/permissions/tenancy.py` and `xbr_crm/tenancy/`.
- **Sales hierarchy permissions** — a Sales User sees a lead or deal only if they own it or are assigned to it; managers see their subtree. See `xbr_crm/permissions/org_hierarchy.py` and [docs/user-hierarchy.md](docs/user-hierarchy.md).
- **Desk blocked for non-admins** — `xbr_crm/utils/desk_guard.py`.
- **Website lead capture API** — `xbr_crm.api.web_lead.capture_inquiry`, with API-key auth, dedup, retry idempotency and an audit log. See [docs/web_lead/INTEGRATION.md](docs/web_lead/INTEGRATION.md).
- **Record origin** — read-only `custom_created_via` (Manual / Website / Email / API / Import) on leads and deals. See `xbr_crm/api/lead_origin.py`.

## Tests

```sh
cd ~/xbr-bench && bench --site xbr.local run-tests --app xbr_crm
cd frontend && yarn test:run
```
