<template>
  <div class="flex flex-col items-center justify-center min-h-screen bg-[var(--crm-surface-2)] p-6">
    <div class="flex flex-col items-center text-center max-w-md w-full p-8 rounded-2xl bg-[var(--crm-surface)] border border-[var(--crm-border)]/80 shadow-md space-y-5">
      <div class="flex items-center justify-center size-14 rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 shadow-sm">
        <span class="lucide-shield-alert size-7" aria-hidden="true" />
      </div>

      <div class="space-y-2">
        <h1 class="text-2xl font-bold text-[var(--crm-text)] tracking-tight">
          {{ __('Access Denied') }}
        </h1>
        <p class="text-sm text-[var(--crm-text-3)] leading-relaxed">
          {{
            __(
              'You do not have permission to access Frappe CRM. Please contact your administrator if you believe this is an error.',
            )
          }}
        </p>
      </div>

      <Button
        class="w-full"
        variant="solid"
        :label="__('Login with Different Account')"
        @click="logout.submit()"
      />
    </div>
  </div>
</template>

<script setup>
import { sessionStore } from '@/stores/session'
const { logout } = sessionStore()
</script>
