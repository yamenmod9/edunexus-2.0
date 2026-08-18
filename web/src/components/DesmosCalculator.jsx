import { useEffect, useRef, useState } from 'react'

/**
 * The Desmos graphing calculator, as Bluebook embeds it in the math modules.
 *
 * Licensing note, in the spirit of CLAUDE.md section 6: Desmos publishes a
 * demo API key in its own documentation for evaluation, and that is the
 * default here. It is *their* key, not ours — before this goes in front of
 * real students, request a free key at https://www.desmos.com/api and set
 * `VITE_DESMOS_API_KEY`. That is a terms-of-use decision, not a coding one.
 *
 * The script is fetched on first use rather than in index.html: it is a few
 * hundred KB that only ever matters in a math module, and most of what this
 * app does is reading and writing.
 */

const DESMOS_SRC = 'https://www.desmos.com/api/v1.11/calculator.js'
const DEMO_KEY = 'dcb31709b452b1cf9dc26972add0fda6'

let scriptPromise = null

/** One shared load. Mounting the panel twice must not fetch it twice. */
function loadDesmos(apiKey) {
  if (window.Desmos) return Promise.resolve(window.Desmos)
  if (scriptPromise) return scriptPromise

  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = `${DESMOS_SRC}?apiKey=${encodeURIComponent(apiKey)}`
    script.async = true
    script.onload = () =>
      window.Desmos ? resolve(window.Desmos) : reject(new Error('Desmos did not load'))
    script.onerror = () => {
      // Let a later mount try again — a failed load is usually the network,
      // not something permanent.
      scriptPromise = null
      reject(new Error('Could not reach Desmos'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export default function DesmosCalculator({ className = 'h-[480px]' }) {
  const host = useRef(null)
  const calculator = useRef(null)
  const [error, setError] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const apiKey = import.meta.env.VITE_DESMOS_API_KEY || DEMO_KEY

    loadDesmos(apiKey)
      .then((Desmos) => {
        if (cancelled || !host.current) return
        calculator.current = Desmos.GraphingCalculator(host.current, {
          // Close to Bluebook's build: the expression list and keypad are
          // there, but nothing that leaves the page — no saving, no sharing,
          // no settings menu to change units mid-test.
          expressions: true,
          keypad: true,
          settingsMenu: false,
          zoomButtons: true,
          expressionsTopbar: false,
          border: false,
        })
        setReady(true)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })

    return () => {
      cancelled = true
      calculator.current?.destroy()
      calculator.current = null
    }
  }, [])

  if (error) {
    return (
      <div className={`flex items-center justify-center p-6 text-sm text-ink-faint ${className}`}>
        {error}. The rest of the question still works.
      </div>
    )
  }

  // The name goes on a <section>, not on the host div: Desmos owns everything
  // inside that div, and aria-label on a role-less generic element is ignored
  // anyway. The host needs a real height — Desmos measures its container and
  // renders nothing at all in a zero-height one.
  return (
    <section
      aria-label="Graphing calculator"
      className={`relative overflow-hidden rounded-md ring-1 ring-line ${className}`}
    >
      {/* The bundle is several megabytes, so the first open is a visible wait.
          An empty bordered box reads as broken; saying so does not. */}
      {!ready && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-ink-faint">
          Loading the calculator…
        </p>
      )}
      <div ref={host} className="h-full w-full" />
    </section>
  )
}
