import { ref } from 'vue'

export const isCommandPaletteOpen = ref(false)

export function toggleCommandPalette() {
  isCommandPaletteOpen.value = !isCommandPaletteOpen.value
}
