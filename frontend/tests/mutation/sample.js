#!/usr/bin/env node
/**
 * Unbiased mutation sampling.
 *
 * `mutants.js` is a curated list, and a curated list has a bias baked in: the
 * mutants were chosen by whoever wrote the tests, aimed at behaviour already
 * known to be covered. "16 of 16 caught" measures the choosing as much as the
 * suite.
 *
 * This does the opposite. It enumerates every mechanically-mutatable site in
 * the source, samples uniformly at random, and runs whichever suites import
 * that file. No knowledge of what is tested enters the choice, so the score it
 * produces is an estimate of the real mutation score rather than a best case.
 *
 *   yarn test:sample              # 20 mutants, default seed
 *   yarn test:sample 30 12345     # 30 mutants, seed 12345
 *
 * A previous version of this reported several mutants as surviving that were
 * in fact caught, and the wrong number nearly went into a report. Everything
 * under "verification" below exists because of that.
 *
 * ⚠️ Do not edit anything under `src/` while this runs, and close those files
 * in your editor if you can. This mutates real source and puts it back, but an
 * editor holding a stale buffer can write the mutation back *after* the
 * restore — verified: a run re-read the file, found it correct, exited 0, and
 * the mutation was on disk afterwards. Nothing this process does can prevent
 * that. Run `yarn test:audit` afterwards; it is the check that can see it.
 */
import { spawnSync } from 'node:child_process'
import {
  readFileSync, writeFileSync, readdirSync, copyFileSync, rmSync, statSync,
} from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolveRoot()
const SRC = join(ROOT, 'src')
const TESTS = join(ROOT, 'tests/unit')
const SAMPLE = Number(process.argv[2] || 20)
const SEED = Number(process.argv[3] || 1)

function resolveRoot() {
  return join(dirname(fileURLToPath(import.meta.url)), '../..')
}

// ── deterministic RNG, so a reported score can be reproduced ───────────────
let s = SEED >>> 0 || 1
const rnd = () => {
  s ^= s << 13; s >>>= 0
  s ^= s >> 17
  s ^= s << 5; s >>>= 0
  return s / 4294967296
}

// ── the source tree ────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|js)$/.test(p)) out.push(p)
  }
  return out
}

/**
 * Which lines of a file are script?
 *
 * For an SFC the obvious approach — track a flag from `<template>` to
 * `</template>` — is wrong, because Vue uses `<template #slot>` inside the
 * markup and every one of those closes the flag early. The first version did
 * exactly that and cheerfully mutated `</div>` and `<script setup>` itself,
 * producing a score that was really measuring "does the file still parse".
 *
 * Script blocks are top-level and unnested, so anchor on column zero. Boundary
 * lines are excluded.
 */
function scriptLineIndexes(text, isVue) {
  const lines = text.split('\n')
  if (!isVue) return lines.map((_, i) => i)
  const out = []
  let inScript = false
  lines.forEach((line, i) => {
    if (/^<script[\s>]/.test(line)) { inScript = true; return }
    if (/^<\/script>/.test(line)) { inScript = false; return }
    if (inScript) out.push(i)
  })
  return out
}

function isBehaviourLine(line) {
  const t = line.trim()
  if (!t) return false
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return false
  if (/^import\b|^export .*from\b/.test(t)) return false
  // `required: true` in a prop declaration is metadata, not behaviour — Vue
  // only console-warns on a missing required prop, so flipping it changes
  // nothing observable and counting it as a survivor overstates the gap.
  if (/\brequired:\s*(true|false)/.test(t)) return false
  return true
}

// Plain, mechanical operators. The point is that nobody chose them for this
// codebase; a clever mutant would reintroduce the bias this exists to remove.
const OPS = [
  { name: 'strict-eq→neq',  re: /(?<![=!<>])===(?!=)/,   to: '!==' },
  { name: 'strict-neq→eq',  re: /(?<![=!<>])!==(?!=)/,   to: '===' },
  { name: 'loose-eq→neq',   re: /(?<![=!<>])==(?![=])/,  to: '!=' },
  { name: 'gt→gte',         re: /(?<![-=<>+])>(?![=>])/, to: '>=' },
  { name: 'lt→lte',         re: /(?<![-=<>+])<(?![=<])/, to: '<=' },
  { name: 'gte→gt',         re: />=/,                     to: '>' },
  { name: 'lte→lt',         re: /<=/,                     to: '<' },
  { name: 'and→or',         re: /&&/,                     to: '||' },
  { name: 'or→and',         re: /\|\|/,                   to: '&&' },
  { name: 'optional→plain', re: /\?\./,                   to: '.' },
  { name: 'true→false',     re: /\btrue\b/,               to: 'false' },
  { name: 'false→true',     re: /\bfalse\b/,              to: 'true' },
  { name: 'nullish→or',     re: /\?\?/,                   to: '||' },
  { name: 'plus1→minus1',   re: /\+ 1\b/,                 to: '- 1' },
  { name: 'negate-if',      re: /\bif \(!/,               to: 'if (' },
]

/**
 * Blank out quoted strings and regex literals, keeping the line's length.
 *
 * Without this the sampler mutates the `<` inside an HTML attribution string
 * and the `>` inside a URL — changes that alter a copyright notice, not
 * behaviour, and that no test should be expected to catch. Counting them as
 * survivors makes the suite look worse than it is.
 *
 * Naive by design: it does not need to parse JavaScript, only to stop the
 * operator regexes from matching inside obvious literals.
 */
function blankLiterals(line) {
  return line.replace(
    /'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\/(?![/*])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^/\\\n])+\/[gimsuy]*/g,
    (m) => ' '.repeat(m.length),
  )
}

const sources = walk(SRC)
const sites = []
for (const file of sources) {
  const text = readFileSync(file, 'utf8')
  const lines = text.split('\n')
  for (const i of scriptLineIndexes(text, file.endsWith('.vue'))) {
    if (!isBehaviourLine(lines[i])) continue
    // Enumerate against the blanked line so literal contents never qualify,
    // but mutate the real line — the two are the same length, so an operator
    // that survives blanking is at a real code position.
    const code = blankLiterals(lines[i])
    for (const op of OPS) {
      if (op.re.test(code)) sites.push({ file, lineNo: i + 1, op })
    }
  }
}

// ── which suites import which source file ──────────────────────────────────
const suiteText = new Map(
  readdirSync(TESTS)
    .filter((f) => f.endsWith('.test.js'))
    .map((f) => [f, readFileSync(join(TESTS, f), 'utf8')]),
)

function importersOf(absSrc) {
  const alias = `@/${relative(SRC, absSrc)}`
  const noExt = alias.replace(/\.(vue|js)$/, '')
  const hits = []
  for (const [name, text] of suiteText) {
    // Only a real import counts. Matching a bare name would also catch a stub
    // keyed by the same word, which imports nothing.
    if (
      text.includes(`'${alias}'`) || text.includes(`"${alias}"`) ||
      text.includes(`'${noExt}'`) || text.includes(`"${noExt}"`)
    ) hits.push(name)
  }
  return hits
}

const importerCache = new Map()
const eligible = []
for (const site of sites) {
  if (!importerCache.has(site.file)) importerCache.set(site.file, importersOf(site.file))
  const suites = importerCache.get(site.file)
  // A site in a file no suite imports can only ever survive; including those
  // would just re-measure the known-uncovered portion.
  if (suites.length) eligible.push({ ...site, suites })
}

console.error(
  `${sites.length} mutatable sites · ${eligible.length} in files a suite imports · ` +
    `sampling ${SAMPLE} (seed ${SEED})`,
)

const picked = []
const seen = new Set()
let guard = 0
while (picked.length < SAMPLE && guard++ < SAMPLE * 500) {
  const c = eligible[Math.floor(rnd() * eligible.length)]
  const key = `${c.file}:${c.lineNo}:${c.op.name}`
  if (seen.has(key)) continue
  // One per file, so the sample does not cluster inside a single large file.
  if (picked.some((p) => p.file === c.file)) continue
  seen.add(key)
  picked.push(c)
}

// ── running one mutant ─────────────────────────────────────────────────────
// A mutant that stops the file compiling is not a test of the tests — any
// suite catches it — so those are discarded rather than counted as caught.
const BROKEN =
  /Transform failed|SyntaxError|Parse failure|Failed to parse|\[vue\/compiler|Unexpected token|Missing semicolon/

function runSuite(suite) {
  // spawnSync, not execFileSync: execFileSync returns stdout ALONE, and vitest
  // writes its summary to stderr. The old version leaned on the thrown-error
  // path to notice failures and had no way to see a failure that exited 0.
  const r = spawnSync(
    'npx',
    ['vitest', 'run', `tests/unit/${suite}`, '--reporter=dot', '--testTimeout=10000'],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`
  return {
    out,
    broken: BROKEN.test(out),
    failed: r.status !== 0 || /\bfailed\b/.test(out) || /Unhandled Error/.test(out),
  }
}

function evaluate(m) {
  const file = m.file
  const backup = `${file}.sample-backup`
  const original = readFileSync(file, 'utf8')
  const lines = original.split('\n')
  const before = lines[m.lineNo - 1]
  // Locate the match in the blanked line, then splice the real one at that
  // index. Running `.replace()` on the real line would take its first match,
  // which can be inside a string even when the site chosen is not.
  const hit = m.op.re.exec(blankLiterals(before))
  if (!hit) return { outcome: 'noop', before }
  const after =
    before.slice(0, hit.index) + m.op.to + before.slice(hit.index + hit[0].length)
  if (after === before) return { outcome: 'noop', before }

  copyFileSync(file, backup)
  try {
    lines[m.lineNo - 1] = after
    writeFileSync(file, lines.join('\n'))

    // Verification 1: the mutation is really on disk. Without this, anything
    // that silently failed to apply reads as a surviving mutant and gets
    // blamed on the tests.
    const onDisk = readFileSync(file, 'utf8').split('\n')[m.lineNo - 1]
    if (onDisk !== after) return { outcome: 'not-applied', before }

    let broken = false
    let failed = false
    // Capped: a file imported by forty suites would cost minutes for one
    // mutant. The cap can only turn a catch into a survivor, so a score
    // measured this way is a floor.
    const toRun = m.suites.slice(0, 6)
    for (const suite of toRun) {
      const r = runSuite(suite)
      if (r.broken) { broken = true; break }
      if (r.failed) { failed = true; break }
    }

    // Verification 2: still mutated at the end. Anything that restored the
    // file mid-run — a crashed suite, a stray watcher — would otherwise be
    // recorded as a survivor.
    const stillThere = readFileSync(file, 'utf8').split('\n')[m.lineNo - 1] === after
    if (!stillThere) return { outcome: 'not-applied', before }

    return {
      outcome: broken ? 'broke-build' : failed ? 'caught' : 'survived',
      before,
      after,
      capped: m.suites.length > toRun.length ? m.suites.length : 0,
    }
  } finally {
    copyFileSync(backup, file)
    // Verify, do not assume — a restore here silently failed twice, leaving a
    // mutated component in the tree that a full green suite did not notice.
    if (readFileSync(file, 'utf8') !== original) {
      console.error(`\n!! COULD NOT RESTORE ${file} — it is still mutated.`)
      console.error(`   its original content is in ${backup}.`)
      process.exit(3)
    }
    rmSync(backup, { force: true })
  }
}

const results = []
for (const m of picked) {
  const r = { ...m, ...evaluate(m) }
  // Verification 3: a survivor is re-run once. The failure this whole block
  // exists for was a survived verdict that did not reproduce by hand, and one
  // repeat is cheap next to publishing a wrong score.
  if (r.outcome === 'survived') {
    const again = evaluate(m)
    if (again.outcome !== 'survived') {
      r.outcome = again.outcome
      r.flaky = true
    }
  }
  results.push(r)
  console.log(
    `${r.outcome.padEnd(11)} ${r.op.name.padEnd(16)} ${relative(SRC, m.file)}:${m.lineNo}` +
      (r.flaky ? '   [disagreed on first run]' : ''),
  )
  // Both sides, always. Printing only the original once left a survivor whose
  // reported line did not match the file, and it took a git archaeology
  // detour to work out what had actually been mutated.
  console.log(`         -  ${(r.before ?? '').trim()}`)
  if (r.after !== undefined) console.log(`         +  ${r.after.trim()}`)
}

const scored = results.filter((r) => r.outcome === 'caught' || r.outcome === 'survived')
const caught = scored.filter((r) => r.outcome === 'caught')
const discarded = results.filter((r) => !scored.includes(r))

console.log('')
console.log(
  `mutation score: ${caught.length}/${scored.length} = ` +
    `${scored.length ? Math.round((caught.length / scored.length) * 100) : 0}%`,
)
if (discarded.length) {
  console.log(
    `discarded ${discarded.length}: ` +
      Object.entries(
        discarded.reduce((a, r) => ({ ...a, [r.outcome]: (a[r.outcome] || 0) + 1 }), {}),
      )
        .map(([k, v]) => `${v} ${k}`)
        .join(', '),
  )
}

const survivors = scored.filter((r) => r.outcome === 'survived')
if (survivors.length) {
  console.log('\nSURVIVED — behaviour that runs but nothing constrains:')
  for (const r of survivors) {
    console.log(`  ${relative(SRC, r.file)}:${r.lineNo}  [${r.op.name}]`)
    console.log(`    ${r.before.trim()}`)
    console.log(`    suites: ${r.suites.slice(0, 6).join(', ')}`)
  }
}

// Sampling is a measurement, not a gate — it always exits 0. `test:mutants` is
// the one that fails a build.
