<template>
  <Transition name="fade">
    <div
      v-if="isOpen"
      class="fixed inset-0 bg-[var(--crm-overlay)] backdrop-blur-[2px] z-50 flex items-start justify-center pt-[10vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-heading"
      @click.self="close"
      @keydown.tab="handleTabKey"
    >
      <h2 id="command-palette-heading" class="sr-only">
        {{ __('Global Search & Command Palette') }}
      </h2>
      <div
        class="bg-[var(--crm-surface)] rounded-[var(--crm-dialog-radius)] shadow-[var(--crm-shadow-lg)] w-full max-w-2xl border border-[var(--crm-border)] overflow-hidden flex flex-col max-h-[70vh] animate-fade-in-up"
      >
        <!-- Search Input Header -->
        <div
          class="flex items-center border-b border-[var(--crm-border)] px-5 py-3.5 gap-3 bg-[var(--crm-surface)]"
        >
          <span
            class="lucide-search size-5 text-[var(--crm-text-4)] shrink-0"
            aria-hidden="true"
          />
          <input
            ref="inputRef"
            v-model="query"
            type="text"
            class="flex-1 bg-transparent border-0 outline-none text-[var(--crm-text-2)] placeholder-[var(--crm-text-4)] text-base font-sans"
            :placeholder="
              leadsEnabled
                ? __('Search leads, deals, contacts, organizations...')
                : __('Search deals, contacts, organizations...')
            "
            aria-label="Global search"
            @keydown.down.prevent="navigateDown"
            @keydown.up.prevent="navigateUp"
            @keydown.enter.prevent="selectActiveItem"
            @keydown.esc="close"
          />
          <kbd
            class="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-sans font-medium text-[var(--crm-text-4)] bg-[var(--crm-surface)] border border-[var(--crm-border)] rounded shadow-sm shrink-0"
            >ESC</kbd
          >
        </div>

        <!-- Search Results / Loading / Empty States -->
        <div class="flex-1 overflow-y-auto min-h-[150px] p-3 font-sans">
          <!-- Skeleton Loading State -->
          <div v-if="isLoading" class="space-y-3 p-2">
            <div
              v-for="i in 4"
              :key="i"
              class="flex items-center gap-3 animate-pulse"
            >
              <div class="w-8 h-8 bg-[var(--crm-surface-2)] rounded-lg" />
              <div class="flex-1 space-y-2">
                <div class="h-4 bg-[var(--crm-surface-2)] rounded w-1/3" />
                <div class="h-3 bg-[var(--crm-surface-2)] rounded w-1/2" />
              </div>
            </div>
          </div>

          <!-- Empty State -->
          <div
            v-else-if="
              query && Object.values(results).every((arr) => arr.length === 0)
            "
            class="flex flex-col items-center justify-center py-10 px-4 text-center"
          >
            <div
              class="size-12 rounded-full bg-[var(--crm-surface-2)] flex items-center justify-center mb-3"
            >
              <span class="lucide-search-x size-6 text-[var(--crm-text-4)]" />
            </div>
            <h3 class="text-sm font-semibold text-[var(--crm-text)]">
              {{ __('No results found') }}
            </h3>
            <p class="text-xs text-[var(--crm-text-3)] mt-1">
              {{ __("No results matching '{0}' across records.", [query]) }}
            </p>
          </div>

          <!-- Default/Initial Help State -->
          <div
            v-else-if="!query"
            class="flex flex-col items-center justify-center py-10 text-center text-[var(--crm-text-4)]"
          >
            <span class="lucide-search size-8 text-[var(--crm-text-4)] mb-2" />
            <p class="text-sm font-medium text-[var(--crm-text-3)]">
              {{ __('Type to search across CRM records') }}
            </p>
            <p class="text-xs text-[var(--crm-text-4)] mt-1">
              {{
                leadsEnabled
                  ? __('Leads, Deals, Contacts, and Organizations')
                  : __('Deals, Contacts, and Organizations')
              }}
            </p>
          </div>

          <!-- Results Lists Grouped by Type -->
          <div v-else class="space-y-4">
            <div v-for="(group, key) in results" :key="key">
              <div v-if="group.length" class="space-y-1">
                <div
                  class="px-3 py-1 text-[11px] font-bold text-[var(--crm-text-4)] uppercase tracking-wider"
                >
                  {{ __(key) }}
                </div>
                <div
                  v-for="item in group"
                  :key="item.id"
                  class="flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors duration-150 border border-transparent"
                  :class="[
                    isActiveItem(item)
                      ? 'bg-brand-50/70 border-brand-100 text-[var(--crm-text)] shadow-sm'
                      : 'hover:bg-[var(--crm-row-hover)] text-[var(--crm-text-2)]',
                  ]"
                  @click="goToRecord(item)"
                  @mouseenter="hoverItem(item)"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <Avatar
                      v-if="item.image || item.logo"
                      size="md"
                      :label="item.title"
                      :image="item.image || item.logo"
                    />
                    <div
                      v-else
                      class="size-8 rounded-lg bg-brand-50 flex items-center justify-center text-brand-600 font-semibold shrink-0"
                    >
                      {{ item.title.charAt(0) }}
                    </div>
                    <div class="min-w-0">
                      <div
                        class="text-sm font-medium truncate"
                        :class="{ 'text-brand-600': isActiveItem(item) }"
                      >
                        {{ item.title }}
                      </div>
                      <div
                        class="text-xs text-[var(--crm-text-4)] truncate mt-0.5"
                      >
                        {{ item.subtitle }}
                      </div>
                    </div>
                  </div>

                  <Badge :label="item.badge" variant="subtle" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Shortcut Hint Footer -->
        <div
          class="border-t border-[var(--crm-border)] px-4 py-2 bg-[var(--crm-surface-2)] text-[10px] text-[var(--crm-text-4)] flex items-center gap-4 shrink-0 font-sans"
        >
          <span class="flex items-center gap-1"
            ><kbd class="px-1 bg-[var(--crm-surface)] border rounded">↑↓</kbd>
            {{ __('Navigate') }}</span
          >
          <span class="flex items-center gap-1"
            ><kbd class="px-1 bg-[var(--crm-surface)] border rounded">↵</kbd>
            {{ __('Select') }}</span
          >
          <span class="flex items-center gap-1"
            ><kbd class="px-1 bg-[var(--crm-surface)] border rounded">ESC</kbd>
            {{ __('Close') }}</span
          >
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { call, Avatar, Badge } from 'frappe-ui'
import { watchDebounced } from '@vueuse/core'
import { isCommandPaletteOpen as isOpen } from '@/composables/commandPalette'
import { isLeadsEnabled } from '@/utils/leads'

const router = useRouter()

const query = ref('')
const isLoading = ref(false)
const modalRef = ref(null)
const inputRef = ref(null)

const leadsEnabled = isLeadsEnabled()

const results = ref({
  Leads: [],
  Deals: [],
  Contacts: [],
  Organizations: [],
})

let triggerElement = null

// Flat representation of all results for keyboard navigation
const flatResults = computed(() => {
  return [
    ...results.value.Leads,
    ...results.value.Deals,
    ...results.value.Contacts,
    ...results.value.Organizations,
  ]
})

const activeIndex = ref(0)

function isActiveItem(item) {
  return flatResults.value[activeIndex.value]?.id === item.id
}

function hoverItem(item) {
  const index = flatResults.value.findIndex((i) => i.id === item.id)
  if (index !== -1) {
    activeIndex.value = index
  }
}

// Keyboard arrow navigations
function navigateDown() {
  if (flatResults.value.length === 0) return
  activeIndex.value = (activeIndex.value + 1) % flatResults.value.length
}

function navigateUp() {
  if (flatResults.value.length === 0) return
  activeIndex.value =
    (activeIndex.value - 1 + flatResults.value.length) %
    flatResults.value.length
}

function selectActiveItem() {
  const item = flatResults.value[activeIndex.value]
  if (item) {
    goToRecord(item)
  }
}

function goToRecord(item) {
  router.push(item.route)
  close()
}

// Close and restore focus
function close() {
  isOpen.value = false
}

// Focus Trap for accessibility
function handleTabKey(e) {
  if (!modalRef.value) return
  const focusables = modalRef.value.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  if (e.shiftKey) {
    if (document.activeElement === first) {
      last.focus()
      e.preventDefault()
    }
  } else {
    if (document.activeElement === last) {
      first.focus()
      e.preventDefault()
    }
  }
}

// Handle trigger element focus restoration
watch(isOpen, (openState) => {
  if (openState) {
    triggerElement = document.activeElement
    query.value = ''
    results.value = { Leads: [], Deals: [], Contacts: [], Organizations: [] }
    activeIndex.value = 0
    nextTick(() => {
      inputRef.value?.focus()
    })
  } else {
    if (triggerElement && typeof triggerElement.focus === 'function') {
      triggerElement.focus()
    }
  }
})

// Debounced parallel searches across categories
watchDebounced(
  query,
  async (newQuery) => {
    const val = newQuery?.trim()
    if (!val) {
      results.value = { Leads: [], Deals: [], Contacts: [], Organizations: [] }
      activeIndex.value = 0
      return
    }

    isLoading.value = true
    activeIndex.value = 0

    try {
      // allSettled: one category failing (e.g. no read permission) must not
      // blank out the results of the others.
      const settled = await Promise.allSettled([
        leadsEnabled
          ? call('frappe.client.get_list', {
              doctype: 'CRM Lead',
              fields: ['name', 'lead_name', 'email', 'status', 'image'],
              or_filters: {
                lead_name: ['like', `%${val}%`],
                name: ['like', `%${val}%`],
                email: ['like', `%${val}%`],
              },
              limit_page_length: 5,
            })
          : [],
        call('frappe.client.get_list', {
          doctype: 'CRM Deal',
          fields: ['name', 'organization', 'lead_name', 'status'],
          or_filters: {
            organization: ['like', `%${val}%`],
            lead_name: ['like', `%${val}%`],
            email: ['like', `%${val}%`],
            name: ['like', `%${val}%`],
          },
          limit_page_length: 5,
        }),
        call('frappe.client.get_list', {
          doctype: 'Contact',
          fields: ['name', 'first_name', 'last_name', 'email_id', 'image'],
          or_filters: {
            first_name: ['like', `%${val}%`],
            last_name: ['like', `%${val}%`],
            email_id: ['like', `%${val}%`],
            name: ['like', `%${val}%`],
          },
          limit_page_length: 5,
        }),
        call('frappe.client.get_list', {
          doctype: 'CRM Organization',
          fields: [
            'name',
            'organization_name',
            'industry',
            'organization_logo',
          ],
          or_filters: {
            organization_name: ['like', `%${val}%`],
            name: ['like', `%${val}%`],
          },
          limit_page_length: 5,
        }),
      ])
      const [leadsRes, dealsRes, contactsRes, orgsRes] = settled.map((r) => {
        if (r.status === 'rejected')
          console.error('Command Palette Search Error:', r.reason)
        return r.value
      })

      results.value.Leads = (leadsRes || []).map((l) => ({
        id: `lead-${l.name}`,
        title: l.lead_name || l.name,
        subtitle: l.email || l.status,
        image: l.image,
        badge: __('Lead'),
        route: { name: 'Lead', params: { leadId: l.name } },
      }))

      results.value.Deals = (dealsRes || []).map((d) => ({
        id: `deal-${d.name}`,
        title: d.organization || d.lead_name || d.name,
        subtitle: [d.lead_name, d.status].filter(Boolean).join(' · '),
        badge: __('Deal'),
        route: { name: 'Deal', params: { dealId: d.name } },
      }))

      results.value.Contacts = (contactsRes || []).map((c) => ({
        id: `contact-${c.name}`,
        title: `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.name,
        subtitle: c.email_id,
        image: c.image,
        badge: __('Contact'),
        route: { name: 'Contact', params: { contactId: c.name } },
      }))

      results.value.Organizations = (orgsRes || []).map((o) => ({
        id: `org-${o.name}`,
        title: o.organization_name || o.name,
        subtitle: o.industry || __('Organization'),
        image: o.organization_logo,
        badge: __('Organization'),
        route: { name: 'Organization', params: { organizationId: o.name } },
      }))
    } catch (err) {
      console.error('Command Palette Search Error:', err)
    } finally {
      isLoading.value = false
    }
  },
  { debounce: 250 },
)
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
