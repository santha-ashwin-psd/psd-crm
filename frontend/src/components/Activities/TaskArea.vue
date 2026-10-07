<template>
  <div v-if="tasks.length" class="flex flex-col gap-4">
    <div v-for="task in tasks" :key="task.name">
      <div
        class="activity bg-[var(--crm-surface)] border border-[var(--crm-border)] border-l-4 border-l-purple-500 hover:border-purple-400 hover:shadow-md transition-all duration-200 rounded-2xl p-4 shadow-sm flex items-start gap-4 cursor-pointer"
        @click="modalRef.showTask(task)"
      >
        <!-- Custom bounce-animated checkbox -->
        <div class="pt-0.5 shrink-0" @click.stop>
          <input
            type="checkbox"
            :checked="task.status === 'Done'"
            class="task-checkbox size-5 rounded-md border-[var(--crm-border-strong)] text-purple-600 focus:ring-purple-500 cursor-pointer"
            @change="
              modalRef.updateTaskStatus(
                task.status === 'Done' ? 'Todo' : 'Done',
                task,
              )
            "
          />
        </div>

        <div class="flex flex-1 flex-col gap-2 text-base truncate">
          <div
            class="font-medium text-[var(--crm-text)] truncate"
            :class="{
              'line-through !text-[var(--crm-text-4)]': task.status === 'Done',
            }"
          >
            {{ task.title }}
          </div>
          <div
            class="flex flex-wrap items-center gap-2.5 text-[var(--crm-text-3)]"
          >
            <div
              class="flex items-center gap-1.5 text-xs text-[var(--crm-text-2)]"
            >
              <UserAvatar :user="task.assigned_to" size="xs" />
              {{ getUser(task.assigned_to).full_name }}
            </div>

            <div v-if="task.due_date">
              <Tooltip
                :text="formatDate(task.due_date, 'ddd, MMM D, YYYY | hh:mm a')"
              >
                <div
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-xs"
                  :class="
                    isOverdue(task.due_date, task.status)
                      ? 'bg-red-50 text-red-800 border-red-200'
                      : 'bg-[var(--crm-surface-2)] text-[var(--crm-text-2)] border-[var(--crm-border)]'
                  "
                >
                  <CalendarIcon class="size-3.5" />
                  <div>{{ formatDate(task.due_date, 'D MMM, hh:mm a') }}</div>
                </div>
              </Tooltip>
            </div>

            <!-- WCAG-compliant high-contrast priority badge -->
            <div
              class="px-2.5 py-0.5 rounded-full text-xs font-semibold border"
              :class="{
                'bg-red-50 text-red-800 border-red-200':
                  task.priority === 'High',
                'bg-amber-50 text-amber-800 border-amber-200':
                  task.priority === 'Medium',
                'bg-[var(--crm-surface-2)] text-[var(--crm-text-2)] border-[var(--crm-border)]':
                  task.priority === 'Low',
              }"
            >
              {{ task.priority }}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-1 shrink-0" @click.stop>
          <Dropdown
            :options="taskStatusOptions(modalRef.updateTaskStatus, task)"
          >
            <Button
              :tooltip="__('Change Status')"
              variant="ghost"
              class="hover:bg-[var(--crm-surface-2)]"
            >
              <TaskStatusIcon :status="task.status" />
            </Button>
          </Dropdown>
          <Dropdown
            :options="[
              {
                label: __('Delete'),
                icon: 'trash-2',
                onClick: () => {
                  $dialog({
                    title: __('Delete Task'),
                    message: __('Are you sure you want to delete this task?'),
                    actions: [
                      {
                        label: __('Delete'),
                        theme: 'red',
                        variant: 'solid',
                        onClick(close) {
                          modalRef.deleteTask(task.name)
                          close()
                        },
                      },
                    ],
                  })
                },
              },
            ]"
          >
            <Button
              icon="lucide-more-horizontal"
              variant="ghost"
              class="hover:bg-[var(--crm-surface-2)] text-[var(--crm-text-2)]"
            />
          </Dropdown>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import CalendarIcon from '@/components/Icons/CalendarIcon.vue'
import TaskStatusIcon from '@/components/Icons/TaskStatusIcon.vue'
import UserAvatar from '@/components/UserAvatar.vue'
import { formatDate, taskStatusOptions } from '@/utils'
import { usersStore } from '@/stores/users'
import { globalStore } from '@/stores/global'
import { Tooltip, Dropdown } from 'frappe-ui'

defineProps({
  tasks: { type: Array, default: () => [] },
  modalRef: { type: Object, default: () => ({}) },
})

const { getUser } = usersStore()
const { $dialog } = globalStore()

const isOverdue = (dueDate, status) => {
  if (!dueDate || status === 'Done') return false
  return new Date(dueDate) < new Date()
}
</script>
