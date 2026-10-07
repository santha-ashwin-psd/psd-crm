const api = vi.hoisted(() => ({ coords: null, maps: [], groups: [], made: [] }))

vi.mock('@vueuse/core', async (importOriginal) => {
  const actual = await importOriginal()
  const { ref } = await import('vue')
  api.coords = ref({ latitude: Infinity, longitude: Infinity })
  return { ...actual, useGeolocation: () => ({ coords: api.coords }) }
})

// The CSS and image imports exist only so Vite bundles them.
vi.mock('leaflet/dist/leaflet.css', () => ({ default: '' }))
vi.mock('leaflet-draw/dist/leaflet.draw.css', () => ({ default: '' }))
vi.mock('leaflet.locatecontrol/dist/L.Control.Locate.min.css', () => ({ default: '' }))
vi.mock('leaflet/dist/images/marker-icon.png?url', () => ({ default: '/icon.png' }))
vi.mock('leaflet/dist/images/marker-icon-2x.png?url', () => ({ default: '/icon2x.png' }))
vi.mock('leaflet/dist/images/marker-shadow.png?url', () => ({ default: '/shadow.png' }))
vi.mock('leaflet-draw', () => ({ default: {} }))
vi.mock('leaflet.locatecontrol', () => ({
  locate: () => ({ addTo: vi.fn() }),
}))

vi.mock('leaflet', () => {
  // Enough of Leaflet's shape for the control's own logic to run: layer
  // groups, bounds, and the geoJSON point factory.
  class LayerGroup {
    constructor() {
      this.layers = []
    }
    addLayer(l) {
      this.layers.push(l)
      return this
    }
    removeLayer(l) {
      this.layers = this.layers.filter((x) => x !== l)
    }
    clearLayers() {
      this.layers = []
    }
    eachLayer(fn) {
      this.layers.forEach(fn)
    }
    addTo(map) {
      map.added.push(this)
      return this
    }
    getBounds() {
      return api.bounds
    }
    toGeoJSON() {
      return { features: this.layers.map((l) => ({ type: 'Feature', layer: l })) }
    }
  }

  class FeatureGroup extends LayerGroup {}

  const marker = (latlng) => ({ kind: 'marker', latlng })
  const circle = (latlng, opts) => ({ kind: 'circle', latlng, ...opts })
  const circleMarker = (latlng, opts) => ({ kind: 'circleMarker', latlng, ...opts })

  const geoJSON = (data, opts) => {
    const group = new LayerGroup()
    const features = data?.features || (data ? [data] : [])
    for (const f of features) {
      const latlng = f.geometry?.coordinates ?? [0, 0]
      group.addLayer(opts.pointToLayer(f, latlng))
    }
    api.made.push({ data, group })
    return group
  }

  const L = {
    map: (id) => {
      const m = {
        id,
        added: [],
        handlers: {},
        view: null,
        fitted: null,
        invalidated: 0,
        setView(center, zoom) {
          this.view = { center, zoom }
        },
        fitBounds(b, o) {
          this.fitted = { b, o }
        },
        invalidateSize() {
          this.invalidated += 1
        },
        on(event, fn) {
          this.handlers[event] = fn
        },
        remove: vi.fn(),
      }
      api.maps.push(m)
      return m
    },
    tileLayer: () => ({ addTo: vi.fn() }),
    control: { layers: () => ({ addTo: vi.fn() }) },
    marker,
    circle,
    circleMarker,
    geoJSON,
    LayerGroup,
    FeatureGroup,
    Icon: { Default: { prototype: {}, mergeOptions: vi.fn() } },
    Circle: { prototype: { toGeoJSON: () => ({}) }, include: vi.fn() },
    CircleMarker: { include: vi.fn() },
    Control: {
      Draw: class {
        constructor(opts) {
          this.opts = opts
        }
        addTo(map) {
          map.added.push(this)
        }
      },
    },
  }
  return { default: L }
})

import GeolocationControl from '@/components/Controls/GeolocationControl.vue'
import { mountComponent } from '../helpers/mount'
import { nextTick } from 'vue'
import { flushPromises } from '@vue/test-utils'

const STUBS = {
  Dialog: {
    name: 'DialogStub',
    inheritAttrs: false,
    props: ['open', 'modelValue'],
    template: '<div v-if="open || modelValue"><slot /><slot name="body-content" /></div>',
  },
}

// Bounds are read back from the mocked feature group.
const boundsOf = (ne, sw) => ({
  isValid: () => Boolean(ne && sw),
  getNorthEast: () => ({ ...ne, equals: (o) => ne.lat === o.lat && ne.lng === o.lng }),
  getSouthWest: () => ({ ...sw, equals: (o) => sw.lat === o.lat && sw.lng === o.lng }),
})

const point = (coords, properties = {}) => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: coords },
})

describe('GeolocationControl — the map', () => {
  const mount = (props = {}) =>
    mountComponent(GeolocationControl, { props, global: { stubs: STUBS } })

  const openMap = async (props = {}) => {
    const wrapper = mount(props)
    await wrapper.vm.initMap()
    await flushPromises()
    return wrapper
  }

  beforeEach(() => {
    api.maps = []
    api.made = []
    api.coords.value = { latitude: Infinity, longitude: Infinity }
    api.bounds = boundsOf(null, null)
  })

  describe('opening it', () => {
    it('builds a map', async () => {
      await openMap()
      expect(api.maps).toHaveLength(1)
    })

    it('adds the draw controls when the field is editable', async () => {
      await openMap()
      const map = api.maps[0]
      expect(map.added.some((a) => a.opts?.draw)).toBe(true)
    })

    it('leaves them out when the field is read-only', async () => {
      // Otherwise a read-only field offers a pencil that saves nothing.
      await openMap({ disabled: true })
      expect(api.maps[0].added.some((a) => a.opts?.draw)).toBe(false)
    })

    it('listens for shapes being drawn and deleted', async () => {
      await openMap()
      expect(Object.keys(api.maps[0].handlers).sort()).toEqual([
        'draw:created',
        'draw:deleted',
      ])
    })

    it('collects a shape that was drawn', async () => {
      const wrapper = await openMap()
      const layer = { kind: 'marker' }
      api.maps[0].handlers['draw:created']({ layer })
      wrapper.vm.saveLocation()
      expect(wrapper.emitted('change').at(-1)[0]).toContain('Feature')
    })

    it('drops a shape that was deleted', async () => {
      const wrapper = await openMap()
      const layer = { kind: 'marker' }
      api.maps[0].handlers['draw:created']({ layer })
      api.maps[0].handlers['draw:deleted']({
        layers: { eachLayer: (fn) => fn(layer) },
      })
      wrapper.vm.saveLocation()
      expect(wrapper.emitted('change').at(-1)).toEqual([null])
    })

    it('loads Leaflet only once across opens', async () => {
      const wrapper = await openMap()
      wrapper.vm.destroyMap()
      await wrapper.vm.initMap()
      await flushPromises()
      expect(api.maps).toHaveLength(2)
    })
  })

  describe('where it centres', () => {
    it('uses the device location when there is one', async () => {
      api.coords.value = { latitude: 51.5, longitude: -0.12 }
      await openMap()
      expect(api.maps[0].view.center).toEqual([51.5, -0.12])
      expect(api.maps[0].view.zoom).toBe(13)
    })

    it('falls back to a fixed point when there is not', async () => {
      // `useGeolocation` reports Infinity until permission is granted.
      await openMap()
      expect(api.maps[0].view.center).toEqual([19.08, 72.8961])
    })

    it('ignores a partial reading', async () => {
      api.coords.value = { latitude: 51.5, longitude: Infinity }
      await openMap()
      expect(api.maps[0].view.center).toEqual([19.08, 72.8961])
    })
  })

  describe('drawing the stored value', () => {
    it('draws nothing when the field is empty', async () => {
      await openMap()
      expect(api.made).toHaveLength(0)
    })

    it('ignores a value that is not valid JSON', async () => {
      // A hand-edited or truncated field must not take the map down.
      await openMap({ value: '{not json' })
      expect(api.made).toHaveLength(0)
    })

    it('draws a plain point as a marker', async () => {
      api.bounds = boundsOf({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })
      await openMap({
        value: JSON.stringify({ type: 'FeatureCollection', features: [point([1, 1])] }),
      })
      expect(api.made[0].group.layers[0].kind).toBe('marker')
    })

    it('draws a circle with the radius it was saved with', async () => {
      // The radius lives in `properties`, not the geometry — Leaflet's GeoJSON
      // has no circle type, so it would otherwise come back as a point.
      api.bounds = boundsOf({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })
      await openMap({
        value: JSON.stringify({
          type: 'FeatureCollection',
          features: [point([1, 1], { point_type: 'circle', radius: 500 })],
        }),
      })
      expect(api.made[0].group.layers[0]).toMatchObject({
        kind: 'circle',
        radius: 500,
      })
    })

    it('draws a circle marker the same way', async () => {
      api.bounds = boundsOf({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })
      await openMap({
        value: JSON.stringify({
          type: 'FeatureCollection',
          features: [point([1, 1], { point_type: 'circlemarker', radius: 20 })],
        }),
      })
      expect(api.made[0].group.layers[0]).toMatchObject({
        kind: 'circleMarker',
        radius: 20,
      })
    })

    it('clears what was there before redrawing', async () => {
      const wrapper = await openMap({
        value: JSON.stringify({ type: 'FeatureCollection', features: [point([1, 1])] }),
      })
      const before = api.made.length
      wrapper.vm.reloadData()
      expect(api.made.length).toBe(before + 1)
    })

    it('does nothing before the map exists', async () => {
      const wrapper = mount({ value: '{}' })
      expect(() => wrapper.vm.reloadData()).not.toThrow()
    })
  })

  describe('framing what it drew', () => {
    it('zooms to a single point rather than fitting zero-area bounds', async () => {
      // `fitBounds` on a single point produces bounds with no area, which
      // Leaflet zooms to its maximum for.
      api.bounds = boundsOf({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })
      const wrapper = await openMap()
      wrapper.vm.fitMap()
      expect(api.maps[0].view.zoom).toBe(14)
      expect(api.maps[0].view.center).toMatchObject({ lat: 1, lng: 1 })
      expect(api.maps[0].fitted).toBeNull()
    })

    it('fits the bounds when the shape has area', async () => {
      api.bounds = boundsOf({ lat: 2, lng: 2 }, { lat: 1, lng: 1 })
      const wrapper = await openMap()
      wrapper.vm.fitMap()
      expect(api.maps[0].fitted.o).toEqual({ padding: [50, 50] })
    })

    it('does nothing with invalid bounds', async () => {
      api.bounds = boundsOf(null, null)
      const wrapper = await openMap()
      const before = api.maps[0].view
      wrapper.vm.fitMap()
      expect(api.maps[0].view).toBe(before)
      expect(api.maps[0].fitted).toBeNull()
    })

    it('tells the map its size changed', async () => {
      // The dialog animates open; without this the tiles lay out at the wrong
      // size and leave grey gaps.
      const wrapper = await openMap()
      const before = api.maps[0].invalidated
      wrapper.vm.fitMap()
      expect(api.maps[0].invalidated).toBe(before + 1)
    })
  })

  describe('flattening nested layers', () => {
    it('adds a plain layer straight across', async () => {
      const wrapper = await openMap()
      const target = { layers: [], addLayer(l) { this.layers.push(l) } }
      wrapper.vm.addNonGroupLayers({ kind: 'marker' }, target)
      expect(target.layers).toHaveLength(1)
    })

    it('walks into a group', async () => {
      // GeoJSON parsing nests layers; the editable group wants them flat, or
      // the draw controls cannot select individual shapes.
      const wrapper = await openMap()
      const leaflet = (await import('leaflet')).default
      const inner = new leaflet.LayerGroup()
      inner.addLayer({ kind: 'a' })
      inner.addLayer({ kind: 'b' })
      const target = { layers: [], addLayer(l) { this.layers.push(l) } }
      wrapper.vm.addNonGroupLayers(inner, target)
      expect(target.layers.map((l) => l.kind)).toEqual(['a', 'b'])
    })

    it('walks into a group inside a group', async () => {
      const wrapper = await openMap()
      const leaflet = (await import('leaflet')).default
      const deep = new leaflet.LayerGroup()
      deep.addLayer({ kind: 'deep' })
      const outer = new leaflet.LayerGroup()
      outer.addLayer(deep)
      const target = { layers: [], addLayer(l) { this.layers.push(l) } }
      wrapper.vm.addNonGroupLayers(outer, target)
      expect(target.layers.map((l) => l.kind)).toEqual(['deep'])
    })
  })

  describe('saving', () => {
    it('sends the drawn shapes back', async () => {
      const wrapper = await openMap()
      api.maps[0].handlers['draw:created']({ layer: { kind: 'marker' } })
      wrapper.vm.saveLocation()
      const [sent] = wrapper.emitted('change').at(-1)
      expect(JSON.parse(sent).features).toHaveLength(1)
    })

    it('sends nothing when everything was erased', async () => {
      // An empty FeatureCollection would read as "a location is set".
      const wrapper = await openMap()
      wrapper.vm.saveLocation()
      expect(wrapper.emitted('change').at(-1)).toEqual([null])
    })

    it('closes the dialog either way', async () => {
      const wrapper = await openMap()
      wrapper.vm.showModal = true
      wrapper.vm.saveLocation()
      expect(wrapper.vm.showModal).toBe(false)
    })
  })

  describe('closing', () => {
    it('tears the map down', async () => {
      const wrapper = await openMap()
      const map = api.maps[0]
      wrapper.vm.destroyMap()
      expect(map.remove).toHaveBeenCalled()
    })

    it('is safe to call twice', async () => {
      const wrapper = await openMap()
      wrapper.vm.destroyMap()
      expect(() => wrapper.vm.destroyMap()).not.toThrow()
      expect(api.maps[0].remove).toHaveBeenCalledTimes(1)
    })

    it('tears it down on unmount, so the tiles stop loading', async () => {
      const wrapper = await openMap()
      const map = api.maps[0]
      wrapper.unmount()
      expect(map.remove).toHaveBeenCalled()
    })

    it('is safe to unmount without ever opening the map', () => {
      expect(() => mount().unmount()).not.toThrow()
    })
  })
})
