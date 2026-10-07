const ROUTE = vi.hoisted(() => ({
  params: { doctype: 'CRM Lead', importName: 'IMPORT-1' },
  query: {},
  hash: '',
}))

vi.mock('vue-router', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, useRoute: () => ROUTE }
})

vi.mock('frappe-ui', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, usePageMeta: vi.fn() }
})

// Hoisted: the vi.mock factory below runs before top-level consts exist.
const DataImportStub = vi.hoisted(() => ({
  name: 'DataImport',
  props: ['doctype', 'importName', 'doctypeMap'],
  template: '<div class="stub-data-import" />',
}))

vi.mock('frappe-ui/frappe', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, DataImport: DataImportStub }
})

import DataImportPage from '@/pages/DataImport.vue'
import { mountComponent } from '../helpers/mount'

const mountPage = () =>
  mountComponent(DataImportPage, {
    global: { stubs: { DataImport: DataImportStub }, mocks: { $route: ROUTE } },
  })

const child = (w) => w.findComponent(DataImportStub)

describe('Data import page', () => {
  beforeEach(() => {
    ROUTE.params = { doctype: 'CRM Lead', importName: 'IMPORT-1' }
  })

  describe('what it hands the importer', () => {
    it('passes the doctype from the URL', () => {
      expect(child(mountPage()).props('doctype')).toBe('CRM Lead')
    })

    it('passes the import name from the URL', () => {
      expect(child(mountPage()).props('importName')).toBe('IMPORT-1')
    })

    it('copes with a new import, which has no name yet', () => {
      ROUTE.params = { doctype: 'CRM Deal' }
      expect(child(mountPage()).props('importName')).toBeUndefined()
    })
  })

  describe('the doctype map', () => {
    const mapOf = () => child(mountPage()).props('doctypeMap')

    it('covers every doctype the CRM lets you import into', () => {
      expect(Object.keys(mapOf()).sort()).toEqual([
        'CRM Call Log',
        'CRM Deal',
        'CRM Lead',
        'CRM Organization',
        'CRM Task',
        'Contact',
      ])
    })

    it('gives each one a human title and a list route', () => {
      for (const [doctype, entry] of Object.entries(mapOf())) {
        expect(entry.title, doctype).toBeTruthy()
        expect(entry.listRoute, doctype).toMatch(/^\//)
      }
    })

    it('omits a detail route for the two doctypes that open in a modal', () => {
      // Tasks and call logs have no page of their own, so there is nowhere for
      // the importer to link an individual imported row to.
      const map = mapOf()
      expect(map['CRM Task'].pageRoute).toBeUndefined()
      expect(map['CRM Call Log'].pageRoute).toBeUndefined()
    })

    it('uses the `docname` placeholder in every detail route it does define', () => {
      const withPage = Object.values(mapOf()).filter((e) => e.pageRoute)
      expect(withPage).toHaveLength(4)
      for (const entry of withPage) {
        expect(entry.pageRoute).toMatch(/\/docname$/)
      }
    })
  })
})
