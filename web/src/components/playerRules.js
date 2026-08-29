/**
 * The exam's own rules and mark formats, shared by both players.
 *
 * Data and pure functions, kept out of playerChrome.jsx so that file exports
 * only components - the same split as reviewFilters.js, and what keeps fast
 * refresh working for the components themselves.
 */

/**
 * Section directions, as the exam states them.
 *
 * Paraphrased rather than transcribed: these describe our own test's rules,
 * which happen to be the same rules, and the student needs them in front of
 * them at the moment they're deciding whether to guess.
 */
export const DIRECTIONS = {
  reading_writing: `The questions in this section address a number of important reading and writing skills. Each question includes one or more passages, which may include a table or graph. Read each passage and question carefully, then choose the best answer to the question based on the passage or passages.

All questions in this section are multiple-choice with four answer options. Each question has a single best answer.`,
  math: `The questions in this section address a number of important math skills. Use of a calculator is permitted for all questions.

For multiple-choice questions, solve each problem and choose the correct answer from the choices provided. Each of these questions has a single correct answer.

For student-produced response questions, solve each problem and enter your answer. If your answer is a fraction that doesn't fit in the space provided, enter the decimal equivalent. If your answer is a decimal that doesn't fit, enter it by truncating or rounding at the fourth digit. If a question asks for a value with a unit, enter only the number.

Unless otherwise indicated: variables and expressions represent real numbers, figures are drawn to scale, and the domain of a given function is the set of all real numbers for which the function is defined.`,
}

/**
 * The `annotations` column carries two different tools' marks in one array -
 * the server stores it opaquely and never looks inside (see
 * backend/app/models/attempt.py), so the split has to happen here. Highlights
 * are keyed by character offset; cross-outs by choice id.
 */
export function splitAnnotations(annotations) {
  const list = Array.isArray(annotations) ? annotations : []
  return {
    highlights: list.filter((a) => a.kind !== 'eliminated'),
    eliminated: list.filter((a) => a.kind === 'eliminated').map((a) => a.choice),
  }
}

export function seatLabel(response, i) {
  return `Question ${i + 1}${response.answered ? ', answered' : ', unanswered'}${
    response.flagged ? ', marked for review' : ''
  }`
}
