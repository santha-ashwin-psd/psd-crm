vi.mock('@/composables/telephony', () => ({ callEnabled: { value: false } }))
vi.mock('@/composables/whatsapp', () => ({ whatsappEnabled: { value: false } }))
vi.mock('@/stores/global', () => ({ globalStore: () => ({ makeCall: vi.fn() }) }))

import ActivityHeader from '@/components/Activities/ActivityHeader.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  MultiActionButton: {
    name: 'MultiActionButton',
    props: ['options'],
    template: '<div class="multi-action" />',
  },
  Dropdown: {
    name: 'Dropdown',
    props: ['options'],
    template: '<div class="dropdown"><slot :open="false" /></div>',
  },
}

function mountHeader(title, props = {}) {
  return mountComponent(ActivityHeader, {
    props: {
      title,
      tabs: [{ name: 'Activity' }, { name: 'Emails' }, { name: 'WhatsApp' }],
      doc: { mobile_no: '+15551234567' },
      doctype: 'CRM Deal',
      modalRef: { showNote: vi.fn(), showTask: vi.fn(), showEvent: vi.fn() },
      ...props,
    },
    global: { stubs: STUBS },
  })
}

const buttonLabels = (wrapper) =>
  wrapper.findAll('.stub-button').map((b) => b.text().trim())

describe('ActivityHeader', () => {
  it('renders nothing on the Data tab, which has its own header', () => {
    expect(mountHeader('Data').html()).toBe('<!--v-if-->')
  })

  it('shows the tab name as the heading', () => {
    expect(mountHeader('Emails').text()).toContain('Emails')
  })

  describe('the standfirst', () => {
    it('appears only on Notes', () => {
      expect(mountHeader('Notes').text()).toContain(
        'Capture important details and updates about this deal.',
      )
      expect(mountHeader('Emails').text()).not.toContain('Capture important')
    })

    it('names the record type it belongs to', () => {
      const wrapper = mountHeader('Notes', { doctype: 'CRM Lead' })
      expect(wrapper.text()).toContain('about this lead.')
    })

    it('falls back to a neutral noun for other doctypes', () => {
      const wrapper = mountHeader('Notes', { doctype: 'CRM Task' })
      expect(wrapper.text()).toContain('about this record.')
    })
  })

  describe('the primary action per tab', () => {
    it.each([
      ['Emails', 'New Email'],
      ['Comments', 'New Comment'],
      ['Notes', 'New Note'],
      ['Tasks', 'New Task'],
      ['Attachments', 'Upload Attachment'],
    ])('offers "%s" tab the %s action', (tab, label) => {
      expect(buttonLabels(mountHeader(tab))).toContain(label)
    })

    it('offers a schedule action on Events', () => {
      expect(mountHeader('Events').text()).toContain('Schedule an Event')
    })

    it('uses the split call button on Calls', () => {
      expect(mountHeader('Calls').find('.multi-action').exists()).toBe(true)
    })

    it('offers two actions on WhatsApp', () => {
      const labels = buttonLabels(mountHeader('WhatsApp'))
      expect(labels).toContain('Send Template')
      expect(labels).toContain('New Message')
    })

    it('falls back to a New dropdown on the activity feed', () => {
      const wrapper = mountHeader('Activity')
      expect(wrapper.find('.dropdown').exists()).toBe(true)
      expect(buttonLabels(wrapper)).toContain('New')
    })
  })

  describe('wiring', () => {
    it('opens the email composer', async () => {
      // The handler sets a property on the model object rather than replacing
      // it, so this shows up as a mutation, not an `update:emailBox` emit.
      const emailBox = { show: false }
      const wrapper = mountHeader('Emails', { emailBox })
      await wrapper.find('.stub-button').trigger('click')
      expect(emailBox.show).toBe(true)
    })

    it('opens the comment composer', async () => {
      const emailBox = { showComment: false }
      const wrapper = mountHeader('Comments', { emailBox })
      await wrapper.find('.stub-button').trigger('click')
      expect(emailBox.showComment).toBe(true)
    })

    it('opens the note modal', async () => {
      const modalRef = { showNote: vi.fn() }
      const wrapper = mountHeader('Notes', { modalRef })
      await wrapper.find('.stub-button').trigger('click')
      expect(modalRef.showNote).toHaveBeenCalled()
    })

    it('opens the task modal', async () => {
      const modalRef = { showTask: vi.fn() }
      const wrapper = mountHeader('Tasks', { modalRef })
      await wrapper.find('.stub-button').trigger('click')
      expect(modalRef.showTask).toHaveBeenCalled()
    })

    it('opens the event modal', async () => {
      const modalRef = { showEvent: vi.fn() }
      const wrapper = mountHeader('Events', { modalRef })
      await wrapper.find('.stub-button').trigger('click')
      expect(modalRef.showEvent).toHaveBeenCalled()
    })
  })

  describe('the fallback New menu', () => {
    it('hides call and WhatsApp entries when those integrations are off', () => {
      const options = mountHeader('Activity')
        .findComponent({ name: 'Dropdown' })
        .props('options')
      const labels = options.map((o) => o.label)
      expect(labels).toContain('Email')
      expect(labels).toContain('Note')
      expect(labels).not.toContain('Make a Call')
      expect(labels).not.toContain('WhatsApp Message')
    })
  })
})
