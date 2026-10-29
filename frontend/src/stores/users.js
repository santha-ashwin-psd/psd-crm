import { defineStore } from 'pinia'
import { createResource } from 'frappe-ui'
import { sessionStore } from './session'
import { computed, reactive } from 'vue'
import { useRouter } from 'vue-router'

export const usersStore = defineStore('crm-users', () => {
  const session = sessionStore()

  let usersByName = reactive({})
  const router = useRouter()

  // Fast initial fetch — returns only the ~few CRM users so the UI is
  // interactive immediately. Non-CRM user profile data is filled in
  // afterwards by the background `usersFull` fetch (and by `get_user_info`
  // for the race window before that lands).
  const users = createResource({
    url: 'xbr_crm.api.session.get_users',
    cache: 'crm-users',
    initialData: [],
    auto: true,
    transform([allUsers, crmUsers]) {
      allUsers = normalizeUsers(allUsers)
      crmUsers = normalizeUsers(crmUsers)
      for (let user of allUsers) {
        usersByName[user.name] = user
        if (user.name === 'Administrator') {
          usersByName[user.email] = user
        }
      }
      return { allUsers, crmUsers }
    },
    onError(error) {
      if (error && error.exc_type === 'AuthenticationError') {
        router.push('/login')
      }
    },
    onSuccess() {
      scheduleBackgroundFetch()
    },
  })

  // Background full-list fetch fired on browser idle. Only System Manager
  // sessions receive a larger payload here; for others the server returns
  // the same crm-users-only list. Populates usersByName so existing
  // getUser(email) call sites keep working for non-CRM emails (comment
  // authors, doc owners, email recipient typeahead, etc.).
  const usersFull = createResource({
    url: 'xbr_crm.api.session.get_users',
    params: { include_all: 1 },
    cache: 'crm-users-full',
    auto: false,
    transform([allUsers]) {
      allUsers = normalizeUsers(allUsers)
      for (let user of allUsers) {
        // upgrade partial get_user_info so always full record is used
        const existing = usersByName[user.name]
        if (existing) {
          Object.assign(existing, mergeUser(existing, user))
        } else {
          usersByName[user.name] = user
        }
      }
      return { allUsers }
    },
  })

  let backgroundFetchScheduled = false
  function scheduleBackgroundFetch() {
    if (backgroundFetchScheduled) return
    backgroundFetchScheduled = true
    const fire = () => usersFull.fetch()
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(fire, { timeout: 5000 })
    } else {
      setTimeout(fire, 2000)
    }
  }

  // Coalesced on-demand resolver. Used when getUser(email) is called for
  // an email that the fast fetch did not cover and the background full
  // fetch has not yet landed.
  const pendingResolves = new Set()
  let flushScheduled = false

  function queueResolve(email) {
    pendingResolves.add(email)
    if (flushScheduled) return
    flushScheduled = true
    queueMicrotask(flush)
  }

  async function flush() {
    flushScheduled = false
    if (!pendingResolves.size) return
    const batch = [...pendingResolves]
    pendingResolves.clear()
    try {
      const r = createResource({
        url: 'xbr_crm.api.session.get_user_info',
        params: { users: batch },
        auto: false,
      })
      const records = await r.fetch()
      for (const u of normalizeUsers(records || [])) {
        usersByName[u.name] = mergeUser(usersByName[u.name], u)
      }
    } catch {
      // best-effort — the synthesized stub remains on failure
    }
  }

  function getUser(email) {
    if (!email || email === 'sessionUser') {
      email = session.user
    }
    if (!usersByName[email]) {
      usersByName[email] = {
        name: email,
        email: email,
        full_name: email.split('@')[0],
        first_name: email.split('@')[0],
        last_name: '',
        user_image: null,
        role: null,
      }
      // Try to upgrade the stub via a batched fetch unless the full list
      // has already arrived.
      if (!usersFull.data) {
        queueResolve(email)
      }
    }
    return usersByName[email]
  }

  function isAdmin(email) {
    return getUser(email).role === 'System Manager'
  }

  // Tenant admin. Their Frappe `role` is the derived "Sales Manager", so
  // isAdmin() (System Manager only) is false for them; the tenancy role lives
  // in `crm_role` (see xbr_crm/api/session.py).
  function isCompanyAdmin(email) {
    return getUser(email).crm_role === 'Company Admin'
  }

  // Can assign Manager / Company Admin roles (platform admin or company admin).
  function canManageRoles(email) {
    return isAdmin(email) || isCompanyAdmin(email)
  }

  function isManager(email) {
    return getUser(email).role === 'Sales Manager' || isAdmin(email)
  }

  function isWebsiteUser(email) {
    return getUser(email).user_type === 'Website User'
  }

  function isSalesUser(email) {
    return getUser(email).role === 'Sales User'
  }

  function isTelephonyAgent(email) {
    return getUser(email).is_telephony_agent
  }

  function getUserRole(email) {
    const user = getUser(email)
    if (user && user.role) {
      return user.role
    }
    return null
  }

  const isCrmUser = (user) => {
    user = user || session.user
    return users.data.crmUsers?.find((u) => u.name === user)
  }

  return {
    users,
    usersFull,
    allUsers: computed(() => usersFull.data?.allUsers || users.data?.allUsers),
    crmUsers: computed(() => users.data?.crmUsers),
    getUser,
    isAdmin,
    isCompanyAdmin,
    canManageRoles,
    isManager,
    isSalesUser,
    isTelephonyAgent,
    getUserRole,
    isWebsiteUser,
    isCrmUser,
  }
})

// Merge a later, possibly partial record over one we already hold.
// `normalizeUser` always fabricates a `full_name` when the payload lacks one,
// falling back to the identifier — so a plain spread lets a partial response
// overwrite a real name ("Bob Brown") with an email address. Both fetch paths
// exist to enrich the record, never to degrade it.
function mergeUser(existing, incoming) {
  const merged = { ...existing, ...incoming }
  const incomingNameIsFallback =
    incoming.full_name === incoming.name ||
    incoming.full_name === incoming.email
  if (existing?.full_name && incomingNameIsFallback) {
    merged.full_name = existing.full_name
  }
  return merged
}

function normalizeUsers(users) {
  return (users || []).filter(Boolean).map((user) => normalizeUser(user))
}

function normalizeUser(user) {
  const name = user.name || user.email || ''
  const email = user.email || name
  const fallbackName = name || email

  return {
    ...user,
    name,
    email,
    full_name: user.full_name?.trim() || fallbackName,
  }
}