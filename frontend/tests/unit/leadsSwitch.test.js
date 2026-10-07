import { afterEach, describe, expect, it } from 'vitest'
import {
  defaultLeadDealDoctype,
  isLeadsEnabled,
  leadDealDoctypeOptions,
  setLeadsEnabled,
} from '@/utils/leads'

// utils/leads keeps the loaded setting in module state; reset to "not loaded
// yet" (null) and restore the boot flag after each case.
afterEach(() => {
  setLeadsEnabled(null)
  window.enable_leads = true
})

describe('Leads switch', () => {
  it('falls back to the boot flag before settings load', () => {
    setLeadsEnabled(null)
    window.enable_leads = false
    expect(isLeadsEnabled()).toBe(false)
    window.enable_leads = true
    expect(isLeadsEnabled()).toBe(true)
  })

  it('prefers the loaded setting over the boot flag', () => {
    window.enable_leads = true
    setLeadsEnabled(0)
    expect(isLeadsEnabled()).toBe(false)
  })

  it('offers only Deal, and defaults to it, while Leads are off', () => {
    setLeadsEnabled(false)
    expect(leadDealDoctypeOptions().map((o) => o.value)).toEqual(['CRM Deal'])
    expect(defaultLeadDealDoctype()).toBe('CRM Deal')
  })

  it('offers Lead first, and defaults to it, while Leads are on', () => {
    setLeadsEnabled(true)
    expect(leadDealDoctypeOptions().map((o) => o.value)).toEqual([
      'CRM Lead',
      'CRM Deal',
    ])
    expect(defaultLeadDealDoctype()).toBe('CRM Lead')
  })
})
