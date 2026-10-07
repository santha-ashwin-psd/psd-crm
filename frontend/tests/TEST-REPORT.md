# CRM Frontend — Test & Fix Report

**5,545 tests · 197 suites · 0 failing · build clean**

This report records what was tested, what failed on the first run, what the
diagnosis was, what changed, and the result afterwards. Every "before" figure
below is an actual failing run, not a reconstruction.

- [1. How to run](#1-how-to-run)
- [2. Headline results](#2-headline-results)
- [3. Coverage](#3-coverage)
- [4. Infrastructure repairs](#4-infrastructure-repairs)
- [5. Every failed case, before and after](#5-every-failed-case-before-and-after)
- [6. Bugs found in the application](#6-bugs-found-in-the-application)
- [7. Issues documented, not fixed](#7-issues-documented-not-fixed)
- [8. Suite inventory](#8-suite-inventory)
- [9. What is not covered](#9-what-is-not-covered)
- [10. Conventions for adding tests](#10-conventions-for-adding-tests)

---

## 1. How to run

```bash
cd frontend

yarn test            # watch mode
yarn test:run        # single pass — what CI should run
yarn test:coverage   # with the coverage table
yarn test:run tests/unit/noteFilters.test.js   # one suite
```

Full run takes roughly six minutes. Nothing talks to a bench, a database, or a
network.

Four tools measure whether the tests actually constrain the code, rather than
merely running it. See
[section 6](#how-strong-is-this-suite--a-measurement-not-an-assertion).

```bash
yarn test:mutants    # 18 curated mutants; fails the build if one survives
yarn test:sample     # random sampling — the unbiased score
yarn test:sample 30 424242            # count and seed, for a reproducible run
yarn test:audit      # did a mutation tool leave damage in the tree?

# after writing a regression test: does it actually pin that line?
node tests/mutation/check.js src/components/Filter.vue 212 '||' '&&' Filter.test.js
```

Run `test:audit` after any mutation run and before committing. The other three
edit real source files, and a restore that silently fails leaves a one-token
change the test suite is structurally unable to notice — four have already been
found this way.

⚠️ **Do not edit files under `src/` while `test:mutants` or `test:sample` is
running.** They hold a backup of the file they are mutating and copy it back
afterwards, which will overwrite anything written in between.

Production build (needs the raised heap or it aborts with exit 134):

```bash
NODE_OPTIONS="--max-old-space-size=8192" yarn build
```

---

## 2. Headline results

| | Before this work | After |
|---|---|---|
| Test suites | 8 | **197** |
| Tests | ~150 | **5,545** |
| Failing | 0 | **0** |
| Components covered | 0 | **324 of 324** |
| Component testing possible? | **No** | Yes |
| Coverage (whole frontend) | not measured | **80.7%** statements, 71.6% branches |
| Mutation score (random sample) | not measured | **67%** |

Coverage says a line *ran*. The mutation score says something would *complain*
if it were wrong, which is the harder and more useful question — see
[section 6](#how-strong-is-this-suite--a-measurement-not-an-assertion).

---

## 3. Coverage

| Layer | Coverage | Status |
|---|---|---|
| Stores | **93.6%** | Complete — all 9 |
| Composables | **83.9%** | Complete — all with real logic |
| Utils | **83.3%** | Pure helpers done |
| **Pages** | **71.4%** | Complete — all 22 |
| **Components** | **78.8%** | Complete — all 324 have a suite |
| **Whole frontend** | **79.2%** | 13,265 of 16,747 statements |
| **Branches** | **67.9%** | 8,484 of 12,500 |

**322 of 324 components have a suite that exercises them**, and all 22 pages
do. So does every store and every composable with
logic in it.

`src/components/` is the bulk of the frontend at 12,537 of 16,451 statements.
The largest single components — `ViewControls.vue` (1,519 lines),
`SidePanelLayout.vue` (824), `FieldLayoutEditor.vue` (680), `AppSidebar.vue`
(794), `ExotelCallUI.vue` (590) and `TwilioCallUI.vue` (550) — each have a
suite of their own.

The remaining 24% is not whole components but the branches inside them:
error paths that need a specific server response, drag-and-drop handlers that
need real pointer events, and the class-name computeds that only produce
strings.

> The original coverage config measured only four hand-picked files, so it
> reported a healthy number against a shortlist. It now measures everything we
> intend to cover, including components, which is why the headline is low. A low
> number that is true beats a high number that is not.

---

## 4. Infrastructure repairs

Before any component could be tested at all, four things had to be fixed. Each
blocked the next, which is why the order matters. A fifth surfaced later, when
the first page to import a `.jsx` file was covered; a sixth much later still,
and it had been silently corrupting runs the whole time.

| # | Problem | Before | After |
|---|---|---|---|
| I1 | `vitest.config.js` declared no plugins, so `.vue` files could not compile | Every component suite failed at import: *"content contains invalid JS syntax. Install @vitejs/plugin-vue"* | Added `vue()` + `vueJsx()`. Suites compile. |
| I2 | `~icons/*` are virtual modules from the frappe-ui vite plugin | *"Failed to resolve import `~icons/lucide/check` from src/utils/index.js"* — any test touching the utils barrel failed, not just component tests | Aliased the namespace to `tests/helpers/iconStub.js` |
| I3 | frappe-ui ships extensionless relative imports (`'./resources'`) | *"Cannot find module …/frappe-ui/src/resources/resources"* — node's ESM loader requires the extension | `test.server.deps.inline: ['frappe-ui']` routes it through vite's resolver |
| I4 | `__()` inside a `<template>` resolves through the component instance, not module scope | Every mount died with `_ctx.__ is not a function` | Mount helper registers `__` as a global property, as `translationPlugin` does in the app |
| I5 | `.jsx` was compiled with **React's** JSX runtime | *"Failed to resolve import `react/jsx-dev-runtime` from src/utils/dialogs.jsx"* — any suite importing a file that reaches `utils/dialogs.jsx` failed to collect at all | Added `oxc: { include: /\.ts$/ }` to the config |
| I6 | Nothing stopped a test reaching the network | One un-mocked component produced **7,703 unhandled rejections**, held the Vite server open past the end of the run, and made a dozen unrelated tests flake — while the suite reported green | `tests/setup.js` now throws on `fetch`, so the failure lands in the test that caused it |

Supporting files added:

| File | Purpose |
|---|---|
| `tests/helpers/mount.js` | `mountComponent()` — stubs the nine frappe-ui components `main.js` registers globally, and installs `__` |
| `tests/helpers/pinia.js` | `withPinia()` and `fakeResource()` — a stand-in for `createResource`/`createListResource`, which otherwise fetch on creation |
| `tests/helpers/iconStub.js` | Inert stand-in for every `~icons/*` import |


### I5 in detail — a warning that had been printing all along

`@vitejs/plugin-vue-jsx` keeps the built-in transformer away from `.jsx` by
setting `esbuild: { include: /\.ts$/ }`. Vite now uses **oxc** instead of
esbuild, so that setting is ignored — and oxc compiles `.jsx` with React's
automatic runtime by default. Every test run had been printing:

> `esbuild` option was specified by "vite:vue-jsx" plugin … Both esbuild and oxc
> options were set. oxc options will be used and esbuild options will be ignored.

Nothing failed for a long time because no covered file transitively imported
`src/utils/dialogs.jsx`. `pages/Leads.vue` is the first that does, and its suite
would not even collect.

Mirroring the restriction onto `oxc` hands `.jsx` back to `vue-jsx`. Worth
noting the config already carried `exclude: ['src/utils/dialogs.jsx']` under
**coverage** — someone had met this file before and worked around the symptom
rather than the cause. Coverage exclusion does not affect transformation.

The full suite was re-run afterwards to confirm the change did not alter how
anything else compiles: 101 suites, 2,170 tests, unchanged.

---

### I6 in detail — a green run with 7,703 errors under it

A run reported `196 passed · 5,515 passed` and then, below the summary:

```
Vitest caught 7703 unhandled errors during the test run.
NetworkError: Failed to execute "fetch()" on "Window" with URL
  "http://localhost:3000/frappe.desk.form.load.getdoctype?doctype=CRM+Task"
Tests closed successfully but something prevents Vite server from exiting
```

`taskStatusOptions()` calls `getMeta('CRM Task')`. One suite mounted a component
that reaches it without mocking `@/stores/meta`, so the call fell through to the
real store, which created a real resource, which called `fetch`. happy-dom
attempts the request rather than refusing it.

Three things made this hard to see, and each is worth naming separately:

- **The rejection has no test attached.** It resolves after the test that
  started it has finished, so vitest can only report it at the end of the run,
  as a count.
- **The count is not the cause.** 7,703 errors came from *one* missing mock,
  because the resource retries and every mount repeats it. The number says
  nothing about how many problems there are.
- **It reported green.** Nothing failed. The only visible symptoms were the
  hanging Vite server and — much worse — twelve tests in `ViewControls` and
  `TelephonyCallUI` that failed in the full run and passed in isolation. Those
  looked like flaky tests in files that had nothing to do with the cause.

The fix has two halves, and the second is the one that matters:

```js
// tests/setup.js
globalThis.fetch = () => {
  throw new Error('A test tried to reach the network. Mock the store …')
}
```

Adding the missing `getMeta` mock fixes today's instance. Throwing on `fetch`
means the next one fails **in the test that causes it, with the URL in the
message**, instead of as an anonymous flood at the end. Applying it turned
7,703 unattributed errors into two named failing tests, in the file responsible,
in one run.

That is the same lesson as the mutation-restore audit, from the other side: the
useful move is not to catch the problem better, it is to move the failure to
where someone can see it.

## 5. Every failed case, before and after

Thirty-one distinct test failures occurred across the work. Each is listed with
its cause and outcome. **Twenty-one were faults in the test I had written; nine
were genuine defects in the application; two were infrastructure.**

### 5.1 Failures caused by defects in the application

These are the ones that mattered.

#### F1 — `usersStore`: a background fetch overwrote a real name with an email

| | |
|---|---|
| **Suite** | `usersStore.test.js` |
| **Before** | 26 passed, **1 failed** — *"expected 'bob@example.com' to be 'Bob Brown'"* |
| **Test** | "upgrades an existing record rather than replacing it" |
| **Diagnosis** | `normalizeUser()` always fabricates a `full_name`, falling back to the identifier when the payload lacks one. Both merge sites then did a plain spread, so a partial record overwrote *Bob Brown* with *bob@example.com*. |
| **Impact** | User-visible. Names silently degrading to email addresses across avatars, assignment chips and comment authors — on a timer, after the page had already rendered correctly. |
| **Fix** | Added `mergeUser()` in `src/stores/users.js`, used by both paths: keeps an existing real name when the incoming one is only the fallback. |
| **After** | **27 passed, 0 failed** — including a new test asserting a genuine rename still lands, so the guard cannot freeze names. |

#### F2 — `useBroadcast`: every listener leaked on unmount

| | |
|---|---|
| **Suite** | `useBroadcast.test.js` |
| **Before** | Written as a regression test; the handler still fired after unmount |
| **Diagnosis** | `bus.on` registered an anonymous wrapper `(e) => handler(e.detail)` but never kept it; `bus.off` called `removeEventListener` with the *original* handler. Reference comparison — it removed nothing. |
| **Impact** | User-visible over time. `on()` is used by the Deal page, the Leads page and two modals. Every visit added a permanent window listener still firing into unmounted components. |
| **Fix** | `bus.on` now returns the wrapper; the composable stores it for teardown. |
| **After** | **20 passed, 0 failed** — one test asserts silence after unmount, another mounts twice and asserts the handler fires exactly once. |

#### F3 — `statusesStore`: `getCommunicationStatus()` indexed the wrong object

| | |
|---|---|
| **Suite** | `statusesStore.test.js` |
| **Before** | Lookup returned `undefined` for every real status |
| **Diagnosis** | Returned `communicationStatuses[name]` — the list resource itself — instead of `communicationStatusesByName[name]`. Its two siblings in the same file do it correctly. |
| **Impact** | None today: zero callers outside the store. It would have broken the moment anyone used it. |
| **Fix** | One-word correction to match its siblings. |
| **After** | **18 passed, 0 failed** |

#### F4 — `utils/index.js`: `cstr(undefined)` threw

| | |
|---|---|
| **Suite** | `utilsIndex.test.js` |
| **Before** | `cstr(undefined)` → `TypeError: Cannot read properties of undefined (reading 'toString')` |
| **Diagnosis** | Guarded with `s === null`. Strict equality misses `undefined`. Hidden because its main caller `isNull()` short-circuits on `undefined` first. The same-named helper in `utils/numberFormat.js` always handled both. |
| **Fix** | Loose `s == null`. Nothing could depend on the old behaviour — the old behaviour was a thrown TypeError. |
| **After** | **Passing**, with an explicit "does not throw on undefined" test. |

#### F5 — `getFormat()`: a fallback that could never fire

| | |
|---|---|
| **Suite** | `utilsIndex.test.js` |
| **Before** | With no `sysdefaults.date_format`, `getFormat()` threw |
| **Diagnosis** | `window.sysdefaults.date_format.replace(…) \|\| 'YYYY-MM-DD'` — `.replace` throws *before* the `\|\|` is evaluated, so the default was unreachable dead code. |
| **Impact** | Latent in production (Frappe always injects `sysdefaults`); fires wherever boot data is missing. |
| **Fix** | Moved the fallback onto the source value, with optional chaining. |
| **After** | **Passing**, with a test asserting it does not throw and returns the default. |

#### F6 — `isFieldVisible()` returned a non-boolean

| | |
|---|---|
| **Suite** | `FieldVisibility.test.js` |
| **Before** | 21 passed, **2 failed** — *"expected undefined to be false"* |
| **Diagnosis** | `display_via_depends_on` carries the *raw* result of the depends_on expression, so an unmet `eval:` condition made the predicate return `undefined`, and a met one could return a string such as `'Open'`. |
| **Impact** | None visible: both consumers use truthiness (`v-if`, and a `.filter().length` that decides whether a side-panel section renders). But a predicate named `isFieldVisible` returning `undefined` is a trap for anyone who writes `=== true`. |
| **Fix** | Wrapped both copies — `FieldLayout/Field.vue` and `SidePanelLayout.vue` — in `Boolean()`. Truthiness is unchanged. |
| **After** | **24 passed, 0 failed**, including a test asserting the return type. |

#### F7 — every task priority rendered the same colour

| | |
|---|---|
| **Suite** | `Icons.test.js` |
| **Before** | 241 passed, **7 failed** — among them *"expected 1 to be 3"* for "distinguishes the three priorities" |
| **Diagnosis** | The class binding was written with a **comma operator**: `({ 'bg-red-500': …, 'bg-yellow-500': …, 'bg-surface-gray-4': … }, $attrs.class)`. JavaScript evaluates the conditional object, discards it, and yields only `$attrs.class`. |
| **Impact** | User-visible. High, Medium and Low tasks all showed an identical uncoloured dot, so the priority column carried no information at all. |
| **Fix** | Changed to an array binding — `:class="[{ … }, $attrs.class]"` — which applies both the conditional classes and the caller's. |
| **After** | **248 passed, 0 failed**, with a test per priority colour and one asserting the caller's class still lands. |

#### F8 — the call timer double-padded its seconds past an hour

| | |
|---|---|
| **Suite** | `CountUpTimer.test.js` |
| **Before** | Reproduced directly: `getTime(3604)` returned `'1:00:005'` |
| **Diagnosis** | `secondsCount` was padded to a **string** (`'05'`), then re-tested with `secondsCount < 10`. That comparison coerces `'05'` back to `5`, so it padded a second time. A dead `minutesCount === 0` check sat alongside it, comparing a string to a number. |
| **Impact** | User-visible on any call past an hour whenever the seconds were single digit — ten seconds out of every minute. |
| **Fix** | Pad once, from the numbers, with `String(n).padStart(2, '0')`. |
| **After** | **15 passed, 0 failed**, including a test asserting the output always matches `/^\d+:\d{2}:\d{2}$/` past an hour. |

#### F9 — the assign panel threw on mount whenever a document had assignees

| | |
|---|---|
| **Suite** | `AssignToBody.test.js` |
| **Before** | 14 tests passed, but Vue logged `ReferenceError: Cannot access 'addAssignees' before initialization` on eight of them |
| **Diagnosis** | The `open` watcher is registered with `{ immediate: true }`, so its callback runs **synchronously during setup**. With `open: false` it calls `updateAssignees()`, and on a document that already has assignees the no-change early return does not fire — so it reaches `addAssignees`, a `const` declared *below* the watcher and therefore still in its temporal dead zone. |
| **Impact** | User-visible in the console on every mount of the assign popover for an already-assigned deal or lead, with the assignment-sync logic aborting mid-flight. Passing tests hid it because Vue catches watcher errors and logs rather than rethrows. |
| **Fix** | Moved both `createResource` declarations above the watchers. Pure reordering — nothing else changes. |
| **After** | **16 passed, 0 failed**, no console errors, with a regression test asserting a clean mount for an already-assigned document. |

### 5.2 Failures caused by faults in my tests

Recorded in full, because each one is a trap the next person will hit.

| # | Suite | Before | What I got wrong | After |
|---|---|---|---|---|
| T1 | `noteFilters` | 204 passed, **2 failed** | Asserted `stripHtml` cleanly handles `>` inside an attribute value — it does not (see [D1](#7-issues-documented-not-fixed)). Also searched for the single letter `"p"` and was surprised to match: *Discussed*, *quote* and *Pricing* all contain a p. | 21 passed |
| T2 | `utilsIndex` | 117 passed, **1 failed** | Asserted `isNull([])` is `false`. It is `true` — an empty array stringifies to `''`, which for a table or multi-select field value is genuinely empty. The code is right. | 119 passed |
| T3 | `metaStore` | 25 passed, **2 failed** | `structuredClone()` on cached fields — they are reactive proxies, which it refuses. Also asserted a numeric `precision: 0` yields 0 decimals (see [D3](#7-issues-documented-not-fixed)). | 28 passed |
| T4 | `expressions` | 20 passed, **2 failed** | Asserted `evaluateDependsOnValue(false)` returns `false`; the `if (!expression) return true` guard catches literal `false` first (see [D4](#7-issues-documented-not-fixed)). Also asserted an `eval:` expression returns a boolean — it returns the raw value, `0`. | 23 passed |
| T5 | *all component suites* | **18 failed** in `ListPagination` | `__()` in a template needs a global property — infrastructure, fixed as [I4](#4-infrastructure-repairs) | — |
| T6 | `ListPagination` | 15 passed, **3 failed** | Assumed the ellipsis was a `.pg-page` button. It is a `<span>`, which shifted my click index — I was clicking page 10 while asserting page 3. | 22 passed |
| T7 | `CollapsibleSection` | 14 passed, **3 failed** | Claimed the chevron defaults to the right. It defaults to **left**; only `FieldLayout/Section.vue` passes `right`. Also used `isVisible()`, which does not see through the transition stub VTU substitutes, though the DOM correctly carries `display: none`. | 17 passed |
| T8 | `QuickFilterField` | 12 passed, **1 failed** | Asserted the magnifier renders as my stub. `QuickFilterField` *imports* FeatherIcon, so the real svg renders. | 13 passed |
| T9 | `MultipleAvatar` | 14 passed, **1 failed** | The mirror image of T8 — `Icon.vue` uses FeatherIcon via *global registration*, so the stub renders, not the real glyph. | 15 passed |
| T10 | `DashboardItem` | 15 passed, **4 failed** | Chart stubs had no `name`, so `findComponent({ name })` could not match them. | 19 passed |
| T11 | `SidebarLink` | **suite failed to load** | Mocked the whole of `vue-router`; the import chain `SidebarLink → Icon → @/utils → stores/users → session → @/router` needs the real `createRouter`. Then 1 further failure: tried to assign to `isMobileView`, which is a computed off window size, not a ref. | 18 passed |
| T12 | `globalStore` | 5 passed, **1 failed** | Compared `store.$dialog` by identity. Pinia wraps whatever a setup store returns in `reactive`, so the store holds a proxy. | 6 passed |
| T13 | `useTimelinePreferences` | 6 passed, **3 failed** | Time-dependent fixture: my "past" date was three hours in the future at the moment the suite ran, so the function correctly returned *"in 3 hours"*. Then 1 further failure: my settings stub was a plain object, so the composable's `computed` cached and never re-evaluated — the test was exercising the mock, not the code. | 9 passed |
| T15 | `GettingStartedBanner` | 5 passed, **8 failed** | My onboarding mock returned plain `{ value }` objects rather than real refs. Vue only unwraps genuine refs in a template, so the component compared objects instead of numbers and rendered `[object Object]`. Second instance of the same class as T13. | 13 passed |
| T16 | `UserDropdown` | **8 failed**, then 7 passed / **1 failed** | Two auto-fetching modules in the import graph (settings and notifications) leaked network calls; then a missing pinia instance; then I asserted "Log out" is a hardcoded menu entry — everything past the Personal group comes from `FCRM Settings.dropdown_items`. | 11 passed |
| T22 | `CountUpTimer` | 14 passed, **1 failed** | Called `getTime()` directly and expected `stop()` to return it. `updatedTime` is only written by the interval tick, so the timer has to actually run. | 15 passed |
| T20 | `DurationInput` | 28 passed, **1 failed** | Asserted Enter-then-blur commits once. The `isCommitting` guard is sound — a real `.blur()` fires synchronously inside the guarded window — but my stub has no element to blur, so the guard had already been released. Rewrote to test the guard directly. | 29 passed |
| T21 | `RatingInput` | 21 passed, **1 failed** | Asserted the fifth star reads as "removing" at a saved value of 0.8. That is 4 of 5 stars, so the fifth was never filled and is correctly empty. | 22 passed |
| T19 | `Icons` | 241 passed, **7 failed** | Two of my own alongside [F7](#f7--every-task-priority-rendered-the-same-colour): I asserted every icon renders an `<svg>`, but `TaskPriorityIcon` is a coloured `<div>`; and I spelled the task status `Cancelled` where the doctype uses `Canceled`. | 248 passed |
| T18 | `FieldVisibility` | 21 passed, **2 failed** | Passed `display_via_depends_on` as a prop; the component computes it itself from `data`, so my value was overwritten. Rewriting the tests to drive it through the document is what exposed [F6](#f6--isfieldvisible-returned-a-non-boolean). | 24 passed |
| T17 | `LinkControl` | 16 passed, **3 failed** | Asserted the child receives a `value` prop. `Link` binds with `v-model`, so it arrives as `modelValue`. | 19 passed |
| T14 | `ActivityHeader` | 18 passed, **1 failed** | Expected an `update:emailBox` emit. The handler sets a property on the model object rather than replacing it, so it shows up as a mutation. | 20 passed |
| T23 | `CalendarPage` | 82 passed, **1 failed** | Named the calendar stub `Calendar` — the same name as `pages/Calendar.vue` under test. `findComponent(stub)` falls back to name matching, so it returned the root wrapper and reported the `config` prop as `undefined`. Renamed the stub. | 83 passed |
| T24 | `MobileOrganizationPage` | 26 passed, **1 failed** | Mocked `sections` on `useDocument`, but this page builds its own local `createResource` for it. The inert factory left `data: null`, so `v-if="sections.data"` never opened and the panel was simply absent. | 27 passed |
| T25 | `MobileOrganizationPage` | 26 passed, **1 failed** | The `document.doc` fixture was `{}`, so `:docname="organization.doc.name"` bound `undefined`. A loaded document always has a `name`. | 27 passed |
| T26 | `DataImportPage` | **suite failed to load** | Declared the child stub as a top-level `const` and referenced it inside a `vi.mock` factory, which is hoisted above it — `ReferenceError: Cannot access 'DataImportStub' before initialization`. Wrapped it in `vi.hoisted`. | 7 passed |
| T27 | `MobileNotificationPage` | 11 passed, **1 failed** | Stubbed `LayoutHeader` with `true`. An auto-stub renders no slots, and the "Mark all as read" button lives in its `#right-header` slot, so it did not exist to click. | 12 passed |
| T28 | `MobileNotificationPage` | 12 passed, **network leak** | Spread `importOriginal()` for `@/stores/notifications` to keep its `dayjs.extend` side effect — which also ran its module-scope auto resource for real. Neutering `createResource` on the `frappe-ui` mock is what stops it. | clean |
| T29 | `LayoutEditorAndLoaders` | 20 passed, **1 failed** | Asserted `BrandLogo` reads `brand.brand_logo`. The settings store renames the field on the way out — `brand.logo = settings.brand_logo` — so the component reads `logo`. | 22 passed |
| T30 | `FieldLayoutEditor` | 59 passed, **but did not discriminate** | Wrote the wrong-index regression with three sections and opened the third section's menu. The buggy index (`0`, the tab) and the correct one (`2`) both resolve to `sections[1]`, so the test passed against the unfixed source. Rewritten with four sections. Found by the mutation check, not by the run. | 59 passed, 4 fail on revert |
| T31 | `ViewControls` | **114 failed** | Stubbed `Dialog` so it always rendered its default slot. The export form reads `list.data.total_count`, which is `null` until the first response, so every mount in the suite threw during render. The real Dialog renders its body only while open; the stub now does the same. | 114 passed |
| T32 | `ViewControls` | 113 passed, **1 failed** | Asserted a quick-filter box per filter without awaiting `nextTick` after setting the resource's data. | 115 passed |
| T33 | `ConditionsFilter` | 71 passed, **8 failed** | Stubbed `Dialog` so it always rendered its body. The nested-conditions editor lives inside it, so every mount carried a second "Add Condition" menu and the assertions drove the wrong one. | 79 passed |
| T34 | `FilesUploader` | 52 passed, **7 failed** | Built fake file objects as plain literals. `addFiles` calls `URL.createObjectURL` on anything image-shaped, and that only accepts a Blob. Also assigned a fake stream to `srcObject`, which happy-dom type-checks. | 59 passed |
| T35 | `TelephonyCallUI` | 40 passed, **12 failed** | Put `ExotelCallUI` and `TaskPanel` in the shared stub map — the same names as the components under test. VTU replaced the components themselves, so a whole describe block exercised the stub and **passed**. Only `CallUI` gets those stubs now. | see T36 |
| T36 | `TelephonyCallUI` | 40 passed, **12 failed** | Assigned a plain `{ parentElement }` object to the popup-header ref. That ref is handed to vueuse's `useDraggable`, which called `addEventListener` on it and threw *in a watcher* — killing the **next** test's mount, not its own. Real elements now. | 53 passed |
| T37 | `SmallShellComponents` | 37 passed, **2 failed** | Made the `createResource` mock fire `onSuccess` immediately for `auto: true`, which made "adds nothing until the server answers" impossible to test. The mock now waits to be driven. | 39 passed |
| T38 | `Layouts` | 48 passed, **4 failed** | `wrapper.find('button')` matched the mobile search icon, not Create. Also assumed every onboarding step's telemetry event is `..._${step.name}`; `setup_your_password` reports `..._setup_password`. | 53 passed |
| T39 | `PageWrappersAndAutocomplete` | 43 passed, **5 failed** | Guessed step names (`source-form`, `email-settings`) instead of reading them (`edit-source`, `user-email-settings`); assumed `ChangePasswordModal` was always mounted when it is `v-if`'d; and treated `inputClasses` as a string when it is an array of class groups. | 48 passed |

### 5.3 Failure with no assertion failure

| # | Suite | Symptom | Cause | Fix | After |
|---|---|---|---|---|---|
| U1 | `NoteArea` | 13 passed but the **run exited 1** on an unhandled fetch rejection to `localhost:3000` | `TimelineTimestamp`'s import graph reaches `stores/settings.js`, which builds an auto-fetching document resource *at module scope*. Stubbing the component does not help — the module still runs on import. | Neutered `createDocumentResource` in that suite's frappe-ui mock | 13 passed, clean exit |
| U2 | `NotesPage`, `CallLogDetailModal` | Both **reported as passing** while quietly firing real requests for `FCRM Settings` and the `CRM Call Log` doctype meta | Same module-scope cause as U1, but these two mocks passed `createDocumentResource` straight through. Vitest lists unhandled rejections *below* the pass summary, so a green "120 passed" sat directly under three live network errors. | Added the settings and meta store mocks to both suites | 120 suites, 0 errors |

U2 is the one worth internalising: **a green run is not proof of an isolated
run.** These two had been leaking since the round that introduced them, and the
summary line said `passed` every time. They were latent flakes — a machine with
something listening on port 3000 would have got different answers.

### 5.4 Files that silently destroyed others

This happened **twice**, the second time after the rule below had already been
written down.

| | First | Second |
|---|---|---|
| **Symptom** | Writing `EmptyState.test.js` destroyed the existing `emptyState.test.js`. No error, no warning — the utils suite simply vanished. | Writing `Telephony.test.js` destroyed the existing `telephony.test.js` (12 tests covering the telephony composable). Again silently. |
| **Cause** | macOS ships a case-insensitive filesystem, so the two names are the same file. On a Linux CI runner they would be two files, which makes this exactly the kind of bug that behaves differently on a colleague's machine. | Identical. |
| **How it surfaced** | The suite count dropped. | The failure output referred to `tests/unit/telephony.test.js` in lower case — a name I had not typed. |
| **Fix** | Renamed to `emptyStateUtils.test.js` and `EmptyStateComponent.test.js`, and recreated the lost suite. | Renamed to `TelephonyCallUI.test.js`, and rewrote the lost suite as `telephonyComposable.test.js` (13 tests over the same module). |

**Rule** — **test filenames must differ by more than case**, and the check
worth doing before writing a new suite is `ls tests/unit | grep -i <name>`, not
`ls tests/unit/<Name>.test.js`.

Recording the repeat rather than quietly fixing it: the lesson from the first
occurrence was written down and still did not prevent the second, which says
the rule needed to be a *check performed*, not a rule remembered.

---

## 6. Bugs found in the application

One hundred and nineteen fixed in total. One hundred would have been
user-visible.

> Earlier revisions of this report said "twenty-six … eighteen". Both were
> miscounts against the table below; the figures above are what the rows say.

| # | Bug | File | User-visible? | Status |
|---|---|---|---|---|
| B1 | Background fetch overwrote a real name with an email address | `stores/users.js` | **Yes** | Fixed |
| B2 | Every broadcast listener leaked on unmount | `composables/useBroadcast.js` | **Yes** | Fixed |
| B3 | 19 error handlers threw on non-API errors | 12 files | **Yes** | Fixed |
| B4 | Two error expressions wrong in *both* branches | `FailureLogs.vue`, `LeadSyncSourceForm.vue` | **Yes** | Fixed |
| B5 | Three Calendar handlers showed the literal word "undefined" | `pages/Calendar.vue` | **Yes** | Fixed |
| B6 | `cstr(undefined)` threw | `utils/index.js` | No | Fixed |
| B7 | `getFormat()` fallback unreachable | `utils/index.js` | No | Fixed |
| B8 | `getCommunicationStatus()` indexed the wrong object | `stores/statuses.js` | No | Fixed |
| B9 | `SettingsPage` rendered "ValidationError: undefined" | `Settings/SettingsPage.vue` | **Yes** | Fixed |
| B10 | `isFieldVisible()` returned `undefined` or a string, not a boolean | `FieldLayout/Field.vue`, `SidePanelLayout.vue` | No | Fixed |
| B11 | Task priority dots were all the same colour | `Icons/TaskPriorityIcon.vue` | **Yes** | Fixed |
| B12 | Call timer showed "1:00:005" past an hour | `CountUpTimer.vue` | **Yes** | Fixed |
| B13 | Assign panel threw on mount for any already-assigned document | `AssignToBody.vue` | **Yes** | Fixed |
| B14 | A no-op timer ran every 10 seconds for the component's lifetime | `EventNotificationPopup.vue` | No | Removed |
| B15 | Emoji telemetry always recorded an empty string | `CommentBox.vue`, `EmailEditor.vue` | No | Fixed |
| B16 | From-address picker shown even when the only account is the user's own | `EmailEditor.vue` | **Yes** | Fixed |
| B17 | Bulk edit could not set a field to 0 or untick a checkbox | `Modals/EditValueModal.vue` | **Yes** | Fixed |
| B18 | "Annual Revenue should be a number" could never fire | `Modals/LeadModal.vue`, `Modals/DealModal.vue` | **Yes** | Fixed |
| B19 | Contact section shown for layouts that have none | `Modals/DealModal.vue` | **Yes** | Fixed |
| B20 | Contact creation failures showed a blank error box | `Modals/ContactModal.vue` | **Yes** | Fixed |
| B21 | "Error converting to deal: undefined" on a network failure | `Modals/ConvertToDealModal.vue` | **Yes** | Fixed |
| B22 | No event spanning midnight could be saved, in any calendar surface | `composables/event.js` + 4 call sites | **Yes** | Fixed |
| B23 | Layout editors threw silently on an incomplete layout | `Modals/SidePanelModal.vue`, `DataFieldsModal.vue`, `QuickEntryModal.vue` | **Yes** | Fixed |
| B24 | Opening a record from a deep link discarded the whole query string | `pages/Notes.vue`, `Tasks.vue`, `CallLogs.vue` | **Yes** | Fixed |
| B25 | Task deep links never opened — the guard re-entered its own computed | `pages/Tasks.vue` | **Yes** | Fixed |
| B26 | Notification deep links anchored on the literal string `#undefined` | `pages/MobileNotification.vue` | **Yes** | Fixed |
| B27 | `updateField` discarded the server's reason and showed a generic error | `pages/Deal.vue`, `Lead.vue`, `MobileDeal.vue`, `MobileLead.vue` | **Yes** | Fixed |
| B28 | A failed multi-field clear set every field to `undefined` instead of restoring it | `pages/Deal.vue`, `Lead.vue`, `MobileDeal.vue`, `MobileLead.vue` | **Yes** | Fixed |
| B29 | No `Button` field ever showed its icon — the binding was a subtraction | `Controls/ButtonControl.vue` | **Yes** | Fixed |
| B30 | `showEye` threw on a numeric password value | `Controls/Password.vue` | No | Fixed |
| B31 | The fourth copy of the layout walk, still missing its `section.columns` guard | `Controls/GridRowFieldsModal.vue` | **Yes** | Fixed |
| B32 | Refusing an empty grid left the Save button spinning for good | `Controls/GridFieldsEditorModal.vue` | **Yes** | Fixed |
| B33 | One deleted field in a saved grid view took the whole editor down | `Controls/GridFieldsEditorModal.vue` | **Yes** | Fixed |
| B34 | The same stale-field case grew a blank, unfillable column in the grid | `Controls/Grid.vue` | **Yes** | Fixed |
| B35 | `new Array(len \|\| [])` made the expand-state list one entry too long | `Controls/Grid.vue` | No | Fixed |
| B36 | Settings forms read `.type` on a DocField, which has no such property | `Settings/SettingsPage.vue` | **Yes** | Fixed |
| B37 | Searching lead sync sources threw on a field that does not exist | `Settings/LeadSyncing/LeadSyncSources.vue` | **Yes** | Fixed |
| B38 | A refused rename still wrote the other fields, against `name: undefined` | `Settings/EmailTemplate/EditEmailTemplate.vue` | **Yes** | Fixed |
| B39 | A refused save still switched telephony on across the whole app | `Settings/Telephony/TwilioSettings.vue`, `ExotelSettings.vue` | **Yes** | Fixed |
| B40 | A telephony save failure with no `messages` reported nothing at all | `Settings/Telephony/TelephonySettings.vue` | **Yes** | Fixed |
| B41 | A primed delete confirmation survived reopening the dialog on another day | `Settings/Sla/WorkDayModal.vue` | **Yes** | Fixed |
| B42 | The same, in the SLA priority dialog | `Settings/Sla/EditResponseResolutionModal.vue` | **Yes** | Fixed |
| B43 | Editing one policy's working hours rewrote the defaults for every later policy | `Settings/Sla/utils.js` | **Yes** | Fixed |
| B44 | Clearing the SLA search shrank the list from 999 rows to 10, with no way back | `Settings/Sla/SlaPolicyList.vue` | **Yes** | Fixed |
| B45 | A refused SLA delete discarded the server's reason | `Settings/Sla/SlaPolicyList.vue` | **Yes** | Fixed |
| B46 | A refused SLA save still reported success and refreshed the list | `Settings/Sla/SlaPolicyView.vue` | **Yes** | Fixed |
| B47 | Assignee search matched case-sensitively, so a lowercase query missed surnames | `Settings/AssignmentRules/AssigneeSearch.vue` | **Yes** | Fixed |
| B48 | Switching off an inactive day removed a different day via `splice(-1, 1)` | `Settings/AssignmentRules/AssignmentScheduleItem.vue` | **Yes** | Fixed |
| B49 | A refused assignment-rule save still reported success | `Settings/AssignmentRules/AssignmentRuleView.vue` | **Yes** | Fixed |
| B50 | Three more error handlers discarded the server's reason | `Settings/Hierarchy/Hierarchy.vue` | No | Fixed |
| B51 | A refused form delete reported nothing and rejected unhandled | `Settings/Forms/FormsList.vue` | **Yes** | Fixed |
| B52 | A failed form-type switch rejected unhandled and explained nothing | `Settings/Forms/FormBuilderPanel.vue` | **Yes** | Fixed |
| B53 | Non-admins were offered the admin and manager roles — the guard was always true | `Settings/Users.vue` | **Yes** | Fixed |
| B54 | A missing API secret passed validation and was submitted | `Settings/emailConfig.js` | **Yes** | Fixed |
| B55 | Toggling only "create lead from incoming email" was silently discarded | `Settings/EmailEdit.vue` | **Yes** | Fixed |
| B56 | Every email-account failure was reported as bad credentials | `Settings/EmailEdit.vue`, `EmailAdd.vue` | **Yes** | Fixed |
| B57 | One checkbox was left as a raw 0/1, so an untouched account looked edited | `Settings/EmailAccountList.vue` | **Yes** | Fixed |
| B58 | Another error handler discarded the server's reason | `Settings/DefaultsSettings.vue` | No | Fixed |
| B59 | A failed invitation popped an empty toast — the handler had no fallback | `Settings/InviteUserPage.vue` | **Yes** | Fixed |
| B60 | Two more error handlers discarded the server's reason | `Settings/ERPNextSettings.vue` | No | Fixed |
| B61 | Saving a lead sync source with no lead form selected threw | `Settings/LeadSyncing/LeadSyncSourceForm.vue` | **Yes** | Fixed |
| B62 | Linked deals were unreachable, and unknown linked doctypes opened a blank tab | `ListViews/LinkedDocsListView.vue` | **Yes** | Fixed |
| B63 | An email whose quote marker had nothing after it overflowed the stack | `Activities/EmailContent.vue` | **Yes** | Fixed |
| B64 | A refused attachment change left the dialog open with no message | `Activities/AttachmentArea.vue` | **Yes** | Fixed |
| B65 | Comment edit and delete failures were reported as one generic sentence | `Activities/CommentArea.vue` | **Yes** | Fixed |
| B66 | Reply-all added a blank recipient from an empty Cc/Bcc header | `Activities/EmailArea.vue` | **Yes** | Fixed |
| B67 | A refused task delete or status change reported nothing | `Activities/AllModals.vue` | **Yes** | Fixed |
| B68 | A failed WhatsApp send destroyed the message the user had typed | `Activities/WhatsAppBox.vue` | **Yes** | Fixed |
| B69 | Jumping to a quoted message that was off-screen took the thread down | `Activities/WhatsAppArea.vue` | **Yes** | Fixed |
| B70 | A failed attachment preview opened an empty dialog with no explanation | `AttachmentItem.vue` | **Yes** | Fixed |
| B71 | A refused bulk delete left the confirmation open, saying nothing | `BulkDeleteLinkedDocModal.vue` | **Yes** | Fixed |
| B72 | Every drag left a `mouseup` listener behind; later clicks re-ran the teardown once per drag | `Resizer.vue` | No | Fixed |
| B73 | Section menu was handed the *tab* index, so sections moved their columns into the wrong section | `FieldLayoutEditor.vue` | **Yes** | Fixed |
| B74 | "Remove and move columns to next section" offered with no neighbour, and threw | `FieldLayoutEditor.vue` | **Yes** | Fixed |
| B75 | "Move Last Column to …" offered on an emptied section, pushing `undefined` and blanking the editor | `FieldLayoutEditor.vue` | **Yes** | Fixed |
| B76 | A column saved with no `fields` threw in the field count and in the available-fields list | `FieldLayoutEditor.vue` | **Yes** | Fixed |
| B77 | Parsed fields were written back into the layout, so `read_only_depends_on` became permanent | `SidePanelLayout.vue` | **Yes** | Fixed |
| B78 | A section saved with no columns threw while deciding whether to render, taking the panel with it | `SidePanelLayout.vue` | **Yes** | Fixed |
| B79 | A rejected field save printed "[object Object]" under the field | `SidePanelLayout.vue` | **Yes** | Fixed |
| B80 | `load_default_columns` was always true, so saving a view discarded its custom columns | `ViewControls.vue` | **Yes** | Fixed |
| B81 | The "Name" quick-filter option was offered twice, and again after being chosen | `ViewControls.vue` | **Yes** | Fixed |
| B82 | Duplicating a view renamed the original to "… (New)" on click, cancelled or not | `ViewControls.vue` | **Yes** | Fixed |
| B83 | Clicking the assignee cell of an unassigned row threw and took the list down | `ViewControls.vue` | **Yes** | Fixed |
| B84 | Export straight after a page load sent `page_length=undefined` | `ViewControls.vue` | **Yes** | Fixed |
| B85 | Removing a condition not in the list spliced from the end, taking two unrelated ones | `ConditionsFilter/CFConditions.vue` | No | Fixed |
| B86 | Grouping a condition not in the list replaced the last one instead | `ConditionsFilter/CFConditions.vue` | No | Fixed |
| B87 | Clearing a text condition left the number `0` in the filter | `ConditionsFilter/CFCondition.vue` | **Yes** | Fixed |
| B88 | A Select whose options come from a script threw while drawing its value box | `ConditionsFilter/CFCondition.vue` | **Yes** | Fixed |
| B89 | The file library could never be enabled — `disableFileBrowser \|\| true` | `FilesUploader/FilesUploaderArea.vue` | **Yes** | Fixed |
| B90 | The file-count limit applied per drop, so repeated drops got past it | `FilesUploader/FilesUploaderArea.vue` | **Yes** | Fixed |
| B91 | Removing one staged file removed every namesake with it | `FilesUploader/FilesUploaderArea.vue` | **Yes** | Fixed |
| B92 | Refusing camera access left the camera pane open and blank | `FilesUploader/FilesUploaderArea.vue` | **Yes** | Fixed |
| B93 | Multi-file upload reported only the last-started file and dropped the rest | `FilesUploader/FilesUploader.vue` | **Yes** | Fixed |
| B94 | One failed upload meant the successful ones were never reported | `FilesUploader/FilesUploader.vue` | **Yes** | Fixed |
| B95 | Attaching by web link never told the parent, so the file appeared only after a reload | `FilesUploader/FilesUploader.vue` | **Yes** | Fixed |
| B96 | The blue-grey column colour was an invalid class and rendered with no background | `Kanban/KanbanView.vue` | **Yes** | Fixed |
| B97 | Restoring a column by an unknown name deleted the last column | `Kanban/KanbanView.vue` | No | Fixed |
| B98 | A column whose rows had not loaded threw while rendering the board | `Kanban/KanbanView.vue` | **Yes** | Fixed |
| B99 | Two computeds read each other, so the picker kept offering fields already on the card | `Kanban/KanbanSettings.vue` | **Yes** | Fixed |
| B100 | Applying kanban settings threw when the saved column or title field was gone | `Kanban/KanbanSettings.vue` | **Yes** | Fixed |
| B101 | The attendee picker pushed "use what you typed" into the search resource itself — a throw before the first response, and a stale entry afterwards | `Calendar/Attendee.vue` | **Yes** | Fixed |
| B102 | A typed-in attendee was saved with `reference_docname: 'new'` | `Calendar/Attendee.vue` | **Yes** | Fixed |
| B103 | A null attendee list threw while rendering the field | `Calendar/Attendee.vue` | **Yes** | Fixed |
| B104 | "Number Chart" was added with no chart chosen, so the dashboard asked for a chart with no name | `Dashboard/AddChartModal.vue` | **Yes** | Fixed |
| B105 | A preferred calling integration that had been disabled still got the call | `Telephony/CallUI.vue` | **Yes** | Fixed |
| B106 | The calling-medium picker offered integrations that were not enabled | `Telephony/CallUI.vue` | **Yes** | Fixed |
| B107 | Setting up telephony again stacked a second socket listener, so every call event was handled twice | `Telephony/ExotelCallUI.vue` | **Yes** | Fixed |
| B108 | Opening the options list focused an input that might not exist yet | `frappe-ui/Autocomplete.vue` | No | Fixed |
| B109 | Answering "Going?" on an event you can see but were not invited to threw and took the panel down | `Calendar/CalendarEventPanel.vue` | **Yes** | Fixed |
| B110 | Setting attendance on a duplicated event asked the server to update `duplicate-event` | `Calendar/CalendarEventPanel.vue` | **Yes** | Fixed |
| B111 | An event with no end time rendered as "10 - Invalid Date Wed, 4 Mar 2026" | `Calendar/CalendarEventPanel.vue` | **Yes** | Fixed |
| B112 | The empty-title path focused an input that only exists in the editing views | `Calendar/CalendarEventPanel.vue` | No | Fixed |
| B113 | A boolean condition value was written as `true`, which is not a Python literal | `utils/index.js` | No | Fixed |
| ~~B114~~ | ~~A Link-to-User field threw before the users store loaded~~ | `FieldLayout/Field.vue` | — | **Withdrawn** |
| B115 | Filtering on a Select whose options come from a script threw — the second copy of B88 | `Filter.vue` | **Yes** | Fixed |
| B116 | Bulk-editing a Select whose options come from a script threw — the third copy of B88 | `Modals/EditValueModal.vue` | **Yes** | Fixed |
| B117 | The invite page threw when the user list had not been fetched — the one site calling `.map` with no guard | `Settings/InviteUserPage.vue` | **Yes** | Fixed |
| B118 | The deal detail pages read `.color`/`.type` off a status lookup that returns `undefined` until the statuses load — nine call sites, while the list views already guarded it | `pages/Deal.vue`, `MobileDeal.vue`, `DealModal.vue`, `ConvertToDealModal.vue` | **Yes** | Fixed |
| B119 | `getDealStatus()` with no name indexed `data[0]` on the `initialData: []` value | `stores/statuses.js` | **Yes** | Fixed |
| B120 | The call button read the primary contact one line *above* the guard that checks it exists | `pages/Deal.vue` | **Yes** | Fixed |
| B121 | `name?.length == 0` cleared the error for a *null* name, so an assignment rule could be saved unnamed | `Settings/AssignmentRules/AssignmentRuleView.vue` | **Yes** | Fixed |
| B122 | "Move Last Column to Next Tab" tested the *previous* tab — hidden where it works, offered where it throws | `FieldLayoutEditor.vue` | **Yes** | Fixed |

### B3 in detail — the largest of them

`toast.error(error.messages[0] || 'fallback')` assumes the Frappe API error
shape. A dropped connection or a timeout arrives as a plain `Error` with no
`messages`, so indexing it raises a **TypeError inside the error handler**. The
user sees no toast at all, and the real failure is replaced by a confusing
secondary one — precisely when something has gone wrong.

**Spread:** 19 sites across 12 files. Most of the codebase already used the safe
`?.messages?.[0]` form; these were the ones that did not.

**Treatment applied per site:**

| Sites | Change |
|---|---|
| 15 | Migrated to the existing `formatError()` helper — same fallback text, but survives a plain `Error`, an empty array, or no error object |
| 2 | Minimal `?.[0]` in `data/document.js`, where the surrounding `__()` wrapper was worth keeping |
| 2 | Corrected `(e.messages ?? e.messages[0])`, which was wrong in *both* branches: with `messages` present it handed the whole array to the toast; without, it evaluated the second operand and threw |

`formatError()` adoption went from 4 sites to 21.

---


### B16 in detail — a guard that could never fire

`EmailEditor`'s From picker is meant to disappear when the user has exactly one
sending account and it is their own address — a one-item dropdown of your own
email is noise. The check:

```js
let emails = user.doc.user_emails.map((e) => ({
  label: e.email_account + ' <' + e.email_id + '>',
  value: e.email_id,
}))
if (emails.length == 1 && emails[0].email_id === sessionUser) return []
```

The mapped options carry `label` and `value` — there is no `email_id` on them.
So `emails[0].email_id` was always `undefined`, the comparison was always false,
and the picker always rendered. Changed to compare `emails[0].value`.

Two tests cover it: one that the picker disappears for the user's own single
account, and one that it survives for a single *shared* mailbox, which is the
case the guard must not swallow.

---


### B17 in detail — the falsy-value trap

Bulk edit built its payload as:

```js
data: { [field.value.fieldname]: fieldVal || null }
```

`||` treats every falsy value as absent. Two of them are legitimate entries:

| Entry | Sent | Should be |
|---|---|---|
| Checkbox → **No** (coerced to `0` just above) | `null` | `0` |
| Currency/Int → **0** | `null` | `0` |
| Empty text box | `null` | `null` ✓ |

So a bulk edit could tick a checkbox but never untick one, and could not zero a
numeric field — both silently wrote `null` instead. Replaced with an explicit
`isBlank()` that only treats `''`, `null` and `undefined` as "clear this field".

Three tests cover it: unticked checkbox sends `0`, numeric zero sends `0`, and
an empty entry still sends `null`.

---


### B18 in detail — a validation branch nothing could reach

Both create modals validate revenue like this:

```js
if (doc.annual_revenue) {
  if (typeof doc.annual_revenue === 'string') {
    doc.annual_revenue = doc.annual_revenue.replace(/,/g, '')
  } else if (isNaN(doc.annual_revenue)) {        // <- unreachable
    error.value = __('Annual Revenue should be a number')
  }
}
```

The `isNaN` check sits in the `else` of a `typeof === 'string'` test. A text
input always yields a string, so it never ran. The only other way in would be an
actual `NaN` — and `NaN` is falsy, so the outer `if` rejects it first. **No input
could reach that branch**, and `"a lot"` was sent to the server unchallenged.

Moved the check out of the `else` so it runs after separators are stripped:
`"1,000,000"` still passes as `"1000000"`, `"a lot"` now errors.

### B19 in detail — one flag reset, its twin not

`DealModal`'s layout transform recomputes which sections the Quick Entry layout
contains:

```js
hasOrganizationSections.value = false     // reset, then set true if found
// hasContactSections — never reset
```

`hasContactSections` is declared `ref(true)` and the transform only ever assigns
`true`, so it could never become false. A layout without contact sections still
rendered the contact block. Added the matching reset.

This one changes what renders, so it is worth a look on a real layout — the
tests assert only the flag, not the markup.

---


### B20 in detail — two error callbacks that look identical and are not

`ContactModal` and `OrganizationModal` both had this line:

```js
error.value = err.error?.messages?.[0]
```

It is correct in one and broken in the other, because they sit on different
frappe-ui APIs:

| Component | API | What the callback receives |
|---|---|---|
| `OrganizationModal` | `call(method, args, { onError })` | `{ response, status, error }` — so `err.error` is right |
| `ContactModal` | `createResource({ onError })` | the error **itself** — so `err.error` is `undefined` |

`handleError` in `frappe-ui/src/resources/resources.js` calls `fn.call(vm, error)`,
while `call.js` calls `options.onError({ response, status, error: e })`. The
ContactModal line therefore always resolved to `undefined`: **every failed contact
save showed an empty error box**, including duplicate-name and permission errors.

Fixed by switching that one to the repo's existing `formatError()` helper, which
handles the frappe shape and plain `Error`s alike. `OrganizationModal` was left
exactly as it was — two tests now pin each contract so the next person copying
one into the other gets a failure instead of silence.

---


### B22 in detail — the bug the clock found

Caught because a test that passed at 22:xx failed at 23:08. `validateTimeRange`
built both ends of the range from the **start** date:

```js
const start = dayjs(fromDate + ' ' + fromTime)
const end   = dayjs(fromDate + ' ' + toTime)   // toDate ignored entirely
```

`toDate` was never a parameter, and none of the four call sites passed one. So
any event whose end time was numerically earlier than its start time failed with
"End Time Should Be After Start Time" — which is every event that runs past
midnight.

Two user-visible consequences:

1. **No overnight event could be saved at all**, on any calendar surface. A
   22:00–02:00 booking was permanently rejected.
2. **Between 23:00 and midnight, the new-event form opened in an unsavable
   state.** `EventModal` defaults a new event to `now → now + 1 hour`; after
   23:00 that crosses midnight, so clicking Create failed immediately with no
   indication of what to change.

Fixed by giving `validateTimeRange` an optional `toDate` that falls back to
`fromDate`, and passing it from all four call sites — two in
[EventModal.vue](../src/components/Modals/EventModal.vue) and two in
[CalendarEventPanel.vue](../src/components/Calendar/CalendarEventPanel.vue).
Backwards compatible: callers that pass no `toDate` behave exactly as before.

Five tests cover it: overnight accepted, same-day reversal still rejected, an
end date *before* the start date rejected, and the no-`toDate` fallback.

**The test that found it was itself wrong** — it depended on the wall clock. It
now pins the time with `vi.setSystemTime`. Had it been written that way from the
start, the bug would have gone unnoticed.

---


### B23 in detail — the third missing guard of the same shape

Three modals share a `saveChanges()` that flattens a layout tree before posting
it. Two of them guard against a tab with no sections:

```js
_tabs.forEach((tab) => {
  if (!tab.sections) return      // DataFieldsModal, QuickEntryModal
  tab.sections.forEach(...)
})
```

`SidePanelModal` did not, and it also ends with `JSON.stringify(_tabs[0].sections)`
— which throws on an empty layout. Its Save button carries **no `:disabled`
binding**, so both paths are reachable: open the side-panel editor for a doctype
with no configured layout, press Save, and the handler dies on a `TypeError`.
The dialog stays open, nothing saves, and nothing is shown to explain why.

So I grepped for the pattern instead of waiting to meet it again — and the three
save paths turned out to have **complementary** gaps, each file missing exactly
the guard its siblings had:

| | `!tabs.length` | `!tab.sections` | `!section.columns` | `!column.fields` |
|---|---|---|---|---|
| `SidePanelModal` (before) | ✗ | ✗ | ✓ | ✓ |
| `DataFieldsModal` (before) | — | ✓ | ✗ | ✓ |
| `QuickEntryModal` (before) | — | ✓ | ✗ | ✓ |

None of the three Save buttons carries a `:disabled` binding, so every gap is
reachable by pressing Save on a layout the server returned incomplete. All three
now guard every level; six tests across the two suites cover each level.

This was the third instance this session of *"N sibling call sites, one missing
its guard"* — see also B19 (`hasContactSections` never reset) and the unguarded
`title.value.el.focus()` in `EventModal`. The grep was worth more than the
individual fix.

---


### B24 and B25 in detail — one feature, two separate faults

Three list pages support a `?open=<name>` deep link that pops a record open on
arrival. Both faults sit in that feature.

**B24 — the whole query string was thrown away.** Each page did:

```js
searchParams.delete('open')                                   // ...and then ignored it
window.history.replaceState(null, '', window.location.pathname)
```

The `delete` call mutates a local copy that is never read again, and the URL is
replaced with the bare pathname. `?view=` — which selects the saved view and is
read in a dozen places in `ViewControls` — went with it. The dead `delete` line
is the giveaway: keeping the rest was the intent. All three now rebuild the
query string from what remains.

**B25 — task deep links never fired at all.** `Tasks.vue` is the odd one out in
*where* it calls the helper:

| Page | Called from | Re-entrant? |
|---|---|---|
| `CallLogs` | `onMounted` | no |
| `Notes` | `watch` on the page count | no |
| `Tasks` | **inside the `rows` computed** | **yes** |

`openTaskFromURL()` guarded on `rows.value?.length` while running *inside* the
`rows` computed, so it read the computed mid-evaluation and got `undefined` on
the first pass. The guard was never satisfied when it mattered. Tasks.vue
imports only `computed` and `ref` — no `watch`, no `onMounted` — so the computed
is the only call site there.

Fixed by guarding on the source data (`tasks.value?.data?.data?.length`)
instead, which is what the guard meant and is not self-referential. The larger
smell — a side effect inside a computed getter — is left alone; moving it to a
watcher is a restructure, not a fix.

---

### B26 in detail — precedence, and a fallback that could never run

```js
hash: '#' + notification.comment || notification.notification_type_doc,
```

`+` binds tighter than `||`, so this reads as
`('#' + notification.comment) || notification.notification_type_doc`. For a
notification with no `comment`, `'#' + undefined` is the **string**
`'#undefined'` — which is truthy, so the right-hand side never runs.

The intent is not in doubt: the click handler three lines above, in the same
template, picks the id the intended way — `n.comment || n.notification_type_doc`.
And the desktop equivalent avoids the problem entirely by using the
server-supplied `notification.hash`.

The effect: tapping a notification that is not a comment — a task or WhatsApp
notification, identified by `notification_type_doc` — opened the right record but
anchored on `#undefined`, so the thing you tapped to see was not scrolled to or
highlighted. Silent, and easy to read as "the app just doesn't jump to it".

```js
hash: '#' + (notification.comment || notification.notification_type_doc),
```

Mutation-checked: against the original line the regression test fails with
`expected '#undefined' to be '#TASK-1'`.

---

### B27 in detail — the fourth appearance of the B3 shape

```js
toast.error(err.messages?.[0] || __('Error updating field'))
```

This is the same assumption [B3](#b3-in-detail--the-largest-of-them) was about:
that every error carries the Frappe API's `messages` array. A validation failure
does. A dropped connection, a timeout, or any client-side throw arrives as a
plain `Error`, which has `.message` and no `.messages` — so the reason is
discarded and the user gets "Error updating field" with nothing to act on.

`formatError` already exists in the codebase for exactly this and is a strict
superset: `.messages[0]`, then `.message`, then `.toString()`, then the fallback.

Four pages carried the identical line — `Deal.vue`, `Lead.vue`, `MobileDeal.vue`
and `MobileLead.vue`. Found by grepping for the pattern rather than by tripping
over it a fourth time.

**A test was documenting the bug.** `LeadPage.test.js` already fed
`new Error('offline')` into this handler and asserted the user saw
`'Error updating field'` — a passing test pinning the wrong behaviour in place.
It now asserts `'offline'`. Worth flagging as its own lesson: a test that
records what the code does is not the same as a test that records what it should
do, and the two are indistinguishable once written.

---

### B28 in detail — a rollback that made things worse

`updateField` accepts either one field name or a list, and rolls back on a
failed save. The list branch captured nothing to roll back to:

```js
let oldValues = Array.isArray(name) ? {} : doc.value[name]
//                                    ^^ always empty
...
onError: (err) => {
  if (Array.isArray(name)) {
    name.forEach((field) => (doc.value[field] = oldValues[field]))  // undefined
  }
```

The single-field branch is correct. The list branch reads every key off `{}`, so
the "restore" writes `undefined` over each field.

The sequence that bites:

1. The side panel clears a group of fields — `updateField(['email', 'mobile_no'])`
   sets both to `''`.
2. The save is refused.
3. The rollback sets both to `undefined` — not the values they held, and not even
   the `''` they had a moment ago.
4. The screen shows blanks, so it looks like the clear succeeded.
5. The next successful save of *any* other field submits the whole document,
   now carrying those `undefined`s — persisting a clearing the server had just
   rejected.

That last step is what makes this more than cosmetic: a failed operation is
laundered into a successful one by an unrelated later save.

```js
let oldValues = Array.isArray(name)
  ? Object.fromEntries(name.map((field) => [field, doc.value[field]]))
  : doc.value[name]
```

Same four pages as B27.

I nearly missed this one. The first version of the `MobileDeal` suite pinned the
`undefined` result as "current behaviour, not endorsed" — a green test over a
live bug. Writing that sentence down is what prompted a second look.

---

### B29 in detail — a subtraction where a binding was meant

```html
:icon-left="lucide - icon"
```

In a Vue template that is an *expression*: `lucide` (undefined) minus `icon`
(the prop). `undefined - 'zap'` is `NaN`, so every `Button` field passed `NaN`
into frappe-ui's `iconLeft` and rendered no icon at all.

Both call sites — `FieldLayout/Field.vue` and `SidePanelLayout.vue` — pass a
real `field.icon` from the doctype configuration, so any Button field an
administrator had given an icon silently lost it. Nothing threw; the button just
appeared plain.

```html
:icon-left="icon"
```

The bare prop matches how the rest of the codebase binds icons dynamically
(`:iconLeft="getIcon()"`, `:icon-left="… ? 'trash-2' : 'unlock'"`). The name in
the original suggests someone reaching for a `lucide-` prefix; if the stored
values turn out to need one, that is a one-word change and the test will say so.

---

### B31–B33 in detail — the grid editors

**B31 is the fourth site of [B23](#b23-in-detail--the-third-missing-guard-of-the-same-shape).**
Four components walk a fields layout to flatten it before saving. Three were
guarded at every level during the B23 round; `GridRowFieldsModal` was not, and
still walked `section.columns` unguarded. A half-built layout — a section added
but no column in it yet — threw on save. Found by grepping the pattern rather
than by tripping over it, which is now the habit for anything met three times.

**B32 — a spinner with no way out.**

```js
function update() {
  loading.value = true          // ← before the guard
  let updateFields = fields.value.map(…)
  if (updateFields.length === 0) {
    error.value = __('At least one field is required')
    return                      // ← leaves loading true for good
  }
```

Remove every field, press Save: the error appears, and the button spins
permanently. Nothing resets `loading`, so the only way out is to close and
reopen the dialog. Moving the assignment below the guard is the whole fix.

**B33 — one stale fieldname took the modal down.**

`oldFields` maps the user's saved grid view onto the doctype's current fields:

```js
return gridViewSettings.map((field) => {
  let f = _fields.find((f) => f.fieldname === field.fieldname)
  if (f) { … return fieldObj(f) }
  // no else — returns undefined
})
```

A saved view naming a field that has since been renamed or deleted yields an
`undefined` entry. Every consumer then reads `.fieldname` off it —
`dropdownFields`, `removeField`, and the template — so the editor threw on open
and stayed unusable until the user's settings were cleared by hand. The user has
no way to reach those settings from the UI, which is what makes this more than
an inconvenience: the feature is simply gone for that person.

`.filter(Boolean)` after the map. Mutation-checked: all five regression tests
fail against the original, including the `not.toThrow` one — worth confirming,
since a `not.toThrow` assertion passes just as happily when it is testing
nothing.

---

### B34 in detail — the same defect, failing more quietly

`Grid.vue` builds its columns from the same saved grid view that
[B33](#b31b33-in-detail--the-grid-editors) reads:

```js
processed = gridViewSettings.map((gs) =>
  getFieldObj(gridFields.find((f) => f.fieldname === gs.fieldname)),
)
```

Identical stale-field case, but a different symptom — and a worse one to
diagnose. `getFieldObj(undefined)` opens with `field = { ...field }`, and
spreading `undefined` yields `{}` rather than throwing. So instead of an error
the grid gained a **column with no fieldname, no label and no control** — a
blank strip the user cannot fill, remove, or explain. `.filter((f) => !f.hidden)`
then keeps it, because `!undefined` is `true`.

Two components, one root cause, two different failure modes: one throws
immediately, the other renders nonsense indefinitely. The second is the kind
that gets reported as "the grid looks weird" and never gets traced.

**B35** is a plain typo in the same file:

```js
new Array(rows.value?.length || []).fill(false)
```

`new Array(x)` builds an *empty array of length x* only when `x` is a number.
`[]` is not, so this builds a one-element array containing the empty array,
which `.fill(false)` turns into `[false]`. An empty grid therefore started with
one expand-state entry for zero rows. `|| 0` is the fix.

> Still open in the same file, deliberately not changed: `deleteRows()` calls
> `showRowList.pop()` exactly once no matter how many rows were removed, so the
> list drifts longer than the grid over repeated multi-row deletes. Because the
> list is indexed by position and only ever read at live row indices, this is
> invisible today. Correcting it means deciding whether the expand state should
> follow a row through a reorder at all, which is a design question rather than
> a typo.

---

### B37 in detail — a search that read a field that was never there

```js
list = list.filter(
  (source) =>
    source.name.toLowerCase().includes(search.value.toLowerCase()) ||
    source.subject.toLowerCase().includes(search.value.toLowerCase()),
)
```

There is no `subject` field on **Lead Sync Source**. Not omitted from the query
— absent from the doctype entirely; the list resource fetches
`['name', 'enabled', 'type', 'last_synced_at', 'facebook_lead_form']`. So
`source.subject` is always `undefined` and `.toLowerCase()` always throws.

What kept it alive is `||` short-circuiting. The second clause only runs when
the **name** does not match, so the crash needs a source that fails the name
test — which is most of them, on most keystrokes. Typing one character into the
search box throws inside a computed, and Vue takes the panel down with it.

That is also why it survived review: with a single source whose name matches
what you type, it works perfectly.

`type` is the other column the row actually shows, and is evidently what the
pair was reaching for:

```js
const q = search.value.toLowerCase()
list = list.filter((source) =>
  [source.name, source.type].some((v) => v?.toLowerCase().includes(q)),
)
```

The optional chaining is deliberate belt-and-braces — `type` is `reqd` on the
doctype, so it should always be present, but a search box is not the place to
find out otherwise.

> If `subject` was meant to be a real field, adding it is a backend change and
> this filter should then include it. Flagging rather than guessing.

**B36** is the same species: `fieldsData[0].type` in `SettingsPage.vue`, where
every other line of the same function reads `.fieldtype`. A DocField has no
`type`, so both guards were permanently true and every settings form built an
extra empty tab or section ahead of the real one — for any doctype whose layout
opens with a Tab Break or Section Break.

Two files, one root cause: **a property name that does not exist fails silently
in JavaScript.** `undefined` is falsy in a guard and throws only when something
tries to use it. Neither would survive a typed field object.

---

### B38 in detail — a failure that did not stop the sequence

Renaming an email template is two operations: `frappe.client.rename_doc`, then a
field update against the new name.

```js
if (nameChanged) {
  name = await renameDoc.fetch()
  …
}
if (otherFieldChanged) {
  templates.setValue.submit({ ...values, name }, …)
}
```

`createResource.fetch()` does not reject on failure — it routes the error to its
own `onError` and **resolves `undefined`**. So a refused rename (a duplicate
name, a permission error) set `errorMessage`, and then execution carried
straight on into the field update with `name: undefined`, writing to a document
that had not been renamed and does not exist under that key.

The user sees a rename error and a second, unrelated failure, with no way to
tell which one mattered.

```js
name = await renameDoc.fetch()
if (!name) return
```

This is the same shape as the frappe-ui contract noted under
[B3](#b3-in-detail--the-largest-of-them): *what a resource does on failure is
not what a plain promise does.* `await` on a rejected promise stops the
function; `await` on this does not.

---

### A copy-paste lineage worth naming

`LeadSyncSources.vue` is `EmailTemplates.vue` with the nouns changed — the same
search filter, the same `getDropdownOptions`, the same toggle-with-revert. The
original is correct: it reads `template.subject?.toLowerCase()`, and Email
Template really does have a `subject`.

The copy lost the `?.` **and** kept a field name that does not exist on the new
doctype. Two independent regressions in one paste, and only the combination is
fatal — either alone would have been harmless.

Worth remembering when reviewing a file that looks familiar: the parts that were
*not* changed during a copy are as suspect as the parts that were.

---

### B39 in detail — a switch thrown before the server agreed

```js
function update() {
  twilio.save.submit(null, { onSuccess: () => twilio.reload() })

  setEnabled('twilio', twilio.doc.enabled)   // ← runs immediately
}
```

`setEnabled` writes to the `callEnabled` composable, which gates the **Calls tab
on every record page and the call button throughout the app**. Running it beside
the save rather than inside its callback meant the UI committed to a state the
server had not accepted.

There is no `onError` on this save either, so the failure is silent. Together:
enter Twilio credentials, press Save, the request fails — and telephony switches
on across the whole app, pointing at a configuration that was never stored. The
first sign of trouble is a call that does not connect.

Identical code in `ExotelSettings.vue`; both moved inside `onSuccess`.

**B40** is in the third file of the same folder:

```js
onError: (err) => {
  err.messages?.forEach((msg) => toast.error(msg))
}
```

`?.` guards the *access*, not the outcome — on a plain `Error` this is a no-op,
so the handler runs and shows nothing. The user presses Save and the button
simply does nothing at all, with no error, no toast and no console output. A
handler that silently succeeds at doing nothing is worse than no handler, which
would at least surface an unhandled rejection.

Now falls through to `formatError` whenever there is no non-empty `messages`
array.

---

### B41 in detail — a confirmation that outlived its question

The workday dialog guards deletion with a two-press confirm: the first press
arms `isConfirmingDelete`, the second removes the row. Reset happened in
`resetForm()`, which the reopen watcher only called on the **new-day** path:

```js
if (dialog.value.isEditing && dialog.value.data) {
  workDayData.workday = dialog.value.data.workday      // populate
  …                                                     // but never reset
} else {
  resetForm()
}
```

So arming the delete and then closing the dialog left it armed. Reopening it to
edit a **different** workday showed a button already in its confirm state, and
one press removed that day — a day the user had never asked to delete, with the
confirmation they were owed already spent on a different row.

Stale validation errors rode along the same path: an error from a previous edit
reappeared on a form that had just been freshly populated.

Always reset, then populate:

```js
resetForm()
if (dialog.value.isEditing && dialog.value.data) { … }
```

The shape is worth recognising: **a reset that lives on only one branch of an
open handler.** Any state a dialog accumulates while open — confirmations,
errors, dirty flags — has to be cleared on *every* path back in, not just the
one that happens to look like "starting fresh".

**Grepping the shape found B42 and cleared four false alarms.** Six components
own an `isConfirmingDelete`; only two ever set it back to false. That looks
alarming until you check *how* each one is wired:

| Component | Delete control | Reset | Verdict |
|---|---|---|---|
| `Sla/WorkDayModal` | button, label driven by the flag | none | **B41** |
| `Sla/EditResponseResolutionModal` | button, label driven by the flag | none | **B42** |
| `Sla/SlaPriorityList` | dropdown via `ConfirmDelete()` | trigger `@click` | fine |
| `Sla/SlaHolidays` | dropdown via `ConfirmDelete()` | trigger `@click` | fine |
| `Sla/SlaPolicyList` | dropdown via `ConfirmDelete()` | trigger `@click` | fine |
| `Forms/FormsList` | dropdown via `ConfirmDelete()` | trigger `@click` | fine |

The four list components reset the flag on the dropdown's trigger button, so
opening any row's menu disarms whatever the last one armed. The two modals have
no equivalent moment. My first reading of `SlaPriorityList` was that a shared
flag across rows made it *worse* than the modals — reading the template showed
the opposite. Worth recording: the grep finds candidates, not defects.

> Two smaller things in the same file, left alone. `validateTimeRange` parses
> times with `Number()` and compares the results; unparseable input yields
> `NaN`, and `NaN <= NaN` is `false`, so the ordering check silently passes.
> It is unreachable through the UI — both inputs are `type="time"` — so fixing
> it would be guarding against a caller that does not exist. And two validators
> write different wording to `errors.start_time` for the same empty-field case,
> with the second overwriting the first; the test records which message
> actually reaches the user.

---

### B43 in detail — a default that stopped being one

```js
const working_hours = [ /* Mon–Fri, 09:00–17:00 */ ]

export const slaData = ref({ …, working_hours: working_hours })

export const resetSlaData = () => {
  slaData.value = { …, working_hours: working_hours }   // same array, again
}
```

Both assignments hand out the **same array object**, and both `SlaHolidays.vue`
and `WorkDayModal.vue` edit it in place — `push`, `splice`, and direct writes to
`day.end_time`. So the module-level constant is not a template; it is the live
data of whichever policy was open last.

The sequence:

1. Create an SLA policy, remove Friday, change Monday to finish at 18:00.
2. Leave. `resetSlaData()` runs and assigns `working_hours` — the array that
   now has four days and a late Monday.
3. Create a second policy. Its "default" hours are the first policy's edits.

Nothing errors and nothing looks wrong; the defaults are simply not the
defaults any more, permanently, until the page is reloaded. A second reload
resets it, which makes it look intermittent to anyone trying to reproduce it.

```js
export const defaultWorkingHours = () => working_hours.map((day) => ({ ...day }))
```

A per-day spread, not just a new array — `SlaHolidays` writes to the day objects
too, so `[...working_hours]` would have fixed the add/remove case and left the
time edits leaking.

This is the counterpart to the mock-reactivity lesson in
[section 10](#10-conventions-for-adding-tests): **a shared mutable default is a
shared mutable object.** In tests it caches a stale value; in application code
it quietly becomes state.

---

### B44 in detail — a page size that only ever shrank

`SlaConfig.vue` owns the policy list and asks for effectively all of it:

```js
createListResource({ …, start: 0, pageLength: 999, auto: true })
```

`SlaPolicyList.vue` then watches the search box, and on an empty query does:

```js
slaPolicyListResource.start = 0
slaPolicyListResource.pageLength = 10     // ← not what the owner configured
```

Resetting the offset is right. Resetting the *page size* to a number this
component invented is not — and because the watcher only fires on **change**,
the first load keeps 999 and everything looks correct. It takes typing in the
search box and then clearing it to drop the list to ten policies, permanently,
with no paging control anywhere on the screen to get the rest back.

That ordering is what makes it easy to miss: the broken state is reachable only
by a round trip through a control that appears to have been put back the way it
was.

Dropping the line is the whole fix — the resource's owner decides its page size.

**B45**, in the same file's delete handler, is the
[B3](#b3-in-detail--the-largest-of-them) shape once more:
`err.messages?.[0] || fallback`. Deleting an SLA that is still linked to open
deals is exactly the case where the server's reason matters, and exactly the
case most likely to arrive as something other than a `messages` array.

> Two things in this file left alone. `duplicate()` nests two auto-fetching
> resources with no `onError` on either, so a failed duplication is silent —
> the same `.then()`-without-`.catch()` convention already flagged for the
> layout modals, and changing one instance would make the file inconsistent
> with its neighbours. And the enable/disable switch is bound one-way
> (`:modelValue` plus a separate handler), so a refused toggle snaps back on
> its own; no rollback is needed, unlike `LeadSyncSources` where the switch
> uses `v-model` and does need one.

---

### B46 in detail — the third time the same contract bit

```js
await slaPolicyListResource.setValue.submit({ … }, {
  onError(err) { toast.error(…) },
})

// …rename, refetch…

toast.success(__('SLA Policy Updated'))
slaPolicyListResource.reload()
```

`await` reads as "stop here if this fails". It does not: the failure goes to
`onError`, and the promise **resolves** regardless. So a refused save showed the
error, then carried straight on and reported *SLA Policy Updated* underneath it,
and reloaded the list as though the write had landed. Two contradictory toasts,
and the more reassuring one arrives second.

The rename branch had the same shape one level down. Its `.catch()` handled the
error and reloaded — then execution continued to
`getSlaResource.submit({ name: slaData.value.sla_name })`, fetching the document
under a name the failed rename never created.

Both now set a flag and return.

**This is the third instance of one contract**, and worth stating as a rule:

| | on failure |
|---|---|
| a plain promise | rejects — `await` throws, the function stops |
| a frappe-ui resource | calls `onError`, **resolves** — the function continues |

[B38](#b38-in-detail--a-failure-that-did-not-stop-the-sequence) was a rename
whose failure did not stop the field update. [B39](#b39-in-detail--a-switch-thrown-before-the-server-agreed)
was a save whose failure did not stop a global flag being set. B46 is a save
whose failure did not stop a success message. Every one of them looks like
correct sequential code and every one of them runs on past the failure.

Anywhere `await someResource.submit()` is followed by more work, that work needs
to ask whether the submit actually succeeded.

---

### B48 in detail — the `-1` that means "from the end"

```js
const dayIndex = assignmentDays.findIndex((d) => d === localData.day)

if (isActive && dayIndex === -1) {
  assignmentDays.push(localData.day)
} else {
  assignmentDays.splice(dayIndex, 1)     // dayIndex may be -1
}
```

`findIndex` returns `-1` for "not found". `splice` reads a negative index as an
offset **from the end of the array**. So `splice(-1, 1)` does not do nothing —
it removes the last element.

Switching *off* a day that was not in the list therefore deleted whichever day
happened to be last. The switch the user pressed stays off, so the screen looks
right; the day that silently vanished is somewhere else in the list.

The `else` also caught `isActive === true` with the day already present, which
would remove a day the user had just switched on.

```js
if (isActive) {
  if (dayIndex === -1) assignmentDays.push(localData.day)
} else if (dayIndex !== -1) {
  assignmentDays.splice(dayIndex, 1)
}
```

Reaching this state needs the switch and the array to disagree, which the normal
flow avoids — but "unreachable today" is exactly how a silent data-losing branch
survives until some later change makes it reachable. Compare the deliberate
*non*-fix in [B41's note](#b41-in-detail--a-confirmation-that-outlived-its-question):
that one is genuinely unreachable and harmless when reached; this one destroys
data.

**B47** is smaller but more likely to be met: the assignee search compared with
`.includes()` on raw strings, so `lovelace` never found *Ada Lovelace*. Every
other search in the app lowercases both sides. Half-working is what kept it
quiet — a lowercase query still matched the email address, so the box appeared
to work right up until someone searched by surname.

---

### B49 — and a fix that was withdrawn

`AssignmentRuleView.updateAssignmentRule` is the fourth appearance of the
[frappe-ui failure contract](#b46-in-detail--the-third-time-the-same-contract-bit).
Here it is `call()` rather than a resource, so the promise really does reject —
but the `.catch()` swallows it and execution carries on regardless, into the
rename branch and then to `toast.success('Assignment Rule Updated')`. Same
symptom, one layer along: an error and a success, in that order.

Both branches now set a flag and return.

**The withdrawn one is worth recording.** While reading the same file I found:

```js
const defaultAssignmentDays = ['Monday', … , 'Sunday']

const assignmentRuleData = ref({ …, assignmentDays: defaultAssignmentDays })
const resetAssignmentRuleData = () => { …, assignmentDays: defaultAssignmentDays }
```

Character for character the shape of
[B43](#b43-in-detail--a-default-that-stopped-being-one): one array handed out by
both the initialiser and the reset, mutated in place by the day switches. I
changed it to a factory and wrote a regression test.

**The mutation check failed to fail.** Reverting the source left the test green,
which meant the test was not discriminating — or there was nothing to
discriminate. The second: B43's array lives in `Sla/utils.js`, a module
evaluated **once per application**. This one is declared inside
`<script setup>`, which is a factory Vue runs **once per component instance**.
Every rule already got its own array.

So the change was reverted and the test rewritten to assert the property that is
actually true. The lesson is not about arrays:

> A pattern match is a hypothesis. Two files can contain identical code and only
> one of them can be wrong, because *where the code lives* decides what it means.
> The mutation check is what tells the difference — a regression test that passes
> against the unfixed source is not proof of a fix, it is proof of nothing.

Grepping for shapes found B27, B31, B34, B42 and B48. It also produced this
false positive and, earlier, a
[misread of `SlaPriorityList`](#b41-in-detail--a-confirmation-that-outlived-its-question).
The technique is worth keeping; its output is a list of places to look, not a
list of defects.

---

### B53 in detail — a permission guard that was never on

The role dropdown in **Users** builds its options with per-option conditions:

```js
{ label: __('Company Admin'), onClick: …, condition: () => isAdmin() },
{ label: __('Manager'),       onClick: …, condition: () => isAdmin() },
{ label: __('Sales User'),    onClick: … },          // no condition
```

and then filters them:

```js
return options.filter((option) => option.condition?.() || true)
```

`X || true` is `true` for every value of `X`. The filter removed nothing, ever.
Both `isAdmin()` guards were dead code, so **a Sales Manager saw "Company Admin"
and "Manager" in the dropdown and could click them.**

```js
return options.filter((option) => option.condition?.() ?? true)
```

`??` falls back only for `null`/`undefined`, so an explicit `false` now hides
the option while an absent condition still defaults to visible — which is what
`|| true` was reaching for and what the third option relies on.

**This is a UI guard, not the authorisation boundary.** `update_member_role` is
a whitelisted server method and enforces its own permissions, so this was not a
privilege escalation — a non-admin clicking "Company Admin" got a server error,
not an admin. What it was is worse than useless as an interface: it advertised
actions the user could not perform and reported the refusal as a failure rather
than as something they were never entitled to try.

Grepping `.condition` across the codebase found four other sites — `Settings.vue`,
`EmailEdit.vue`, `EmailAdd.vue`, `CallLogDetailModal.vue`, `AppSidebar.vue` — and
every one uses `cond ? cond() : true` or an explicit `if`. This was the only
broken instance, which is worth knowing: it is a slip, not a house style.

---

### B54–B56 in detail — the email account forms

**B54 — a validator that forgot its message.**

```js
if (isCustom) {
  if (!state.api_key)    return __('API key is required')
  if (!state.api_secret) return                          // ← undefined
}
```

Every other branch of `validateInputs` returns a string. This one returns
`undefined`, and both callers test the result with `if (error) return`. So a
custom-provider account with no API secret **passed validation and was
submitted**. The server refused it, and the UI reported the refusal as
*Invalid credentials* — pointing the user at the password field of a form that
has no password field.

Two defects compounding: a validator that silently approves, and an error
message that misdirects. Either alone would have been survivable.

**B55 — a field missing from the change check.**

`EmailEdit.isDirty` compares nine fields. The form edits ten. The one left out
was `create_lead_from_incoming_email` — so toggling only that checkbox left both
`nameChanged` and `otherFieldsChanged` false, and Update answered
*"No changes made"* while discarding the edit.

An enumerated dirty-check is a list that has to be maintained by hand every time
a field is added, with nothing to enforce it. This is what that costs.

**B56 — a catch that threw the reason away.**

```js
} catch {
  errorHandler()
}
…
function errorHandler() {
  error.value = __('Failed to update Email Account, Invalid credentials')
}
```

The bare `catch` did not even bind the error. Every failure — a duplicate
account name, a permission error, a dropped connection — was reported as bad
credentials. The wording stays as the *fallback*, since it is the common case,
but the server's own reason now wins when there is one.

Worth noting where this bites hardest: **it made B54 much harder to find.** The
symptom of an empty API secret was a credentials error, which is exactly what an
empty API secret would plausibly cause — a wrong message that happens to sound
right is worse than no message.

**B57 — the other half of B55, found by fixing B55.**

`EmailAccountList` normalises the account's checkbox fields from the server's
`0`/`1` into real booleans before handing them to the edit form:

```js
account.enable_incoming = Boolean(account.enable_incoming)
account.enable_outgoing = Boolean(account.enable_outgoing)
account.default_incoming = Boolean(account.default_incoming)
account.default_outgoing = Boolean(account.default_outgoing)
// create_lead_from_incoming_email — missing
```

Four of the five. The form initialises its state with `|| false`, so an
unconverted `0` becomes `false` on one side of `isDirty` and stays `0` on the
other. `false !== 0` is true.

While it was absent from `isDirty` this was invisible. **Adding the field to
`isDirty` — the B55 fix — would have made every untouched account report itself
as edited the moment it was opened.** The B55 test passed because its fixture
used a real boolean; a fixture is not the server.

This is the most useful thing in this round, and it was not found by testing.
It was found by reading the sibling file to understand *why* a field might have
been left out of a list — the answer being that the omission was consistent with
a second omission elsewhere, and neither was correct. Two incomplete lists that
happened to be incomplete in the same place cancelled out.

---

### B62 in detail — a switch over an open set

`LinkedDocsListView.viewLinkedDoc` maps a linked record's doctype to a route:

```js
switch (doc.reference_doctype) {
  case 'CRM Lead':          page = 'leads';         …
  case 'CRM Call Log':      page = 'call-logs';     …
  case 'CRM Task':          …
  case 'Contact':           …
  case 'CRM Organization':  …
  case 'CRM Notification':  …
  case 'FCRM Note':         …
  default: break            // page and id stay ''
}
window.open(`${base}/${page}/${id}`)
```

Two problems. **`CRM Deal` is not in the list** — one of the most common things
to be linked to a contact or an organization. And the `default` leaves both
parts empty, so the call becomes `window.open('//')`: a blank tab pointing at
nothing.

The second matters more than a missing case, because the set being switched over
is **open**. `get_linked_docs_of_document` calls Frappe's generic
`get_linked_docs`, which returns *whatever doctype happens to reference the
record* — `Communication`, `ToDo`, `File`, `Comment`, anything an app installs.
No enumeration of that set can be complete, so the default branch is not an edge
case; it is the normal path for most of what the function will ever be handed.

Added the deal case, and made the default do nothing:

```js
if (!page || !id) return
```

The same guard also covers a row with no `reference_docname`.

---

### A near-miss worth recording: identical code, different meaning

Writing the shared list-view suite, one assertion failed:
`CallLogsListView.getLabel` does not format `Duration` columns, while the other
five do. That reads exactly like an omission — five files agree, one differs.

It is not. `crm_call_log.py` pre-formats the field into `_duration` with
`seconds_to_duration`, and `utils/callLog.js` renders that string, so raw
seconds never reach `getLabel` in that list. Adding the branch would have been
harmless but meaningless; treating it as a bug and "fixing" the other end would
have been worse.

This is the [B49 lesson](#b49--and-a-fix-that-was-withdrawn) from the other
direction. There, identical code in two places meant different things because of
*where it lived*. Here, differing code in near-identical files is correct because
of *what happens upstream*. Both times the answer came from reading the
surrounding system rather than comparing the files to each other.

---

### B63 in detail — a recursion whose base case had a hole in it

`EmailContent` folds an email's quoted history into a collapsible block. It
walks the document repeatedly, because each replacement mutates it:

```js
function handleAllInstances(doc) {
  const els = doc.querySelectorAll(selector)
  if (els.length === 0) return
  replaceReplyToContent(els[0], forGmail)
  handleAllInstances(doc)          // re-query and go again
}
```

The base case is "no matches left", which relies on `replaceReplyToContent`
removing the element it was handed. It does — with `replaceChild` on its **last
line**. But the non-Gmail branch has an earlier exit:

```js
const followingSiblings = allSiblings.slice(replyToContentIndex + 1)
if (followingSiblings.length === 0) return      // ← never reaches replaceChild
```

A quote marker with nothing after it is therefore left in place, the re-query
finds it again, and the recursion never terminates.
**`RangeError: Maximum call stack size exceeded`** — thrown in the `<script
setup>` body rather than a handler, so the component never finishes setting up
and the entire activity timeline fails to render.

Reachable from ordinary mail: an Outlook `div#appendonsend` or the CRM's own
`p.reply-to-content` as the last element of the body — a reply sent with the
marker present but the quoted text stripped.

Rewritten as a loop that stops when a pass removes nothing:

```js
let elements = doc.querySelectorAll(selector)
while (elements.length) {
  const remaining = elements.length
  replaceReplyToContent(elements[0], forGmail)
  elements = doc.querySelectorAll(selector)
  if (elements.length >= remaining) break
}
```

The shape to recognise: **a recursion whose termination depends on a side effect
in another function.** `handleAllInstances` cannot see that
`replaceReplyToContent` has an early exit, and `replaceReplyToContent` has no
idea it is being called in a loop that assumes it always removes something. The
contract between them was never written down, so one of them changed and the
other kept trusting it.

---

### B66 in detail — `''.split(',')` is not empty

Reply-all builds its Cc list from the original email's headers:

```js
let cc = email.cc?.split(',').map((r) => r.trim())
let bcc = email.bcc?.split(',').map((r) => r.trim())
…
editor.cc = cc ? true : false
editor.bcc = bcc ? true : false
```

`?.` guards `null`, which is the case the author had in mind. It does not guard
`''` — and `''.split(',')` returns `['']`, an array containing one empty string.
Frappe stores an unused header as an empty string as often as null.

So replying to all on a mail with `cc: ''`:

- `cc` becomes `['']`, whose `.length` is 1, so the "there is a Cc" branch runs
- the empty string is merged with the recipients and lands in `ccEmails`
- the composer opens with **a blank recipient chip** the user has to notice and
  delete, and which the server rejects if they do not

`bcc: ''` has a second failure on top: `editor.bcc = bcc ? true : false` is
`true` for `['']` *and* for `[]`, because **an empty array is truthy**. The Bcc
field opens containing nothing.

Both are now filtered and both toggles gate on `.length`. A shared helper does
the splitting, so `recipients` gets the same treatment.

Two distinct JavaScript facts, in adjacent lines, each producing a plausible
value rather than an error — the kind of thing that reaches production because
every individual step looks reasonable.

> Also guarded while here: `email.subject.startsWith('Re:')` on an email with no
> subject. An empty subject is legal mail; `null.startsWith` is not.

---

### B68 in detail — optimistic clearing with no way back

Sending a WhatsApp message captures the composer's contents, empties it, and
*then* fires the request:

```js
let args = { …, message: content.value, attach: whatsapp.value.attach, … }
content.value = ''
whatsapp.value.attach = ''
whatsapp.value.content_type = 'text'
reply.value = {}
createResource({ …, onError: (e) => toast.error(…) })
```

Clearing first is the right instinct — the message feels sent immediately, and
the user can start typing the next one. But the failure path only *reports*;
it never puts anything back. A rejected send therefore leaves an error toast
above an empty box, with the message gone.

This is worse than the "silent failure" bugs elsewhere in this report, because
the user is told something went wrong and still cannot act on it. Retyping is
the only option, and for a long message written in that box, it is a real loss.

`onError` now restores the message, the attachment and its content type from
`args` — which already held them, because they were captured for the request.

The pattern is worth separating from ordinary optimistic UI: **an optimistic
*update* can be rolled back from the value it replaced; optimistic *clearing*
throws that value away unless something holds it.** Several rollbacks elsewhere
in this codebase get the first case right (see
[B27/B28](#b28-in-detail--a-rollback-that-made-things-worse)); this was the
second case, and nothing was holding it but the request payload.

---

### B73 in detail — the index that named the wrong thing

`FieldLayoutEditor` renders each tab in an outer loop and each section in an
inner one:

```vue
<div v-for="(tab, i) in tabs" v-show="tabIndex == i">
  <Draggable :list="tab.sections">
    <template #item="{ element: section }">
      ...
      <Dropdown :options="getSectionOptions(i, section, tab)">
```

The inner slot destructured only `element`, so the `i` reaching
`getSectionOptions` was the **tab** index. Everything inside that function
treats it as the *section* index:

```js
let targetSection = tab.sections[i == 0 ? i + 1 : i - 1]
...
condition: () => tab.sections[i + 1]   // "Move Last Column to Next Section"
condition: () => tab.sections[i - 1]   // "…to Previous Section"
```

On the first tab, `i` is `0` for every section. So section 4's "Remove and move
columns to next section" moved its columns into **section 2**, and its menu
read "next" when the section was the last one. The layout is what the record
form renders from, so fields quietly reappeared in a section the user had not
chosen. On the third tab, `i` is `2` for every section — section 3's "move to
previous section" targeted itself, and sections past the third could not be
reached at all because `tab.sections[3]` did not exist.

The fix is one word in the template — `index: sectionIndex` on the slot, and
`getSectionOptions(sectionIndex, …)`.

The tests that pin it use **four** sections, not three. With three, the buggy
index (`0`) and the correct one (`2`) both resolve to `sections[1]`, and the
test passes against the unfixed source. That was the first version I wrote, and
the mutation check caught it — the same discipline that withdrew
[B49](#b49--and-a-fix-that-was-withdrawn).

---

### B77 in detail — a read-only rule that could not be undone

`SidePanelLayout` parsed each field for display and wrote the result back into
the layout it had been handed:

```js
section.columns[0].fields = section.columns[0].fields.map(parsedField)
```

`parsedField` clones the field, so this looked idempotent, and for most of what
it computes it is: a Select's options are already an array on the second pass,
a `Link`-to-`User` has already become a `User`. One line is not:

```js
const effectiveReadOnly =
  scriptReadOnly !== undefined
    ? scriptReadOnly
    : field.read_only ||
      (field.read_only_depends_on && read_only_via_depends_on)
```

`_field.read_only` is set to that result, and that parsed field replaces the
original in the layout. On the next pass `field.read_only` is no longer the
field's own flag — it is the answer the condition gave last time. `A || B` can
only grow, so once `read_only_depends_on` held even momentarily, the field was
read-only for the rest of the page's life.

Concretely: a deal with `read_only_depends_on: "eval:doc.status == 'Won'"` on a
field. Mark it Won, mark it Open again — the field stays locked until a full
page reload, with no indication why.

The computed now builds a copy of the section and its first column instead of
writing through, which also stops a computed from mutating its own dependency.

---

### B80 in detail — the flag that discarded a column layout

```js
load_default_columns: _view?.row || true,
```

Two faults in one line. `row` is not a field on a view — it is `rows` — so the
left side is always `undefined`; and `|| true` would have made the result true
even if it were not. This is the same shape as
[B53](#b53-in-detail--a-permission-guard-that-was-never-on), where
`option.condition?.() || true` made a permission check unconditional.

What makes it costly here is *where the value goes*. `getParams()` assigns
`view.value`, and `view.value` is the payload of every save:

```js
call('…crm_view_settings.update', { view: view.value })
```

`updateColumns` sets the flag correctly from the user's choice, so customising
columns saves the right thing. But `getParams()` runs again on the next reload
and overwrites it with `true`. From then on, any save — pressing **Save
Changes**, or changing a filter on a standard view — writes
`load_default_columns = 1`. The server reads that flag directly:

```python
if not is_default and custom_view_name:
    is_default = frappe.db.get_value("CRM View Settings", custom_view_name, "load_default_columns")
```

and serves the doctype's default columns instead. The user's column layout is
gone, and nothing said so.

The fix reads the field that exists and defaults to false.

---

### B93–B95 in detail — three ways one upload dialog lost track of its files

`FilesUploader` starts one upload per staged file and decides it is finished
like this:

```js
files.value.forEach((file, i) => attachFile(file, i))
...
.then((response) => {
  uploadedFiles.value.push(response)
  if (i === files.value.length - 1) {
    // …emit('after', uploaded), clear the list, close the dialog
  }
})
```

`i` is the position the file was *started* at, not the order it finished in.
Uploads run concurrently and come back by size and luck, so:

- **B93.** Drop three files. If the third finishes first, its `.then` sees
  `i === 2 === files.value.length - 1`, emits `after` with only its own
  response, empties `files.value` and closes the dialog. The other two are
  still uploading; when they land, `files.value.length - 1` is now `-1`, so
  their branch never runs. They *did* upload — the server has them — but the
  parent was told about one file, so the attachment list shows one.
- **B94.** If any upload rejects, the completion branch never runs at all,
  because the file that would have triggered it is the one that failed. The
  dialog sits open and the files that succeeded are never reported.
- **B95.** The web-link path calls `attachFile({ fileUrl })` with **no** index,
  so `undefined === length - 1` is never true and `after` is never emitted for
  a linked file. It also set `show.value = false` before starting the upload,
  so the dialog closed whether or not the upload worked.

All three are the same missing idea: nothing was counting completions. There is
now a pending counter, decremented on both settle paths, that emits once when
it reaches zero — and keeps the dialog open if anything failed, so the error
stays readable while the successes are still reported.

---

### B99 in detail — two computeds that read each other

`KanbanSettings` had a cycle:

```js
const fields = computed(() => {
  …
  allFields.value?.forEach(…)          // which fields are already on the card
  return _fields.filter(notAlreadyOnTheCard).map(toOption)
})

const allFields = computed({
  get: () => {
    …
    rows = rows.map((row) => fields.value.find((f) => f.fieldname === row) || {})
    return rows.filter((row) => row.label)
  },
  …
})
```

`fields` asks `allFields` what is already on the card; `allFields` asks
`fields` to turn saved fieldnames into field objects. Vue does not error on
this — it hands whichever one is mid-evaluation its unset value. In practice
the template reads `allFields` first, so `fields` runs with
`allFields.value === undefined`, its "already on the card" list comes out
empty, and **the "add a field" picker goes on offering every field including
the ones already there**. Adding one again produces a duplicate row on the
card.

The fix introduces a third computed holding the doctype's fields in option
shape, and a fourth holding just the saved fieldnames. `fields` and `allFields`
both read those, and neither reads the other.

Worth noting what did *not* change: `columnFields`, and the lookups behind the
column-field and title-field boxes, used to run over `fields`. Now that
`fields` genuinely excludes what is on the card, that would have made a field
vanish from those boxes the moment it was added to the card — a regression
introduced by the fix. They read the unfiltered list instead.

---

### B105 in detail — a preference that outlived the thing it preferred

`CallUI` decides which integration places a call:

```js
if (enabledIntegrations.value.length > 1 && !defaultCallingMedium.value) {
  show.value = true        // ask which one
  return
}
callMedium.value = enabledIntegrations.value[0]?.label ?? 'Twilio'
if (defaultCallingMedium.value) {
  callMedium.value = defaultCallingMedium.value   // …unconditionally
}
```

The stored preference wins outright, with no check that it is still one of the
enabled integrations. Both children are always mounted, so `twilio.value`
exists whether or not Twilio is configured — the call is handed to a component
with no credentials, and nothing visible happens.

The sequence is ordinary: a user ticks "make Exotel my default", an admin later
turns Exotel off and configures Twilio instead, and from then on that user's
calls go nowhere while everyone else's work.

A preference for something that is no longer available is not a preference. It
is now filtered against the enabled list, and when it does not survive that
filter the picker opens instead — which is what happens for a user who never
set one.

The same round fixed the picker itself: it listed `['Twilio', 'Exotel']`
literally, so the dialog offered a medium that could not place a call.

---

### The shape that keeps coming back: a read that writes

Five of the defects in this report are the same idea in different clothes — a
computed, or a function called from a template, that writes to something it
also reads:

| | Where | What it wrote | Consequence |
|---|---|---|---|
| [B77](#b77-in-detail--a-read-only-rule-that-could-not-be-undone) | `SidePanelLayout._sections` | parsed fields back into the layout prop | `read_only` became permanent |
| [B99](#b99-in-detail--two-computeds-that-read-each-other) | `KanbanSettings.fields` / `allFields` | each other | the picker offered fields already on the card |
| B101 | `Attendee.options` | the search resource's own `data` | a crash before the first response, a stale entry after |
| [D14](#7-issues-documented-not-fixed) | `KanbanView.columns` | a colour onto each column | benign — it is a one-shot initialiser |
| [D11](#7-issues-documented-not-fixed) | `ViewControls.quickFilterList` | `filter.value` onto each entry | benign — it is how the value round-trips |

The three that broke and the two that did not differ on one point: **whether
the written value feeds back into the next computation.** B77 OR'd against its
own previous answer, B99 formed a cycle, B101 accumulated. `KanbanView.columns`
checks whether any colour is set and stops; `quickFilterList` overwrites from
the filter each pass.

That is the test to apply when the shape shows up, rather than a blanket rule:
*if this runs twice, does the second run see the first run's output?*

---

### B111 in detail — the fourth guard that could never fire

`CalendarEventPanel` opened its date line with what looks like a guard:

```js
if (!_event.value.fromDate) return ''
```

`fromDate` is built by `parseEventDoc`:

```js
fromDate: dayjs(doc.starts_on).format('YYYY-MM-DD'),
toTime:   dayjs(doc.ends_on).format('HH:mm'),
```

`dayjs(null).format(...)` does not return an empty string. It returns the
**string** `"Invalid Date"` — which is truthy, so the guard never fires and the
formatter carries on.

That would be harmless if these fields were always present. `starts_on` is
required on Frappe's `Event` doctype; **`ends_on` is not**:

```
starts_on | reqd = 1 | type = Datetime
ends_on   | reqd = 0 | type = Datetime
```

So an event saved without an end time — which the desk calendar allows —
renders in the CRM panel as:

```
10 - Invalid Date Wed, 4 Mar 2026
```

The fix tests validity rather than emptiness, and shows the start on its own
when there is no end to show: `10 am Wed, 4 Mar 2026`.

This is the fourth guard in this report that could not fire
([B7](#6-bugs-found-in-the-application), B16, B18 are the others), and the
third to arise from a falsy-vs-empty confusion. The pattern is narrow enough to
state: **a value that has been through `.format()`, `.toString()` or template
interpolation is always a non-empty string**, so `if (!x)` no longer means what
it meant one line earlier.

---

### B109/B110 in detail — a getter that guarded and a setter that did not

The "Going?" control is one `computed` with both halves:

```js
get() {
  if (_event.value.owner?.value === user) return _event.value.attending || null
  const _attending = currentAttendee.value?.attending      // guarded
  return ['Yes', 'No', 'Maybe'].includes(_attending) ? _attending : null
},
set(value) {
  if (_event.value.owner?.value === user) { … } else {
    currentAttendee.value.attending = value                // not guarded
    updateAttendingStatus(currentAttendee.value.email, value)
  }
}
```

The `?.` in the getter is a statement that `currentAttendee` can be absent —
you can see an event you were not invited to. Reading it then works and returns
`null`; answering it throws, and the panel goes with it.

**B110** sits behind the same control. Duplicating an event copies its
participants but the copy has no record on the server yet, so its id is the
placeholder `duplicate-event`. Answering "Going?" before saving sent that
placeholder to `update_attending_status`. The status is now applied locally and
saved with the event.

Two findings, one control, one shape: the guarded read and the unguarded write
sat four lines apart.

---

### B88 / B115 — the same defect, found twice, six rounds apart

```js
function getSelectOptions(options) {
  return options.split('\n')
}
```

That function exists, character for character, in **two** files:
`ConditionsFilter/CFCondition.vue` and `Filter.vue`. A Select field whose
options are filled in by a script has nothing stored on the field, so
`options` is null and picking that field throws — in the condition builder
while drawing the value box, in the filter builder while working out the
default value.

The first copy was fixed as B88. The second sat there for six more rounds
until `Filter.vue` came up in the branch-filling pass.

This is the fourth pair of this kind in the report:

| | Guarded in | Unguarded in |
|---|---|---|
| `getSelectOptions(options)` | `CFCondition.vue` (B88) | `Filter.vue` (B115), `EditValueModal.vue` (B116) |
| `crmUsers.map(...)` with no `?.` | seven other sites | `InviteUserPage.vue` (B117) |
| `currentAttendee?.attending` | the getter | the setter, four lines below (B109) |
| `column.fields` | `getColumnSum` | `updateColumn` and the template (B98) |

The lesson is not "grep harder" — a previous round already recorded that
pattern-grepping *finds candidates, not defects*, and produced a false positive
doing it. It is narrower than that: **when a fix lands, the question worth
asking is whether the same expression exists elsewhere**, because in this
codebase it usually does. That check is cheap and exact, unlike grepping for a
shape.

---

### B114 withdrawn — the second fix taken back

Last round's report proposed a rule: *when a fix lands, check whether the same
expression exists elsewhere.* Applying it immediately turned up eight sites and
I guarded all of them. Six were wrong.

The reasoning was: `users` is fetched asynchronously, so `users.data` is null
until it resolves, so `users.data.crmUsers?.map(...)` throws. `SidePanelLayout`
writes `users.data?.crmUsers?.map(...)`; `Field.vue` does not; therefore
`Field.vue` has the bug (B114).

The store says otherwise:

```js
const users = createResource({
  url: 'xbr_crm.api.session.get_users',
  initialData: [],          // ← never null
  transform([allUsers, crmUsers]) { … return { allUsers, crmUsers } },
})
```

`users.data` is `[]` before the fetch, `[]` again if it fails, and
`{ allUsers, crmUsers }` on success. **It is never null.** Guarding `data` was
guarding a state that cannot occur, and the sibling `?.` in `SidePanelLayout`
that I reasoned from is itself redundant.

What the `[]` *does* mean is that `data.crmUsers` is `undefined` whenever the
fetch has not succeeded — so the meaningful guard is the one **after**
`crmUsers`, and seven of the eight sites already had it. The eighth,
`InviteUserPage`, calls `.map` directly: that is B117, and it is real.

Two things made the error visible:

- **The mutation check.** My behavioural test — "isCrmUser is falsy when the
  list could not be fetched" — passed against the reverted source. A test that
  cannot fail against the unfixed code is not testing the fix. That is the same
  signal that withdrew B49, and the same signal a round earlier when a revert
  script silently failed to revert.
- **Reading the resource definition** rather than reasoning from the call site.
  The premise "async resource ⇒ data starts null" is true of most resources in
  this codebase and false of this one.

The six unnecessary guards are reverted along with their comments, because a
comment asserting a bug that cannot happen is worse than no comment. What
replaces them is `UserFilterGuards.test.js`, which pins the actual contract —
`initialData: []`, therefore guard the list and not the container — across all
ten files that touch it.

The rule from last round survives, with a correction: checking for the same
expression elsewhere is worth doing, but **the check produces candidates, not
defects** — exactly what was already written about pattern-grepping. It reads
as a stronger signal than it is because the expressions are textually
identical; that similarity says nothing about whether the surrounding contract
is the same.

---

### B118 in detail — the codebase disagreed with itself, and this time it was right

`getDealStatus(name)` resolves a deal's status through a map:

```js
let dealStatusesByName = reactive({})        // filled in by transform()

function getDealStatus(name) {
  if (!name) name = dealStatuses.data[0].name
  return dealStatusesByName[name]
}
```

The map starts empty and is populated by the list resource's `transform`, so
**every lookup returns `undefined` until that fetch lands** — and returns
`undefined` permanently for a deal whose status was renamed or removed in
settings. Nothing makes the deal page wait for the statuses; it renders as soon
as its own document resolves.

Fourteen call sites. Five wrote `getDealStatus(x)?.color`; nine wrote
`getDealStatus(x).color` or `.type`. The split was not random:

| | Guarded | Unguarded |
|---|---|---|
| Deal **lists** (`Deals`, `Contact`, `Organization`, and their mobile twins) | 5 | 0 |
| Deal **detail** (`Deal`, `MobileDeal`, `DealModal`, `ConvertToDealModal`) | 0 | 9 |

Same data, same lookup, same failure mode — handled in the list, unhandled on
the record. On a cold load the deal page could throw during render.

The three unguarded `.type` comparisons all fall the safe way once guarded,
which is worth stating because it is why `?.` is the whole fix:

```js
getDealStatus(doc.status)?.type !== 'Lost'   // undefined → true  → save
getDealStatus(data.status)?.type == 'Lost'   // undefined → false → normal save
getDealStatus(data.status)?.type != 'Lost'   // undefined → true  → reload
```

An unclassifiable status saves the record rather than blocking the user behind
a "why was this lost?" modal it cannot justify asking.

**B119** is the same function's other half: `dealStatuses.data[0].name` runs
whenever a caller passes no name, and the resource is created with
`initialData: []`. All three status getters had it.

#### Why this one is not a repeat of the withdrawn fix

Last round's mistake was inferring a bug from a sibling's redundant `?.`. The
check that separates the two cases is *reading the initial state*, and here it
is unambiguous: `reactive({})` with no seeding, versus `users`' `initialData: []`
whose `.crmUsers` is merely `undefined` rather than a dereference of null. The
guarded-vs-unguarded split across fourteen sites is corroboration, not the
argument.

---

### B120 in detail — a guard one line too late

```js
function triggerCall() {
  let primaryContact = dealContacts.data?.find((c) => c.is_primary)
  let mobile_no = primaryContact.mobile_no || null     // ← reads it here

  if (!primaryContact) {                               // ← checks it here
    toast.error(__('No Primary Contact Set'))
    return
  }
  …
}
```

Two lines, in the wrong order. The `?.` on `dealContacts.data` shows the author
knew the list might not be there — and `find` returning `undefined` is the
ordinary case, not an edge one: a deal with contacts but none marked primary,
a deal with no contacts, or simply a page where the contacts request has not
come back yet.

So the check exists, the message exists, and neither can ever run. Pressing the
call button in any of those three states throws.

It is worth separating from the other guard defects in this report. Those were
missing (`?.` absent, a `.split` on a null). This one is *present and
unreachable* — the same category as
[B16](#b16-in-detail--a-guard-that-could-never-fire),
[B18](#b18-in-detail--a-validation-branch-nothing-could-reach) and
[B111](#b111-in-detail--the-fourth-guard-that-could-never-fire), and the fifth
of them. Reading the function top to bottom is what finds these; no amount of
grepping for `?.` would.

---

### How strong is this suite? — a measurement, not an assertion

Every number in this report so far describes the suite's *size*. None of them
say whether the tests actually constrain behaviour. Six times in this work a
test passed while proving nothing, so the question is worth answering directly.

**Step 1 — is anything being stubbed out?** A scan flagged nine suites that
stub a component they also import for testing (the T35 trap). All nine were
false positives: breaking each component made its suite fail. Coverage already
implied this — a stubbed-out component would measure 0% — and only two files
anywhere sit at 0%, both known and documented.

**Step 2 — do the assertions constrain the behaviour they cover?** Sixteen
deliberate behaviour changes, one per area, each run against the suite that
owns it:

| Mutation | Result |
|---|---|
| rounding becomes truncation | caught |
| the `like` operator stops matching | caught |
| deal statuses resolve against the lead map | caught |
| dates default to equals instead of a range | caught |
| single-point map framing is skipped | caught |
| the missing-participant guard is removed | caught |
| optional selects lose their blank option | caught |
| the column ceiling is lifted | caught |
| the primary-contact guard inverts | caught |
| the comment filter stops filtering | caught |
| pagination stops clamping | caught |
| empty checkboxes are hidden | caught |
| the -1 splice guard is removed | caught |
| blue-grey becomes indistinguishable from grey | caught |
| uploads report before they all finish | caught |
| the minimum resize width stops applying | caught |

Sixteen of sixteen.

**Step 3 — and can the harness report a failure at all?** This is the step that
makes the other two mean anything. A run that only ever prints "caught" is
indistinguishable from a broken harness — the same trap as the revert script
that silently failed to revert. Four mutations were made in code the coverage
run proves is never executed:

| Mutation | Result |
|---|---|
| reworded an error toast on the deal page | **missed**, correctly |
| reworded a second untested toast | **missed**, correctly |
| reworded a Kanban empty-state string | **missed**, correctly |
| reworded an empty-search message | **missed**, correctly |

Four of four missed. The harness can report both outcomes.

#### What this does and does not show

It does **not** show the suite catches 100% of regressions. The sixteen were
chosen by the person who wrote the tests, targeting behaviour known to be
covered — a biased sample by construction. The four negative controls are the
honest counterweight: **the uncovered 20% is undefended, and mutating it is
silent.**

What it does show is narrower and still worth having: *where the suite claims
to cover behaviour, the assertions genuinely pin it down.* The tests are not
passing vacuously. Given how often the opposite turned out to be true during
this work, that was not safe to assume.

#### And it immediately found one

The full run after this exercise reported **4 unhandled errors under 5,418
passing tests** — `Link.vue` calls `options.update()` before every search, and
the resource mock in `DealRecord.test.js` (written two rounds ago) had no
`update`. The tests passed; the errors were noise underneath them.

The reason it went unnoticed for two rounds is a habit, not a mistake in the
test: the per-suite verification here greps for `FAIL` and `Tests`, and vitest
prints unhandled errors on a separate `Errors` line. **That grep now includes
`Errors`.** It is the fourth variant of the same lesson in this report — a
check that cannot observe the thing it is checking for.

#### The measurement now lives in the repo

A number measured once and written into a document decays the moment someone
edits a test. So the exercise above is no longer a transcript — it is a script
anyone can run:

```
yarn test:mutants            # all of them
yarn test:mutants --list     # what they are, without running
yarn test:mutants --filter=pagination
```

Two files, in `tests/mutation/`:

- **`mutants.js`** — the list. Each entry names a source file, the suite that
  should notice, the exact text to change, what the change means in plain
  words, and whether it is expected to be `caught` or `missed`.
- **`run.js`** — applies one mutant, runs only the owning suite, restores the
  file, and compares outcome against expectation.

Three properties were worth the extra code:

**It always restores.** The source is copied to a sibling `.mutant-backup`
before the edit and put back in a `finally`, plus on `SIGINT` and on any
uncaught exception. A run killed mid-suite leaves the tree clean. This is the
whole reason the tool is safe to run casually — a mutation harness that can
strand a mutated file in your working tree is one you will not run.

**Stale mutants fail the run.** If the anchor text is no longer in the source —
the code was refactored, the line moved — the mutant is reported `STALE` and
the run exits non-zero. The alternative is worse than useless: a mutant that
silently matches nothing prints nothing and reads exactly like a pass.

**A caught control is also a failure.** The two `expect: 'missed'` entries are
the negative controls from step 3, and if one is ever caught the run fails.
That is not because catching it is bad — it usually means somebody wrote a test
for that string, which is progress. It fails so the list gets updated
deliberately rather than drifting into a set that can only ever say "caught".
The runner also refuses to pass if *no* controls ran at all.

Current state: **18 mutants, 18 as expected** — 16 caught, 2 correctly
survived. Same result as the one-off measurement, now reproducible on demand
rather than asserted here.

The bar for adding one: it must be a real invariant, not a typo. "Rounding
becomes truncation" is a mutant. Renaming a variable is not.

#### Then the same list was used to find a flaw in itself

The first full run of `test:mutants` after an ambiguity check was added
reported the rounding mutant as **AMBIG**: `Math.round(` appears three times in
`numberFormat.js`, and only the first match is replaced. The original "caught"
verdict had been luck — the first occurrence happened to be a covered one.

The anchor now names Commercial Rounding specifically, and an ambiguous anchor
fails the run rather than quietly testing whichever site comes first. In a
`.vue` file the first match is very often in the template, where the suite may
not look at all — which reads as a surviving mutant and blames the tests for a
mutation that never happened where it was meant to.

---

### The honest version of the number: random sampling

Everything above is measured against a **curated** list, and a curated list has
its bias baked in: those 18 mutants were chosen by the person who wrote the
tests, aimed at behaviour already known to be covered. "16 of 16" measures the
choosing as much as it measures the suite. The report said so, and then left it
there. This is the follow-through.

`tests/mutation/sample.js` (`yarn test:sample`) enumerates every
mechanically-mutatable site in `src/` — 5,503 of them — and samples uniformly
at random. Fifteen plain operators (`===`→`!==`, `&&`→`||`, `?.`→`.`,
`true`→`false`, `+ 1`→`- 1`, …), no cleverness, and above all no knowledge of
what is tested entering the choice. Each mutant runs against whichever suites
import that file.

**Two independent seeds, 60 mutants:**

| Seed | Caught | Scored | Score |
|---|---|---|---|
| 424242 | 22 | 29 | **76%** |
| 20260830 | 19 | 29 | **66%** |
| **combined** | **41** | **58** | **71%** |

(Two mutants were discarded, one per run, for stopping the file compiling. A
mutant any suite catches because the file no longer parses measures nothing.)

**So: 100% on the mutants I picked, 71% on mutants picked at random.** That gap
is the entire value of this exercise. The curated number was not a lie, but it
was not an estimate of anything either.

#### Three wrong numbers came first, and each looked plausible

This is the part worth writing down, because a mutation harness fails silently
in exactly the way it exists to detect.

**Wrong number 1 — 60%.** The SFC script-block detection tracked a flag from
`<template>` to `</template>`. Vue uses `<template #slot>` *inside* the markup,
and every one of those closed the flag early, so the sampler mutated `</div>`,
a URL inside an attribution string, and `<script setup>` itself. Most of the
"caught" results were the file failing to parse. Caught by reading the output
instead of the summary line: the mutated lines were printed, and they were
markup.

**Wrong number 2 — 50% and 56%.** `execFileSync` returns **stdout alone**, and
vitest writes its summary to stderr. The harness leaned entirely on the
thrown-error path to notice a failure. Several mutants were reported as
surviving that a hand check caught immediately. Caught by disbelieving the
result: three "survivors" sat on lines whose tests visibly asserted on them, so
they were re-run by hand and all three failed. Fixed by using `spawnSync` and
reading `status`, `stdout` and `stderr`.

**Wrong number 3 — a false survivor inside the good run.** A `<` inside
`'© <a href="https://www.stadiamaps.com/">Stadia Maps</a>'` counted as an
untested comparison. Operators are now matched against a copy of the line with
string and regex literals blanked out, and the mutation is spliced at that
index rather than at the first match in the raw line.

The pattern across all three: **every broken version produced a number in a
believable range.** 60%, 56%, 50%, 76% — none of them looked wrong. The only
thing that separated them was checking what was actually mutated.

The sampler now, in consequence:

- reads the file back after writing and reports `not-applied` rather than
  `survived` if the mutation is not on disk;
- reads it again before restoring, so a run that lost its mutation mid-way
  cannot be recorded as a survivor;
- **re-runs every survivor once** and flags any that disagrees;
- prints the `-` and `+` lines for every mutant, not just the original.

That last one is the cheapest and was added last. A survivor whose printed line
did not match the file cost a long detour through `git show` to resolve.

#### A third seed, and what it cost to act on

| Seed | Caught | Scored | Score |
|---|---|---|---|
| 424242 | 22 | 29 | **76%** |
| 20260830 | 19 | 29 | **66%** |
| 90210 | 15 | 25 | **60%** |
| **combined** | **56** | **83** | **67%** |

Ten survivors from the third seed, triaged one at a time. Six were real gaps
and now have tests: the `?.` on `getDealStatus(...)` inside `reloadResources`
(one of this work's *own* B118 guards, whose null path nothing exercised), the
all-day reminder's singular/plural branch, the hierarchy picker's loading flag,
the background user-fetch latch, the two-step delete confirmation, and the lead
owner's fallback to a raw id.

Four were **equivalent mutants**, and one of them is instructive.
`Questionnaire.vue` reads:

```js
if (autoAdvance(question.value) && current.value < total.value - 1) advance()
```

Flipping that `&&` to `||` changed nothing, because `advance()` re-checks the
same bound internally. The outer clause is redundant. A surviving mutant there
is not a missing test — it is a *duplicated guard*, which is worth knowing but
is not a defect.

#### A flake worth recording

One full run in this round reported 12 failures across `ViewControls` and
`TelephonyCallUI`. Both suites passed alone; the audit was clean before and
after; the next full run was green at 197 files and 5,545 tests. The likely
cause is the same one as the mutated files — writes landing in `src/` from
outside while vitest was reading it.

It is recorded rather than chased because the useful part is the diagnosis
procedure, not the incident: *run the suite alone, run the audit, run it
again.* Three cheap checks separate "the tree is wrong" from "the run was
disturbed", and only the first is worth debugging.

#### What survives, and what that means

The survivors are not random. Across both samples they fall into four groups:

| Shape | Example | Real gap? |
|---|---|---|
| Optional chaining removed | `note?.name`, `geoJson.features?.length` | Sometimes — see below |
| A prop default flipped | `card: { default: false }` | Only for callers that omit the prop |
| A boundary condition | `sidebarWidth < range[1]` | Yes |
| A branch selector | `section.name === 'organization_section'` | Yes |

**Optional chaining is the interesting one.** Removing a `?.` only changes
behaviour when the value is actually nullish, so a surviving `?.` mutant means
one of two things: the guard is unreachable and the mutant is *equivalent*, or
the null path is real and untested. Those are opposite conclusions, and only
reading the code separates them. This report has examples of both — five
guards were withdrawn as unreachable (B114), and five real defects were guards
that could never fire (B16, B18, B111, B119, B120).

So a survivor list is a list of **questions**, not defects — the same lesson the
pattern-grep produced, arrived at from the other direction.

#### Ten survivors were then killed

Working through the lists produced real tests, not box-ticking, because each
one names a specific behaviour nothing was checking:

| What nothing was checking | Now pinned by |
|---|---|
| The primary email/phone is the ticked row in the contact side panel | `ContactPage` |
| Uploading a contact photo, and clearing it | `ContactPage` |
| A shaped field's placeholder falls back to its label | `FieldTransforms` |
| Call and email timeline entries are left undecorated (only `communication` was tested; both call types went through the same untested branch) | `Activities` |
| The prop defaults three list pages rely on — Columns, Import, Export, the list view | `ViewControls` |
| Which callback gets the insert flag when a call log spawns a note or task | `CallLogDetailModal` |
| Formatters given a fieldname the doctype no longer has | `metaStore` |
| The app switcher never lists CRM itself | `UserDropdown` |
| "1 hour before" versus "1 hours before", on every interval | `CalendarComponents` |
| Which of two list-resource shapes the filter chips read from | `Filter` |
| Where the fade sits as a scrollable list is scrolled | `SmallComponents2` |
| The call popup appearing when the carrier accepts; the minimised popup closing with the large one | `TwilioCallUI`, `TelephonyCallUI` |
| Whether a tab move is offered at the ends of the tab strip | `FieldLayoutEditor` |
| Every reminder-alert rule behind the event notification popup | `eventNotificationsData` (new suite, 28 tests) |

Two of those turned up defects rather than gaps — B121 and B122 below.

### B121 — a rule with no name validated clean

```js
case 'assignmentRuleName':
  if (assignmentRuleData.value.assignmentRuleName?.length == 0) {
```

`?.length == 0` is true only for the empty string. A `null` name gives
`undefined == 0`, which is **false**, so the validator took the `else` branch
and cleared the error — an assignment rule could be saved with no name at all.
The field beside it gets this right (`description?.length > 0 ? '' : error`),
which is what makes the shape recognisable.

The `?.` is the tell: whoever wrote it knew the value could be null. The
comparison just did not act on it. That is the fourth appearance in this report
of a guard that was written for a case it does not handle.

```js
if (!assignmentRuleData.value.assignmentRuleName?.length) {
```

### B122 — a defect this work introduced, caught by the sampler

The `plus1→minus1` mutant on `FieldLayoutEditor.vue` survived. Writing the test
for it showed why: the condition on **Move Last Column to Next Tab** read
`tabs.value[tabIndex.value - 1]`. It asked about the previous tab.

So the action was hidden on the first tab, where a next tab does exist, and
offered on the last, where it does not — and taking it there dereferenced
`undefined` and blanked the editor.

`git show HEAD` settles the authorship, and it is not upstream's:

```diff
-          condition: () => tabs.value[tabIndex.value + 1],
+          condition: () =>
+            tabs.value[tabIndex.value - 1] && section.columns.length,
```

That is **this work's own edit** — an earlier session added the
`&& section.columns.length` guard to all four move actions by copying the
previous-tab line, and carried its `- 1` along. A fix that introduced a defect,
in the same file, of the same copy-paste shape the report had already named.

It survived a full green suite for several sessions. Coverage was 100% on that
line — the condition ran on every menu open. Nothing asserted what it returned.

### The ad-hoc check that left the source mutated

Mutation checks on individual fixes were being run as a shell function: copy the
file, edit a line, run the suite, copy it back. During this session one of those
restores **did not take**, and `ViewControls.vue` sat with
`allowedViews: ['kanban']` through a full coverage run — which is how it was
found, as a single failing test in an otherwise green suite.

The check that was supposed to catch this — `find src -name '*.chk'` — passed,
because the backup had been removed even though the copy-back had not landed.
A cleanup check is not a restore check.

This is now `tests/mutation/check.js`:

```
node tests/mutation/check.js src/components/Filter.vue 212 '||' '&&' Filter.test.js
```

It reads the file back after restoring and **exits 3, loudly, if the content
does not match** what it saved.

The general form of the lesson, for the fifth time in this report: *a check
that cannot observe the thing it is checking for is not a check.*

### And then it happened three more times

The paragraph above used to end "all three mutation tools now verify their
restores rather than assuming them." That was written after fixing `check.js`,
and it was not true: `run.js` and `sample.js` were still doing a bare
`copyFileSync` in a `finally` and trusting it. A later session went looking for
a surviving mutant, opened the file, and found the mutation still in it.

A full sweep of the working tree turned up **four** files left mutated — and a
fifth arrived later, after the hardening, which is what finally identified the
cause:

| File | Left behind | Why nothing noticed |
|---|---|---|
| `AllModals.vue` | `note?.name` → `note.name` | only throws if `showNote()` is called bare |
| `ListPagination.vue` | `card: default false` → `true` | — |
| `MobileLead.vue` | `&&` → `\|\|` | in a branch no test reached |
| `EmailEdit.vue` | `accountData?.password` → `.password` | only throws when the prop is absent |
| `ViewControls.vue` | `$socket?.off` → `$socket.off` | unmount path, and `$socket` is always mocked |

All four sat in the tree through a **full green suite — 196 files, 5,521 tests,
zero failures.** That is not a coincidence, and it is the whole problem in one
line: *a mutant that survives is by definition one the suite cannot see.* The
tests can never be the thing that catches a failed restore, because the only
mutations that survive long enough to be left behind are the ones nothing
tests.

`ListPagination` is the exception that proves it — a test *does* cover that
default, and the mutant was correctly reported caught. It was left behind
anyway, because the restore is a separate step from the verdict.

Both tools now read the file back after restoring and exit 3 rather than
continuing. But that only protects future runs, and by then four files had
already been damaged, so:

#### The cause is not in the tools

A fifth file turned up *after* that hardening was in place — and this one
settles what is actually happening. `sample.js` re-read `ViewControls.vue`
after restoring it, found it correct, and exited 0. The mutation was in the
file afterwards anyway.

So the restore is not failing. **Something outside the process writes the
mutated content back after the tool has put the original there.** The editor is
the obvious candidate: it has these files open, its buffer picks up the
mutation mid-run, and a later save — manual or automatic — writes that buffer
over the restored file. Another file in the tree was reported as changed on
disk by the editor during the same session, which fits.

That matters because it moves the problem out of reach of anything the tool can
do to itself. No amount of in-process verification helps against a write that
lands after the process exits. The practical rules are therefore:

- **Do not edit files under `src/` while a mutation run is in flight**, and
  close them in the editor if you can.
- **Run `yarn test:audit` after every mutation run**, because it is the only
  check positioned to see this at all.

### `yarn test:audit`

`tests/mutation/audit.js` diffs the working tree against `HEAD` and flags any
hunk where a removed line becomes an added line through **exactly one mutation
operator**. That is the signature of a tool's edit rather than a person's.

It found the fourth instance — `EmailEdit.vue` — after the first three had been
fixed by hand and the tree was believed clean.

It reports candidates, not verdicts, because a real fix can have the same
shape: two `?.` removals in `EmailArea.vue` are legitimate, since the `cc` value
now comes from a helper that always returns an array. Those live in an
`ACKNOWLEDGED` list in the script with the reason attached, so the check can go
green without going blind.

The choice of detector matters here. The obvious one — "run the suite and see
if it fails" — is precisely the one that cannot work. The audit does not ask
whether the code is correct. It asks whether the *shape of the change* looks
like something a machine did, which is a question the tests are not equipped to
answer and a diff is.

---

## 7. Issues documented, not fixed

#### D9 — `AssignTo` anticipates a null owner field and then dereferences it

```js
const ownerField = computed(() => {
  if (props.doctype === 'CRM Lead') return 'lead_owner'
  else if (props.doctype === 'CRM Deal') return 'deal_owner'
  else return null                       // ← deliberate
})
…
let owner = ownerField.value.replace('_', ' ')   // ← unconditional
```

Only `Lead.vue`, `Deal.vue`, `MobileLead.vue` and `MobileDeal.vue` mount this
component, all with one of the two doctypes, so the null branch is unreachable
today. Left alone rather than guessed at: the function's whole purpose past
that line is composing a message *about the owner field*, and what it should
say when there isn't one is a design question, not a missing guard. The test
suite records the null return so the next person meets it deliberately.


Eight cases where a test pins the current behaviour rather than changing it,
because the fix carried more risk than the bug. Each has a test so any future
change is deliberate and visible.

#### D1 — `stripHtml` leaks a fragment when an attribute contains `>`

`<a href="http://x.com/a>b">link</a>` strips to `b">link`, because the tag regex
closes at the first `>` — which is inside the href. This only decides which
notes a free-text search matches; a real HTML parser is not worth the weight,
and the failure mode is an odd search hit, not broken output.

#### D2 — `strip()` returns `undefined`, not a string

Its body is wrapped in `if (s) { … }` with no else, so `strip('')`,
`strip(null)` and `strip(0)` all fall off the end. Inherited Frappe helper with
callers we do not control; "fixing" it could change behaviour somewhere relying
on the falsy return.

#### D3 — a numeric `precision: 0` is ignored

The meta formatters read `df?.precision || null`, so a field set to **0**
decimals is falsy and falls through to the 3-decimal default — `40` renders as
`40.000%`.

It has never bitten because Frappe stores precision in a Select, so it arrives
as the *string* `'0'`, which is truthy and works. **Switching to `??` would be
wrong:** that `||` is also swallowing `''`, which is Frappe's "use the default".
With `??`, `''` would pass through to `toFixed('')` and silently turn every
default-precision field into 0 decimals — trading a dormant edge case for a
visible regression across every currency and float in the app.

#### D4 — `evaluateDependsOnValue(false)` returns `true`

The `if (!expression) return true` guard catches literal `false` before the
boolean branch can, so both booleans resolve to "visible". All seven callers
pass a doctype schema property (`depends_on`, `mandatory_depends_on`, …), which
is always a string or undefined — the path is unreachable in practice, and
changing field-visibility semantics app-wide for it is not warranted.

#### D6 — `Questionnaire`'s skip feature is declared but not implemented

The component declares a `showSkip` prop, a `skip` emit and a `labels.skip`
string, but the template renders no skip control and never emits it. The only
consumer, `pages/PersonaForm.vue`, passes `:show-skip="false"` and does not
listen for `@skip`, so nothing depends on it today.

Left as-is rather than either implementing a feature nobody requested or
removing API that may be intended. Three tests record the current state so the
gap is visible to whoever next reaches for the prop.

#### D5 — an empty list takes the *grouped* branch in `ListRows`

`[].every()` is vacuously true, so zero rows reads as "all grouped". Harmless —
both branches render nothing — but it means the flat scroll container is not
mounted, so there is no scroll position to restore until rows arrive.


#### D7 — `formattedDateTime` rewrites the event it is handed

`EventNotificationsArea` formats times by assigning back onto the item
(`e.fromTime = e.fromTime.replace(':00', '')`), and the template calls it during
render — so the objects inside `computedEvents` are mutated in place as a side
effect of drawing them. Anything reading `fromTime` afterwards sees `"3 pm"`,
never `"3:00 pm"`.

Harmless today: the rewrite is idempotent and the computed rebuilds its objects
whenever `events` changes. Left alone because making it pure means either
formatting during the map or returning a new object, and both change what the
template binds. Two tests pin the behaviour so a future refactor has to
acknowledge it.


#### D8 — enrichment can never fill company size

`LeadModal`/`DealModal` prefill `no_of_employees = '1-10'` in `onMounted`, before
any user interaction. `enrichFromWebsite()` uses fill-empty semantics — it only
writes fields that are `undefined`, `null` or `''` — so the pre-selected size
always looks like user input and whatever Domain Enrichment returns for company
size is discarded.

Left as-is: removing the default changes what the form shows on open, and
"never clobber what the user typed" is the right rule for every other field.
A test pins it so the interaction is visible rather than surprising.

#### D10 — `Resizer` saves a width nothing reads, and nothing mounts it

`Resizer.vue` writes `localStorage.sidebarWidth` when a drag ends, but the
width is initialised from `props.defaultWidth` and no code anywhere reads that
key back — so a resized panel is the same size again on the next visit. The
component is also **not mounted anywhere**: `pages/Deal.vue` imports it and
never uses it in its template.

Left as-is on both counts. Restoring the saved width is a behaviour decision
(which panels share the key? does it survive a layout change?), not a defect
with an obvious right answer, and deleting an unused component is a call for
whoever owns the roadmap. The listener leak inside it *was* a defect and is
fixed as [B72](#6-bugs-found-in-the-application); tests cover the drag maths
either way, so whenever it is wired up the behaviour is pinned.

#### D11 — `quickFilterList` writes to its own source

The computed loops over `quickFilters.data` and assigns `filter.value` on each
entry, so reading it mutates the resource it depends on. It works because the
template `v-model`s onto that same `value`, which is how an applied filter
shows back up in its box — the round-trip goes through the resource rather than
through local state.

Left as-is: the alternative is a parallel map of fieldname → value plus a watch
to keep it in step, which is a real change to how the quick-filter row is
wired, and there is no observed misbehaviour to justify it. Tests pin the
round-trip for plain values, `LIKE` values with their wildcards stripped, and
checkboxes, so a rewrite has something to hold it to. Compare
[B77](#b77-in-detail--a-read-only-rule-that-could-not-be-undone), where the
same shape *did* misbehave — there the written-back value fed back into the
computation on the next pass; here it does not.

#### D12 — the export URL interpolates two values unencoded

`exportRows` encodes `filters` but not `fields` or `order_by`, and `order_by`
contains a space (`modified desc`). Browsers percent-encode on assignment to
`location.href`, so the request goes out correctly today.

Left as-is: `encodeURIComponent` on both would be strictly more correct, but
nothing is currently broken and the change is invisible. Recorded so that if a
field label or sort expression ever gains a character the browser does *not*
fix up, the cause is already written down.

---

#### D13 — a filter default that was computed and then thrown away

`CFCondition.updateOperator` read:

```js
condition[2] = getDefaultValue(condition[0])
resetConditionValue()          // condition[2] = ''
```

Two things wrong at once: `getDefaultValue` expects a field object and was
handed a fieldname string, so every branch of it missed and it returned `''`
anyway; and its result was overwritten on the next line regardless.

The dead assignment is removed, which changes nothing observable. What is *not*
done is the thing the line was reaching for — seeding a sensible value when the
operator changes (`0` for a rating, `Yes` for a checkbox, a pair for
`between`). That is a product decision about what a filter should mean the
instant its operator changes, and there is no right answer to guess at.
`getDefaultValue` is left in place with a note, and a test pins the current
behaviour: changing the operator clears the value.

#### D14 — two more computeds that write to their own source

`KanbanView.columns` assigns a colour to each column while computing, and
`ViewControls.quickFilterList` assigns `filter.value` on each entry (see
[D11](#7-issues-documented-not-fixed)). Both are reads with side effects on
their dependencies — the shape that turned out to matter in B77 and B99.

Left as-is. `columns` is a one-shot initialiser: it checks whether any column
already has a colour and stops assigning if one does, so unlike B77 the written
value does not feed back into the next computation. Recorded because the shape
is worth recognising, not because these two misbehave.

---

#### D15 — three cache keys captured before the value they name

`createResource` takes a `cache` key, and most callers pass props or constants
that are stable for the component's life. Three pass a `.value` read at
creation time, when it is still empty:

| File | Key | What varies |
|---|---|---|
| `Calendar/Attendee.vue` | `[text.value, 'Contact']` | the search text, per keystroke |
| `Controls/Link.vue` | `[props.doctype, text.value, …]` | the search text, per keystroke |
| `Telephony/TwilioCallUI.vue` | `['contact', phoneNumber.value]` | the number, per call |

So each of those components has **one** cache slot shared by every query it
ever makes. All three call `reload()`/`fetch()` explicitly, so the data is
corrected as soon as the response lands; the visible effect is the previous
query's results showing for a moment — for `TwilioCallUI` that is the previous
caller's name in the incoming-call popup.

Left as-is. Making the key vary means either a dynamic key (which changes how
frappe-ui coalesces requests) or dropping caching (an extra request per
keystroke). Which of those is right is a performance decision, and nothing
here is wrong enough to make it unilaterally.

#### D16 — `save()` and `update()` in `ExotelCallUI` are the same function

Both read:

```js
if (note.value.content) createUpdateNote()
if (task.value.title) createUpdateTask()
```

They are wired to different buttons. Whether the two should ever diverge — for
instance, whether "update" ought to skip creating something that does not exist
yet — is a question for whoever designed the in-call panel. Recorded rather
than merged.

---

---

## 8. Suite inventory

194 suites. **186 new**; the 8 pre-existing ones still pass unchanged.

### Utils — 12 suites

| Suite | Tests | Covers |
|---|---|---|
| `utilsIndex.test.js` | 119 | 28 helpers from the utils barrel |
| `utilsIndexPart2.test.js` | 76 | Condition-expression building, task menus, clipboard, dropdown builders |
| `numberFormat.test.js` | 60 | Currency, grouping, all three rounding methods |
| `dashboardCards.test.js` | 29 | KPI hues, captions, chart config stripping |
| `expressions.test.js` | 23 | `depends_on` / `eval:` evaluation |
| `processField.test.js` | 26 | *pre-existing* |
| `fieldPropertyOverrides.test.js` | 22 | *pre-existing* |
| `renderFieldLayoutDialog.test.js` | 22 | *pre-existing* |
| `scriptHelpers.test.js` | 22 | *pre-existing* |
| `checkMandatory.test.js` | 21 | *pre-existing* |
| `noteFilters.test.js` | 21 | Note search, owner scope, HTML stripping |
| `assignFilter.test.js` | 14 | *pre-existing* |
| `emptyStateUtils.test.js` | 14 | Sentence splitting, subtitle nouns |
| `callLog.test.js` | 15 | Call-log cells, status maps |
| `dashboardDates.test.js` | 11 | Date ranges, clock pinned |
| `formatError.test.js` | 11 | Every API error shape |
| `applyStateFieldOptions.test.js` | 11 | *pre-existing* |
| `parseLinkFilters.test.js` | 5 | *pre-existing* |

### Stores — 9 suites, all 9 stores covered

| Suite | Tests | Covers |
|---|---|---|
| `metaStore.test.js` | 28 | `getFields`, formatters, user settings |
| `usersStore.test.js` | 27 | `getUser`, roles, record merging, auth redirect |
| `viewsStore.test.js` | 19 | Pinned/public/standard view resolution |
| `statusesStore.test.js` | 18 | Colour transforms, lookups, `statusOptions` |
| `notificationsStore.test.js` | 8 | Unread count, mark-as-read |
| `sessionStore.test.js` | 8 | Cookie parsing, login/logout |
| `organizationsStore.test.js` | 7 | Indexing, auth redirect |
| `settingsStore.test.js` | 7 | Brand setup singleton |
| `globalStore.test.js` | 6 | Call-handler indirection, app globals |

### Composables — 8 suites

| Suite | Tests | Covers |
|---|---|---|
| `eventComposable.test.js` | 35 | Duration, time ranges, participants, doc parsing |
| `useKeyboardShortcuts.test.js` | 23 | Matching, typing guard, dialog guard, teardown |
| `useBroadcast.test.js` | 20 | Cross-tab replay, listener teardown, doctype modal |
| `useActiveTabManager.test.js` | 16 | URL hash, storage fallback, back-button sync |
| `smallComposables.test.js` | 14 | Composer doctypes, breakpoint, page actions, WhatsApp flags |
| `telephonyComposable.test.js` | 13 | Integration toggles, `callEnabled` derivation |
| `useAttachments.test.js` | 12 | Deferred deletion, per-document isolation |
| `documentComposable.test.js` | 11 | Create flow, ERPNext product redirect |
| `useTimelinePreferences.test.js` | 9 | Timestamp format, sort order, cell swap |
| `frappecloud.test.js` | 5 | Confirm dialog, dashboard URL |

### Components — 95 suites

| Suite | Tests | Covers |
|---|---|---|
| `EmailMultiSelect.test.js` | 30 | Pasted lists, validation, suggestions, modes |
| `Icons.test.js` | 248 | All 116 icon components as a set, plus the three with logic |
| `DurationInput.test.js` | 29 | Duration parsing in every accepted format, commit and keyboard |
| `AttachControl.test.js` | 25 | Filename extraction, image detection, upload and clear |
| `EnrichFromWebsite.test.js` | 24 | Socket lifecycle, completion and failure paths |
| `Questionnaire.test.js` | 25 | Single vs multi choice, navigation, delayed submit |
| `ColumnSettings.test.js` | 18 | Add/remove/edit columns, alignment, reset |
| `EventNotificationPopup.test.js` | 15 | Alert filtering, dismissal timing, participants |
| `DeleteLinkedDocModal.test.js` | 15 | Selection scope, unlink vs delete, document deletion |
| `SLASection.test.js` | 17 | SLA colour and wording, response type, status dots |
| `AssignToBody.test.js` | 16 | Add/remove assignees, the assign-to-me switch, mount safety |
| `CountUpTimer.test.js` | 15 | Call-timer formatting, rollovers, start/stop |
| `RatingInput.test.js` | 22 | Half-star maths, toggle-off, hover states, formatted input |
| `FieldVisibility.test.js` | 24 | Form-field visibility rules, placeholders, options, url guard |
| `LinkControl.test.js` | 19 | Search results, `@me` shortcut, value binding, refetch guard |
| `ViewBreadcrumbs.test.js` | 10 | Page name, views menu, separator |
| `GettingStartedBanner.test.js` | 13 | Progress bar, step wording, completed state, collapsed rail |
| `UserDropdown.test.js` | 11 | Avatar chevron, collapsed brand, server-driven menu |
| `ListPagination.test.js` | 22 | Page maths, ellipsis, bounds, page size |
| `ActivityHeader.test.js` | 20 | Per-tab actions, standfirst, New-menu gating |
| `DashboardItem.test.js` | 19 | KPI hues, captions, panel header, config stripping |
| `StatusKpiBand.test.js` | 19 | Counts, month-over-month trend, filtering, icons |
| `AddExistingUserModal.test.js` | 18 | Role options by permission, submit, error shapes |
| `SidebarLink.test.js` | 18 | Active state, record routes, saved views, collapsed rail |
| `CollapsibleSection.test.js` | 17 | Toggle, chevron position, actions slot |
| `MultipleAvatar.test.js` | 15 | Single vs stacked assignees, plus `Icon` |
| `NoteArea.test.js` | 13 | Card chrome, author fallback, delete |
| `QuickFilterField.test.js` | 13 | Fieldtype branching, magnifier, debounce |
| `EmptyStateComponent.test.js` | 12 | The component behind all 19 empty screens |
| `ListRows.test.js` | 12 | Flat vs grouped, group headers, scroll persistence |
| `Filter.test.js` | 39 | Operator sets per fieldtype, query building, `_assign` rewrite |
| `SortBy.test.js` | 20 | `order_by` round trip, default-sort suppression, precedence |
| `EventNotificationsArea.test.js` | 18 | Starting-now/ongoing/upcoming bucketing, time labels |
| `Notifications.test.js` | 12 | Lead vs Deal routing, socket lifecycle, mark-as-read |
| `CommentBox.test.js` | 10 | Mention list, attachment removal, emoji insertion |
| `CommunicationArea.test.js` | 31 | Subject building, signature insertion, send payloads, box toggling |
| `EmailEditor.test.js` | 20 | From-account list, templates, cc/bcc, recipients |
| `ListBulkActions.test.js` | 17 | Action visibility, customizations, bulk convert and clear |
| `EditValueModal.test.js` | 19 | Editable-field filtering, value coercion, control per fieldtype |
| `AssignmentModal.test.js` | 15 | Add/remove diffing, single vs bulk endpoints |
| `EmailTemplateSelectorModal.test.js` | 11 | Name and subject search, create hand-off, broadcast refresh |
| `LeadModal.test.js` | 26 | Defaults, every validation branch, enrichment fill-empty |
| `DealModal.test.js` | 25 | Validation, existing-vs-new contact, layout section flags |
| `ContactModal.test.js` | 23 | Mandatory + conditional-mandatory rules, child-table reshaping |
| `OrganizationModal.test.js` | 17 | Create and redirect options, enrichment, error contract |
| `ConvertToDealModal.test.js` | 26 | Existing contact/org rules, mandatory-error shaping, custom-field prefill |
| `CallLogDetailModal.test.js` | 23 | Summary and detail rows, note/task linking, lead creation |
| `EventModal.test.js` | 29 | Create/edit/duplicate modes, time-range rules, delete confirmation |
| `CommandPalette.test.js` | 25 | Four-doctype search, debounce, result shaping, keyboard wrap-around |
| `FieldLayoutDialog.test.js` | 31 | Four-way layout resolution, required flags, resolve-once guard |
| `CreateDocumentModal.test.js` | 23 | Title/icon per doctype, prompted-name injection, seeding from data |
| `DoctypeModal.test.js` | 18 | Create vs edit, mandatory-error shaping, update path |
| `ChangePasswordModal.test.js` | 14 | Strength rules, three-field comparison, submit outcomes |
| `QuickEntryModal.test.js` | 12 | Layout type selection, dirty tracking, field serialisation |
| `ViewModal.test.js` | 12 | Create/update payloads, edit and duplicate modes |
| `SidePanelModal.test.js` | 14 | Layout serialisation, dirty tracking, empty-layout guards |
| `LostReasonModal.test.js` | 14 | Reason/notes validation, cancel restoring status, inline create |
| `WhatsappTemplateSelectorModal.test.js` | 10 | Approved-only filter, doctype scoping, name search |
| `ShortcutsHelpModal.test.js` | 10 | Mac vs non-Mac modifier, shortcut groups, open/close |
| `DataFieldsModal.test.js` | 12 | Layout serialisation, fieldname/name fallback, level guards |
| `FieldLayoutDialogContainer.test.js` | 6 | onResolve stripped from bound props, one dialog per entry |
| `AboutModal.test.js` | 5 | Link destinations, absolute URLs, no duplicates |
| `TasksPage.test.js` | 25 | Status band and filtering, column alignment, deep links |
| `NotesPage.test.js` | 16 | Card accents, create/edit callbacks, deep links |
| `LeadsPage.test.js` | 31 | Status band, group-by, kanban flattening, row actions |
| `DealsPage.test.js` | 30 | Row shaping, SLA colours, group-by, kanban, row actions |
| `ContactsPage.test.js` | 15 | View gating, avatar/logo pairing, column alignment |
| `OrganizationsPage.test.js` | 15 | View gating, website normalising, column alignment |
| `LeadPage.test.js` | 26 | Breadcrumbs, inline field edit + rollback, lost-reason gate |
| `DealPage.test.js` | 20 | Contact add/remove/primary, organization field wiring |
| `ContactPage.test.js` | 12 | Primary email/phone, inline option edit and delete |
| `OrganizationPage.test.js` | 13 | Website normalising, rename-on-title-change |
| `CalendarPage.test.js` | 83 | Date ranges, view modes, event shaping, create/edit/delete |
| `MobileDealPage.test.js` | 45 | Tab gating, contacts, field rollback, lost-reason gate |
| `CallLogsPage.test.js` | 44 | Deep-link query rebuild, row shaping, status band, create |
| `MobileContactPage.test.js` | 39 | Primary email/phone, option edit/delete, mobile panels |
| `DashboardPage.test.js` | 27 | Range presets, layout persistence, chart and KPI plumbing |
| `MobileLeadPage.test.js` | 27 | Tab gating, inline edit, conversion, mobile navigation |
| `MobileOrganizationPage.test.js` | 27 | Website parsing, tabs, linked deals and contacts |
| `PersonaFormPage.test.js` | 13 | Question set, telemetry, local-first flag, fade before nav |
| `MobileNotificationPage.test.js` | 12 | Deep-link anchor, mark-as-read, socket lifecycle |
| `DataImportPage.test.js` | 7 | Doctype map completeness, route params |
| `WelcomePage.test.js` | 5 | Lead modal, inert card buttons, placeholder greeting |
| `NotPermittedPage.test.js` | 3 | Message, escape hatch, logout wiring |
| `GridAndEditorControls.test.js` | 35 | Editor class matrix, dirty-on-blur, uploader states, grid row modal |
| `SmallControls.test.js` | 31 | Button theme/variant maps, HTML sanitising, formatted input, password reveal |
| `TableMultiselectInput.test.js` | 18 | Link-field discovery, duplicate guard, create-and-add, exclusion filter |
| `GridFieldsEditorModal.test.js` | 31 | Saved-view mapping, stale-field tolerance, save guard, layout flattening |
| `GridControl.test.js` | 60 | Column selection, row add/delete/reorder, defaults, link fields, overrides |
| `GeolocationControl.test.js` | 33 | Coordinate summary, render branches, clear, size and variant classes |
| `LeadSyncSources.test.js` | 24 | Search, enable/disable with rollback, delete, row menu |
| `SettingsPage.test.js` | 22 | Tab/section/column assembly, save messaging, dirty badge |
| `EmailTemplateSettings.test.js` | 46 | List filtering, create/edit validation, rename-then-save ordering |
| `PreferencesSettings.test.js` | 26 | Inherited language fallback, reload-on-locale-change, theme mapping |
| `ProfileSettings.test.js` | 22 | Name splitting, photo tooltip and removal, save gating, shortcut |
| `TelephonySettings.test.js` | 28 | Enable-after-save ordering, agent insert vs save, failure reporting |
| `WorkDayModal.test.js` | 31 | Day availability, time parsing and ordering, edit-in-place, delete confirmation |
| `SlaPriorityModal.test.js` | 17 | Response-time validation, single-default enforcement, delete confirmation |
| `slaUtils.test.js` | 33 | Policy validation across every field, working-hours defaults isolation |
| `SlaPriorityList.test.js` | 26 | Priority seeding, add/delete rows, single default, condition builder, screen routing |
| `SlaHolidays.test.js` | 19 | Next-free-day selection, edit-by-copy, delete confirmation, time display |
| `SlaPolicyList.test.js` | 20 | Search paging, default-policy protection, delete reporting, duplication |
| `SlaPolicyView.test.js` | 24 | Corrupt-condition recovery, old/new editor choice, save-then-rename ordering |
| `AssignmentRuleParts.test.js` | 28 | Assignee search and exclusion, routing strategies, day scheduling |
| `AssignmentRuleView.test.js` | 29 | Rule loading, validation, create/update/rename ordering, unsaved guard |
| `AssignmentRuleList.test.js` | 24 | Priority and enable writes, delete, duplication, condition sections |
| `Hierarchy.test.js` | 43 | Tree building, ancestor-preserving filter, rank rules, bulk add, reparenting |
| `HierarchyParts.test.js` | 29 | Collapse behaviour, user picker, row menu and selection reset |
| `FormsList.test.js` | 46 | Route slugging, create/publish/delete paths, field-type icons, field cards |
| `FormBuilderPanel.test.js` | 69 | Section/column model round-trip, mandatory-field hiding, publish guard, embedding domains |
| `UsersSettings.test.js` | 25 | Search and role filtering, admin-only role options, role change and removal |
| `EmailAccountSettings.test.js` | 42 | Credential validation per provider, change detection, create and update paths |
| `EmailAccountList.test.js` | 3 | Sample-account filter, boolean normalisation of every checkbox |
| `SmallSettingsPanels.test.js` | 27 | Defaults rows and options, general toggles, brand assets, home actions |
| `SettingsShell.test.js` | 21 | Role-based tab visibility, WhatsApp gating, deep-link navigation |
| `InviteUserPage.test.js` | 30 | Address parsing, duplicate warnings, role gating, partial-batch reporting |
| `ERPNextSettings.test.js` | 64 | Connection validation, dirty tracking, product sync, log tabs, desk links |
| `LeadSyncSourceForm.test.js` | 26 | Create vs edit, page/form dependency, mapping save guard, on-demand sync |
| `DashboardAndCalendarSettings.test.js` | 34 | Provider key rules, currency confirmation, reminder interval clamping |
| `UserEmailAndFailureLogs.test.js` | 26 | Outgoing-account linking, failure log detail, retry error shapes |
| `ListViewComponents.test.js` | 118 | The six list views' shared helpers, status colours, linked-doc routing |
| `EmailContentAndPlayer.test.js` | 35 | Reply-quote collapsing, timeline timestamps, audio player menu |
| `ActivityAreas.test.js` | 28 | Comment authorship and editing, attachment visibility and deletion, overdue tasks |
| `EmailArea.test.js` | 26 | Reply and reply-all addressing, subject prefixing, delivery status |
| `AllModalsAndAreas.test.js` | 24 | Timeline modal wiring, post-save tab routing, task delete and status |
| `WhatsAppBox.test.js` | 19 | Send payload, failure recovery, attachment kinds, shift+enter |
| `WhatsAppArea.test.js` | 23 | WhatsApp markup rendering and sanitising, reactions, quote navigation |
| `Activities.test.js` | 31 | Timeline assembly per tab, ordering, change descriptions, empty states |
| `DataFieldsArea.test.js` | 13 | Layout fetch, changed-field diffing, parent interception, dirty tracking |
| `FieldLayoutTree.test.js` | 21 | Docname resolution, tab-strip rule, script overrides, section and column rendering |
| `SmallComponents.test.js` | 29 | Avatar and shortcut rendering, multi-action button, attachment preview, group-by |
| `SmallComponents2.test.js` | 26 | Hierarchy banner persistence, custom action grouping, assignee/owner handover |
| `SmallComponents3.test.js` | 24 | Emoji search and grouping, inline option editing, bulk delete vs unlink |
| `LayoutEditorAndLoaders.test.js` | 22 | Brand logo fallback, skeleton shapes, side-panel field picker |
| `Resizer.test.js` | 30 | Drag maths, snapping, limits, parent offset, listener teardown |
| `FieldLayoutEditor.test.js` | 59 | Tabs, sections, columns, every menu action and its guard |
| `SidePanelLayout.test.js` | 76 | Field parsing, visibility rules, per-field save and its errors, leading icons |
| `ViewControls.test.js` | 115 | Params, pagination, filters, quick filters, view actions, export |
| `ConditionsFilter.test.js` | 79 | Nested condition groups, per-fieldtype operators and value controls |
| `FilesUploader.test.js` | 59 | Restrictions, the camera, concurrent uploads and their failures |
| `Kanban.test.js` | 61 | Board columns and colours, column sums, stage moves, card-field settings |
| `CalendarComponents.test.js` | 53 | Attendee picking and pasting, reminder intervals and their wording |
| `Layouts.test.js` | 53 | Sidebar links and onboarding steps, header Create rules, the three shells |
| `TelephonyCallUI.test.js` | 53 | Medium selection, Exotel call events, the in-call note and task panes |
| `TwilioCallUI.test.js` | 36 | Device registration, incoming and outgoing call lifecycles, in-call notes |
| `PageWrappersAndAutocomplete.test.js` | 48 | Settings step routing, global modal mounting, autocomplete search and styling |
| `SmallShellComponents.test.js` | 39 | Dashboard chart picker, mobile sidebar groups, email account cards |
| `CalendarEventPanel.test.js` | 74 | Event loading and parsing, time validation, attendance, discard prompts |
| `ShortcutTooltip.test.js` | 22 | Platform modifier keys, alternate combos, the Mac delete-key dedupe |
| `FieldTransforms.test.js` | 48 | Field shaping: select options, user links, script overrides, grid-row overrides |
| `GeolocationMap.test.js` | 31 | Map lifecycle, GeoJSON round-trip, single-point framing, teardown |
| `FilterBuilder.test.js` | 52 | Field availability, default-filter hiding, query building, placeholders |
| `UserFilterGuards.test.js` | 18 | The `crmUsers` empty-list contract across ten files, and the three `getSelectOptions` copies |
| `FormBuilderLayout.test.js` | 54 | Route slugs, section/column breaks, hidden required fields, the preview |
| `StatusLookupGuards.test.js` | 17 | The status-map contract, and every `getDealStatus` call site across nine files |
| `DealRecord.test.js` | 28 | The Lost-reason prompt, post-save refreshes, the call button, owner display |
| `ActivityTimeline.test.js` | 28 | Timeline ordering, change-description wording, cross-tab comments, WhatsApp templates |

---

### `src/pages/` is complete

All 22 page components have a suite. The last twelve were the ones with no
desktop twin to lean on — the four `Mobile*` record pages, `Calendar`,
`Dashboard`, `CallLogs`, and the four small standalone pages.

`CallLogs.vue` was prioritised because its source had been changed for
[B24](#b24-and-b25-in-detail--one-feature-two-separate-faults) without a suite to
match — a gap worth naming, since a fix with no test is indistinguishable from an
untouched file a month later.

---

### `Modals/` is complete

All 27 files in `src/components/Modals/` now have a suite, except two that are
pure wiring with no logic to assert — `GlobalModals.vue` and `DoctypeModals.vue`
are import-and-render shells whose only behaviour is the components they mount,
each of which is covered on its own.

---

## 9. What is not covered

**324 of 324 components have a suite that exercises them**, plus all 22 pages.

> A revision of this report claimed 324 while two of them were only ever
> `vi.mock()`ed away by `CalendarPage.test.js` and measured 0% —
> `Calendar/CalendarEventPanel.vue` (294 statements) and `ShortcutTooltip.vue`
> (41). Counting a mock as coverage is exactly the green-over-nothing this
> report exists to catch. Both now have suites of their own, and the panel's
> gave up four more defects (B109–B112).
>
> Two files anywhere in `src/` still measure 0%: `Modals/GlobalModals.vue`
> (5 statements, all `v-if`'d modal mounts) and `utils/view.js` (8 statements,
> a store wrapper — see D-series). Every
directory under `src/components/` has suites, including the ones that were
untouched a few rounds ago: `Kanban/`, `Mobile/`, `Layouts/`, `Telephony/`,
`Calendar/`, `ConditionsFilter/` and `FilesUploader/`.

That is coverage of *components*, not of *every branch in them* — the
statement figures in [section 3](#3-coverage) are the honest measure of the
latter, and they are 80.2% overall.

Also outstanding:

- `utils/index.js` — the dayjs relative-date formatters (`prettyDate`,
  `timeAgo`) and their many size buckets. `convertToConditions`, the option
  builders and the customisation hooks are now covered (83.3%, up from 60.2%)
- `utils/view.js` and `utils/model.js` — a three-line store wrapper and a
  constants file; a suite there would restate the data
- No integration or end-to-end tests of any kind

### On chasing the last 20% — measured, not estimated

Every component has a suite; what is left is branches inside them. Six rounds
of deliberate branch-filling produced this:

| Round | Target | Tests added | Statements covered |
|---|---|---|---|
| 1 | `utils/index.js` | 76 | +101 |
| 2 | `Field.vue`, `GeolocationControl` | 79 | +125 |
| 3 | `FormBuilderPanel` | 54 | +47 |
| 4 | `pages/Deal.vue` | 28 | +35 |
| 5 | `Activities.vue` | 28 | +22 |
| 6 | `AssignmentRuleView` | 21 | **+9** |

The yield fell from **1.3 statements per test to 0.4**, and the last round did
not move the whole-frontend figure at all — 80.2% before and after.

An earlier revision of this report estimated 85% at "about a session and a
half". That was wrong, and the table is why: 784 more statements at the recent
rate is on the order of forty more rounds. The estimate was extrapolated from
the greenfield phase, where every new suite covered a file that had none.
Branch-filling is a different activity with a different curve, and the two
should not have been projected from one another.

The remaining lines are also not hiding easy wins — they are progressively
thinner and more entangled with frappe-ui's injection contexts, which means
more scaffolding per test and less signal from each. `ListRows` is the clearest example: four frappe-ui primitives had to be
stubbed before it would mount, and only about a quarter of the resulting suite
tests our own logic.

Three kinds of thing account for most of the remainder:

- **Class-name computeds.** `Autocomplete.inputClasses` and its like produce
  strings. A test pins the string, and the next restyle breaks the test
  without a user ever noticing.
- **Pointer and drag handlers.** `useDraggable`, `vuedraggable` and the
  resize handles need real pointer sequences to exercise; the unit-test
  environment reports element sizes as zero.
- **Server error shapes nobody has seen.** Each error branch is one more
  fixture guessing at what the server might send.

The better next step is to target the screens that have actually broken for
users, including the integration paths this style of unit test does not reach.

---

## 10. Conventions for adding tests

- **Pure logic goes in `src/utils`, and the test imports it.** If logic sits
  inside `<script setup>`, lift it out first — that is what
  `utils/dashboardCards.js`, `utils/noteFilters.js` and `utils/emptyState.js`
  were.
- **Component tests use `tests/helpers/mount.js`.** Its `mountComponent()` stubs
  the nine globally-registered frappe-ui components and installs `__`.
- **Store tests use `tests/helpers/pinia.js`.** `withPinia()` gives a fresh
  instance per test; `fakeResource()` replaces `createResource` /
  `createListResource`, which otherwise fetch on creation. Seed with
  `resource._seed(rows)` to push data through the store's own `transform`.
- **Partial-mock modules, do not replace them.** Use
  `vi.mock(mod, async (importOriginal) => ({ ...(await importOriginal()), … }))`.
  The utils barrel drags in a large graph — replacing `vue-router` wholesale
  broke `createRouter` for an unrelated import (see [T11](#52-failures-caused-by-faults-in-my-tests)).
- **Watch for modules that fetch on import.** `stores/settings.js` builds an
  auto-fetching document resource at module scope, so any component whose graph
  reaches it fires a real request — stubbing the component does not help.
  Neuter `createDocumentResource` in those suites (see [U1](#53-failure-with-no-assertion-failure)).
- **Pin the clock for anything time-dependent.** `vi.useFakeTimers()` +
  `vi.setSystemTime()`. See [T13](#52-failures-caused-by-faults-in-my-tests).
- **Make mocks reactive when the code under test uses `computed`.** A plain
  object caches on first read and the test ends up exercising the mock. This
  caught me out three separate times — in `useTimelinePreferences`,
  `GettingStartedBanner` and `DeleteLinkedDocModal` — and each time the symptom
  looked like a component bug rather than a test bug.
- **Assert behaviour, not styling.** Prefer rendered text, emitted events and
  element counts. The few class-name assertions exist because a specific
  regression is what they guard.
- **Filenames must differ by more than case.** See [section 5.4](#54-a-file-that-silently-destroyed-another).
- **Add new paths to `coverage.include`** so the percentage stays honest.
- **Never pin a bug as "current behaviour".** If a test needs the words *not
  endorsed* in its comment, stop and fix the code instead — a green test over a
  known defect is worse than no test, because it now argues the defect is
  intended. Both [B27](#b27-in-detail--the-fourth-appearance-of-the-b3-shape) and
  [B28](#b28-in-detail--a-rollback-that-made-things-worse) were sitting under
  passing tests that described them accurately.
- **Don't name a stub after the component under test.** `findComponent(stub)`
  falls back to matching by name, so a `Calendar` stub inside a suite for
  `pages/Calendar.vue` silently matches the root wrapper and returns its props —
  which looks like "the prop wasn't passed" rather than "you found the wrong
  component".
- **Check where a resource actually comes from.** `sections` is a page-local
  `createResource` on some pages and part of `useDocument` on others. Mocking the
  wrong one leaves `data: null`, the `v-if` never opens, and the element you are
  asserting on simply is not there.
- **`--reporter=basic` no longer exists** in vitest 4. It fails at startup with
  "Failed to load custom Reporter", which reads like a broken config rather than
  a bad flag. Use `--reporter=dot`.
- **An auto-stub also lets undeclared props fall through to the DOM.** A
  component object passed as a prop (an icon, say) then reaches
  `setAttribute`, which throws "Cannot convert object to primitive value" on
  every render — while the tests still pass. `Activities.test.js` produced 48
  such errors under 30 green tests. Stub with `inheritAttrs: false`.
- **An auto-stub (`Foo: true`) renders no slots.** Any control the component puts
  in a child's named slot — a header button, a tab panel — vanishes. Stub with a
  template that forwards the slots you need to reach.
- **A green run can still be hitting the network.** Three suites were leaking
  real `fetch` calls to `localhost:3000` and reporting as passes; unhandled
  rejections are listed separately from failures and are easy to scroll past.
  They are latent flakes — worth treating as failures.
