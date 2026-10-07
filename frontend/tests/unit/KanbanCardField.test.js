import KanbanCardField from '@/components/Kanban/KanbanCardField.vue'
import { mountComponent } from '../helpers/mount'

const STUBS = {
  Avatar: {
    name: 'AvatarStub',
    inheritAttrs: false,
    props: ['image', 'label', 'size'],
    template: '<span class="stub-avatar" :data-label="label" />',
  },
  Tooltip: {
    name: 'TooltipStub',
    inheritAttrs: false,
    props: ['text'],
    template: '<span class="stub-tooltip" :data-text="text"><slot /></span>',
  },
  MultipleAvatar: {
    name: 'MultipleAvatarStub',
    inheritAttrs: false,
    props: ['avatars', 'size'],
    template: '<span class="stub-multi-avatar" :data-count="avatars.length" />',
  },
  StatusBadge: {
    name: 'StatusBadgeStub',
    inheritAttrs: false,
    props: ['status', 'label'],
    template: '<span class="stub-status" :data-label="label" />',
  },
}

function render(props) {
  return mountComponent(KanbanCardField, {
    props,
    global: { stubs: STUBS },
  })
}

// The gutter is the whole point of the component: the text column has to start
// at the same place whether or not the row has a glyph. Asserting that the
// element exists on every row is the structural form of that promise — the
// 16px width itself lives in `.kb-card-row` in index.css.
function gutter(wrapper) {
  return wrapper.find('.kb-card-row-icon')
}

describe('KanbanCardField', () => {
  it('claims the icon gutter even with no glyph to put in it', () => {
    const w = render({ field: { label: 'Acme Pvt Ltd' }, fieldName: 'custom' })
    expect(gutter(w).exists()).toBe(true)
    expect(gutter(w).element.children.length).toBe(0)
    expect(w.find('.kb-card-row-text').text()).toBe('Acme Pvt Ltd')
  })

  it('renders nothing when the field has no value', () => {
    const w = render({ field: { label: '' }, fieldName: 'mobile_no' })
    expect(w.find('.kb-card-row').exists()).toBe(false)
  })

  describe('_assign', () => {
    // An empty assignee list is `[]`, which is truthy. The row used to render
    // as an invisible, zero-height element that still claimed the card's row
    // gap, so two cards with the same content came out different heights.
    it('is hidden when the record has no assignees', () => {
      const w = render({ field: { label: [] }, fieldName: '_assign' })
      expect(w.find('.kb-card-row').exists()).toBe(false)
    })

    it('shows the avatar group in the value column, not the gutter', () => {
      const w = render({ field: { label: ['a@b.c'] }, fieldName: '_assign' })
      expect(w.find('.kb-card-row').exists()).toBe(true)
      expect(w.find('.kb-card-row-text .stub-multi-avatar').exists()).toBe(true)
      expect(gutter(w).element.children.length).toBe(1)
    })
  })

  describe('glyphs', () => {
    it.each([
      ['email_id', 'email'],
      ['company_email', 'email'],
      ['mobile_no', 'phone'],
      ['work_phone', 'phone'],
    ])('gives %s a glyph', (fieldName) => {
      const w = render({ field: { label: 'x' }, fieldName })
      expect(gutter(w).element.children.length).toBe(1)
    })

    it('shows a relative time with the full date on the tooltip', () => {
      const w = render({
        field: { label: '2026-10-02 09:00:00', timeAgo: '2 hours ago' },
        fieldName: 'modified',
      })
      expect(w.find('.stub-tooltip').attributes('data-text')).toBe(
        '2026-10-02 09:00:00',
      )
      expect(w.text()).toContain('2 hours ago')
    })

    it.each(['lead_name', 'lead_owner', 'deal_owner'])(
      'puts the %s avatar in the gutter',
      (fieldName) => {
        const w = render({
          field: {
            label: 'Jane Doe',
            full_name: 'Jane Doe',
            image_label: 'JD',
          },
          fieldName,
        })
        expect(gutter(w).find('.stub-avatar').exists()).toBe(true)
        expect(w.find('.kb-card-row-text').text()).toBe('Jane Doe')
      },
    )
  })

  describe('title row', () => {
    it('reads as a heading', () => {
      const w = render({
        field: { label: 'Ms Claire Dubois' },
        fieldName: 'lead_name',
        title: true,
      })
      expect(w.find('.kb-card-row-text').classes()).toContain('kb-card-name')
    })

    // Only the title row falls back — an empty value anywhere else is simply
    // not shown, which is why the row is dropped above.
    it('falls back to No Title, and only the title row does', () => {
      const titled = render({
        field: {},
        fieldName: 'organization',
        title: true,
      })
      expect(titled.text()).toContain('No Title')

      const plain = render({ field: {}, fieldName: 'organization' })
      expect(plain.find('.kb-card-row').exists()).toBe(false)
    })
  })
})
