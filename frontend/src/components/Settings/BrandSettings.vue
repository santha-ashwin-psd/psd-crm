<template>
  <SettingsLayoutBase
    :title="__('Brand Settings')"
  >
    <template #title>
      <div class="flex items-center gap-3.5">
        <span
          class="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--crm-chip-blue)] text-[var(--crm-accent-primary)]"
        >
          <LucidePalette class="size-5" />
        </span>
        <div class="flex flex-col gap-1">
          <h2 class="text-2xl font-semibold leading-none text-ink-gray-9">
            {{ __('Brand Settings') }}
          </h2>
          <p class="text-p-base text-ink-gray-6">
            {{ __('Configure your Brand Name, Logo, and Favicon') }}
          </p>
        </div>
      </div>
    </template>

    <template #content>
      <div class="flex flex-col gap-4">
        <!-- Brand Name -->
        <div class="crm-settings-row">
          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ __('Brand Name') }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ __('Set the name of your brand. It appears in the left sidebar.') }}
            </div>
          </div>
          <div class="shrink-0">
            <FormControl
              v-model="settings.doc.brand_name"
              type="text"
              size="md"
              :placeholder="__('Enter Brand Name')"
              class="w-56"
            />
          </div>
        </div>

        <!-- Brand Logo / Favicon -->
        <div v-for="asset in assets" :key="asset.field" class="crm-settings-row">
          <div class="brand-preview">
            <img
              v-if="settings.doc?.[asset.field]"
              :src="settings.doc[asset.field]"
              :alt="asset.title"
              class="size-11 rounded object-contain"
            />
            <component :is="asset.icon" v-else class="size-6 text-ink-gray-4" />
          </div>

          <div class="min-w-0 flex-1">
            <div class="text-base font-semibold text-ink-gray-9">
              {{ asset.title }}
            </div>
            <div class="mt-0.5 text-sm leading-relaxed text-ink-gray-6">
              {{ asset.where }}
            </div>
            <div class="text-sm leading-relaxed text-ink-gray-6">
              {{ asset.recommendation }}
            </div>
          </div>

          <div class="crm-settings-action shrink-0">
            <ImageUploader
              :image_type="asset.accept"
              :image_url="settings.doc?.[asset.field]"
              @upload="(url) => (settings.doc[asset.field] = url)"
              @remove="() => (settings.doc[asset.field] = '')"
            />
          </div>
        </div>

        <!-- Save bar -->
        <div class="crm-settings-savebar">
          <div class="flex min-w-0 items-center gap-2.5">
            <FeatherIcon
              name="info"
              class="size-4 shrink-0 text-[var(--crm-accent-primary)]"
            />
            <span class="text-sm text-ink-gray-6">
              {{ __('Changes will be applied across the system after saving.') }}
            </span>
          </div>
          <Button
            class="shrink-0"
            variant="solid"
            icon-left="check"
            :label="__('Save Changes')"
            :loading="settings.save.loading"
            @click="updateSettings"
          />
        </div>
      </div>
    </template>
  </SettingsLayoutBase>
</template>

<script setup>
import SettingsLayoutBase from '@/components/Layouts/SettingsLayoutBase.vue'
import ImageUploader from '@/components/Controls/ImageUploader.vue'
import LucidePalette from '~icons/lucide/palette'
import LucideImage from '~icons/lucide/image'
import LucideSquareStar from '~icons/lucide/star'
import { FormControl, FeatherIcon } from 'frappe-ui'
import { getSettings } from '@/stores/settings'
import { showSettings } from '@/composables/settings'
import { markRaw } from 'vue'

const { _settings: settings, setupBrand } = getSettings()

const assets = [
  {
    field: 'brand_logo',
    icon: markRaw(LucideImage),
    accept: 'image/*',
    title: __('Brand Logo'),
    where: __('Appears in the left sidebar.'),
    recommendation: __('Recommended size is 32×32 px in PNG or SVG'),
  },
  {
    field: 'favicon',
    icon: markRaw(LucideSquareStar),
    accept: 'image/*',
    title: __('Favicon'),
    where: __('Appears next to the title in your browser tab.'),
    recommendation: __('Recommended size is 32×32 px in PNG or ICO'),
  },
]

function updateSettings() {
  settings.save.submit(null, {
    onSuccess: () => {
      showSettings.value = false
      setupBrand()
    },
  })
}
</script>

<style scoped>
/* Dashed drop-zone style preview for the logo / favicon. */
.brand-preview {
  display: grid;
  place-items: center;
  width: 72px;
  height: 72px;
  flex-shrink: 0;
  border-radius: var(--crm-radius-lg);
  border: 2px dashed var(--crm-border-strong);
  background: var(--crm-surface-2);
}

</style>
