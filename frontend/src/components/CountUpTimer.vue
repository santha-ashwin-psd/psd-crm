<template>
  <slot />
</template>

<script setup>
import { ref } from 'vue'

const hours = ref(0)
const minutes = ref(0)
const seconds = ref(0)
const timer = ref(null)
const updatedTime = ref('0:00')

function startCounter() {
  updatedTime.value = getTime()
}

function start() {
  timer.value = setInterval(() => startCounter(), 1000)
}

function stop() {
  clearInterval(timer.value)
  let output = updatedTime.value
  hours.value = 0
  minutes.value = 0
  seconds.value = 0
  updatedTime.value = '0:00'
  return output
}

function getTime(_seconds = 0) {
  if (_seconds) {
    if (typeof _seconds === 'string') {
      _seconds = parseInt(_seconds)
    }
    seconds.value = _seconds

    if (seconds.value >= 60) {
      minutes.value = Math.floor(seconds.value / 60)
      seconds.value = seconds.value % 60
    } else {
      minutes.value = 0
    }

    if (minutes.value >= 60) {
      hours.value = Math.floor(minutes.value / 60)
      minutes.value = minutes.value % 60
    } else {
      hours.value = 0
    }
  }

  if (seconds.value === 59) {
    seconds.value = 0
    minutes.value = minutes.value + 1
    seconds.value--
  }
  if (minutes.value === 60) {
    minutes.value = 0
    hours.value = hours.value + 1
  }
  seconds.value++

  // Pad once, from the numbers. The previous version padded `secondsCount` to
  // a string first ('05') and then re-tested `secondsCount < 10`, which coerces
  // '05' back to 5 and pads a second time — so any call past an hour showed
  // "1:00:005" whenever the seconds were single digit.
  const hoursCount = hours.value > 0 ? hours.value + ':' : ''
  const minutesCount = hoursCount
    ? String(minutes.value).padStart(2, '0')
    : String(minutes.value)
  const secondsCount = String(seconds.value).padStart(2, '0')

  return hoursCount + minutesCount + ':' + secondsCount
}

defineExpose({ start, stop, getTime, updatedTime })
</script>
