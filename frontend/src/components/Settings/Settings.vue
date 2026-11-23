<template>
  <Dialog
    v-model:open="showSettings"
    :size="'5xl'"
    bare
    :dismissible="!disableSettingModalOutsideClick"
    @close="activeSettingsPage = ''"
  >
    <template #default>
      <div
        class="crm-settings-modal flex flex-col md:flex-row h-[calc(100vh_-_8rem)] bg-[var(--crm-bg)]"
      >
        <div
          class="flex flex-row md:flex-col m-1 rounded-l-lg w-full md:w-60 shrink-0 bg-[var(--crm-settings-sidebar)] overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-[var(--crm-settings-border)] p-2 gap-1.5 scrollbar-thin"
        >
          <!-- Sidebar header: icon chip + title + description -->
          <div class="hidden md:flex flex-col gap-1.5 px-3 pb-5 pt-3">
            <div class="flex items-center gap-2.5">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
              >
                <FeatherIcon name="settings" class="size-4" />
              </span>
              <h2 class="text-xl font-semibold leading-none text-ink-gray-9">
                {{ __('Settings') }}
              </h2>
            </div>
            <p class="text-sm leading-snug text-ink-gray-6">
              {{ __('Manage your account and system preferences.') }}
            </p>
          </div>
          <template v-for="(tab, i) in tabs" :key="tab.label">
            <div
              v-if="!tab.hideLabel && i != 0"
              class="hidden md:block mx-1 mb-0.5 mt-[5px]"
            />
            <div
              v-if="!tab.hideLabel"
              class="hidden md:flex h-7.5 px-3 py-[7px] my-[3px] items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--crm-text-4)] bg-[var(--crm-settings-sidebar)] sticky top-0 z-10"
            >
              <span>{{ __(tab.label) }}</span>
            </div>
            <nav class="flex flex-row md:flex-col gap-[3px] px-1 shrink-0">
              <SidebarLink
                v-for="item in tab.items"
                :key="item.label"
                :icon="item.icon"
                :label="__(item.label)"
                class="w-auto md:w-full shrink-0"
                :class="
                  activeTab?.label == item.label
                    ? '!text-[var(--crm-accent-text)] !bg-[var(--crm-chip-blue)] !rounded-lg !font-semibold [&_svg]:!text-[var(--crm-accent-text)]'
                    : '!rounded-lg text-[var(--crm-text-2)] hover:bg-[var(--crm-row-hover)] hover:text-[var(--crm-text)]'
                "
                @click="activeSettingsPage = item.label"
              />
            </nav>
          </template>
        </div>
        <div
          class="relative flex min-w-0 flex-1 flex-col bg-[var(--crm-surface)]"
        >
          <!-- Decorative wash behind the page header: a faint blue tint that
               fades into the white page, plus the topographic lines on top. -->
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-52 bg-gradient-to-b from-[var(--crm-settings-wash)] to-transparent"
            aria-hidden="true"
          />
          <svg
            class="crm-wash-mask pointer-events-none absolute inset-x-0 top-0 h-52 w-full"
            viewBox="0 0 1200 220"
            preserveAspectRatio="none"
            fill="none"
            aria-hidden="true"
          >
            <g
              stroke="var(--crm-accent-primary)"
              stroke-opacity="0.13"
              stroke-width="1"
              fill="none"
            >
              <path d="M-40 8 C 240 -62, 470 96, 770 26 S 1160 -50, 1300 42" />
              <path
                d="M-40 40 C 240 -30, 470 128, 770 58 S 1160 -18, 1300 74"
              />
              <path d="M-40 72 C 240 2, 470 160, 770 90 S 1160 14, 1300 106" />
              <path
                d="M-40 104 C 240 34, 470 192, 770 122 S 1160 46, 1300 138"
              />
              <path
                d="M-40 136 C 240 66, 470 224, 770 154 S 1160 78, 1300 170"
              />
              <path
                d="M-40 168 C 240 98, 470 256, 770 186 S 1160 110, 1300 202"
              />
              <path
                d="M-40 200 C 240 130, 470 288, 770 218 S 1160 142, 1300 234"
              />
            </g>
          </svg>

          <!-- Close -->
          <button
            class="absolute right-5 top-5 z-20 grid size-9 place-items-center rounded-xl border border-[var(--crm-settings-border)] bg-[var(--crm-surface)] text-ink-gray-6 shadow-sm transition hover:bg-[var(--crm-surface-2)] hover:text-ink-gray-8"
            :aria-label="__('Close settings')"
            @click="showSettings = false"
          >
            <FeatherIcon name="x" class="size-4" />
          </button>

          <div class="relative z-10 flex flex-1 flex-col overflow-y-auto p-6">
            <component :is="activeTab.component" v-if="activeTab" />
          </div>
        </div>
      </div>
    </template>
  </Dialog>
</template>
<script setup>
import LucideLayoutDashboard from '~icons/lucide/layout-dashboard'
import LucideNetwork from '~icons/lucide/network'
import MonitorCogIcon from '~icons/lucide/monitor-cog'
import LucideTextCursorInput from '~icons/lucide/text-cursor-input'
import SlidersIcon from '@/components/Icons/SlidersIcon.vue'
import SparkleIcon from '@/components/Icons/SparkleIcon.vue'
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import WhatsAppIcon from '@/components/Icons/WhatsAppIcon.vue'
import ERPNextIcon from '@/components/Icons/ERPNextIcon.vue'
import PhoneIcon from '@/components/Icons/PhoneIcon.vue'
import Email2Icon from '@/components/Icons/Email2Icon.vue'
import EmailTemplateIcon from '@/components/Icons/EmailTemplateIcon.vue'
import SettingsIcon from '@/components/Icons/SettingsIcon.vue'
import SettingsIcon2 from '@/components/Icons/SettingsIcon2.vue'
import Users from '@/components/Settings/Users.vue'
import Hierarchy from '@/components/Settings/Hierarchy/Hierarchy.vue'
import InviteUserPage from '@/components/Settings/InviteUserPage.vue'
import ProfilePage from '@/components/Settings/Profile/ProfilePage.vue'
import PreferencesSettings from '@/components/Settings/PreferencesSettings.vue'
import WhatsAppSettings from '@/components/Settings/WhatsAppSettings.vue'
import WhatsAppAutomationSettings from '@/components/Settings/WhatsAppAutomationSettings.vue'
import ERPNextSettings from '@/components/Settings/ERPNextSettings.vue'
import AiSettings from '@/components/Settings/AiSettings.vue'
import LucideSparkles from '~icons/lucide/sparkles'
import LeadSyncSourcePage from '@/components/Settings/LeadSyncing/LeadSyncSourcePage.vue'
import DefaultsSettings from '@/components/Settings/DefaultsSettings.vue'
import FollowUpSettings from '@/components/Settings/FollowUpSettings.vue'
import BrandSettings from '@/components/Settings/BrandSettings.vue'
import CalendarSettings from '@/components/Settings/CalendarSettings.vue'
import HomeActions from '@/components/Settings/HomeActions.vue'
import FormsSettings from '@/components/Settings/Forms/FormsSettings.vue'
import GeneralSettings from '@/components/Settings/GeneralSettings.vue'
import DashboardSettings from '@/components/Settings/DashboardSettings.vue'
import EmailTemplatePage from '@/components/Settings/EmailTemplate/EmailTemplatePage.vue'
import TelephonyPage from '@/components/Settings/Telephony/TelephonyPage.vue'
import EmailConfig from '@/components/Settings/EmailConfig.vue'
import SidebarLink from '@/components/SidebarLink.vue'
import { usersStore } from '@/stores/users'
import {
  showSettings,
  activeSettingsPage,
  disableSettingModalOutsideClick,
} from '@/composables/settings'
import { isWhatsappInstalled } from '@/composables/whatsapp'
import { Dialog, Avatar, FeatherIcon } from 'frappe-ui'
import { ref, markRaw, computed, watch, h } from 'vue'
import AssignmentRulePage from './AssignmentRules/AssignmentRulePage.vue'
import ShieldCheck from '~icons/lucide/shield-check'
import SlaConfig from './Sla/SlaConfig.vue'
import { isLeadsEnabled } from '@/utils/leads'

const { isManager, getUser } = usersStore()

const user = computed(() => getUser() || {})

const tabs = computed(() => {
  let _tabs = [
    {
      label: __('User Configuration'),
      items: [
        {
          label: __('Profile'),
          icon: () =>
            h(Avatar, {
              size: 'xs',
              label: user.value.full_name,
              image: user.value.user_image,
            }),
          component: markRaw(ProfilePage),
        },
        {
          label: __('Preferences'),
          icon: SlidersIcon,
          component: markRaw(PreferencesSettings),
        },
      ],
    },
    {
      label: __('System Configuration'),
      items: [
        {
          label: __('General'),
          component: markRaw(GeneralSettings),
          icon: SettingsIcon,
        },
        {
          label: __('Dashboard'),
          component: markRaw(DashboardSettings),
          icon: LucideLayoutDashboard,
        },
        {
          label: __('Defaults'),
          component: markRaw(DefaultsSettings),
          icon: MonitorCogIcon,
        },
        {
          label: __('Brand'),
          icon: SparkleIcon,
          component: markRaw(BrandSettings),
        },
        {
          label: __('Calendar'),
          icon: CalendarIcon,
          component: markRaw(CalendarSettings),
        },
        {
          label: __('Follow-ups'),
          icon: 'clock',
          component: markRaw(FollowUpSettings),
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('User Management'),
      items: [
        {
          label: __('Users'),
          icon: 'user',
          component: markRaw(Users),
          condition: () => isManager(),
        },
        {
          label: __('Invite User'),
          icon: 'user-plus',
          component: markRaw(InviteUserPage),
          condition: () => isManager(),
        },
        {
          label: __('Sales Hierarchy'),
          icon: LucideNetwork,
          component: markRaw(Hierarchy),
          condition: () => isManager(),
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Email'),
      items: [
        {
          label: __('Accounts'),
          icon: Email2Icon,
          component: markRaw(EmailConfig),
          condition: () => isManager(),
        },
        {
          label: __('Templates'),
          icon: EmailTemplateIcon,
          component: markRaw(EmailTemplatePage),
        },
      ],
    },
    {
      label: __('Automation & Rules'),
      items: [
        {
          label: __('Assignment Rules'),
          icon: markRaw(h(SettingsIcon2, { class: 'rotate-90' })),
          component: markRaw(AssignmentRulePage),
        },
        {
          label: __('SLA Policies'),
          icon: markRaw(h(ShieldCheck)),
          component: markRaw(SlaConfig),
        },
        {
          label: __('Forms'),
          component: markRaw(FormsSettings),
          icon: markRaw(LucideTextCursorInput),
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Customization'),
      items: [
        {
          label: __('Home Actions'),
          component: markRaw(HomeActions),
          icon: 'home',
        },
      ],
      condition: () => isManager(),
    },
    {
      label: __('Integrations', null, 'FCRM'),
      items: [
        {
          label: __('Telephony'),
          icon: PhoneIcon,
          component: markRaw(TelephonyPage),
        },
        {
          label: __('WhatsApp'),
          icon: WhatsAppIcon,
          component: markRaw(WhatsAppSettings),
          condition: () => isWhatsappInstalled.value && isManager(),
        },
        {
          label: __('WhatsApp Automation'),
          icon: WhatsAppIcon,
          component: markRaw(WhatsAppAutomationSettings),
          condition: () => isWhatsappInstalled.value && isManager(),
        },
        {
          label: __('AI Assistant'),
          icon: LucideSparkles,
          component: markRaw(AiSettings),
          condition: () => isManager(),
        },
        {
          label: __('ERPNext'),
          icon: ERPNextIcon,
          component: markRaw(ERPNextSettings),
          condition: () => isManager(),
        },
        {
          label: __('Lead Syncing'),
          icon: 'refresh-cw',
          component: markRaw(LeadSyncSourcePage),
          condition: () => isManager() && isLeadsEnabled(),
        },
      ],
    },
  ]

  return _tabs.filter((tab) => {
    if (tab.condition && !tab.condition()) return false
    if (tab.items) {
      tab.items = tab.items.filter((item) => {
        if (item.condition && !item.condition()) return false
        return true
      })
    }
    return true
  })
})

const activeTab = ref(tabs.value[0].items[0])

function setActiveTab(tabName) {
  activeTab.value =
    (tabName &&
      tabs.value
        .map((tab) => tab.items)
        .flat()
        .find((tab) => tab.label === tabName)) ||
    tabs.value[0].items[0]
}

watch(activeSettingsPage, (activePage) => setActiveTab(activePage))
</script>
