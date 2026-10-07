<template>
  <SettingsLayoutBase
    :title="__('Dashboard Settings')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <FeatherIcon name="settings" class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Dashboard Settings') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'Configure how your dashboard calculates, formats, and displays key metrics.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        v-if="settings.isDirty"
        :label="__('Update')"
        variant="solid"
        icon-left="check"
        :loading="settings.loading"
        @click="updateSettings"
      />
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Enable Forecasting -->
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideTrendingUp class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Enable Forecasting') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Makes "Expected Closure Date" and "Expected Deal Value" mandatory for deal value forecasting',
                )
              }}
            </div>
          </div>
          <div class="shrink-0">
            <Switch v-model="settings.doc.enable_forecasting" size="sm" />
          </div>
        </div>

        <!-- Auto Update Expected Deal Value -->
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideRefreshCw class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Auto Update Expected Deal Value') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Automatically update "Expected Deal Value" based on the total value of associated products in a deal',
                )
              }}
            </div>
          </div>
          <div class="shrink-0">
            <Switch
              v-model="settings.doc.auto_update_expected_deal_value"
              size="sm"
            />
          </div>
        </div>

        <!-- Dashboard Currency -->
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideCircleDollarSign class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Dashboard Currency') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Dashboard number cards & charts will show currency in the selected format. Once set, cannot be edited.',
                )
              }}
            </div>
          </div>
          <div class="shrink-0">
            <!-- Locked once saved — shown as a read-only control. -->
            <span v-if="settings.doc?.currency" class="crm-settings-row-static">
              {{ settings.doc.currency }}
            </span>
            <Link
              v-else
              class="w-44"
              :value="settings.doc?.currency"
              doctype="Currency"
              :placeholder="__('Select Currency')"
              placement="bottom-end"
              @change="(v) => setCurrency(v)"
            />
          </div>
        </div>

        <!-- Exchange Rate Provider -->
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideArrowLeftRight class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Exchange Rate Provider') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ __('Configure the Exchange Rate Provider for your CRM') }}
            </div>
          </div>
          <div class="shrink-0">
            <FormControl
              v-model="settings.doc.service_provider"
              type="select"
              class="w-44"
              :options="providerOptions"
              :placeholder="__('Select Provider')"
              :disabled="!settings.doc?.currency"
              @update:modelValue="() => (settings.doc.access_key = '')"
            />
          </div>
        </div>

        <!-- Access Key (only for providers that need one) -->
        <div v-if="requiresAccessKey" class="crm-settings-row">
          <span class="crm-settings-row-icon">
            <LucideKeyRound class="size-5" />
          </span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Access Key') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __('Access Key for {0}. Required for fetching exchange rates.', [
                  providerMeta.label,
                ])
              }}
              <a
                class="font-medium text-[var(--crm-accent-primary)] hover:underline"
                :href="providerMeta.docsUrl"
                target="_blank"
              >
                {{ __(providerMeta.docsLabel) }}
              </a>
            </div>
          </div>
          <div class="shrink-0">
            <FormControl
              v-model="settings.doc.access_key"
              type="text"
              class="w-44"
              :placeholder="__('Enter Access Key')"
              :disabled="!settings.doc?.currency"
            />
          </div>
        </div>

        <ErrorMessage v-if="errorMessage" :message="__(errorMessage)" />
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import LucideTrendingUp from '~icons/lucide/trending-up'
import LucideRefreshCw from '~icons/lucide/refresh-cw'
import LucideCircleDollarSign from '~icons/lucide/circle-dollar-sign'
import LucideArrowLeftRight from '~icons/lucide/arrow-left-right'
import LucideKeyRound from '~icons/lucide/key-round'
import { getSettings } from '@/stores/settings'
import { globalStore } from '@/stores/global'
import { useBroadcast } from '@/composables/useBroadcast'
import {
  ErrorMessage,
  FormControl,
  Switch,
  FeatherIcon,
  toast,
} from 'frappe-ui'
import { useRoute } from 'vue-router'
import { ref, computed } from 'vue'

const route = useRoute()

const { _settings: settings } = getSettings()
const { $dialog } = globalStore()
const { send } = useBroadcast()

const errorMessage = ref('')

const providerOptions = [
  { label: 'Frankfurter', value: 'frankfurter.app' },
  { label: 'Fawaz Ahmed Exchange API', value: 'fawazahmed-exchange-api' },
  { label: 'Exchangerate Host', value: 'exchangerate.host' },
  { label: 'Exchangerate API', value: 'exchangerate-api' },
]

const PROVIDERS_REQUIRING_KEY = ['exchangerate.host', 'exchangerate-api']

const PROVIDER_META = {
  'exchangerate.host': {
    label: 'Exchangerate Host',
    docsUrl: 'https://exchangerate.host/#/docs/access_key',
    docsLabel: 'exchangerate.host',
  },
  'exchangerate-api': {
    label: 'Exchangerate API',
    docsUrl: 'https://www.exchangerate-api.com',
    docsLabel: 'exchangerate-api.com',
  },
}

const serviceProvider = computed(() => settings.doc?.service_provider)
const requiresAccessKey = computed(() =>
  PROVIDERS_REQUIRING_KEY.includes(serviceProvider.value),
)
const providerMeta = computed(() => PROVIDER_META[serviceProvider.value])

function updateSettings() {
  settings.save.submit(null, {
    validate: () => {
      errorMessage.value = ''
      if (!settings.doc?.currency) {
        errorMessage.value = __('Please select a currency before saving.')
        return errorMessage.value
      }
      if (requiresAccessKey.value && !settings.doc.access_key) {
        errorMessage.value = __('Please enter the {0} Access Key.', [
          providerMeta.value.label,
        ])
        return errorMessage.value
      }
    },
    onSuccess: () => {
      toast.success(__('Dashboard settings updated successfully'))

      if (route.name === 'Deal') {
        send('reload-deal-sections')
      }
    },
  })
}

function setCurrency(value) {
  $dialog({
    title: __('Set Currency'),
    message: __(
      'Are you sure you want to set the currency as {0}? This cannot be changed later.',
      [value],
    ),
    variant: 'solid',
    theme: 'blue',
    actions: [
      {
        label: __('Save'),
        variant: 'solid',
        onClick: (close) => {
          settings.doc.currency = value
          settings.save.submit(null, {
            onSuccess: () => {
              toast.success(__('Currency set as {0} successfully', [value]))
              close()
            },
          })
        },
      },
    ],
  })
}
</script>
