/**
 * API client.
 *
 * One job beyond wrapping fetch: transparently refreshing an expired access
 * token and replaying the request.
 *
 * The subtle part is that the backend ROTATES refresh tokens - refreshing
 * revokes the token you presented and issues a new one. So if two requests
 * 401 at the same moment and each fires its own refresh, the second presents a
 * token the first already revoked, that refresh fails, and the user is logged
 * out mid-test. Refresh is therefore single-flight: the first 401 starts a
 * refresh, every other caller awaits that same promise. This is a correctness
 * requirement, not a performance optimisation.
 */

import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from './tokens.js'

// Empty in dev: Vite proxies /api to the backend so requests stay same-origin.
const BASE_URL = (import.meta.env?.VITE_API_URL ?? '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }

  /** Field-level validation errors, as marshmallow returns them. */
  get fieldErrors() {
    return this.payload?.errors ?? null
  }
}

let refreshPromise = null
const sessionEndedHandlers = new Set()

/** Notified when the session cannot be recovered, so the app can redirect. */
export function onSessionEnded(handler) {
  sessionEndedHandlers.add(handler)
  return () => sessionEndedHandlers.delete(handler)
}

function endSession() {
  clearTokens()
  for (const handler of sessionEndedHandlers) handler()
}

async function parseBody(response) {
  if (response.status === 204) return null
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { error: text }
  }
}

function errorMessage(payload, response) {
  if (payload?.error) return payload.error
  if (payload?.errors) {
    // Surface the first field error rather than "[object Object]".
    const [field, messages] = Object.entries(payload.errors)[0] ?? []
    if (field) {
      const detail = Array.isArray(messages) ? messages[0] : messages
      return `${field}: ${detail}`
    }
  }
  return `Request failed (${response.status})`
}

async function rawRequest(path, { method = 'GET', body, token, signal } = {}) {
  const headers = {}
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = `Bearer ${token}`

  return fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    signal,
    body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
  })
}

/**
 * Refreshes the token pair. Concurrent callers share one in-flight request -
 * see the note at the top of this file about rotation.
 */
function refreshTokens() {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refresh_token = getRefreshToken()
    if (!refresh_token) throw new ApiError('No session', { status: 401 })

    const response = await rawRequest('/api/auth/refresh', {
      method: 'POST',
      body: { refresh_token },
    })
    const payload = await parseBody(response)
    if (!response.ok) {
      throw new ApiError(errorMessage(payload, response), {
        status: response.status,
        payload,
      })
    }
    setTokens(payload)
    return payload.access_token
  })()

  // Clear the slot however it settles, so a later 401 can refresh again.
  refreshPromise.catch(() => {}).finally(() => {
    refreshPromise = null
  })

  return refreshPromise
}

/**
 * @param {string} path
 * @param {object} [options]
 * @param {boolean} [options.auth=true] send the access token and refresh on 401
 */
export async function request(path, options = {}) {
  const { auth = true, ...rest } = options

  let response = await rawRequest(path, {
    ...rest,
    token: auth ? getAccessToken() : undefined,
  })

  if (response.status === 401 && auth && getRefreshToken()) {
    try {
      const token = await refreshTokens()
      response = await rawRequest(path, { ...rest, token })
    } catch {
      // The refresh token is gone, expired or revoked. Nothing left to try.
      endSession()
    }
  }

  const payload = await parseBody(response)
  if (!response.ok) {
    if (response.status === 401 && auth) endSession()
    throw new ApiError(errorMessage(payload, response), {
      status: response.status,
      payload,
    })
  }
  return payload
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
}

// --- endpoints ------------------------------------------------------------
// Named wrappers so screens never assemble URLs, and a route change is a
// one-line edit here.

export const auth = {
  register: (email, password) =>
    request('/api/auth/register', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  login: (email, password) =>
    request('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  me: () => api.get('/api/auth/me'),
  logout: (refresh_token) =>
    request('/api/auth/logout', {
      method: 'POST',
      body: { refresh_token },
      auth: false,
    }),
  changePassword: (current_password, new_password) =>
    api.post('/api/auth/password', { current_password, new_password }),
}

/**
 * Filters serialise with one entry per value, so `{domain: ['algebra','geometry']}`
 * becomes `?domain=algebra&domain=geometry` — which is how the practice
 * browser asks for several categories at once. Empty values are dropped
 * rather than sent, because `?domain=` would otherwise read as a real filter.
 */
function toQuery(params) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      if (item !== '' && item != null) query.append(key, item)
    }
  }
  return query
}

export const questions = {
  list: (params = {}) => api.get(`/api/questions?${toQuery(params)}`),
  counts: (params = {}) => api.get(`/api/questions/counts?${toQuery(params)}`),
  get: (id) => api.get(`/api/questions/${id}`),
  // `extra` carries seconds_spent, which the backend records as a practice
  // response. Optional so callers that only want the grade stay one argument.
  check: (id, answer, extra = {}) =>
    api.post(`/api/questions/${id}/check`, { answer, ...extra }),
  create: (payload) => api.post('/api/questions', payload),
  update: (id, payload) => api.patch(`/api/questions/${id}`, payload),
  remove: (id) => api.delete(`/api/questions/${id}`),
  importFile: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/questions/import', { method: 'POST', body: form })
  },
}

export const taxonomy = {
  get: () => api.get('/api/taxonomy'),
}

export const forms = {
  list: () => api.get('/api/forms'),
  get: (id) => api.get(`/api/forms/${id}`),
  create: (payload) => api.post('/api/forms', payload),
}

export const analytics = {
  dashboard: (params = {}) => {
    const query = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v != null),
    )
    const suffix = query.toString()
    return api.get(`/api/analytics/dashboard${suffix ? `?${suffix}` : ''}`)
  },
}

export const attempts = {
  start: (form_id) => api.post('/api/attempts', { form_id }),
  list: () => api.get('/api/attempts'),
  current: () => api.get('/api/attempts/current'),
  get: (id) => api.get(`/api/attempts/${id}`),
  respond: (id, questionId, payload) =>
    api.put(`/api/attempts/${id}/responses/${questionId}`, payload),
  completeModule: (id) => api.post(`/api/attempts/${id}/module/complete`),
  submit: (id) => api.post(`/api/attempts/${id}/submit`),
  abandon: (id) => api.post(`/api/attempts/${id}/abandon`),
  review: (id) => api.get(`/api/attempts/${id}/review`),
  score: (id) => api.get(`/api/attempts/${id}/score`),
}
