import MathText from './MathText.jsx'

/**
 * The student-produced response rules, shown beside every grid-in question.
 *
 * The real exam keeps these on screen for the whole of a grid-in rather than
 * behind the Directions button, because they are not orientation you read once
 * — they are the format rules you check *while* typing an answer, and a
 * student who writes 2/3 as 0.66 loses a question they solved correctly.
 *
 * These are our test's answer-entry rules, paraphrased, not transcribed
 * (CLAUDE.md section 6). The examples are arithmetic.
 */

const RULES = [
  'If you find more than one correct answer, enter only one of them.',
  'You can enter up to 5 characters for a positive answer and up to 6 characters (including the minus sign) for a negative answer.',
  'If your answer is a fraction that doesn’t fit in the space provided, enter the decimal equivalent instead.',
  'If your answer is a decimal that doesn’t fit, enter it by truncating or rounding at the fourth digit.',
  'If your answer is a mixed number, enter it as an improper fraction or its decimal equivalent.',
  'If the question asks for a value with a unit, enter only the number.',
  'Don’t enter symbols such as a percent sign, comma or dollar sign.',
]

// String.raw, because a plain quoted string would let JavaScript eat the
// LaTeX backslash: '1\tfrac{1}{2}' is a TAB followed by "frac12".
const EXAMPLES = [
  { answer: '3.5', accepted: '3.5, 7/2' },
  { answer: '2/3', accepted: '2/3, .6666, 0.6667' },
  { answer: '-1/3', accepted: '-1/3, -.3333, -0.333' },
  { answer: String.raw`1\tfrac{1}{2}`, accepted: '3/2, 1.5' },
]

export default function GridInDirections() {
  return (
    <div>
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Student-produced response directions
      </p>

      <ul className="mb-6 space-y-2 text-[13.5px] leading-relaxed text-ink-soft">
        {RULES.map((rule) => (
          <li key={rule} className="flex gap-2.5">
            <span aria-hidden="true" className="mt-[9px] h-1 w-1 flex-shrink-0 rounded-full bg-line-strong" />
            <span>{rule}</span>
          </li>
        ))}
      </ul>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-faint">
        Examples
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13px]">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-ink-faint">
              <th scope="col" className="py-1.5 pr-4 font-semibold">Answer</th>
              <th scope="col" className="py-1.5 font-semibold">Acceptable entries</th>
            </tr>
          </thead>
          <tbody>
            {EXAMPLES.map((example) => (
              <tr key={example.answer} className="border-b border-line">
                <td className="py-2 pr-4 align-top">
                  <MathText>{`$${example.answer}$`}</MathText>
                </td>
                <td className="py-2 align-top font-mono text-[12.5px] text-ink-soft">
                  {example.accepted}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
