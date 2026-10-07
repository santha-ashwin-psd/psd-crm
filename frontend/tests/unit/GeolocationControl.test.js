const api = vi.hoisted(() => ({ coords: null }))

// useGeolocation reaches for navigator.geolocation on setup; the map itself is
// never initialised in these tests (that needs Leaflet and a real DOM node), so
// a fixed pair of coordinates is enough.
vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal()
  const { ref } = await import('vue')
  api.coords = ref({ latitude: 19.08, longitude: 72.8961 })
  return { ...actual, useGeolocation: () => ({ coords: api.coords }) }
})

import GeolocationControl from '@/components/Controls/GeolocationControl.vue'
import { mountComponent } from '../helpers/mount'

const mount = (props = {}, attrs = {}) =>
  mountComponent(GeolocationControl, {
    props,
    attrs,
    global: { stubs: { Dialog: true } },
  })

const point = (lng, lat) =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', geometry: { type: 'Point', coordinates: [lng, lat] } },
    ],
  })

const many = (n) =>
  JSON.stringify({
    type: 'FeatureCollection',
    features: Array.from({ length: n }, () => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [1, 2] },
    })),
  })

const summary = (value) => mount({ value }).vm.coordinateSummary

describe('GeolocationControl', () => {
  describe('summarising the stored value', () => {
    it('shows a single point as degrees', () => {
      expect(summary(point(72.8961, 19.076))).toBe('19.07600°N, 72.89610°E')
    })

    it('marks a southern latitude S', () => {
      expect(summary(point(72.8961, -19.076))).toBe('19.07600°S, 72.89610°E')
    })

    it('marks a western longitude W', () => {
      expect(summary(point(-72.8961, 19.076))).toBe('19.07600°N, 72.89610°W')
    })

    it('treats the equator and prime meridian as N and E', () => {
      // `>= 0` rather than `> 0`, so zero must not read as S or W.
      expect(summary(point(0, 0))).toBe('0.00000°N, 0.00000°E')
    })

    it('pads to five decimal places', () => {
      expect(summary(point(72, 19))).toBe('19.00000°N, 72.00000°E')
    })

    it('counts instead when there is more than one feature', () => {
      expect(summary(many(3))).toBe('3 features')
    })

    it('uses the singular for one non-point feature', () => {
      const polygon = JSON.stringify({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
          },
        ],
      })
      expect(summary(polygon)).toBe('1 feature')
    })

    it('accepts a bare Feature, not just a collection', () => {
      const bare = JSON.stringify({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [72.8961, 19.076] },
      })
      expect(summary(bare)).toBe('19.07600°N, 72.89610°E')
    })

    it('says so when the value is not valid GeoJSON', () => {
      expect(summary('not json at all')).toBe('Invalid GeoJSON')
    })

    it('says so when a collection has no features array', () => {
      expect(summary(JSON.stringify({ type: 'FeatureCollection' }))).toBe(
        'Invalid GeoJSON',
      )
    })

    it('is blank when there is no value', () => {
      expect(summary(null)).toBe('')
    })
  })

  describe('what it renders', () => {
    it('invites a location when empty and editable', () => {
      expect(mount().text()).toContain('Set location')
    })

    it('shows a dash when empty and read-only', () => {
      // An empty editable control is an invitation; an empty read-only one is
      // just a fact, and must not look clickable.
      const wrapper = mount({ disabled: true })
      expect(wrapper.text()).toContain('—')
      expect(wrapper.text()).not.toContain('Set location')
    })

    it('shows the summary once a value is set', () => {
      expect(mount({ value: point(72.8961, 19.076) }).text()).toContain(
        '19.07600°N',
      )
    })

    it('offers a clear button alongside a value', () => {
      expect(
        mount({ value: point(1, 2) }).find('button[title="Clear"]').exists(),
      ).toBe(true)
    })

    it('withholds it when read-only', () => {
      expect(
        mount({ value: point(1, 2), disabled: true })
          .find('button[title="Clear"]')
          .exists(),
      ).toBe(false)
    })
  })

  describe('clearing', () => {
    it('emits null rather than an empty string', async () => {
      // The field is stored as JSON text; '' would be an invalid document value
      // where null is a genuine absence.
      const wrapper = mount({ value: point(1, 2) })
      await wrapper.find('button[title="Clear"]').trigger('click')
      expect(wrapper.emitted('change')).toEqual([[null]])
    })
  })

  describe('opening the map', () => {
    it('opens from an empty editable control', async () => {
      const wrapper = mount()
      await wrapper.find('div').trigger('click')
      expect(wrapper.vm.showModal).toBe(true)
    })

    it('opens from a control that already has a value', async () => {
      const wrapper = mount({ value: point(1, 2) })
      await wrapper.find('div').trigger('click')
      expect(wrapper.vm.showModal).toBe(true)
    })

    it('opens read-only too, so the location can still be viewed', async () => {
      const wrapper = mount({ value: point(1, 2), disabled: true })
      await wrapper.find('div').trigger('click')
      expect(wrapper.vm.showModal).toBe(true)
    })

    it('does not open from an empty read-only control', async () => {
      const wrapper = mount({ disabled: true })
      await wrapper.find('div').trigger('click')
      expect(wrapper.vm.showModal).toBe(false)
    })
  })

  describe('saving before the map has loaded', () => {
    it('just closes, without clearing the stored value', () => {
      // Leaflet loads lazily, so Save can be reached before `editableLayers`
      // exists. Emitting here would wipe a value the user never touched.
      const wrapper = mount({ value: point(1, 2) })
      wrapper.vm.showModal = true
      wrapper.vm.saveLocation()
      expect(wrapper.emitted('change')).toBeUndefined()
      expect(wrapper.vm.showModal).toBe(false)
    })
  })

  describe('sizing', () => {
    it('defaults to the small size', () => {
      expect(mount().vm.containerClasses).toContain('h-7')
    })

    it.each([
      ['md', 'h-8'],
      ['lg', 'h-10'],
      ['xl', 'h-10'],
    ])('honours size %s', (size, height) => {
      expect(mount({}, { size }).vm.containerClasses).toContain(height)
    })

    it('scales the padding with the size', () => {
      expect(mount({}, { size: 'lg' }).vm.containerClasses).toContain('px-3')
      expect(mount().vm.containerClasses).toContain('px-2')
    })
  })

  describe('variants', () => {
    it('defaults to subtle', () => {
      expect(mount().vm.containerClasses).toContain('bg-surface-gray-2')
    })

    it('outlines on request', () => {
      expect(mount({}, { variant: 'outline' }).vm.containerClasses).toContain(
        'border-outline-gray-2',
      )
    })

    it('drops the border for ghost', () => {
      expect(mount({}, { variant: 'ghost' }).vm.containerClasses).toContain(
        'border-0',
      )
    })

    it('greys out when disabled, whatever the variant', () => {
      for (const variant of ['subtle', 'outline', 'ghost']) {
        expect(
          mount({ disabled: true }, { variant }).vm.containerClasses,
        ).toContain('bg-surface-gray-1')
      }
    })

    it('keeps an outline visible while disabled', () => {
      // A disabled outlined field still needs its edge, or it disappears into
      // the form background.
      expect(
        mount({ disabled: true }, { variant: 'outline' }).vm.containerClasses,
      ).toContain('border-outline-gray-2')
      expect(
        mount({ disabled: true }, { variant: 'subtle' }).vm.containerClasses,
      ).toContain('border-transparent')
    })

    it('appends any class the caller passed', () => {
      expect(mount({}, { class: 'my-own-class' }).vm.containerClasses).toContain(
        'my-own-class',
      )
    })
  })
})
