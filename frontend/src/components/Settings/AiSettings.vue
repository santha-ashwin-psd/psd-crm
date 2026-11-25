<template>
  <SettingsLayoutBase :title="__('AI Assistant')">
    <template #title>
      <div class="flex items-start gap-3.5">
        <span
          class="mt-0.5 grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucideSparkles class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('AI Assistant') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{
              __(
                'AI reads the emails and WhatsApp messages on each pipeline. It screens out junk inquiry emails and suggests a stage whenever the conversation moves on. New pipelines always start in the first stage, and AI never moves a pipeline on its own: you accept or dismiss each suggestion.',
              )
            }}
          </p>
        </div>
      </div>
    </template>

    <template #header-actions>
      <Button
        v-if="isDirty"
        :label="__('Update')"
        variant="solid"
        icon-left="check"
        :loading="settings.save.loading"
        @click="update"
      />
    </template>

    <template #content>
      <div v-if="settings.doc" class="flex flex-col gap-4">
        <div class="crm-settings-row">
          <span class="crm-settings-row-icon"
            ><LucideSparkles class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Let AI suggest pipeline stages') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                settings.doc.ai_enabled && settings.doc.ai_enabled_on
                  ? __('On since {0}. Pipelines created from then on are read by AI.', [
                      formatDate(settings.doc.ai_enabled_on, 'D MMM YYYY, h:mm a'),
                    ])
                  : __('Only pipelines created after you switch this on are read by AI.')
              }}
            </div>
          </div>
          <Switch
            v-model="enabled"
            :aria-label="__('Let AI suggest pipeline stages')"
            class="shrink-0"
          />
        </div>

        <div class="crm-settings-row" :class="{ 'opacity-60': !enabled }">
          <span class="crm-settings-row-icon"
            ><LucideHistory class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Include older pipelines') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Also give suggestions on pipelines created before AI was switched on, a few at a time.',
                )
              }}
            </div>
          </div>
          <Switch
            v-model="includeExisting"
            :disabled="!enabled"
            :aria-label="__('Include older pipelines')"
            class="shrink-0"
          />
        </div>

        <div class="crm-settings-row" :class="{ 'opacity-60': !enabled }">
          <span class="crm-settings-row-icon"
            ><LucideGauge class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Minimum confidence (%)') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ __('AI decisions less certain than this are ignored.') }}
            </div>
          </div>
          <FormControl
            v-model.number="settings.doc.ai_min_confidence"
            type="number"
            min="1"
            max="100"
            :disabled="!enabled"
            class="!w-24 shrink-0"
          />
        </div>

        <div class="crm-settings-row" :class="{ 'opacity-60': !enabled }">
          <span class="crm-settings-row-icon"
            ><LucideTrash class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Move junk automatically') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                autoJunk
                  ? __(
                      'Pipelines still in New that AI is sure are junk go to Junk on their own, after the wait below, with the lost reason filled in. Older pipelines are checked too, a few every few minutes. Pipelines someone is already working on are never moved.',
                    )
                  : __(
                      'Off: AI only suggests Junk, and a person clicks Move.',
                    )
              }}
            </div>
          </div>
          <Switch
            v-model="autoJunk"
            :disabled="!enabled"
            :aria-label="__('Move junk automatically')"
            class="shrink-0"
          />
        </div>

        <div
          v-if="autoJunk"
          class="crm-settings-row"
          :class="{ 'opacity-60': !enabled }"
        >
          <span class="crm-settings-row-icon"
            ><LucideGauge class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Move junk at confidence (%)') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                __(
                  'Only move on its own when AI is at least this sure. Less certain junk stays a suggestion.',
                )
              }}
            </div>
          </div>
          <FormControl
            v-model.number="settings.doc.ai_auto_junk_confidence"
            type="number"
            min="1"
            max="100"
            :disabled="!enabled"
            :aria-label="__('Move junk at confidence (%)')"
            class="!w-24 shrink-0"
          />
        </div>

        <div
          v-if="autoJunk"
          class="crm-settings-row"
          :class="{ 'opacity-60': !enabled }"
        >
          <span class="crm-settings-row-icon"
            ><LucideHourglass class="size-5"
          /></span>
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Wait before moving (hours)') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{
                waitHours > 0
                  ? __(
                      'A new pipeline is moved once it is {0} hours old. Until then the Junk suggestion shows, so someone can still dismiss it.',
                      [waitHours],
                    )
                  : __('Moved as soon as AI suggests Junk.')
              }}
            </div>
          </div>
          <FormControl
            v-model.number="settings.doc.ai_auto_junk_after_hours"
            type="number"
            min="0"
            max="720"
            :disabled="!enabled"
            :aria-label="__('Wait before moving (hours)')"
            class="!w-24 shrink-0"
          />
        </div>

        <section class="flex flex-col gap-3 pt-2">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-ink-gray-9">
                {{ __('Connection') }}
              </h3>
              <p class="mt-0.5 text-sm text-ink-gray-6">
                {{
                  __(
                    'Any OpenAI-compatible service. Groq is the default; switching to OpenAI is a change of URL, model and key.',
                  )
                }}
              </p>
            </div>
            <Button
              :label="__('Test connection')"
              :loading="testing"
              @click="testConnection"
            />
          </div>
          <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormControl
              v-model="settings.doc.ai_base_url"
              :label="__('API base URL')"
              placeholder="https://api.groq.com/openai/v1"
            />
            <FormControl
              v-model="settings.doc.ai_model"
              :label="__('Model')"
              placeholder="openai/gpt-oss-120b"
            />
            <FormControl
              v-model="settings.doc.ai_transcription_model"
              :label="__('Transcription model')"
              placeholder="whisper-large-v3-turbo"
            />
            <div class="hidden md:block" />
            <FormControl
              v-model="settings.doc.ai_api_key"
              type="password"
              :label="__('API key')"
              :placeholder="__('Using the key from the site config')"
              autocomplete="off"
              class="md:col-span-2"
            />
          </div>
        </section>

        <section class="flex flex-col gap-3 pt-2">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-semibold text-ink-gray-9">
                {{ __('Keyword rules') }}
              </h3>
              <p class="mt-0.5 text-sm text-ink-gray-6">
                {{
                  __(
                    'Checked before AI, top to bottom. The first rule whose words appear in the latest message decides the suggested stage, with no AI call.',
                  )
                }}
              </p>
            </div>
            <Button :label="__('Add rule')" icon-left="plus" @click="addRule" />
          </div>
          <div
            v-if="!rules.length"
            class="rounded-lg border border-dashed border-[var(--crm-border)] px-4 py-6 text-center text-sm text-ink-gray-5"
          >
            {{ __('No rules yet. AI suggests every stage on its own.') }}
          </div>
          <ul v-else class="flex flex-col divide-y divide-[var(--crm-border)]">
            <li
              v-for="(rule, i) in rules"
              :key="rule.name || i"
              class="flex flex-wrap items-center gap-3 py-2.5"
              data-testid="ai-rule"
            >
              <Switch
                :modelValue="Boolean(rule.enabled)"
                :aria-label="__('Rule enabled')"
                @update:modelValue="(on) => (rule.enabled = on ? 1 : 0)"
              />
              <FormControl
                v-model="rule.keywords"
                :placeholder="__('e.g. quotation, price list')"
                :aria-label="__('Keywords')"
                class="min-w-48 flex-1"
              />
              <span class="text-sm text-ink-gray-5">{{ __('suggests') }}</span>
              <Link
                v-model="rule.stage"
                doctype="CRM Deal Status"
                :placeholder="__('Stage')"
                class="!w-48"
              />
              <Button
                variant="ghost"
                icon="lucide-trash-2"
                :tooltip="__('Remove rule')"
                :aria-label="__('Remove rule')"
                @click="removeRule(i)"
              />
            </li>
          </ul>
          <p
            v-if="ruleError"
            class="text-xs text-[var(--crm-danger-text)]"
            role="alert"
          >
            {{ ruleError }}
          </p>
        </section>

      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import Link from '@/components/Controls/Link.vue'
import LucideSparkles from '~icons/lucide/sparkles'
import LucideHistory from '~icons/lucide/history'
import LucideGauge from '~icons/lucide/gauge'
import LucideTrash from '~icons/lucide/trash-2'
import LucideHourglass from '~icons/lucide/hourglass'
import { getSettings } from '@/stores/settings'
import { formatError } from '@/utils/formatError'
import { formatDate } from '@/utils'
import {
  Button,
  FormControl,
  Switch,
  call,
  toast,
  createDocumentResource,
} from 'frappe-ui'
import { computed, ref } from 'vue'

const settings = createDocumentResource({
  doctype: 'FCRM Settings',
  name: 'FCRM Settings',
  auto: true,
})

const enabled = computed({
  get: () => Boolean(settings.doc?.ai_enabled),
  set: (value) => (settings.doc.ai_enabled = value ? 1 : 0),
})

const includeExisting = computed({
  get: () => Boolean(settings.doc?.ai_include_existing),
  set: (value) => (settings.doc.ai_include_existing = value ? 1 : 0),
})

const autoJunk = computed({
  get: () => Boolean(settings.doc?.ai_auto_junk),
  set: (value) => {
    settings.doc.ai_auto_junk = value ? 1 : 0
    // A blank threshold would mean "any confidence", and a blank wait "move
    // straight away"; start from the safe defaults.
    if (value && !settings.doc.ai_auto_junk_confidence) {
      settings.doc.ai_auto_junk_confidence = 90
    }
    if (value && settings.doc.ai_auto_junk_after_hours == null) {
      settings.doc.ai_auto_junk_after_hours = 12
    }
  },
})

// Shown in the wait row's help text; blank or negative reads as 0.
const waitHours = computed(() =>
  Math.max(Number(settings.doc?.ai_auto_junk_after_hours) || 0, 0),
)

const rules = computed(() => settings.doc?.ai_rules || [])

function addRule() {
  if (!settings.doc.ai_rules) settings.doc.ai_rules = []
  settings.doc.ai_rules.push({ enabled: 1, keywords: '', stage: '' })
}

function removeRule(index) {
  settings.doc.ai_rules.splice(index, 1)
}

const ruleError = computed(() =>
  rules.value.some((r) => !(r.keywords || '').trim() || !r.stage)
    ? __('Each rule needs keywords and a stage.')
    : '',
)

const isDirty = computed(
  () => JSON.stringify(settings.doc) !== JSON.stringify(settings.originalDoc),
)

function update() {
  if (ruleError.value) return
  settings.save.submit(null, {
    onSuccess: () => {
      // Pipeline pages read ai_enabled from the shared settings store.
      getSettings()._settings.reload()
      toast.success(__('Settings updated successfully'))
    },
    onError: (error) =>
      toast.error(formatError(error, 'Failed to save settings')),
  })
}

const testing = ref(false)

async function testConnection() {
  if (isDirty.value) {
    toast.info(__('Save your changes first, then test.'))
    return
  }
  testing.value = true
  try {
    const result = await call('xbr_crm.ai.pipeline.test_connection')
    if (result?.ok) {
      toast.success(__('Connected to {0}', [result.model]))
    } else {
      toast.error(result?.message || __('The AI service did not answer.'))
    }
  } catch (error) {
    toast.error(formatError(error, 'Connection test failed'))
  } finally {
    testing.value = false
  }
}

defineExpose({
  update,
  enabled,
  includeExisting,
  ruleError,
})
</script>
