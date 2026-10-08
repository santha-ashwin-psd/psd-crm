export function allTimeSlots() {
  const out = []
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hh = String(h).padStart(2, '0')
      const mm = String(m).padStart(2, '0')
      const ampm = h >= 12 ? 'pm' : 'am'
      const hour12 = h % 12 === 0 ? 12 : h % 12
      out.push({
        value: `${hh}:${mm}`,
        label: `${hour12}:${mm} ${ampm}`,
      })
    }
  }
  return out
}

export function min(notification) {
  if (notification.interval === 'minutes') return 5
  return 1
}

export function max(notification) {
  if (notification.interval === 'minutes') return 3600
  if (notification.interval === 'hours') return 3600
  if (notification.interval === 'days') return 28
  return 4
}

export function handleIntervalChange(notification) {
  if (notification.interval === 'minutes') {
    if (notification.before < 5) notification.before = 5
    if (notification.before > 3600) notification.before = 3600
    if (notification.before % 5 !== 0)
      notification.before = Math.round(notification.before / 5) * 5
  } else if (notification.interval === 'hours') {
    if (notification.before < 1) notification.before = 1
    if (notification.before > 3600) notification.before = 3600
  } else if (notification.interval === 'days') {
    if (notification.before < 1) notification.before = 1
    if (notification.before > 28) notification.before = 28
  } else if (notification.interval === 'weeks') {
    if (notification.before < 1) notification.before = 1
    if (notification.before > 4) notification.before = 4
  }
}

const REMINDER_UNITS = {
  minutes: ['minute', 'minutes'],
  hours: ['hour', 'hours'],
  days: ['day', 'days'],
  weeks: ['week', 'weeks'],
}

export function formatReminderTime(time) {
  const [hours, minutes] = (time || '08:00').split(':').map(Number)
  const period = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 || 12}:${String(minutes).padStart(2, '0')} ${period}`
}

// "10 minutes before, 1 day before at 8:00 am" — one entry per reminder.
export function reminderSummary(reminders = [], isAllDay = false) {
  return (reminders || [])
    .map((n) => {
      const [one, many] = REMINDER_UNITS[n.interval] || ['', '']
      const unit = n.before == 1 ? __(one) : __(many)
      const text = __('{0} {1} before', [n.before, unit])
      return isAllDay
        ? __('{0} at {1}', [text, formatReminderTime(n.time)])
        : text
    })
    .join(', ')
}
