import AboutModal from '@/components/Modals/AboutModal.vue'
import { mountComponent } from '../helpers/mount'

const mountModal = () =>
  mountComponent(AboutModal, {
    props: { modelValue: true },
    global: { stubs: { Dialog: true, CRMLogo: true, GitHubIcon: true } },
  })

describe('AboutModal', () => {
  describe('the link list', () => {
    it('offers the five support destinations', () => {
      expect(mountModal().vm.links.map((l) => l.label)).toEqual([
        'Website',
        'GitHub Repository',
        'Documentation',
        'Report an Issue',
        'Contact Support',
      ])
    })

    it('points every link at an absolute https URL', () => {
      // These open in a new tab; a relative path would resolve against the CRM.
      for (const link of mountModal().vm.links) {
        expect(link.url).toMatch(/^https:\/\//)
      }
    })

    it('sends issue reports to the tracker, not the repository root', () => {
      const links = mountModal().vm.links
      const issue = links.find((l) => l.label === 'Report an Issue')
      expect(issue.url).toBe('https://github.com/frappe/crm/issues')
    })

    it('gives every link an icon', () => {
      for (const link of mountModal().vm.links) {
        expect(link.icon).toBeTruthy()
      }
    })

    it('has no duplicate destinations', () => {
      const urls = mountModal().vm.links.map((l) => l.url)
      expect(new Set(urls).size).toBe(urls.length)
    })
  })
})
