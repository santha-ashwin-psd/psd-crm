#!/usr/bin/env node
/**
 * Has a mutation tool left damage in the working tree?
 *
 *   yarn test:audit
 *
 * The mutation tools edit real source files and put them back afterwards.
 * Three times that restore silently did not take, and the tree carried a
 * one-token change — `card: default false` flipped to `true`, an `&&` turned
 * into `||`, a `?.` flattened to `.` — through a full green suite. None of them
 * broke a test, which is exactly why they were invisible: a mutant that no test
 * catches is by definition one no test catches.
 *
 * So this looks for the damage by its shape instead. It diffs the working tree
 * against HEAD and flags any hunk where a removed line becomes an added line
 * through exactly one mutation operator — the signature of a tool's edit, not
 * of a person's.
 *
 * It reports candidates, not verdicts. A real fix can look identical: removing
 * a `?.` that a new guard made redundant is a legitimate change with the same
 * shape. Read each one. The point is that damage cannot sit unnoticed, not that
 * the tool can tell intent.
 *
 * Exits 1 if anything is flagged, so it can gate a commit.
 */
import { execFileSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

// The same operators the tools apply, in both directions.
const OPS = [
  ['===', '!=='], ['!==', '==='], ['==', '!='],
  ['>', '>='], ['<', '<='], ['>=', '>'], ['<=', '<'],
  ['&&', '||'], ['||', '&&'],
  ['?.', '.'], ['??', '||'],
  ['true', 'false'], ['false', 'true'],
  ['+ 1', '- 1'], ['if (!', 'if ('],
]

let diff
try {
  diff = execFileSync('git', ['diff', '-U0', '--', 'src'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
} catch (e) {
  console.error('could not read the diff — is this a git working tree?')
  process.exit(2)
}

/**
 * Changes that have the shape of tool damage but are deliberate.
 *
 * Keep this short and keep the reason with it. An entry here switches off a
 * real alarm, so it is worth more than a filename: anyone reading it later has
 * to be able to tell whether it is still true.
 */
const ACKNOWLEDGED = [
  {
    file: 'frontend/src/components/Activities/EmailArea.vue',
    after: 'if (cc.length) {',
    // `cc` now comes from an `addresses()` helper that always returns an array,
    // so the `?.` guards a state that can no longer happen.
    why: 'the addresses() helper makes cc non-nullable',
  },
  {
    file: 'frontend/src/components/Activities/EmailArea.vue',
    after: 'recipients = recipients.filter((r) => !cc.includes(r))',
    why: 'same — cc is an array by construction here',
  },
]

const isAcknowledged = (s) =>
  ACKNOWLEDGED.some((a) => a.file === s.file && a.after === s.after)

const suspects = []
let file = null
let removed = []

for (const line of diff.split('\n')) {
  if (line.startsWith('+++ b/')) {
    file = line.slice(6)
    removed = []
  } else if (line.startsWith('@@')) {
    removed = []
  } else if (line.startsWith('-') && !line.startsWith('---')) {
    removed.push(line.slice(1))
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    const added = line.slice(1)
    for (const before of removed) {
      if (before === added) continue
      for (const [from, to] of OPS) {
        if (before.includes(from) && before.replace(from, to) === added) {
          suspects.push({ file, from, to, before: before.trim(), after: added.trim() })
        }
      }
    }
  }
}

const flagged = suspects.filter((s) => !isAcknowledged(s))
const acked = suspects.length - flagged.length

if (!flagged.length) {
  console.log(
    'No unacknowledged operator changes in src/. Nothing that looks like tool damage.' +
      (acked ? ` (${acked} acknowledged.)` : ''),
  )
  process.exit(0)
}

console.log(
  `${flagged.length} change${flagged.length === 1 ? '' : 's'} in src/ have the shape of a ` +
    `mutation edit.\nRead each one: a deliberate fix can look the same. If it is deliberate, ` +
    `add it to\nACKNOWLEDGED in this file with the reason.\n`,
)
for (const s of flagged) {
  console.log(`${s.file}   ${JSON.stringify(s.from)} → ${JSON.stringify(s.to)}`)
  console.log(`  -  ${s.before}`)
  console.log(`  +  ${s.after}\n`)
}
process.exit(1)
