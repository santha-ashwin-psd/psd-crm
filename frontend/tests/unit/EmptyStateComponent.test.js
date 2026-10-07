import EmptyState from '@/components/ListViews/EmptyState.vue'
import { mountComponent } from '../helpers/mount'

/**
 * EmptyState is the single component behind every empty screen in the app
 * (~19 call sites), so a regression here is visible in 19 places at once.
 */
describe('EmptyState', () => {
  it('builds a title from the name when none is given', () => {
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    expect(wrapper.text()).toContain('No Deals Found')
  })

  it('builds a singular description from the name', () => {
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    // "Deals" -> "deal" for the closing clause.
    expect(wrapper.text()).toContain('creating your first deal')
  })

  it('prefers an explicit title and description', () => {
    const wrapper = mountComponent(EmptyState, {
      props: {
        name: 'Emails',
        title: 'No Emails Found',
        description:
          'No emails found in your inbox. New messages will appear here soon.',
      },
    })
    expect(wrapper.text()).toContain('No Emails Found')
    expect(wrapper.text()).not.toContain('It appears that there are currently')
  })

  it('renders each sentence of the description on its own line', () => {
    const wrapper = mountComponent(EmptyState, {
      props: {
        name: 'Emails',
        description:
          'No emails found in your inbox. New messages will appear here soon.',
      },
    })
    const lines = wrapper.findAll('.max-w-xs')
    expect(lines).toHaveLength(2)
    expect(lines[0].text()).toBe('No emails found in your inbox.')
    expect(lines[1].text()).toBe('New messages will appear here soon.')
  })

  it('renders a one-sentence description as a single line', () => {
    const wrapper = mountComponent(EmptyState, {
      props: { name: 'Notes', description: 'You have no new notifications' },
    })
    expect(wrapper.findAll('.max-w-xs')).toHaveLength(1)
  })

  it('renders the illustration discs and sparks', () => {
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    expect(wrapper.find('.empty-illustration').exists()).toBe(true)
    expect(wrapper.find('.empty-disc').exists()).toBe(true)
    expect(wrapper.find('.empty-disc-inner').exists()).toBe(true)
    expect(wrapper.findAll('.empty-spark')).toHaveLength(3)
  })

  it('hides the decorative illustration from assistive tech', () => {
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    expect(wrapper.find('.empty-disc').attributes('aria-hidden')).toBe('true')
    wrapper.findAll('.empty-spark').forEach((spark) => {
      expect(spark.attributes('aria-hidden')).toBe('true')
    })
  })

  it('tints the icon with the accent token rather than a grey', () => {
    // Regression: the Emails empty state used to force the icon to
    // text-ink-gray-4, which left a grey envelope inside a blue disc.
    const wrapper = mountComponent(EmptyState, { props: { name: 'Emails' } })
    expect(wrapper.html()).toContain('text-[var(--crm-accent-primary)]')
  })

  it('renders no call to action by default', () => {
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    expect(wrapper.find('.stub-button').exists()).toBe(false)
  })

  it('renders the call to action when a label is given', () => {
    const wrapper = mountComponent(EmptyState, {
      props: { name: 'Deals', ctaLabel: 'Create Deal' },
    })
    const button = wrapper.find('.stub-button')
    expect(button.exists()).toBe(true)
    expect(button.text()).toContain('Create Deal')
  })

  it('emits ctaClick when the call to action is pressed', async () => {
    const wrapper = mountComponent(EmptyState, {
      props: { name: 'Deals', ctaLabel: 'Create Deal' },
    })
    await wrapper.find('.stub-button').trigger('click')
    expect(wrapper.emitted('ctaClick')).toHaveLength(1)
  })

  it('does not leak stray attributes onto the root element', () => {
    // The dead `top` / `width` props were removed; callers that still pass
    // them would otherwise land invalid attributes on a div.
    const wrapper = mountComponent(EmptyState, { props: { name: 'Deals' } })
    expect(wrapper.attributes('width')).toBeUndefined()
    expect(wrapper.attributes('top')).toBeUndefined()
  })
})
