<template>
  <!-- `description` is deliberately NOT forwarded. TextInput renders a
       description of its own when it receives one, and this component renders
       it again below — so a Currency or Float field with a description printed
       it twice, stacked, under the input. This component keeps ownership of it
       because it also exposes the `description` slot. -->
  <TextInput
    ref="inputRef"
    :value="displayValue"
    v-bind="inputAttrs"
    @focus="handleFocus"
    @blur="isFocused = false"
  />
  <slot name="description">
    <p v-if="attrs.description" class="mt-1.5" :class="descriptionClasses">
      {{ attrs.description }}
    </p>
  </slot>
</template>
<script setup>
import { TextInput } from 'frappe-ui'
import { ref, computed, nextTick, useAttrs } from 'vue'

const props = defineProps({
  value: { type: [String, Number], default: '' },
  formattedValue: { type: [String, Number], default: '' },
})

const attrs = useAttrs()

const isFocused = ref(false)
const inputRef = ref(null)

function handleFocus() {
  isFocused.value = true

  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.el?.select()
    }
  })
}

// Everything except the description, which this component renders itself.
const inputAttrs = computed(() => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { description, ...rest } = attrs
  return rest
})

const displayValue = computed(() => {
  return isFocused.value ? props.value : props.formattedValue || props.value
})

const descriptionClasses = computed(() => {
  return [
    {
      sm: 'text-xs',
      md: 'text-base',
    }[attrs.size || 'sm'],
    'text-ink-gray-5',
  ]
})
</script>
