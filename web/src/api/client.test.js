import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ApiError,
  analytics,
  attempts,
  auth,
  onSessionEnded,
  questions,
  request,
} from './client.js'
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from './tokens.js'

function jsonResponse(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    text: async () => (body === undefined ? '' : JSON.stringify(body)),
  }
}

function authHeader(call) {
  return call?.[1]?.headers?.Authorization
}

beforeEach(() => {
  clearTokens()
  globalThis.fetch = vi.fn()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('request', () => {
  it('sends the access token as a bearer header', async () => {
    setTokens({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetch.mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    await request('/api/thing')

    expect(authHeader(fetch.mock.calls[0])).toBe('Bearer access-1')
  })

  it('omits the token when auth is disabled', async () => {
    setTokens({ access_token: 'access-1', refresh_token: 'refresh-1' })
    fetch.mockResolvedValueOnce(jsonResponse(200, {}))

    await request('/api/auth/login', { method: 'POST', body: {}, auth: false })

    expect(authHeader(fetch.mock.calls[0])).toBeUndefined()
  })

  it('returns null for a 204 rather than trying to parse it', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValueOnce({ status: 204, ok: true, text: async () => '' })

    await expect(request('/api/thing', { method: 'DELETE' })).resolves.toBeNull()
  })

  it('throws ApiError carrying the status and payload', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(404, { error: 'question not found' }))

    const error = await request('/api/questions/nope').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('question not found')
  })

  it('surfaces the first field error instead of an object', async () => {
    fetch.mockResolvedValueOnce(
      jsonResponse(422, { errors: { password: ['too short'] } }),
    )

    const error = await request('/api/auth/register', { auth: false }).catch((e) => e)
    expect(error.message).toBe('password: too short')
    expect(error.fieldErrors).toEqual({ password: ['too short'] })
  })

  it('does not choke on a non-JSON error body', async () => {
    fetch.mockResolvedValueOnce({
      status: 502,
      ok: false,
      text: async () => '<html>Bad Gateway</html>',
    })

    const error = await request('/api/thing', { auth: false }).catch((e) => e)
    expect(error.status).toBe(502)
  })

  it('sends FormData without forcing a JSON content type', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValueOnce(jsonResponse(200, {}))
    const form = new FormData()
    form.append('file', new Blob(['x']), 'q.csv')

    await request('/api/questions/import', { method: 'POST', body: form })

    const [, init] = fetch.mock.calls[0]
    // The browser must set the multipart boundary itself.
    expect(init.headers['Content-Type']).toBeUndefined()
    expect(init.body).toBe(form)
  })
})

describe('token refresh', () => {
  it('refreshes on 401 and replays the original request', async () => {
    setTokens({ access_token: 'stale', refresh_token: 'refresh-1' })
    fetch
      .mockResolvedValueOnce(jsonResponse(401, { error: 'token has expired' }))
      .mockResolvedValueOnce(
        jsonResponse(200, { access_token: 'fresh', refresh_token: 'refresh-2' }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { items: [] }))

    await expect(request('/api/questions')).resolves.toEqual({ items: [] })

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(authHeader(fetch.mock.calls[2])).toBe('Bearer fresh')
    // Rotation: the new pair must have replaced the old one.
    expect(getAccessToken()).toBe('fresh')
    expect(getRefreshToken()).toBe('refresh-2')
  })

  it('refreshes only once for concurrent 401s', async () => {
    // The backend revokes a refresh token when it is used. A second concurrent
    // refresh would present the revoked one and log the user out mid-test.
    setTokens({ access_token: 'stale', refresh_token: 'refresh-1' })

    let refreshCalls = 0
    fetch.mockImplementation(async (url, init) => {
      if (String(url).includes('/api/auth/refresh')) {
        refreshCalls += 1
        await new Promise((resolve) => setTimeout(resolve, 10))
        return jsonResponse(200, {
          access_token: 'fresh',
          refresh_token: 'refresh-2',
        })
      }
      return init?.headers?.Authorization === 'Bearer fresh'
        ? jsonResponse(200, { ok: true })
        : jsonResponse(401, { error: 'token has expired' })
    })

    const results = await Promise.all([
      request('/api/a'),
      request('/api/b'),
      request('/api/c'),
    ])

    expect(refreshCalls).toBe(1)
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }])
  })

  it('allows a later refresh after an earlier one finished', async () => {
    setTokens({ access_token: 'stale', refresh_token: 'refresh-1' })
    const refreshed = () =>
      jsonResponse(200, { access_token: 'fresh', refresh_token: 'refresh-2' })

    fetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(jsonResponse(200, { first: true }))
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(refreshed())
      .mockResolvedValueOnce(jsonResponse(200, { second: true }))

    await expect(request('/api/a')).resolves.toEqual({ first: true })
    await expect(request('/api/b')).resolves.toEqual({ second: true })
  })

  it('ends the session when the refresh token is rejected', async () => {
    setTokens({ access_token: 'stale', refresh_token: 'revoked' })
    const onEnded = vi.fn()
    const unsubscribe = onSessionEnded(onEnded)

    fetch
      .mockResolvedValueOnce(jsonResponse(401, {}))
      .mockResolvedValueOnce(
        jsonResponse(401, { error: 'refresh token has been revoked' }),
      )

    await expect(request('/api/questions')).rejects.toThrow()

    expect(onEnded).toHaveBeenCalled()
    expect(getRefreshToken()).toBeNull()
    unsubscribe()
  })

  it('does not attempt a refresh when there is no refresh token', async () => {
    fetch.mockResolvedValueOnce(jsonResponse(401, { error: 'authorization required' }))

    await expect(request('/api/questions')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('does not refresh for a 403, which a new token would not fix', async () => {
    setTokens({ access_token: 'good', refresh_token: 'refresh-1' })
    fetch.mockResolvedValueOnce(
      jsonResponse(403, { error: 'administrator access required' }),
    )

    await expect(request('/api/questions', { method: 'POST' })).rejects.toThrow(
      'administrator access required',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

describe('endpoint wrappers', () => {
  it('builds question filters and drops empty ones', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValueOnce(jsonResponse(200, { items: [] }))

    await questions.list({ section: 'math', domain: '', difficulty: null, page: 2 })

    const [url] = fetch.mock.calls[0]
    expect(url).toContain('section=math')
    expect(url).toContain('page=2')
    expect(url).not.toContain('domain=')
    expect(url).not.toContain('difficulty=')
  })

  it('points attempt actions at the right paths', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValue(jsonResponse(200, {}))

    await attempts.respond('att-1', 'q-9', { answer: 'B' })
    expect(fetch.mock.calls[0][0]).toBe('/api/attempts/att-1/responses/q-9')
    expect(fetch.mock.calls[0][1].method).toBe('PUT')

    await attempts.completeModule('att-1')
    expect(fetch.mock.calls[1][0]).toBe('/api/attempts/att-1/module/complete')
  })

  it('logs out without the access token, so a stale one cannot block it', async () => {
    setTokens({ access_token: 'expired', refresh_token: 'refresh-1' })
    fetch.mockResolvedValueOnce(jsonResponse(200, {}))

    await auth.logout('refresh-1')

    expect(authHeader(fetch.mock.calls[0])).toBeUndefined()
  })

  it('fetches the analytics dashboard with no query string by default', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValueOnce(jsonResponse(200, { attempts_analyzed: 0 }))

    await analytics.dashboard()

    expect(fetch.mock.calls[0][0]).toBe('/api/analytics/dashboard')
  })

  it('appends analytics params and drops empty ones', async () => {
    setTokens({ access_token: 'a', refresh_token: 'r' })
    fetch.mockResolvedValueOnce(jsonResponse(200, { attempts_analyzed: 0 }))

    await analytics.dashboard({ min_sample: 3, weak_limit: '' })

    const [url] = fetch.mock.calls[0]
    expect(url).toContain('min_sample=3')
    expect(url).not.toContain('weak_limit')
  })
})
