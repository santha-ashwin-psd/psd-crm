#!/usr/bin/env node
/**
 * Mutation runner.
 *
 * For each mutant: change the source, run only the suite that owns it, restore
 * the source, and compare what happened against what was expected.
 *
 *   yarn test:mutants
 *   yarn test:mutants --filter=pagination     # only mutants whose description matches
 *   yarn test:mutants --list                  # print them without running
 *
 * Exit code is non-zero if any mutant survived that should have been caught,
 * or any control was caught that should have survived.
 *
 * Restoring is the part that has to be right: the source is copied to a
 * sibling `.mutant-backup` first and put back in a `finally`, plus on SIGINT
 * and on any uncaught error. A crashed run must never leave mutated source
 * behind.
 *
 * `find` is a plain string and only the FIRST occurrence is replaced — one
 * mutant, one site. Make the anchor long enough to be unambiguous.
 *
 * ⚠️ Do not edit anything under `src/` while this runs, and close those files
 * in your editor if you can. This mutates real source and puts it back, but an
 * editor holding a stale buffer can write the mutation back *after* the
 * restore — verified: a run re-read the file, found it correct, exited 0, and
 * the mutation was on disk afterwards. Nothing this process does can prevent
 * that. Run `yarn test:audit` afterwards; it is the check that can see it.
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mutants } from './mutants.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const filter = args.find((a) => a.startsWith('--filter='))?.slice(9)
const listOnly = args.includes('--list')

const selected = filter
  ? mutants.filter((m) => m.describes.toLowerCase().includes(filter.toLowerCase()))
  : mutants

if (!selected.length) {
  console.error(filter ? `No mutants match "${filter}".` : 'No mutants defined.')
  process.exit(1)
}

if (listOnly) {
  for (const m of selected) {
    console.log(`${m.expect.padEnd(7)} ${m.suite.padEnd(32)} ${m.describes}`)
  }
  process.exit(0)
}

// Every file currently mutated, so an interrupt can put them all back.
const inFlight = new Map()

function restoreAll() {
  for (const [file, backup] of inFlight) {
    try {
      copyFileSync(backup, file)
      // Leave the backup in place if the copy did not land, so there is
      // something to recover from.
      if (readFileSync(file, 'utf8') === readFileSync(backup, 'utf8')) {
        rmSync(backup, { force: true })
      } else {
        console.error(`  !! ${file} is still mutated — its original is at ${backup}`)
      }
    } catch {
      console.error(`  !! could not restore ${file} — its backup is at ${backup}`)
    }
  }
  inFlight.clear()
}

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => {
    console.error(`\n${sig} — restoring sources`)
    restoreAll()
    process.exit(130)
  })
}
process.on('uncaughtException', (err) => {
  restoreAll()
  throw err
})

/** Run one suite. Returns true if it reported a failure or an unhandled error. */
function suiteObjects(suite) {
  try {
    const out = execFileSync(
      'npx',
      ['vitest', 'run', `tests/unit/${suite}`, '--reporter=dot', '--testTimeout=10000'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    // A clean pass still needs checking for unhandled errors, which vitest
    // reports on their own line without failing the run.
    return /\bfailed\b/.test(out) || /Unhandled Error/.test(out)
  } catch (e) {
    // Non-zero exit: the suite failed, which is what a caught mutant looks like.
    const out = `${e.stdout ?? ''}${e.stderr ?? ''}`
    if (/No test files found/.test(out)) {
      throw new Error(`suite not found: tests/unit/${suite}`)
    }
    return true
  }
}

const results = []

for (const m of selected) {
  const file = resolve(root, m.file)
  const backup = `${file}.mutant-backup`

  if (!existsSync(file)) {
    results.push({ ...m, outcome: 'error', detail: 'source file not found' })
    console.log(`ERROR    ${m.suite.padEnd(32)} ${m.describes}  (no such file)`)
    continue
  }

  const original = readFileSync(file, 'utf8')
  const occurrences = original.split(m.find).length - 1
  if (occurrences === 0) {
    // The code moved on and the mutant no longer applies. That is a real
    // failure of the mutant list, not a pass: a stale mutant silently stops
    // testing anything.
    results.push({ ...m, outcome: 'stale', detail: 'anchor not found in source' })
    console.log(`STALE    ${m.suite.padEnd(32)} ${m.describes}`)
    continue
  }
  if (occurrences > 1) {
    // Only the first match is replaced, so an ambiguous anchor silently
    // mutates a different site than the one intended — and in a .vue file the
    // first match is often in the template, where the suite may not look at
    // all. That reads as "survived" and blames the tests for a mutation that
    // never happened where it was meant to.
    results.push({
      ...m,
      outcome: 'stale',
      detail: `anchor matches ${occurrences} places — make it unambiguous`,
    })
    console.log(`AMBIG    ${m.suite.padEnd(32)} ${m.describes}`)
    continue
  }

  copyFileSync(file, backup)
  inFlight.set(file, backup)
  try {
    writeFileSync(file, original.replace(m.find, m.replace))
    const noticed = suiteObjects(m.suite)
    const outcome = noticed ? 'caught' : 'missed'
    const ok = outcome === m.expect
    results.push({ ...m, outcome, ok })
    const label = ok ? (outcome === 'caught' ? 'caught  ' : 'survived') : 'FAIL    '
    console.log(`${label} ${m.suite.padEnd(32)} ${m.describes}`)
  } finally {
    copyFileSync(backup, file)
    // Read it back. Twice now a restore has silently not taken and left a
    // mutated file in the working tree — once through a full green suite. The
    // backup is only removed after the content is confirmed.
    if (readFileSync(file, 'utf8') !== original) {
      console.error(`\n!! COULD NOT RESTORE ${m.file} — it is still mutated.`)
      console.error(`   its original content is in ${backup} — put it back before anything else.`)
      process.exit(3)
    }
    rmSync(backup, { force: true })
    inFlight.delete(file)
  }
}

const survived = results.filter((r) => r.expect === 'caught' && r.outcome === 'missed')
const controlsCaught = results.filter((r) => r.expect === 'missed' && r.outcome === 'caught')
const stale = results.filter((r) => r.outcome === 'stale' || r.outcome === 'error')
const controls = results.filter((r) => r.expect === 'missed')

console.log('')
console.log(
  `${results.filter((r) => r.ok).length}/${results.length} as expected` +
    ` · ${controls.length} negative control${controls.length === 1 ? '' : 's'}`,
)

// Only enforced on a full run — `--filter` is for working on one mutant, and
// failing that because the controls were filtered out helps nobody.
if (!controls.length && !filter) {
  console.error(
    '\nNo negative controls ran. A run that can only report "caught" proves\n' +
      'nothing — keep at least one control in the set.',
  )
  process.exit(1)
}

if (survived.length) {
  console.error('\nMutants that survived — this behaviour runs but nothing constrains it:')
  for (const r of survived) console.error(`  ${r.file}  —  ${r.describes}`)
}
if (controlsCaught.length) {
  console.error('\nControls that were caught — a test now covers these, so update mutants.js:')
  for (const r of controlsCaught) console.error(`  ${r.file}  —  ${r.describes}`)
}
if (stale.length) {
  console.error('\nStale mutants — the code moved and these test nothing any more:')
  for (const r of stale) console.error(`  ${r.file}  —  ${r.describes} (${r.detail})`)
}

process.exit(survived.length || controlsCaught.length || stale.length ? 1 : 0)
