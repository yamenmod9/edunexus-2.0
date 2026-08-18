import MathText from './MathText.jsx'

/**
 * The formula sheet the digital SAT provides in every maths module.
 *
 * These are the standard geometry reference facts the exam supplies — areas,
 * volumes, the special right triangles, the circle relationships. They are
 * mathematical facts rather than exam content, which is why reproducing them
 * is fine where reproducing questions is not (CLAUDE.md section 6).
 */

const GROUPS = [
  {
    title: 'Circles',
    items: [
      { label: 'Area', formula: 'A = \\pi r^2' },
      { label: 'Circumference', formula: 'C = 2\\pi r' },
      { label: 'Arc length', formula: 's = r\\theta' },
      { label: 'Radians in a circle', formula: '2\\pi' },
      { label: 'Degrees in a circle', formula: '360' },
    ],
  },
  {
    title: 'Triangles',
    items: [
      { label: 'Area', formula: 'A = \\tfrac{1}{2}bh' },
      { label: 'Pythagorean theorem', formula: 'a^2 + b^2 = c^2' },
      { label: 'Special right triangle', formula: '30^\\circ\\!-\\!60^\\circ\\!-\\!90^\\circ:\\ x,\\ x\\sqrt{3},\\ 2x' },
      { label: 'Special right triangle', formula: '45^\\circ\\!-\\!45^\\circ\\!-\\!90^\\circ:\\ s,\\ s,\\ s\\sqrt{2}' },
      { label: 'Sum of interior angles', formula: '180^\\circ' },
    ],
  },
  {
    title: 'Rectangles and boxes',
    items: [
      { label: 'Area of a rectangle', formula: 'A = \\ell w' },
      { label: 'Volume of a box', formula: 'V = \\ell w h' },
    ],
  },
  {
    title: 'Solids',
    items: [
      { label: 'Cylinder', formula: 'V = \\pi r^2 h' },
      { label: 'Sphere', formula: 'V = \\tfrac{4}{3}\\pi r^3' },
      { label: 'Cone', formula: 'V = \\tfrac{1}{3}\\pi r^2 h' },
      { label: 'Pyramid', formula: 'V = \\tfrac{1}{3}\\ell w h' },
    ],
  },
]

export default function ReferenceSheet() {
  return (
    <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
      {GROUPS.map((group) => (
        <section key={group.title}>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
            {group.title}
          </h3>
          <dl className="space-y-1.5">
            {group.items.map((item) => (
              <div key={`${group.title}-${item.label}-${item.formula}`} className="flex gap-3">
                <dt className="w-40 flex-shrink-0 text-xs text-ink-soft">{item.label}</dt>
                <dd className="text-sm">
                  <MathText>{`$${item.formula}$`}</MathText>
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}
