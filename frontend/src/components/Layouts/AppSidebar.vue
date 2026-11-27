<template>
  <div
    class="crm-sidebar relative flex h-full flex-col justify-between font-sans"
    :class="isSidebarCollapsed ? 'crm-sidebar-collapsed' : ''"
  >
    <!-- Brand Header -->
    <div class="crm-sidebar-brand">
      <!-- Collapsed: the logo itself expands the sidebar. The 26px collapse
           button does not fit beside a 30px logo in a 56px rail, so it was being
           clipped by the sidebar's overflow:hidden — leaving no way to expand
           again once collapsed. Hovering swaps the logo for the chevron so the
           control is discoverable. -->
      <button
        v-if="isSidebarCollapsed"
        class="crm-sidebar-brand-btn"
        :title="__('Expand sidebar')"
        :aria-label="__('Expand sidebar')"
        @click="isSidebarCollapsed = false"
      >
        <BrandLogo v-model="brand" class="crm-sidebar-brand-mark" />
        <span class="crm-sidebar-brand-expand" aria-hidden="true">
          <CollapseSidebar class="h-3.5 w-3.5 [transform:rotateY(180deg)]" />
        </span>
      </button>

      <template v-else>
        <BrandLogo v-model="brand" class="crm-sidebar-brand-mark" />
        <span class="crm-sidebar-brand-text">
          {{ __(brand.name || 'CRM') }}
        </span>
        <button
          class="crm-sidebar-collapse"
          :title="__('Collapse sidebar')"
          :aria-label="__('Collapse sidebar')"
          @click="isSidebarCollapsed = true"
        >
          <CollapseSidebar class="h-3.5 w-3.5" />
        </button>
      </template>
    </div>

    <div class="crm-sidebar-nav">
      <div v-for="view in allViews" :key="view.label">
        <div class="mx-2 my-1.5" />
        <CollapsibleSection
          :label="view.name"
          :hideLabel="view.hideLabel"
          :opened="view.opened"
        >
          <template #header="{ opened, hide, toggle }">
            <div
              v-if="!hide"
              class="crm-sidebar-section"
              :class="{
                'crm-sidebar-section-collapsed': isSidebarCollapsed,
                'crm-sidebar-section-active': opened,
              }"
              @click="toggle()"
            >
              <span
                class="crm-section-chev"
                :class="{ 'rotate-90': opened }"
                aria-hidden="true"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </span>
              <span>{{ __(view.name) }}</span>
            </div>
          </template>
          <nav class="flex flex-col">
            <SidebarLink
              v-for="link in view.views"
              :key="link.label"
              :icon="link.icon"
              :label="__(link.label)"
              :to="link.to"
              :isCollapsed="isSidebarCollapsed"
            >
              <template v-if="link.badge" #right>
                <span
                  v-if="!isSidebarCollapsed && link.badge()"
                  class="crm-sidebar-count"
                  :aria-label="__('{0} waiting for a reply', [link.badge()])"
                  >{{ link.badge() > 99 ? '99+' : link.badge() }}</span
                >
              </template>
            </SidebarLink>
          </nav>
        </CollapsibleSection>
      </div>
    </div>

    <div class="crm-sidebar-footer">
      <div class="crm-sidebar-banners flex flex-col gap-2 mb-1">
        <SalesHierarchyBanner
          v-if="showSalesHierarchyBanner"
          :isSidebarCollapsed="isSidebarCollapsed"
        />
        <TrialBanner
          v-if="isFCSite"
          :isSidebarCollapsed="isSidebarCollapsed"
          :afterUpgrade="() => capture('upgrade_plan_from_trial_banner')"
        />
        <GettingStartedBanner
          v-if="!gettingStartedOff && !isOnboardingStepsCompleted"
          :isSidebarCollapsed="isSidebarCollapsed"
        />
      </div>
      <SidebarLink
        class="crm-sidebar-item-danger"
        :label="__('Logout')"
        :isCollapsed="isSidebarCollapsed"
        @click="() => logout.submit()"
      >
        <template #icon>
          <LogOutIcon class="h-4 w-4" />
        </template>
      </SidebarLink>
      <SidebarLink
        v-if="!gettingStartedOff && isOnboardingStepsCompleted"
        :label="__('Help')"
        :isCollapsed="isSidebarCollapsed"
        @click="
          () => {
            showHelpModal = minimize ? true : !showHelpModal
            minimize = !showHelpModal
          }
        "
      >
        <template #icon>
          <HelpIcon class="h-4 w-4" />
        </template>
      </SidebarLink>
    </div>

    <div class="crm-sidebar-user">
      <Settings v-if="settingsUsed" />
    </div>

    <HelpModal
      v-if="showHelpModal && !gettingStartedOff"
      v-model="showHelpModal"
      v-model:articles="articles"
      :logo="CRMLogo"
      :afterSkip="(step) => capture('onboarding_step_skipped_' + step)"
      :afterSkipAll="() => capture('onboarding_steps_skipped')"
      :afterReset="(step) => capture('onboarding_step_reset_' + step)"
      :afterResetAll="() => capture('onboarding_steps_reset')"
      docsLink="https://docs.frappe.io/crm"
    />
    <IntermediateStepModal
      v-model="showIntermediateModal"
      :currentStep="currentStep"
    />
  </div>
</template>

<script setup>
import LogOutIcon from '~icons/lucide/log-out'
import LucideLayoutDashboard from '~icons/lucide/layout-dashboard'
import CRMLogo from '@/components/Icons/CRMLogo.vue'
import InviteIcon from '@/components/Icons/InviteIcon.vue'
import ConvertIcon from '@/components/Icons/ConvertIcon.vue'
import CommentIcon from '@/components/Icons/CommentIcon.vue'
import EmailIcon from '@/components/Icons/EmailIcon.vue'
import StepsIcon from '@/components/Icons/StepsIcon.vue'
import CollapsibleSection from '@/components/CollapsibleSection.vue'
import SquareAsterisk from '@/components/Icons/SquareAsterisk.vue'
import LeadsIcon from '@/components/Icons/LeadsIcon.vue'
import DealsIcon from '@/components/Icons/DealsIcon.vue'
import ContactsIcon from '@/components/Icons/ContactsIcon.vue'
import OrganizationsIcon from '@/components/Icons/OrganizationsIcon.vue'
import NoteIcon from '@/components/Icons/NoteIcon.vue'
import TaskIcon from '@/components/Icons/TaskIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import CollapseSidebar from '@/components/Icons/CollapseSidebar.vue'
import HelpIcon from '@/components/Icons/HelpIcon.vue'
import SidebarLink from '@/components/SidebarLink.vue'
import BrandLogo from '@/components/BrandLogo.vue'
// Settings (form builder, integrations, SLAs, ...) is fetched the first time it
// is opened rather than with every page, then kept mounted.
const Settings = defineAsyncComponent(
  () => import('@/components/Settings/Settings.vue'),
)
import { getSettings } from '@/stores/settings'
import { isLeadsEnabled } from '@/utils/leads'
import SalesHierarchyBanner from '@/components/SalesHierarchyBanner.vue'
import { viewsStore } from '@/stores/views'
import { usersStore } from '@/stores/users'
import { sessionStore } from '@/stores/session'
import { showSettings, activeSettingsPage } from '@/composables/settings'
import { showChangePasswordModal } from '@/composables/modals'
import { useBroadcast } from '@/composables/useBroadcast.js'
import { call } from 'frappe-ui'
import GettingStartedBanner from '@/components/GettingStartedBanner.vue'
import {
  TrialBanner,
  HelpModal,
  useOnboarding,
  showHelpModal,
  minimize,
  IntermediateStepModal,
  useTelemetry,
} from 'frappe-ui/frappe'
import router from '@/router'
import { useStorage } from '@vueuse/core'
import LucideInbox from '~icons/lucide/inbox'
import { needsReplyCount, startInboxPolling } from '@/composables/inbox'
import {
  ref,
  reactive,
  computed,
  markRaw,
  onMounted,
  watch,
  defineAsyncComponent,
} from 'vue'

const { getPinnedViews, getPublicViews } = viewsStore()
const { brand, _settings: crmSettings } = getSettings()

// Settings → General → "Show Getting started". Off hides the sidebar card, its
// checklist panel and the Help link for everyone.
const gettingStartedOff = computed(() =>
  Boolean(crmSettings.doc?.hide_getting_started),
)
watch(gettingStartedOff, (off) => {
  if (off) showHelpModal.value = false
})

const settingsUsed = ref(false)
watch(
  showSettings,
  (open) => {
    if (open) settingsUsed.value = true
  },
  { immediate: true },
)
const { capture } = useTelemetry()
const { send } = useBroadcast()

const isSidebarCollapsed = useStorage('isSidebarCollapsed', false)

const isFCSite = ref(window.is_fc_site)
const showSalesHierarchyBanner = ref(!!window.show_sales_hierarchy_banner)

const links = [
  {
    label: 'Dashboard',
    icon: LucideLayoutDashboard,
    to: 'Dashboard',
  },
  {
    label: 'Inbox',
    icon: LucideInbox,
    to: 'Inbox',
    // Conversations whose latest message is from the customer.
    badge: () => needsReplyCount.data || 0,
  },
  {
    label: 'Leads',
    icon: LeadsIcon,
    to: 'Leads',
    condition: () => isLeadsEnabled(),
  },
  {
    label: 'Deals',
    icon: DealsIcon,
    to: 'Deals',
  },
  {
    label: 'Contacts',
    icon: ContactsIcon,
    to: 'Contacts',
  },
  {
    label: 'Organizations',
    icon: OrganizationsIcon,
    to: 'Organizations',
  },
  {
    label: 'Notes',
    icon: NoteIcon,
    to: 'Notes',
  },
  {
    label: 'Tasks',
    icon: TaskIcon,
    to: 'Tasks',
  },
  {
    label: 'Calendar',
    icon: CalendarIcon,
    to: 'Calendar',
  },
  {
    label: 'Call Logs',
    icon: PhoneIcon,
    to: 'Call Logs',
  },
]

const allViews = computed(() => {
  let _views = [
    {
      name: 'All Views',
      hideLabel: true,
      opened: true,
      views: links.filter((link) => {
        if (link.condition) {
          return link.condition()
        }
        return true
      }),
    },
  ]
  if (getPublicViews().length) {
    _views.push({
      name: 'Public Views',
      opened: true,
      views: getPublicViews(),
    })
  }
  if (getPinnedViews().length) {
    _views.push({
      name: 'Pinned Views',
      opened: true,
      views: getPinnedViews(),
    })
  }
  return _views
})

// onboarding
const { user, logout } = sessionStore()
const { users, isManager } = usersStore()
const { isOnboardingStepsCompleted, setUp } = useOnboarding('frappecrm')

async function getFirstLead() {
  let firstLead = localStorage.getItem('firstLead' + user)
  if (firstLead) return firstLead
  return await call('xbr_crm.api.onboarding.get_first_lead')
}

async function getFirstDeal() {
  let firstDeal = localStorage.getItem('firstDeal' + user)
  if (firstDeal) return firstDeal
  return await call('xbr_crm.api.onboarding.get_first_deal')
}

const showIntermediateModal = ref(false)
const currentStep = ref({})

const steps = reactive([
  {
    name: 'setup_your_password',
    title: __('Setup your password'),
    icon: markRaw(SquareAsterisk),
    completed: false,
    onClick: () => {
      minimize.value = true
      showChangePasswordModal.value = true
      capture('onboarding_step_clicked_setup_password')
    },
  },
  {
    name: 'create_first_lead',
    title: __('Create your first lead'),
    icon: markRaw(LeadsIcon),
    completed: false,
    onClick: () => {
      minimize.value = true
      router.push({ name: 'Leads' })
      send('trigger_lead_create', true)
      capture('onboarding_step_clicked_create_first_lead')
    },
    condition: () => isLeadsEnabled(),
  },
  {
    name: 'invite_your_team',
    title: __('Invite your team'),
    icon: markRaw(InviteIcon),
    completed: false,
    onClick: () => {
      minimize.value = true
      showSettings.value = true
      activeSettingsPage.value = 'Invite User'
      capture('onboarding_step_clicked_invite_your_team')
    },
    condition: () => isManager(),
  },
  {
    name: 'convert_lead_to_deal',
    title: __('Convert lead to deal'),
    icon: markRaw(ConvertIcon),
    completed: false,
    dependsOn: 'create_first_lead',
    onClick: async () => {
      minimize.value = true
      capture('onboarding_step_clicked_convert_lead_to_deal')
      currentStep.value = {
        title: __('Convert lead to deal'),
        buttonLabel: __('Convert'),
        videoURL: '/assets/xbr_crm/videos/convertToDeal.mov',
        onClick: async () => {
          showIntermediateModal.value = false
          currentStep.value = {}

          let lead = await getFirstLead()
          if (lead) {
            router.push({ name: 'Lead', params: { leadId: lead } })
          } else {
            router.push({ name: 'Leads' })
          }
        },
      }
      showIntermediateModal.value = true
    },
    condition: () => isLeadsEnabled(),
  },
  {
    name: 'create_first_task',
    title: __('Create your first task'),
    icon: markRaw(TaskIcon),
    completed: false,
    onClick: async () => {
      minimize.value = true
      let deal = await getFirstDeal()
      capture('onboarding_step_clicked_create_first_task')

      if (deal) {
        router.push({
          name: 'Deal',
          params: { dealId: deal },
          hash: '#tasks',
        })
      } else {
        router.push({ name: 'Tasks' })
      }
    },
  },
  {
    name: 'create_first_note',
    title: __('Create your first note'),
    icon: markRaw(NoteIcon),
    completed: false,
    onClick: async () => {
      minimize.value = true
      let deal = await getFirstDeal()
      capture('onboarding_step_clicked_create_first_note')

      if (deal) {
        router.push({
          name: 'Deal',
          params: { dealId: deal },
          hash: '#notes',
        })
      } else {
        router.push({ name: 'Notes' })
      }
    },
  },
  {
    name: 'add_first_comment',
    title: __('Add your first comment'),
    icon: markRaw(CommentIcon),
    completed: false,
    dependsOn: 'create_first_lead',
    onClick: async () => {
      minimize.value = true
      let deal = await getFirstDeal()
      capture('onboarding_step_clicked_add_first_comment')

      if (deal) {
        router.push({
          name: 'Deal',
          params: { dealId: deal },
          hash: '#comments',
        })
      } else {
        router.push({ name: 'Leads' })
      }
    },
  },
  {
    name: 'send_first_email',
    title: __('Send email'),
    icon: markRaw(EmailIcon),
    completed: false,
    dependsOn: 'create_first_lead',
    onClick: async () => {
      minimize.value = true
      let deal = await getFirstDeal()
      capture('onboarding_step_clicked_send_first_email')

      if (deal) {
        router.push({
          name: 'Deal',
          params: { dealId: deal },
          hash: '#emails',
        })
      } else {
        router.push({ name: 'Leads' })
      }
    },
  },
  {
    name: 'change_deal_status',
    title: __('Change deal status'),
    icon: markRaw(StepsIcon),
    completed: false,
    dependsOn: 'convert_lead_to_deal',
    onClick: async () => {
      minimize.value = true
      capture('onboarding_step_clicked_change_deal_status')

      currentStep.value = {
        title: __('Change deal status'),
        buttonLabel: __('Change'),
        videoURL: '/assets/xbr_crm/videos/changeDealStatus.mov',
        onClick: async () => {
          showIntermediateModal.value = false
          currentStep.value = {}

          let deal = await getFirstDeal()
          if (deal) {
            router.push({
              name: 'Deal',
              params: { dealId: deal },
              hash: '#activity',
            })
          } else {
            router.push({ name: 'Leads' })
          }
        },
      }
      showIntermediateModal.value = true
    },
  },
])

onMounted(async () => {
  startInboxPolling()
  await users.promise

  const filteredSteps = steps.filter((step) => {
    if (step.condition) {
      return step.condition()
    }
    return true
  })

  setUp(filteredSteps)
})

// help center
const articles = ref([
  {
    title: __('Introduction'),
    opened: false,
    subArticles: [
      { name: 'introduction', title: __('Introduction') },
      { name: 'setting-up', title: __('Setting Up') },
    ],
  },
  {
    title: __('Settings'),
    opened: false,
    subArticles: [
      { name: 'profile', title: __('Profile') },
      { name: 'custom-branding', title: __('Custom Branding') },
      { name: 'home-actions', title: __('Home Actions') },
      { name: 'invite-users', title: __('Invite Users') },
    ],
  },
  {
    title: __('Masters'),
    opened: false,
    subArticles: [
      ...(isLeadsEnabled() ? [{ name: 'lead', title: __('Lead') }] : []),
      { name: 'deal', title: __('Deal') },
      { name: 'contact', title: __('Contact') },
      { name: 'organization', title: __('Organization') },
      { name: 'note', title: __('Note') },
      { name: 'task', title: __('Task') },
      { name: 'call-log', title: __('Call Log') },
      { name: 'email-template', title: __('Email Template') },
    ],
  },
  {
    title: isLeadsEnabled() ? __('Capturing Leads') : __('Web Forms'),
    opened: false,
    subArticles: [{ name: 'web-form', title: __('Web Form') }],
  },
  {
    title: __('Views'),
    opened: false,
    subArticles: [
      { name: 'view', title: __('Saved View') },
      { name: 'public-view', title: __('Public View') },
      { name: 'pinned-view', title: __('Pinned View') },
    ],
  },
  {
    title: __('Other Features'),
    opened: false,
    subArticles: [
      { name: 'email-communication', title: __('Email Communication') },
      { name: 'comment', title: __('Comment') },
      { name: 'data', title: __('Data') },
      { name: 'service-level-agreement', title: __('Service Level Agreement') },
      { name: 'assignment-rule', title: __('Assignment Rule') },
      { name: 'notification', title: __('Notification') },
    ],
  },
  {
    title: __('Customization'),
    opened: false,
    subArticles: [
      { name: 'custom-fields', title: __('Custom Fields') },
      { name: 'custom-actions', title: __('Custom Actions') },
      { name: 'custom-statuses', title: __('Custom Statuses') },
      { name: 'custom-list-actions', title: __('Custom List Actions') },
      { name: 'quick-entry-layout', title: __('Quick Entry Layout') },
    ],
  },
  {
    title: __('Integration'),
    opened: false,
    subArticles: [
      { name: 'twilio', title: __('Twilio') },
      { name: 'exotel', title: __('Exotel') },
      { name: 'whatsapp', title: __('WhatsApp') },
      { name: 'erpnext', title: __('ERPNext') },
    ],
  },
  {
    title: __('PS Digitise CRM mobile'),
    opened: false,
    subArticles: [
      { name: 'mobile-app-installation', title: __('Mobile App Installation') },
    ],
  },
])
</script>

<style scoped>
.crm-sidebar {
  background: var(--nav-bg);
  color: var(--nav-text-soft);
  overflow: hidden;
  border-right: 1px solid var(--nav-edge);
  transition: width 0.3s ease-in-out;
  width: 220px;
}
.crm-sidebar.crm-sidebar-collapsed {
  width: 56px;
}

/* Brand row */
.crm-sidebar-brand {
  background: var(--nav-bg-brand);
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--nav-border);
  flex-shrink: 0;
  user-select: none;
}
.crm-sidebar-brand-mark {
  height: 30px;
  max-width: 30px;
  flex-shrink: 0;
  border-radius: var(--crm-radius-sm);
}
.crm-sidebar-brand-text {
  font-size: 18px;
  font-weight: var(--weight-normal);
  color: var(--nav-text-brand);
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.crm-sidebar-collapse {
  flex-shrink: 0;
  background: transparent;
  border: 1px solid var(--nav-border-control);
  color: var(--nav-text-dim);
  width: 26px;
  height: 26px;
  border-radius: var(--crm-radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.15s,
    color 0.15s;
}
.crm-sidebar-collapse:hover {
  background: var(--nav-bg-control);
  color: var(--nav-text-soft);
}

/* ── Collapsed rail ──────────────────────────────────────────────────────
   The expanded row is padded 14px/12px for the logo + wordmark + button. With
   only the logo left, that asymmetry reads as off-centre, so centre it instead
   of padding it. */
.crm-sidebar-collapsed .crm-sidebar-brand {
  padding: 0;
  gap: 0;
  justify-content: center;
}
.crm-sidebar-brand-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--crm-radius-sm);
  cursor: pointer;
  flex-shrink: 0;
}
.crm-sidebar-brand-expand {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  border-radius: var(--crm-radius-sm);
  background: var(--nav-bg-control);
  color: var(--nav-text-soft);
}
.crm-sidebar-brand-btn:hover .crm-sidebar-brand-expand,
.crm-sidebar-brand-btn:focus-visible .crm-sidebar-brand-expand {
  display: flex;
}
.crm-sidebar-brand-btn:focus {
  outline: none;
}
.crm-sidebar-brand-btn:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.6);
  outline-offset: 2px;
}
/* Section headers carry 13px side padding for their label; collapsed there is
   no label, so that padding only shifts the divider off-centre. */
.crm-sidebar-collapsed .crm-sidebar-section {
  padding-left: 0;
  padding-right: 0;
  justify-content: center;
}

/* Nav scroll area */
.crm-sidebar-nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
}
.crm-sidebar-nav::-webkit-scrollbar {
  width: 4px;
}
.crm-sidebar-nav::-webkit-scrollbar-track {
  background: transparent;
}
.crm-sidebar-nav::-webkit-scrollbar-thumb {
  background: var(--nav-border-control);
  border-radius: var(--crm-radius-xs);
}

/* Section headers */
.crm-sidebar-section {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
  font-size: 13px;
  font-weight: var(--weight-normal);
  letter-spacing: 0.07em;
  color: var(--nav-text);
  padding: 10px 13px;
  margin: 0 2px;
  white-space: nowrap;
  overflow: hidden;
  cursor: pointer;
  user-select: none;
  border-radius: var(--crm-radius-sm);
  transition:
    color 0.12s,
    background-color 0.12s;
}
.crm-sidebar-section:hover,
.crm-sidebar-section-active {
  color: var(--nav-text-strong);
  background-color: var(--nav-bg-hover);
}
.crm-sidebar-section-collapsed {
  height: 0;
  overflow: hidden;
  opacity: 0;
  padding: 0;
  margin: 0;
}
.crm-section-chev {
  display: inline-flex;
  opacity: 0.6;
  flex-shrink: 0;
  transition: transform 0.2s;
  order: -1;
}
.crm-section-chev.rotate-90 {
  transform: rotate(90deg);
}

/* Footer (banners / help) */
.crm-sidebar-footer {
  margin: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
/* The footer's own side margin stacks with each link's 8px, so collapsed its
   items would sit 16px in against the nav's 8px — visibly narrower buttons in
   the same column. Drop the side margin and let the links do the insetting. */
.crm-sidebar-collapsed .crm-sidebar-footer {
  margin-left: 0;
  margin-right: 0;
}
.crm-sidebar-item-danger {
  color: var(--nav-danger) !important;
}
.crm-sidebar-item-danger:hover {
  background-color: var(--nav-danger-soft) !important;
  color: var(--nav-danger) !important;
}

/* User / notifications / settings row */
.crm-sidebar-user {
  border-top: 1px solid var(--nav-border);
}
</style>