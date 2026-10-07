<template>
  <Teleport v-if="showHeader" to="#app-header">
    <slot>
      <header
        class="flex h-10.5 w-full items-center gap-3 py-[7px] sm:pl-5 pl-2"
      >
        <div class="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
          <slot name="left-header" />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <slot name="right-header" class="flex items-center gap-2" />
        </div>
      </header>
    </slot>
  </Teleport>
  <!-- Primary action rendered in the global right cluster, beside the avatar. -->
  <Teleport v-if="showHeader && $slots['primary-action']" to="#app-header-primary">
    <slot name="primary-action" />
  </Teleport>
</template>
<script setup>
import { ref, nextTick, useSlots, onMounted, onUnmounted } from 'vue'
import { headerPrimaryActionPresent } from '@/composables/pageActions'

const showHeader = ref(false)
const slots = useSlots()

nextTick(() => {
  showHeader.value = true
})

// Let the global header know a primary action is present so it can, e.g., only
// draw its divider when something actually sits to the left of the account menu.
onMounted(() => {
  if (slots['primary-action']) headerPrimaryActionPresent.value = true
})
onUnmounted(() => {
  if (slots['primary-action']) headerPrimaryActionPresent.value = false
})
</script>
