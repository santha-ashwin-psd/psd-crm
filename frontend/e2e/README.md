# End-to-end tests

Real browser, real Frappe bench, real database. These exist to cover the wiring
the 5,515 unit tests cannot reach: routing, auth, the API contract, and whether
a page that mounts under happy-dom also mounts against the built bundle.

A spec here should fail for a reason no unit test could catch. If it would pass
or fail the same way with the server stubbed, it belongs in `tests/unit/`.

## Running them

The bench is a **prerequisite**, not something Playwright starts — a Frappe boot
is slow enough to dominate the run, and killing one mid-run leaves redis and the
workers in a state the next run inherits.

```bash
# once per machine
cd frontend && yarn && npx playwright install chromium

# the stack (from frappe-bench/)
redis-server config/redis_cache.conf --daemonize yes
redis-server config/redis_queue.conf --daemonize yes
bench serve --port 8001

# the tests (from frontend/)
yarn test:e2e
yarn test:e2e --headed          # watch it happen
yarn test:e2e --ui              # pick and step through
```

Point them elsewhere with `CRM_E2E_URL`.

## The login it uses

A dedicated account, created by `e2e/seed-user.py`:

| | |
|---|---|
| email | `e2e@crm.test` |
| password | `e2e-playwright-local` |
| roles | System Manager, Sales Manager, Sales User |

Deliberately a **new** account rather than a password change on Administrator or
on one of the `crm.*` test fixtures — nothing existing is touched, and removing
it is one delete. The password is in the repo on purpose: it exists only on a
local dev bench and the suite needs a credential it can use unattended.
Override with `CRM_E2E_USER` / `CRM_E2E_PASSWORD`.

```bash
bench --site crm.local console < frontend/e2e/seed-user.py   # create
```

## How it is wired

Three Playwright projects, in order:

1. **setup** — logs in through the real login form once, skips the onboarding
   overlay, and saves the session to `e2e/.auth/user.json`.
2. **chromium** — everything else, reusing that session.
3. **login** — the login form's own spec, which must start logged out. It runs
   **last** on purpose: signing the same user in from a fresh context gets a new
   session from Frappe, and running it first left the later specs holding a
   cookie the server had stopped honouring. Nothing reported an auth error —
   pages still rendered from the shell while API-backed things silently did
   nothing, which looks exactly like a broken button.

## Two specs are skipped, with reasons in the file

Both are recorded rather than deleted, next to the flow they concern:

- **`a new deal is created…`** — the spec assumes an empty list and opens the
  form via the empty state's button, which does not exist once the site has
  deals. The fix is for it to own its fixtures rather than to add more waiting.
- **`the header Create button opens the same dialog`** — opens reliably when
  its file runs alone, never under the full suite, through 30s of retried
  clicks with no interception reported. Real defect or suite state; asserting
  either would be guessing.

## Writing a new one

- **Do not guess selectors.** Dump what actually rendered:
  `console.log(await page.locator('body').ariaSnapshot())`. Every selector here
  that was written from the source rather than from the page was wrong — the
  sidebar entries are `<button>`s, not links, and the SPA router's base is `/`,
  so the app's URLs are `/deals/view/list`, not `/crm/deals/view/list`.
- **Own your data.** Create what you assert on and delete it afterwards. The
  skipped spec above is what happens otherwise.
- **Waiting for an element is not waiting for the app.** Controls paint before
  their handlers attach; an early click silently no-ops.
