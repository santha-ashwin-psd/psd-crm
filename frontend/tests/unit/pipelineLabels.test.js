import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// Deals are shown to users as "Pipeline". The wording lives in one place —
// xbr_crm/translations/en.csv, which Frappe applies to every __() string in the
// frontend and every _() string on the server. This suite fails when a new
// user-visible string mentions "deal" without an entry there, so the rename
// cannot quietly regress.

const repo = path.resolve(__dirname, '../../..')
const DEAL = /\bdeals?\b/i

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      } else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"') quoted = true
    else if (c === ',') {
      row.push(cell)
      cell = ''
    } else if (c === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += c
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

function walk(dir, exts, skip = () => false) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (skip(full)) continue
    if (entry.isDirectory()) out.push(...walk(full, exts, skip))
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

function translatableStrings(files, pattern) {
  const found = new Map()
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    for (const m of source.matchAll(pattern)) {
      const text = m[2].replace(/\\(['"])/g, '$1')
      if (DEAL.test(text) && !text.includes('${')) {
        found.set(text, path.relative(repo, file))
      }
    }
  }
  return found
}

const rows = parseCsv(
  fs.readFileSync(path.join(repo, 'xbr_crm/translations/en.csv'), 'utf8'),
)
// Rows with a third column only apply in that context (e.g. chart legends).
const mapping = new Map(
  rows
    .filter(([, , context]) => !context)
    .map(([source, target]) => [source, target]),
)

describe('Pipeline wording (xbr_crm/translations/en.csv)', () => {
  it('never maps a string back to "deal"', () => {
    const leaks = rows.filter(([, target]) => DEAL.test(target))
    expect(leaks).toEqual([])
  })

  it('covers every frontend __() string that mentions a deal', () => {
    const files = walk(path.join(repo, 'frontend/src'), ['.vue', '.js', '.ts'])
    const strings = translatableStrings(
      files,
      /__\(\s*(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )
    const missing = [...strings].filter(([text]) => !mapping.has(text))
    expect(missing).toEqual([])
  })

  it('covers every server _() string that mentions a deal', () => {
    const skip = (p) =>
      /\/(locale|public|tests|node_modules)(\/|$)/.test(p) ||
      path.basename(p).startsWith('test_')
    const files = walk(path.join(repo, 'xbr_crm'), ['.py', '.html'], skip)
    const strings = translatableStrings(
      files,
      /\b_\(\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1/g,
    )
    const missing = [...strings].filter(([text]) => !mapping.has(text))
    expect(missing).toEqual([])
  })

  it('shows the Deals module as "Pipeline"', () => {
    expect(mapping.get('Deals')).toBe('Pipeline')
    expect(mapping.get('Deal')).toBe('Pipeline')
    expect(mapping.get('CRM Deal')).toBe('Pipeline')
  })
})
