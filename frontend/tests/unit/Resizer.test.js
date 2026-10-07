import Resizer from '@/components/Resizer.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'

const MIN = 16 * 16 // 256
const MAX = 30 * 16 // 480

describe('Resizer', () => {
  const mount = (props = {}) =>
    mountComponent(Resizer, {
      props,
      slots: { default: '<div class="panel">panel</div>' },
    })

  const drag = (wrapper, clientX) => wrapper.vm.resize({ clientX })

  beforeEach(() => {
    localStorage.removeItem('sidebarWidth')
    document.body.className = ''
    window.innerWidth = 1200
  })

  describe('its resting state', () => {
    it('starts at the default width', () => {
      expect(mount().vm.sidebarWidth).toBe(352)
    })

    it('honours a caller-supplied default', () => {
      expect(mount({ defaultWidth: 400 }).vm.sidebarWidth).toBe(400)
    })

    it('applies the width to the wrapper', () => {
      expect(mount().html()).toContain('width: 352px')
    })

    it('renders its slot', () => {
      expect(mount().find('.panel').exists()).toBe(true)
    })

    it('is not resizing until dragged', () => {
      expect(mount().vm.sidebarResizing).toBe(false)
    })
  })

  describe('dragging', () => {
    it('follows the pointer on the left', () => {
      const wrapper = mount()
      drag(wrapper, 300)
      expect(wrapper.vm.sidebarWidth).toBe(300)
    })

    it('measures from the far edge on the right', () => {
      // A right-hand panel grows as the pointer moves left.
      const wrapper = mount({ side: 'right' })
      drag(wrapper, 900)
      expect(wrapper.vm.sidebarWidth).toBe(300)
    })

    it('marks itself as resizing so the handle stays visible', async () => {
      const wrapper = mount()
      drag(wrapper, 300)
      await nextTick()
      expect(wrapper.vm.sidebarResizing).toBe(true)
    })

    it('suppresses text selection while dragging', () => {
      // Without this the drag selects whatever text it passes over.
      const wrapper = mount()
      drag(wrapper, 300)
      expect(document.body.classList.contains('select-none')).toBe(true)
      expect(document.body.classList.contains('cursor-col-resize')).toBe(true)
    })

    it('passes its state down to the slot', () => {
      const wrapper = mountComponent(Resizer, {
        slots: {
          default: '<div class="panel">{{ params.sidebarWidth }}</div>',
        },
      })
      expect(wrapper.text()).toContain('352')
    })
  })

  describe('the limits', () => {
    it('will not shrink below the minimum', () => {
      const wrapper = mount()
      drag(wrapper, 10)
      expect(wrapper.vm.sidebarWidth).toBe(MIN)
    })

    it('will not grow past the maximum', () => {
      const wrapper = mount()
      drag(wrapper, 5000)
      expect(wrapper.vm.sidebarWidth).toBe(MAX)
    })

    it('honours caller-supplied limits', () => {
      const wrapper = mount({ minWidth: 100, maxWidth: 200 })
      drag(wrapper, 10)
      expect(wrapper.vm.sidebarWidth).toBe(100)
      drag(wrapper, 5000)
      expect(wrapper.vm.sidebarWidth).toBe(200)
    })

    it('clamps a negative width', () => {
      const wrapper = mount({ side: 'right' })
      drag(wrapper, 5000)
      expect(wrapper.vm.sidebarWidth).toBe(MIN)
    })
  })

  describe('snapping to the default', () => {
    it('snaps when released just short of it', () => {
      const wrapper = mount()
      drag(wrapper, 345)
      expect(wrapper.vm.sidebarWidth).toBe(352)
    })

    it('snaps when released just past it', () => {
      const wrapper = mount()
      drag(wrapper, 359)
      expect(wrapper.vm.sidebarWidth).toBe(352)
    })

    it('leaves a width outside the snap range alone', () => {
      const wrapper = mount()
      drag(wrapper, 330)
      expect(wrapper.vm.sidebarWidth).toBe(330)
    })

    it.each([342, 362])(
      'does not snap exactly at range edge %i',
      (width) => {
        // The comparison is strict on both sides, and only the lower edge was
        // pinned — so the upper one could have drifted to `<=` unnoticed.
        const wrapper = mount()
        drag(wrapper, width)
        expect(wrapper.vm.sidebarWidth).toBe(width)
      },
    )

    it('snaps everywhere strictly inside the range', () => {
      for (const width of [343, 350, 352, 355, 361]) {
        const wrapper = mount()
        drag(wrapper, width)
        expect(wrapper.vm.sidebarWidth).toBe(352)
      }
    })
  })

  describe('measuring against a parent', () => {
    const parent = (rect) => ({ getBoundingClientRect: () => rect })

    it('subtracts the parent offset on the left', () => {
      // The panel sits inside a container, so its width is the pointer
      // position minus where that container starts.
      const wrapper = mount({ parent: parent({ left: 100, right: 1100 }) })
      drag(wrapper, 400)
      expect(wrapper.vm.sidebarWidth).toBe(300)
    })

    it('measures from the viewport when there is no parent', () => {
      const wrapper = mount({ parent: null })
      drag(wrapper, 400)
      expect(wrapper.vm.sidebarWidth).toBe(400)
    })

    it('reports no gap without a parent', () => {
      expect(mount().vm.distance()).toBe(0)
    })

    it('reads the edge on the side it is anchored to', () => {
      const wrapper = mount({
        side: 'right',
        parent: parent({ left: 100, right: 1100 }),
      })
      expect(wrapper.vm.distance()).toBe(1100)
    })
  })

  describe('finishing a drag', () => {
    it('stops resizing', () => {
      const wrapper = mount()
      drag(wrapper, 300)
      wrapper.vm.stopResize()
      expect(wrapper.vm.sidebarResizing).toBe(false)
    })

    it('lets text be selected again', () => {
      const wrapper = mount()
      drag(wrapper, 300)
      wrapper.vm.stopResize()
      expect(document.body.classList.contains('select-none')).toBe(false)
      expect(document.body.classList.contains('cursor-col-resize')).toBe(false)
    })

    it('restores the elements it made unselectable', () => {
      const el = document.createElement('div')
      el.classList.add('select-text')
      document.body.appendChild(el)

      const wrapper = mount()
      drag(wrapper, 300)
      expect(el.classList.contains('select-text1')).toBe(true)

      wrapper.vm.stopResize()
      expect(el.classList.contains('select-text')).toBe(true)
      expect(el.classList.contains('select-text1')).toBe(false)
      el.remove()
    })

    it('records the width it settled on', () => {
      const wrapper = mount()
      drag(wrapper, 300)
      wrapper.vm.stopResize()
      expect(localStorage.getItem('sidebarWidth')).toBe('300')
    })
  })

  describe('the listeners it installs', () => {
    let added, removed

    beforeEach(() => {
      added = []
      removed = []
      vi.spyOn(document, 'addEventListener').mockImplementation((t, h) =>
        added.push([t, h]),
      )
      vi.spyOn(document, 'removeEventListener').mockImplementation((t, h) =>
        removed.push([t, h]),
      )
    })

    afterEach(() => vi.restoreAllMocks())

    it('listens for the drag and its end', () => {
      mount().vm.startResize()
      expect(added.map(([t]) => t)).toEqual(['mousemove', 'mouseup'])
    })

    it('removes both when the drag ends', () => {
      // Regression: the mouseup handler was an anonymous function that was
      // never removed, so every drag left one behind and every later click
      // anywhere on the page re-ran the teardown once per drag ever made.
      const wrapper = mount()
      wrapper.vm.startResize()
      wrapper.vm.stopResize()
      expect(removed.map(([t]) => t).sort()).toEqual(['mousemove', 'mouseup'])
    })

    it('removes the very handlers it added', () => {
      const wrapper = mount()
      wrapper.vm.startResize()
      wrapper.vm.stopResize()
      for (const [type, handler] of added) {
        expect(removed).toContainEqual([type, handler])
      }
    })

    it('leaves nothing behind after repeated drags', () => {
      const wrapper = mount()
      for (let i = 0; i < 5; i++) {
        wrapper.vm.startResize()
        wrapper.vm.stopResize()
      }
      // One pair added and the same pair removed, five times over — not five
      // accumulated mouseup handlers.
      expect(added).toHaveLength(10)
      expect(removed).toHaveLength(10)
    })
  })
})
