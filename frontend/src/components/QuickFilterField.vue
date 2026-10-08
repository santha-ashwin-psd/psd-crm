<template>
  <FormControl
    v-if="filter.fieldtype == 'Check'"
    v-model="filter.value"
    :label="filter.label"
    type="checkbox"
    @change.stop="updateFilter(filter, $event.target.checked)"
  />
  <FormControl
    v-else-if="filter.fieldtype === 'Select'"
    v-model="filter.value"
    class="form-control cursor-pointer [&_button]:cursor-pointer"
    type="select"
    :options="filter.options"
    :placeholder="filter.label"
    @update:modelValue="updateFilter(filter, $event)"
  />
  <Link
    v-else-if="filter.fieldtype === 'Link'"
    :value="filter.value"
    :doctype="filter.options"
    :placeholder="filter.label"
    @change="(data) => updateFilter(filter, data)"
  />
  <component
    :is="filter.fieldtype === 'Date' ? DatePicker : DateTimePicker"
    v-else-if="['Date', 'Datetime'].includes(filter.fieldtype)"
    class="border-none"
    :value="filter.value"
    :placeholder="filter.label"
    @change="(v) => updateFilter(filter, v)"
  />
  <!-- Free-text quick filters are the toolbar's search box, so they carry a
       magnifier. TextInput reserves the left padding itself once a #prefix
       slot is present, so no padding override is needed here. -->
  <!-- type="search" and a neutral name keep browsers from autofilling these
       boxes: Chrome ignores autocomplete="off" for address data, so a box
       labelled "Email Address" or "Phone" got the user's own email and phone
       filled in. That applied as a filter and was saved to the default view,
       so the list opened filtered on every visit. -->
  <FormControl
    v-else
    v-model="filter.value"
    type="search"
    :name="`crm-quick-filter-${filter.fieldname}`"
    autocomplete="off"
    data-1p-ignore
    data-lpignore="true"
    data-form-type="other"
    class="crm-quick-filter-search"
    :placeholder="filter.label"
    @input.stop="debouncedFn(filter, $event.target.value)"
  >
    <template #prefix>
      <FeatherIcon name="search" class="size-4 text-[var(--crm-text-4)]" />
    </template>
  </FormControl>
</template>
<script setup>
import Link from '@/components/Controls/Link.vue'
import { FormControl, DatePicker, DateTimePicker, FeatherIcon } from 'frappe-ui'
import { useDebounceFn } from '@vueuse/core'
import { reactive, watch } from 'vue'

const props = defineProps({
  filter: { type: Object, required: true },
})

const filter = reactive(props.filter)

const emit = defineEmits(['applyQuickFilter'])

watch(
  () => props.filter,
  (newFilter) => Object.assign(filter, newFilter),
  { deep: true },
)

const debouncedFn = useDebounceFn((f, value) => {
  emit('applyQuickFilter', f, value)
}, 500)

function updateFilter(f, value) {
  emit('applyQuickFilter', f, value)
}
</script>

<style scoped>
/* The toolbar has its own clear button; hide the browser's search adornments. */
.crm-quick-filter-search
  :deep(input[type='search']::-webkit-search-cancel-button),
.crm-quick-filter-search
  :deep(input[type='search']::-webkit-search-decoration) {
  -webkit-appearance: none;
  appearance: none;
}
</style>
