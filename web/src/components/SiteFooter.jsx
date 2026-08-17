/**
 * Nominative-use trademark disclaimer.
 *
 * "SAT" is College Board's registered trademark. Using the name to describe
 * what this product prepares people for is permitted nominative use, but it
 * has to be clear the mark's owner is neither affiliated with nor endorsing
 * this site - hence the second clause, which is the part that actually does
 * the work here.
 *
 * Scope note: this covers the *name* only. It is not a content licence and
 * says nothing about question provenance - see CLAUDE.md section 6.
 */
export default function SiteFooter() {
  return (
    <footer className="mt-12 border-t border-slate-200 px-4 py-6">
      <p className="mx-auto max-w-5xl text-center text-xs leading-relaxed text-ink-faint">
        SAT<sup>®</sup> is a trademark registered by the College Board, which is not
        affiliated with, and does not endorse, this site.
      </p>
    </footer>
  )
}
