<template>
  <button
    class="crm-sidebar-item"
    :class="{
      'crm-sidebar-item-active': isActive,
      'crm-sidebar-item-collapsed': isCollapsed,
    }"
    :aria-current="isActive ? 'page' : undefined"
    :aria-label="label"
    @click="handleClick"
  >
    <div class="crm-sidebar-item-inner">
      <div class="crm-sidebar-item-main">
        <Tooltip :text="label" placement="right" :disabled="!isCollapsed">
          <span class="crm-sidebar-icon">
            <slot name="icon">
              <Icon :icon="icon" class="size-4" />
            </slot>
          </span>
        </Tooltip>
        <Tooltip
          :text="label"
          placement="right"
          :disabled="isCollapsed"
          :hoverDelay="1.5"
        >
          <span v-if="!isCollapsed" class="crm-sidebar-label">
            {{ label }}
          </span>
        </Tooltip>
      </div>
      <slot name="right" />
    </div>
  </button>
</template>

<script setup>
import Icon from '@/components/Icon.vue'
import { Tooltip } from 'frappe-ui'
import { computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { isMobileView, mobileSidebarOpened } from '@/composables/settings'

const router = useRouter()
const route = useRoute()

const props = defineProps({
  icon: { type: [Object, String, Function], default: null },
  label: { type: String, default: '' },
  to: { type: [Object, String], default: null },
  isCollapsed: { type: Boolean, default: false },
})

function handleClick() {
  if (!props.to) return
  if (typeof props.to === 'object') {
    router.push(props.to)
  } else {
    router.push({ name: props.to })
  }
  if (isMobileView.value) {
    mobileSidebarOpened.value = false
  }
}

// Keep the module highlighted while inside one of its records — detail routes
// are singular (e.g. "Lead") but the sidebar link points at the list ("Leads").
const detailToList = {
  Lead: 'Leads',
  Deal: 'Deals',
  Contact: 'Contacts',
  Organization: 'Organizations',
  Task: 'Tasks',
  Note: 'Notes',
}

let isActive = computed(() => {
  // Inside a record → highlight that module's list link (ignore any ?view=).
  if (detailToList[route.name]) {
    return detailToList[route.name] === props.to
  }
  if (route.query.view) {
    return route.query.view == props.to?.query?.view
  }
  return route.name === props.to
})
</script>

<style scoped>
.crm-sidebar-item {
  position: relative;
  display: flex;
  align-items: center;
  /* Must account for the 8px side margins. At width:100% the box overran its
     container by 16px; the sidebar's overflow:hidden masked that when expanded,
     but in the 56px collapsed rail it pushed the centred icon 8px off-centre. */
  width: calc(100% - 16px);
  margin: 1px 8px;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 13px;
  font-weight: var(--weight-normal);
  font-family: inherit;
  cursor: pointer;
  border-radius: var(--crm-radius-sm);
  transition:
    background 0.12s,
    color 0.12s;
}

.crm-sidebar-item:focus {
  outline: none;
}
.crm-sidebar-item:focus:not(:focus-visible) {
  outline: none;
}
.crm-sidebar-item:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.5);
  outline-offset: 2px;
}

/* Colors ONLY inside the actual navy sidebars. When SidebarLink is reused
   elsewhere (e.g. the Settings nav) these don't apply, so the caller's own
   classes control its appearance and it isn't forced to near-white text. */
.crm-sidebar .crm-sidebar-item,
.crm-mobile-sidebar .crm-sidebar-item {
  color: var(--nav-text);
}
.crm-sidebar .crm-sidebar-item:hover,
.crm-mobile-sidebar .crm-sidebar-item:hover {
  color: var(--nav-text-strong);
  background-color: var(--nav-bg-hover);
}
/* Solid blue pill, white label — the design's active treatment. It replaces a
   translucent wash + a 3px left rail, which read as two competing markers. */
.crm-sidebar .crm-sidebar-item-active,
.crm-mobile-sidebar .crm-sidebar-item-active {
  background: var(--nav-active-bg);
  color: var(--nav-text-strong);
  box-shadow: var(--nav-active-shadow);
}
.crm-sidebar .crm-sidebar-item-active:hover,
.crm-mobile-sidebar .crm-sidebar-item-active:hover {
  background: var(--nav-active-bg-hover);
  color: var(--nav-text-strong);
}

.crm-sidebar-item-inner {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  padding: 10px 13px;
  transition: padding 0.2s ease-in-out;
}
.crm-sidebar-item-collapsed .crm-sidebar-item-inner {
  justify-content: center;
  padding: 8px 0;
}

.crm-sidebar-item-main {
  display: flex;
  align-items: center;
  min-width: 0;
}

.crm-sidebar-icon {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  opacity: 0.8;
  transition: opacity 0.12s;
}
.crm-sidebar-item:hover .crm-sidebar-icon,
.crm-sidebar-item-active .crm-sidebar-icon {
  opacity: 1;
}

.crm-sidebar-label {
  margin-left: 9px;
  flex: 1;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
</style>
