#!/usr/bin/env node
/**
 * One-off mutation check: does this test actually pin this line?
 *
 *   node tests/mutation/check.js <file> <line> <find> <replace> <suite>
 *
 *   node tests/mutation/check.js \
 *     src/components/Filter.vue 212 '||' '&&' Filter.test.js
 *
 * Use it after writing a regression test, in place of a shell one-liner. The
 * shell version of this cost real damage: a `cp` restore silently did not take,
 * the source sat mutated through a full-suite run, and the leftover-file check
 * passed because the backup had been removed anyway. So this one verifies the
 * restore rather than assuming it, and says so out loud when it cannot.
 *
 * Exit codes: 0 the test caught it, 1 it did not, 2 the check could not run,
 * 3 the source could not be restored — fix that before doing anything else.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync, rmSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const [file, lineArg, find, replace, suite] = process.argv.slice(2)

if (!file || !lineArg || find === undefined || replace === undefined || !suite) {
  console.error('usage: check.js <file> <line> <find> <replace> <suite>')
  process.exit(2)
}

const path = resolve(ROOT, file)
const lineNo = Number(lineArg)
if (!existsSync(path)) {
  console.error(`no such file: ${file}`)
  process.exit(2)
}

const original = readFileSync(path, 'utf8')
const lines = original.split('\n')
const before = lines[lineNo - 1]
if (before === undefined) {
  console.error(`${file} has no line ${lineNo}`)
  process.exit(2)
}
if (!before.includes(find)) {
  console.error(`line ${lineNo} does not contain ${JSON.stringify(find)}:`)
  console.error(`  ${before.trim()}`)
  process.exit(2)
}

const after = before.replace(find, replace)
lines[lineNo - 1] = after

let restored = false
function restore() {
  if (restored) return
  writeFileSync(path, original)
  // Verify, do not assume. This is the whole point of the file.
  if (readFileSync(path, 'utf8') !== original) {
    console.error(`\n!! COULD NOT RESTORE ${file} — it is still mutated.`)
    process.exit(3)
  }
  restored = true
}
// SIGINT is Ctrl-C; SIGTERM is what a timeout or a task runner sends, and it
// was a SIGTERM that left a mutated file behind once. SIGKILL cannot be caught
// at all, which is why `yarn test:audit` exists as the backstop.
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(sig, () => { restore(); process.exit(130) })
}

try {
  writeFileSync(path, lines.join('\n'))
  if (readFileSync(path, 'utf8').split('\n')[lineNo - 1] !== after) {
    restore()
    console.error('mutation did not land on disk')
    process.exit(2)
  }
  console.log(`-  ${before.trim()}`)
  console.log(`+  ${after.trim()}`)

  const r = spawnSync(
    'npx',
    ['vitest', 'run', `tests/unit/${suite}`, '--reporter=dot', '--testTimeout=10000'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  const summary = out.split('\n').find((l) => l.includes('Tests ')) ?? ''
  const caught = r.status !== 0 || /\bfailed\b/.test(out)

  restore()
  console.log(summary.trim())
  console.log(caught ? '✓ caught — the test pins this line' : '✗ SURVIVED — nothing constrains it')
  // Only cleaned up once the tree is verified clean.
  rmSync(`${path}.check-backup`, { force: true })
  process.exit(caught ? 0 : 1)
} catch (err) {
  restore()
  throw err
}
