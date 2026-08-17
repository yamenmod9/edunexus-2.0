"""Generates original math items for the question bank.

Why a generator rather than hand-authored items: every answer here is
*computed* from the same parameters that build the question, so a key cannot
disagree with its stem. Hand-authoring N items means N chances to mistype an
answer, catchable only by driving a full test. This is correct by construction.

Distractors are modelled on real student errors - sign slips, forgetting to
distribute, inverting a rate, using radius where diameter belongs - rather than
random near-misses, because a distractor nobody would pick teaches nothing.

Usage:
    python -m scripts.generate_math_bank --count 200 --seed 7 \
        --out data/question_bank/math_generated.json
"""

import argparse
import json
import random
from fractions import Fraction

TEMPLATES = []


def template(domain, skill, difficulty):
    """Registers a generator fn(rng) -> question dict (minus taxonomy fields)."""

    def decorator(fn):
        TEMPLATES.append(
            {"domain": domain, "skill": skill, "difficulty": difficulty, "fn": fn}
        )
        return fn

    return decorator


def mc(stem, correct, distractors, rationale, rng, stimulus=None, fmt=str):
    """Builds a 4-choice item, shuffling so the key is not always in one slot.

    Returns None if distinct distractors cannot be produced, which lets a
    template bail on an unlucky parameter draw rather than emit a broken item
    with duplicate choices.
    """
    options, seen = [correct], {fmt(correct)}
    for d in distractors:
        text = fmt(d)
        if text not in seen:
            seen.add(text)
            options.append(d)
        if len(options) == 4:
            break
    if len(options) < 4:
        return None

    rng.shuffle(options)
    ids = "ABCD"
    return {
        "question_type": "multiple_choice",
        "stimulus": stimulus,
        "stem": stem,
        "choices": [{"id": ids[i], "text": fmt(v)} for i, v in enumerate(options)],
        "correct_answer": ids[options.index(correct)],
        "rationale": rationale,
    }


def grid(stem, correct, rationale, stimulus=None):
    return {
        "question_type": "grid_in",
        "stimulus": stimulus,
        "stem": stem,
        "choices": None,
        "correct_answer": str(correct),
        "rationale": rationale,
    }


def money(v):
    # Escaped: a bare $ would pair with another price on the same line
    # and be read as a math delimiter. See web/src/components/MathText.jsx.
    return f"\\${v:,}"


def frac(n, d):
    """Renders a reduced fraction in LaTeX, or an integer when it reduces."""
    f = Fraction(n, d)
    if f.denominator == 1:
        return str(f.numerator)
    return f"\\frac{{{f.numerator}}}{{{f.denominator}}}"


# --- Algebra -----------------------------------------------------------


@template("algebra", "Linear equations in one variable", "easy")
def t_lin_one(rng):
    a, x = rng.randint(2, 9), rng.randint(2, 12)
    b = rng.randint(2, 20)
    c = a * x + b
    return mc(
        f"If ${a}x + {b} = {c}$, what is the value of $x$?",
        x,
        [x + 1, x - 1, c - b, a + b],
        f"Subtract {b} from both sides: ${a}x = {c - b}$. Divide by {a}: $x = {x}$.",
        rng,
    )


@template("algebra", "Linear functions", "easy")
def t_eval_linear(rng):
    m, b, k = rng.randint(2, 9), rng.randint(-9, 9), rng.randint(2, 9)
    y = m * k + b
    return mc(
        f"The function $f$ is defined by $f(x) = {m}x {'+' if b >= 0 else '-'} {abs(b)}$. "
        f"What is the value of $f({k})$?",
        y,
        [m * k - b, m + k + b, y + m, m * k],
        f"Substitute {k} for $x$: $f({k}) = {m}({k}) {'+' if b >= 0 else '-'} {abs(b)} = {y}$.",
        rng,
    )


@template("algebra", "Linear equations in two variables", "easy")
def t_slope(rng):
    x1, y1 = rng.randint(-6, 6), rng.randint(-9, 9)
    dx = rng.choice([1, 2, 3, 4])
    m = rng.choice([-4, -3, -2, 2, 3, 4, 5])
    x2, y2 = x1 + dx, y1 + m * dx
    return mc(
        f"A line in the $xy$-plane passes through the points $({x1}, {y1})$ and "
        f"$({x2}, {y2})$. What is the slope of this line?",
        m,
        [-m, y2 - y1, x2 - x1, m + 1],
        f"Slope is the change in $y$ over the change in $x$: "
        f"$\\frac{{{y2} - ({y1})}}{{{x2} - ({x1})}} = \\frac{{{y2 - y1}}}{{{dx}}} = {m}$.",
        rng,
    )


@template("algebra", "Linear equations in one variable", "easy")
def t_lin_grid(rng):
    d, k = rng.choice([2, 3, 4, 5]), rng.randint(3, 15)
    b = rng.randint(2, 12)
    x = d * k
    return grid(
        f"If $\\frac{{x}}{{{d}}} + {b} = {k + b}$, what is the value of $x$?",
        x,
        f"Subtract {b} from both sides: $\\frac{{x}}{{{d}}} = {k}$. "
        f"Multiply by {d}: $x = {x}$.",
    )


@template("algebra", "Linear inequalities in one or two variables", "easy")
def t_ineq(rng):
    a, bound = rng.randint(2, 6), rng.randint(3, 12)
    b = rng.randint(1, 15)
    c = a * bound + b
    return mc(
        f"Which of the following is a solution to the inequality ${a}x + {b} < {c}$?",
        bound - 1,
        [bound, bound + 1, bound + 2, bound + 3],
        f"Subtract {b}: ${a}x < {c - b}$, so $x < {bound}$. "
        f"Of the options, only {bound - 1} is less than {bound}.",
        rng,
    )


@template("algebra", "Systems of two linear equations in two variables", "easy")
def t_system_add(rng):
    x, y = rng.randint(2, 12), rng.randint(1, 10)
    s, d = x + y, x - y
    return mc(
        f"$$x + y = {s}$$\n$$x - y = {d}$$\nWhat is the value of $x$ in the solution "
        f"to the system of equations above?",
        x,
        [y, s, d, x + 1],
        f"Add the two equations: $2x = {s + d}$, so $x = {x}$.",
        rng,
    )


@template("algebra", "Linear functions", "easy")
def t_fee_rate(rng):
    fee, rate = rng.choice([25, 30, 40, 45, 50, 60]), rng.choice([15, 20, 25, 30, 35])
    return mc(
        "Which equation gives the total charge $C$, in dollars, for a service call "
        "lasting $h$ hours?",
        f"$C = {rate}h + {fee}$",
        [f"$C = {fee}h + {rate}$", f"$C = {fee + rate}h$", f"$C = {fee} + {rate} + h$"],
        f"The \\${rate} hourly rate multiplies the hours $h$, and the flat \\${fee} fee "
        f"is added once: $C = {rate}h + {fee}$.",
        rng,
        stimulus=f"A technician charges a flat fee of \\${fee} for a service call plus "
        f"\\${rate} for each hour of work.",
    )


@template("algebra", "Linear equations in one variable", "medium")
def t_distribute(rng):
    a, x = rng.randint(2, 7), rng.randint(2, 14)
    b, c = rng.randint(2, 9), rng.randint(2, 8)
    # a(x - b) = c*x + k  ->  solve for k so that x is the solution
    k = a * (x - b) - c * x
    sign = "+" if k >= 0 else "-"
    return mc(
        f"If ${a}(x - {b}) = {c}x {sign} {abs(k)}$, what is the value of $x$?",
        x,
        [x + 1, x - 2, a * b, x + b],
        f"Distribute: ${a}x - {a * b} = {c}x {sign} {abs(k)}$. "
        f"Collecting terms gives ${a - c}x = {a * b + k}$, so $x = {x}$.",
        rng,
    )


@template("algebra", "Linear equations in two variables", "medium")
def t_intercept(rng):
    a, b = rng.choice([2, 3, 4, 5, 6]), rng.choice([2, 3, 4, 5, 6])
    y_int = rng.randint(2, 9)
    c = b * y_int
    return mc(
        f"Line $k$ is defined by the equation ${a}x + {b}y = {c}$. "
        f"What is the $y$-intercept of line $k$?",
        f"$(0, {y_int})$",
        [f"$(0, {c})$", f"$(0, {c // a if c % a == 0 else c})$", f"$(0, {y_int + 2})$",
         f"$({y_int}, 0)$"],
        f"The $y$-intercept occurs where $x = 0$. Substituting gives ${b}y = {c}$, "
        f"so $y = {y_int}$.",
        rng,
    )


@template("algebra", "Systems of two linear equations in two variables", "medium")
def t_system_sub(rng):
    x, y = rng.randint(1, 9), rng.randint(1, 9)
    a, b = rng.randint(2, 5), rng.randint(2, 5)
    c1 = a * x + b * y
    d = x - y
    return mc(
        f"$${a}x + {b}y = {c1}$$\n$$x - y = {d}$$\nWhat is the value of $y$ in the "
        f"solution to the system of equations above?",
        y,
        [x, y + 1, y + 2, abs(d)],
        f"From the second equation, $x = y + {d}$. Substituting: "
        f"${a}(y + {d}) + {b}y = {c1}$, which gives ${a + b}y = {c1 - a * d}$ and $y = {y}$.",
        rng,
    )


@template("algebra", "Linear functions", "medium")
def t_drain(rng):
    start = rng.choice([400, 500, 600, 800, 900, 1200])
    rate = rng.choice([15, 20, 25, 30, 40])
    return mc(
        "Which function $V$ gives the volume of water, in liters, remaining in the "
        "tank after $t$ minutes of draining?",
        f"$V(t) = {start} - {rate}t$",
        [f"$V(t) = {start} + {rate}t$", f"$V(t) = {rate}t - {start}$",
         f"$V(t) = {rate} - {start}t$"],
        f"The tank starts at {start} liters and loses {rate} liters each minute, so "
        f"${rate}t$ is subtracted from the starting amount.",
        rng,
        stimulus=f"A tank contains {start} liters of water and is drained at a constant "
        f"rate of {rate} liters per minute.",
    )


@template("algebra", "Linear equations in one variable", "medium")
def t_two_side_grid(rng):
    x = rng.randint(3, 16)
    a, c = rng.randint(4, 9), rng.randint(2, 3)
    b = rng.randint(2, 12)
    k = a * x - b * 1 - c * x  # a*x - b_total = c*x + k
    return grid(
        f"If ${a}x - {b} = {c}x + {a * x - b - c * x}$, what is the value of $x$?",
        x,
        f"Subtract ${c}x$ from both sides: ${a - c}x - {b} = {a * x - b - c * x}$. "
        f"Adding {b} gives ${a - c}x = {a * x - c * x}$, so $x = {x}$.",
    )


@template("algebra", "Linear inequalities in one or two variables", "medium")
def t_budget(rng):
    budget = rng.choice([40, 50, 60, 80, 100])
    p1, p2 = rng.choice([3, 4, 5, 6]), rng.choice([1, 2, 3])
    return mc(
        f"If the student buys $n$ notebooks and $p$ pens, which inequality represents "
        f"this situation?",
        f"${p1}n + {p2}p \\le {budget}$",
        [f"${p1}n + {p2}p \\ge {budget}$", f"${p2}n + {p1}p \\le {budget}$",
         f"${p1 + p2}(n + p) \\le {budget}$"],
        f"Each notebook costs \\${p1}, contributing ${p1}n$, and each pen costs \\${p2}, "
        f"contributing ${p2}p$. The total cannot exceed \\${budget}.",
        rng,
        stimulus=f"A student has \\${budget} to spend on notebooks and pens. Notebooks "
        f"cost \\${p1} each and pens cost \\${p2} each.",
    )


@template("algebra", "Linear equations in two variables", "medium")
def t_point_slope(rng):
    m = rng.choice([-5, -4, -3, -2, 2, 3, 4])
    px, py = rng.randint(1, 8), rng.randint(-8, 9)
    b = py - m * px
    return mc(
        f"A line passes through the point $({px}, {py})$ and has slope ${m}$. "
        f"Which equation represents this line?",
        f"$y = {m}x {'+' if b >= 0 else '-'} {abs(b)}$",
        [f"$y = {m}x {'+' if py >= 0 else '-'} {abs(py)}$",
         f"$y = {-m}x {'+' if b >= 0 else '-'} {abs(b)}$",
         f"$y = {m}x {'+' if -b >= 0 else '-'} {abs(b)}$"],
        f"Using point-slope form: $y - ({py}) = {m}(x - {px})$, which simplifies to "
        f"$y = {m}x {'+' if b >= 0 else '-'} {abs(b)}$.",
        rng,
    )


@template("algebra", "Linear equations in two variables", "hard")
def t_perpendicular(rng):
    p, q = rng.choice([2, 3, 4, 5]), rng.choice([3, 5, 7])
    px = q * rng.randint(1, 3)
    py = rng.randint(-6, 8)
    # perpendicular slope = -q/p
    b = Fraction(py) + Fraction(q, p) * px
    if b.denominator != 1:
        return None
    b = int(b)
    return mc(
        f"In the $xy$-plane, line $m$ is perpendicular to the line "
        f"$y = \\frac{{{p}}}{{{q}}}x + {rng.randint(1, 6)}$ and passes through the point "
        f"$({px}, {py})$. What is the $y$-coordinate of the $y$-intercept of line $m$?",
        b,
        [-b, py, b + q, b - p],
        f"A perpendicular line has the negative reciprocal slope, "
        f"$-\\frac{{{q}}}{{{p}}}$. Substituting the point into "
        f"$y = -\\frac{{{q}}}{{{p}}}x + b$ gives $b = {b}$.",
        rng,
    )


@template("algebra", "Systems of two linear equations in two variables", "hard")
def t_infinite(rng):
    k = rng.choice([2, 3, 4])
    a, b, c = rng.randint(2, 6), rng.randint(2, 6), rng.randint(6, 20)
    return mc(
        f"$$ax + {b}y = {c}$$\n$${a * k}x + {b * k}y = {c * k}$$\nIn the system of "
        f"equations above, $a$ is a constant. If the system has infinitely many "
        f"solutions, what is the value of $a$?",
        a,
        [a * k, a + k, b, c // k if c % k == 0 else c],
        f"Infinitely many solutions means one equation is a multiple of the other. "
        f"Dividing the second equation by {k} gives ${a}x + {b}y = {c}$, so $a = {a}$.",
        rng,
    )


@template("algebra", "Linear functions", "hard")
def t_two_points_f0(rng):
    m = rng.choice([3, 4, 5, 6, 7, 8])
    b = rng.randint(-8, 12)
    x1 = rng.randint(1, 4)
    x2 = x1 + rng.randint(3, 6)
    return grid(
        "What is the value of $h(0)$?",
        b,
        f"The slope is $\\frac{{{m * x2 + b} - {m * x1 + b}}}{{{x2} - {x1}}} = {m}$. "
        f"Using $h({x1}) = {m * x1 + b}$: ${m * x1 + b} = {m}({x1}) + b$, so $b = {b}$. "
        f"Since $h(0) = b$, the value is {b}.",
        stimulus=f"The linear function $h$ satisfies $h({x1}) = {m * x1 + b}$ and "
        f"$h({x2}) = {m * x2 + b}$.",
    )


@template("algebra", "Linear equations in one variable", "hard")
def t_find_constant(rng):
    x = rng.choice([-20, -12, -10, -8, 8, 10, 12])
    a, b = rng.randint(2, 5), rng.randint(2, 5)
    k = rng.randint(2, 12)
    # (a*x + k)/b = (x - c)/1 style is messy; use a*x + k = b*(x + m)
    m = Fraction(a * x + k, b) - x
    if m.denominator != 1:
        return None
    m = int(m)
    return mc(
        f"In the equation ${a}x + k = {b}(x {'+' if m >= 0 else '-'} {abs(m)})$, $k$ is "
        f"a constant. If the solution to the equation is $x = {x}$, what is the value of $k$?",
        k,
        [-k, k + b, k - a, a * b],
        f"Substituting $x = {x}$: ${a}({x}) + k = {b}({x} {'+' if m >= 0 else '-'} {abs(m)})$, "
        f"so ${a * x} + k = {b * (x + m)}$ and $k = {k}$.",
        rng,
    )


# --- Advanced Math -----------------------------------------------------


@template("advanced_math", "Equivalent expressions", "easy")
def t_expand(rng):
    a, b = rng.randint(1, 9), rng.randint(1, 9)
    return mc(
        f"Which expression is equivalent to $(x + {a})(x + {b})$?",
        f"$x^2 + {a + b}x + {a * b}$",
        [f"$x^2 + {a * b}$", f"$x^2 + {a + b}x + {a + b}$", f"$x^2 + {a * b}x + {a + b}$"],
        f"Expanding gives $x^2 + {b}x + {a}x + {a * b} = x^2 + {a + b}x + {a * b}$.",
        rng,
    )


@template("advanced_math", "Nonlinear functions", "easy")
def t_eval_quad(rng):
    c, k = rng.randint(-9, 9), rng.randint(2, 8)
    y = k * k + c
    return mc(
        f"The function $f$ is defined by $f(x) = x^2 {'+' if c >= 0 else '-'} {abs(c)}$. "
        f"What is the value of $f({k})$?",
        y,
        [2 * k + c, k * k, y + 2, abs(c) + k],
        f"Substitute {k} for $x$: $f({k}) = {k}^2 {'+' if c >= 0 else '-'} {abs(c)} "
        f"= {k * k} {'+' if c >= 0 else '-'} {abs(c)} = {y}$.",
        rng,
    )


@template("advanced_math", "Nonlinear equations in one variable", "easy")
def t_diff_squares_solve(rng):
    a = rng.randint(2, 12)
    return mc(
        f"What are the solutions to the equation $x^2 - {a * a} = 0$?",
        f"$x = {a}$ and $x = -{a}$",
        [f"$x = {a}$ only", f"$x = -{a}$ only", f"$x = {a * a}$ and $x = -{a * a}$"],
        f"Adding {a * a} gives $x^2 = {a * a}$, so $x = {a}$ or $x = -{a}$.",
        rng,
    )


@template("advanced_math", "Equivalent expressions", "easy")
def t_monomial_div(rng):
    c1 = rng.choice([6, 8, 10, 12, 15, 18, 20, 24])
    c2 = rng.choice([2, 3, 4, 5])
    if c1 % c2:
        return None
    e1, e2 = rng.randint(4, 9), rng.randint(1, 3)
    return mc(
        f"Which expression is equivalent to $\\frac{{{c1}x^{e1}}}{{{c2}x^{e2}}}$, "
        f"where $x \\ne 0$?",
        f"${c1 // c2}x^{{{e1 - e2}}}$",
        [f"${c1 // c2}x^{{{e1 + e2}}}$", f"${c1 - c2}x^{{{e1 - e2}}}$",
         f"${c1 * c2}x^{{{e1 - e2}}}$"],
        f"Divide the coefficients: ${c1} \\div {c2} = {c1 // c2}$. Subtract the "
        f"exponents: $x^{{{e1}-{e2}}} = x^{{{e1 - e2}}}$.",
        rng,
    )


@template("advanced_math", "Nonlinear equations in one variable", "easy")
def t_radical(rng):
    r = rng.randint(3, 12)
    a = rng.randint(2, 20)
    return mc(
        f"If $\\sqrt{{x + {a}}} = {r}$, what is the value of $x$?",
        r * r - a,
        [r * r + a, r - a, 2 * r - a, r * r],
        f"Square both sides: $x + {a} = {r * r}$. Subtract {a}: $x = {r * r - a}$.",
        rng,
    )


@template("advanced_math", "Nonlinear equations in one variable", "medium")
def t_sum_roots(rng):
    r1, r2 = rng.randint(1, 9), rng.randint(1, 9)
    if r1 == r2:
        return None
    return mc(
        f"What is the sum of the solutions to the equation "
        f"$x^2 - {r1 + r2}x + {r1 * r2} = 0$?",
        r1 + r2,
        [r1 * r2, r1, r2, abs(r1 - r2)],
        f"Factoring gives $(x - {r1})(x - {r2}) = 0$, so the solutions are {r1} and "
        f"{r2}, which sum to {r1 + r2}.",
        rng,
    )


@template("advanced_math", "Nonlinear functions", "medium")
def t_vertex(rng):
    h, k = rng.randint(-7, 7), rng.randint(-9, 9)
    return mc(
        f"The graph of the quadratic function "
        f"$f(x) = (x {'-' if h >= 0 else '+'} {abs(h)})^2 {'+' if k >= 0 else '-'} {abs(k)}$ "
        f"has its vertex at which point?",
        f"$({h}, {k})$",
        [f"$({-h}, {k})$", f"$({h}, {-k})$", f"$({-h}, {-k})$", f"$({k}, {h})$"],
        f"In vertex form $a(x - h)^2 + k$, the vertex is $(h, k)$, so the vertex is "
        f"$({h}, {k})$.",
        rng,
    )


@template("advanced_math", "Equivalent expressions", "medium")
def t_square_binomial(rng):
    a, b = rng.randint(2, 6), rng.randint(1, 9)
    return mc(
        f"Which expression is equivalent to $({a}x - {b})^2$?",
        f"${a * a}x^2 - {2 * a * b}x + {b * b}$",
        [f"${a * a}x^2 + {b * b}$", f"${a * a}x^2 - {b * b}$",
         f"${a * a}x^2 - {a * b}x + {b * b}$"],
        f"Expanding: $({a}x - {b})({a}x - {b}) = {a * a}x^2 - {a * b}x - {a * b}x + "
        f"{b * b} = {a * a}x^2 - {2 * a * b}x + {b * b}$.",
        rng,
    )


@template("advanced_math", "Nonlinear functions", "medium")
def t_exponential(rng):
    start = rng.choice([200, 300, 400, 500, 600, 800])
    period = rng.choice([3, 4, 5, 6, 8])
    return mc(
        "Which function models the population $P$ after $t$ hours?",
        f"$P(t) = {start}(2)^{{t/{period}}}$",
        [f"$P(t) = {start}(2)^{{{period}t}}$", f"$P(t) = {start}(4)^{{t/{period}}}$",
         f"$P(t) = {start} + 2t$"],
        f"The population multiplies by 2 once per {period}-hour period, and the number "
        f"of such periods in $t$ hours is $\\frac{{t}}{{{period}}}$.",
        rng,
        stimulus=f"A population of bacteria doubles every {period} hours. The initial "
        f"population is {start}.",
    )


@template("advanced_math", "Nonlinear equations in one variable", "medium")
def t_quad_grid(rng):
    r = rng.randint(2, 9)
    neg = rng.randint(2, 12)
    b = neg - r
    c = r * neg
    return grid(
        f"If $x^2 {'+' if b >= 0 else '-'} {abs(b)}x = {c}$ and $x > 0$, what is the "
        f"value of $x$?",
        r,
        f"Rewrite as $x^2 {'+' if b >= 0 else '-'} {abs(b)}x - {c} = 0$ and factor: "
        f"$(x + {neg})(x - {r}) = 0$. The solutions are $-{neg}$ and {r}; since "
        f"$x > 0$, the value is {r}.",
    )


@template("advanced_math", "Equivalent expressions", "medium")
def t_rational_simplify(rng):
    a, b = rng.randint(1, 8), rng.randint(1, 8)
    if a == b:
        return None
    return mc(
        f"Which expression is equivalent to "
        f"$\\frac{{x^2 + {a + b}x + {a * b}}}{{x + {a}}}$, where $x \\ne -{a}$?",
        f"$x + {b}$",
        [f"$x + {a}$", f"$x - {b}$", f"$x + {a * b}$"],
        f"Factor the numerator: $x^2 + {a + b}x + {a * b} = (x + {a})(x + {b})$. "
        f"Cancelling $(x + {a})$ leaves $x + {b}$.",
        rng,
    )


@template("advanced_math", "Systems of equations in two variables", "hard")
def t_nonlinear_system(rng):
    r = rng.randint(2, 7)
    c = rng.randint(1, 9)
    # y = x^2 - r*x + c and y = c  ->  x^2 - r*x = 0  ->  x = 0, r
    return mc(
        f"$$y = x^2 - {r}x + {c}$$\n$$y = {c}$$\nWhich values of $x$ satisfy the system "
        f"of equations above?",
        f"$x = 0$ and $x = {r}$",
        [f"$x = 0$ and $x = {c}$", f"$x = {r}$ and $x = {c}$", f"$x = -{r}$ and $x = {r}$"],
        f"Set the expressions equal: $x^2 - {r}x + {c} = {c}$, so $x^2 - {r}x = 0$. "
        f"Factoring gives $x(x - {r}) = 0$, so $x = 0$ or $x = {r}$.",
        rng,
    )


@template("advanced_math", "Nonlinear functions", "hard")
def t_leading_coeff(rng):
    r1, r2 = rng.randint(1, 6), rng.randint(1, 8)
    a = rng.choice([2, 3, -2, 4])
    y0 = a * (0 + r1) * (0 - r2)
    return mc(
        "What is the value of the leading coefficient of $f$?",
        a,
        [-a, a + 1, a * 2, 1],
        f"Write $f(x) = a(x + {r1})(x - {r2})$. Substituting $(0, {y0})$: "
        f"${y0} = a({r1})(-{r2}) = {-r1 * r2}a$, so $a = {a}$.",
        rng,
        stimulus=f"The quadratic function $f$ has zeros at $x = -{r1}$ and $x = {r2}$, "
        f"and its graph passes through the point $(0, {y0})$.",
    )


@template("advanced_math", "Nonlinear equations in one variable", "hard")
def t_discriminant(rng):
    a, c = rng.choice([1, 2, 3]), rng.choice([2, 4, 8, 9, 18])
    disc = 4 * a * c
    root = int(disc**0.5)
    if root * root != disc:
        return None
    return mc(
        f"In the equation ${a}x^2 + bx + {c} = 0$, $b$ is a constant. If the equation "
        f"has exactly one real solution, what is a possible value of $b$?",
        root,
        [root // 2 if root > 1 else root + 1, root + 2, a * c, 4 * a * c],
        f"Exactly one real solution means the discriminant is zero: $b^2 - 4ac = 0$. "
        f"Here $b^2 = 4({a})({c}) = {disc}$, so $b = {root}$ or $b = -{root}$.",
        rng,
    )


@template("advanced_math", "Nonlinear functions", "hard")
def t_min_value(rng):
    a = rng.choice([2, 3, 4])
    h = rng.randint(1, 5)
    k = rng.randint(-12, 6)
    b = -2 * a * h
    c = a * h * h + k
    return grid(
        "What is the minimum value of $f(x)$?",
        k,
        f"The vertex occurs at $x = -\\frac{{b}}{{2a}} = {h}$. Then "
        f"$f({h}) = {a}({h * h}) {'+' if b >= 0 else '-'} {abs(b * h)} + {c} = {k}$. "
        f"The parabola opens upward, so this is the minimum.",
        stimulus=f"The function $f$ is defined by $f(x) = {a}x^2 "
        f"{'+' if b >= 0 else '-'} {abs(b)}x {'+' if c >= 0 else '-'} {abs(c)}$.",
    )


@template("advanced_math", "Equivalent expressions", "hard")
def t_frac_exponent(rng):
    base = rng.choice([2, 3, 4, 5])
    return mc(
        f"If $x^{{2/3}} = {base * base}$ and $x > 0$, what is the value of $x$?",
        base**3,
        [base * base, base, base**4, base * 3],
        f"Raise both sides to the power $\\frac{{3}}{{2}}$: "
        f"$x = ({base * base})^{{3/2}} = ({base})^3 = {base**3}$.",
        rng,
    )


# --- Problem-Solving & Data Analysis ----------------------------------


@template("problem_solving_data_analysis", "Percentages", "easy")
def t_percent_of(rng):
    pct = rng.choice([5, 10, 15, 20, 25, 30, 40])
    base = rng.choice([80, 120, 160, 200, 240, 300, 400])
    val = pct * base // 100
    if pct * base % 100:
        return None
    return mc(
        f"What is {pct}% of {base}?",
        val,
        [val * 2, val // 2 if val > 1 else val + 1, base - val, pct + base],
        f"{pct}% of {base} is ${pct / 100} \\times {base} = {val}$.",
        rng,
    )


@template("problem_solving_data_analysis", "Ratios, rates, proportional relationships, and units", "easy")
def t_unit_rate(rng):
    rate = rng.choice([40, 45, 50, 55, 60, 65])
    h1 = rng.randint(2, 4)
    h2 = rng.randint(5, 8)
    return mc(
        f"A car travels {rate * h1} miles in {h1} hours at a constant speed. At this "
        f"rate, how many miles will it travel in {h2} hours?",
        rate * h2,
        [rate * h1, rate * (h2 + 1), rate * h2 // 2, rate * h1 * h2],
        f"The speed is $\\frac{{{rate * h1}}}{{{h1}}} = {rate}$ miles per hour. "
        f"In {h2} hours it travels ${rate} \\times {h2} = {rate * h2}$ miles.",
        rng,
    )


@template("problem_solving_data_analysis", "One-variable data: distributions and measures of center and spread", "easy")
def t_median(rng):
    vals = sorted(rng.sample(range(1, 40), 5))
    return mc(
        f"What is the median of the data set {', '.join(map(str, vals))}?",
        vals[2],
        [vals[1], vals[3], round(sum(vals) / 5, 1), vals[4]],
        f"The values are in order and there are 5 of them, so the median is the third "
        f"value, {vals[2]}.",
        rng,
    )


@template("problem_solving_data_analysis", "Probability and conditional probability", "easy")
def t_simple_prob(rng):
    k = rng.choice([2, 3, 4, 5])
    a = rng.choice([3, 4, 5, 6])
    total = a * k
    return mc(
        f"A bag contains {a} red marbles and {total - a} blue marbles. If one marble is "
        f"selected at random, what is the probability that it is red?",
        f"$\\frac{{1}}{{{k}}}",
        [f"$\\frac{{1}}{{{k + 1}}}", f"$\\frac{{1}}{{{a}}}",
         f"$\\frac{{{k - 1}}}{{{k}}}"],
        f"There are {total} marbles total, of which {a} are red, so the probability is "
        f"$\\frac{{{a}}}{{{total}}} = \\frac{{1}}{{{k}}}$.",
        rng,
        fmt=lambda s: s + "$",
    )


@template("problem_solving_data_analysis", "Ratios, rates, proportional relationships, and units", "easy")
def t_ratio_grid(rng):
    r1, r2 = rng.choice([2, 3, 4]), rng.choice([5, 6, 7])
    k = rng.randint(3, 8)
    return grid(
        f"The ratio of cats to dogs at a shelter is {r1} to {r2}. If there are "
        f"{r1 * k} cats, how many dogs are there?",
        r2 * k,
        f"The proportion $\\frac{{{r1}}}{{{r2}}} = \\frac{{{r1 * k}}}{{d}}$ gives "
        f"$d = {r2 * k}$.",
    )


@template("problem_solving_data_analysis", "Percentages", "easy")
def t_percent_decrease(rng):
    orig = rng.choice([40, 50, 60, 80, 120, 200])
    pct = rng.choice([10, 20, 25, 40, 50])
    new = orig * (100 - pct) // 100
    if orig * (100 - pct) % 100:
        return None
    return mc(
        f"An item originally priced at \\${orig} is on sale for \\${new}. What is the "
        f"percent decrease in price?",
        f"{pct}%",
        [f"{100 - pct}%", f"{pct * 2}%", f"{orig - new}%"],
        f"The decrease is \\${orig} minus \\${new}, or \\${orig - new}. As a percent of the "
        f"original: $\\frac{{{orig - new}}}{{{orig}}} = {pct}\\%$.",
        rng,
    )


@template("problem_solving_data_analysis", "Percentages", "medium")
def t_successive(rng):
    start = rng.choice([2000, 4000, 5000, 8000, 10000])
    up = rng.choice([10, 20, 25])
    down = rng.choice([10, 20, 25])
    mid = start * (100 + up) // 100
    end = mid * (100 - down) // 100
    if start * (100 + up) % 100 or mid * (100 - down) % 100:
        return None
    return mc(
        f"The population of a town increased by {up}% one year, then decreased by "
        f"{down}% the next. If the population started at {start:,}, what was it at the end?",
        f"{end:,}",
        [f"{start:,}", f"{mid:,}", f"{start * (100 + up - down) // 100:,}"],
        f"After the increase: ${start:,} \\times {1 + up / 100} = {mid:,}$. "
        f"After the decrease: ${mid:,} \\times {1 - down / 100} = {end:,}$.",
        rng,
    )


@template("problem_solving_data_analysis", "Two-variable data: models and scatterplots", "medium")
def t_best_fit(rng):
    slope = round(rng.uniform(2, 9), 1)
    intercept = rng.randint(30, 70)
    return mc(
        "According to the model, what is the predicted increase in exam score for each "
        "additional hour studied?",
        f"{slope} points",
        [f"{intercept} points", f"{round(slope + intercept, 1)} points",
         f"{round(slope * 2, 1)} points"],
        f"In a linear model the slope gives the change in the predicted output per "
        f"one-unit increase in the input. Here the slope is {slope}.",
        rng,
        stimulus=f"A line of best fit relating study hours $h$ to exam score $s$ is "
        f"given by $s = {slope}h + {intercept}$.",
    )


@template("problem_solving_data_analysis", "Ratios, rates, proportional relationships, and units", "medium")
def t_rate_scale_grid(rng):
    parts = rng.choice([15, 18, 24, 30, 36, 45])
    mins = rng.choice([2, 3, 4, 5, 6])
    return grid(
        f"A machine produces {parts} parts every {mins} minutes. At this rate, how many "
        f"parts does it produce in one hour?",
        parts * (60 // mins),
        f"In 60 minutes there are $\\frac{{60}}{{{mins}}} = {60 // mins}$ intervals. "
        f"The machine produces ${parts} \\times {60 // mins} = {parts * (60 // mins)}$ parts.",
    )


@template("problem_solving_data_analysis", "Inference from sample statistics and margin of error", "medium")
def t_margin(rng):
    pct = rng.randint(52, 72)
    moe = rng.choice([2, 3, 4, 5])
    n = rng.choice([200, 400, 500, 800, 1000])
    return mc(
        "Which conclusion is best supported by these results?",
        f"It is plausible that between {pct - moe}% and {pct + moe}% of all residents "
        f"support the proposal.",
        [f"Exactly {pct}% of all residents support the proposal.",
         "All residents support the proposal.",
         "Fewer than half of residents support the proposal."],
        f"The margin of error creates an interval of ${pct}\\% \\pm {moe}\\%$, or "
        f"{pct - moe}% to {pct + moe}%. A sample estimates the population value within "
        f"that interval rather than determining it exactly.",
        rng,
        stimulus=f"A random sample of {n} residents found that {pct}% support a proposal, "
        f"with a margin of error of {moe} percentage points at the 95% confidence level.",
    )


@template("problem_solving_data_analysis", "Percentages", "hard")
def t_reverse_percent(rng):
    pct = rng.choice([10, 20, 25, 40])
    orig = rng.choice([80, 120, 160, 200, 240, 400])
    sale = orig * (100 - pct) // 100
    if orig * (100 - pct) % 100:
        return None
    return mc(
        f"After a {pct}% discount, the sale price of an item is ${sale}. What was the "
        f"original price?",
        money(orig),
        [money(sale + pct), money(int(sale * (100 + pct) / 100)), money(sale * 2)],
        f"A {pct}% discount means the sale price is {100 - pct}% of the original: "
        f"$0.{100 - pct}p = {sale}$, so $p = {orig}$.",
        rng,
    )


@template("problem_solving_data_analysis", "Ratios, rates, proportional relationships, and units", "hard")
def t_recipe(rng):
    a, b = rng.choice([2, 3, 4, 5]), rng.choice([3, 4, 5, 6, 7])
    if a == b:
        return None
    k = rng.randint(3, 9)
    return mc(
        f"A recipe requires {a} cups of flour for every {b} cups of milk. If a baker "
        f"uses {a * k} cups of flour, how many cups of milk are needed?",
        b * k,
        [a * k, b * k + a, a * b * k, round(a * k * a / b, 1)],
        f"Set up the proportion $\\frac{{{a}}}{{{b}}} = \\frac{{{a * k}}}{{m}}$. "
        f"Cross-multiplying gives $m = {b * k}$.",
        rng,
    )


@template("problem_solving_data_analysis", "Probability and conditional probability", "hard")
def t_complement_grid(rng):
    a, b = rng.choice([3, 4, 5, 6]), rng.choice([4, 6, 8])
    c = a + b
    total = a + b + c
    val = Fraction(a + b, total)
    return grid(
        "If one token is drawn at random, what is the probability that it is not white? "
        "Give your answer as a decimal.",
        float(val) if float(val) != int(val) else int(val),
        f"There are {total} tokens, of which ${a} + {b} = {a + b}$ are not white. "
        f"The probability is $\\frac{{{a + b}}}{{{total}}} = {float(val)}$.",
        stimulus=f"A box contains {a} green, {b} yellow, and {c} white tokens.",
    )


@template("problem_solving_data_analysis", "Two-variable data: models and scatterplots", "hard")
def t_decay(rng):
    start = rng.choice([400, 600, 800, 1000, 1600])
    half = rng.choice([4, 5, 6, 8, 10])
    return mc(
        "Which expression gives the value of $y$ after $t$ years?",
        f"${start}(0.5)^{{t/{half}}}$",
        [f"${start}(0.5)^{{{half}t}}$", f"${start} - \\frac{{t}}{{{half}}}$",
         f"${start}(2)^{{t/{half}}}$"],
        f"The quantity is multiplied by 0.5 once every {half} years, and "
        f"$\\frac{{t}}{{{half}}}$ counts how many such periods have elapsed.",
        rng,
        stimulus=f"A quantity $y$ decreases exponentially over time $t$, halving every "
        f"{half} years. At $t = 0$, $y = {start}$.",
    )


# --- Geometry & Trigonometry -------------------------------------------


@template("geometry_trigonometry", "Area and volume", "easy")
def t_rect_area(rng):
    l, w = rng.randint(4, 20), rng.randint(3, 15)
    if l == w:
        return None
    return mc(
        f"A rectangle has a length of {l} centimeters and a width of {w} centimeters. "
        f"What is its area, in square centimeters?",
        l * w,
        [2 * (l + w), l + w, l * w * 2, (l + w) * 2 - 2],
        f"The area of a rectangle is length times width: ${l} \\times {w} = {l * w}$.",
        rng,
    )


@template("geometry_trigonometry", "Lines, angles, and triangles", "easy")
def t_triangle_angle(rng):
    a = rng.randint(30, 80)
    b = rng.randint(30, 80)
    if a + b >= 175:
        return None
    return mc(
        f"In a triangle, two of the angles measure ${a}°$ and ${b}°$. What is the "
        f"measure of the third angle?",
        f"${180 - a - b}°$",
        [f"${a + b}°$", f"${90 - (a + b) // 2}°$", f"${360 - a - b}°$"],
        f"The angles of a triangle sum to $180°$, so the third angle is "
        f"$180° - {a}° - {b}° = {180 - a - b}°$.",
        rng,
    )


@template("geometry_trigonometry", "Circles", "easy")
def t_circle_area(rng):
    r = rng.randint(2, 12)
    return mc(
        f"A circle has a radius of {r} units. What is its area, in square units?",
        f"${r * r}\\pi$",
        [f"${2 * r}\\pi$", f"${r}\\pi$", f"${4 * r * r}\\pi$"],
        f"The area of a circle is $\\pi r^2 = \\pi({r})^2 = {r * r}\\pi$.",
        rng,
    )


@template("geometry_trigonometry", "Right triangles and trigonometry", "easy")
def t_pythag(rng):
    a, b, c = rng.choice([(3, 4, 5), (6, 8, 10), (5, 12, 13), (8, 15, 17),
                          (9, 12, 15), (7, 24, 25), (20, 21, 29)])
    return mc(
        f"A right triangle has legs of length {a} and {b}. What is the length of the "
        f"hypotenuse?",
        c,
        [a + b, c + 1, a * b // 2, c - 1],
        f"By the Pythagorean theorem, $c^2 = {a}^2 + {b}^2 = {a * a} + {b * b} = "
        f"{c * c}$, so $c = {c}$.",
        rng,
    )


@template("geometry_trigonometry", "Area and volume", "easy")
def t_cube_grid(rng):
    s = rng.randint(2, 12)
    return grid(
        f"A cube has edges of length {s} inches. What is its volume, in cubic inches?",
        s**3,
        f"The volume of a cube is $s^3 = {s}^3 = {s**3}$ cubic inches.",
    )


@template("geometry_trigonometry", "Lines, angles, and triangles", "easy")
def t_supplementary(rng):
    a = rng.randint(20, 160)
    return mc(
        f"Two angles are supplementary. If one angle measures ${a}°$, what is the "
        f"measure of the other?",
        f"${180 - a}°$",
        [f"${90 - a if a < 90 else a - 90}°$", f"${360 - a}°$", f"${a}°$"],
        f"Supplementary angles sum to $180°$, so the other measures "
        f"$180° - {a}° = {180 - a}°$.",
        rng,
    )


@template("geometry_trigonometry", "Area and volume", "medium")
def t_cylinder(rng):
    r, h = rng.randint(2, 8), rng.randint(3, 15)
    return mc(
        f"A cylinder has a radius of {r} meters and a height of {h} meters. What is its "
        f"volume, in cubic meters?",
        f"${r * r * h}\\pi$",
        [f"${2 * r * h}\\pi$", f"${r * h}\\pi$", f"${r * r * h * 3}\\pi$"],
        f"The volume of a cylinder is $\\pi r^2 h = \\pi({r})^2({h}) = {r * r * h}\\pi$.",
        rng,
    )


@template("geometry_trigonometry", "Right triangles and trigonometry", "medium")
def t_sine(rng):
    a, b, c = rng.choice([(3, 4, 5), (6, 8, 10), (5, 12, 13), (8, 15, 17), (7, 24, 25)])
    return mc(
        "What is the value of $\\sin A$?",
        f"$\\frac{{{b}}}{{{c}}}$",
        [f"$\\frac{{{a}}}{{{c}}}$", f"$\\frac{{{a}}}{{{b}}}$", f"$\\frac{{{c}}}{{{b}}}$"],
        f"The hypotenuse is $AC = \\sqrt{{{a}^2 + {b}^2}} = {c}$. For angle $A$ the "
        f"opposite side is $BC = {b}$, so $\\sin A = \\frac{{{b}}}{{{c}}}$.",
        rng,
        stimulus=f"In right triangle $ABC$, the right angle is at $B$. Side $AB = {a}$ "
        f"and side $BC = {b}$.",
    )


@template("geometry_trigonometry", "Lines, angles, and triangles", "medium")
def t_similar(rng):
    k = rng.choice([2, 3, 4])
    ab = rng.randint(2, 9) * k
    bc = rng.randint(2, 9) * k
    de = ab // k
    return mc(
        "What is the length of side $EF$?",
        bc // k,
        [bc, de, bc // k + 1, ab // k],
        f"The scale factor is $\\frac{{DE}}{{AB}} = \\frac{{{de}}}{{{ab}}} = "
        f"\\frac{{1}}{{{k}}}$. Therefore $EF = {bc} \\div {k} = {bc // k}$.",
        rng,
        stimulus=f"Triangle $ABC$ is similar to triangle $DEF$. Side $AB = {ab}$, side "
        f"$BC = {bc}$, and the corresponding side $DE = {de}$.",
    )


@template("geometry_trigonometry", "Circles", "medium")
def t_circle_center(rng):
    h, k, r = rng.randint(-8, 8), rng.randint(-8, 8), rng.randint(2, 10)
    return mc(
        f"A circle in the $xy$-plane has equation "
        f"$(x {'-' if h >= 0 else '+'} {abs(h)})^2 + (y {'-' if k >= 0 else '+'} {abs(k)})^2 "
        f"= {r * r}$. What are the coordinates of its center?",
        f"$({h}, {k})$",
        [f"$({-h}, {-k})$", f"$({-h}, {k})$", f"$({h}, {-k})$", f"$({k}, {h})$"],
        f"In the standard form $(x - h)^2 + (y - k)^2 = r^2$, the center is $(h, k)$, "
        f"so the center is $({h}, {k})$.",
        rng,
    )


@template("geometry_trigonometry", "Area and volume", "medium")
def t_tri_area_grid(rng):
    b = rng.choice([4, 6, 8, 10, 12, 14, 16, 18])
    h = rng.randint(3, 15)
    return grid(
        f"A triangle has a base of {b} centimeters and a height of {h} centimeters. "
        f"What is its area, in square centimeters?",
        b * h // 2,
        f"The area of a triangle is $\\frac{{1}}{{2}}bh = \\frac{{1}}{{2}}({b})({h}) "
        f"= {b * h // 2}$ square centimeters.",
    )


@template("geometry_trigonometry", "Circles", "hard")
def t_arc(rng):
    r = rng.choice([5, 6, 9, 10, 12, 15, 18])
    deg = rng.choice([30, 36, 45, 60, 72, 90, 120])
    frac_circ = Fraction(deg, 360)
    arc = frac_circ * 2 * r
    if arc.denominator != 1:
        return None
    arc = int(arc)
    return mc(
        "What is the length of the arc intercepted by this central angle?",
        f"${arc}\\pi$",
        [f"${2 * r}\\pi$", f"${r}\\pi$", f"${arc * 2}\\pi$"],
        f"The arc is $\\frac{{{deg}}}{{360}}$ of the circumference. The circumference is "
        f"$2\\pi({r}) = {2 * r}\\pi$, so the arc length is ${arc}\\pi$.",
        rng,
        stimulus=f"A circle has a radius of {r} units. A central angle measures ${deg}°$.",
    )


@template("geometry_trigonometry", "Area and volume", "hard")
def t_cone(rng):
    r = rng.choice([3, 6, 9, 12])
    h = rng.choice([4, 8, 10, 12])
    vol = r * r * h // 3
    if r * r * h % 3:
        return None
    return mc(
        "What is the volume of the cone, in cubic inches?",
        f"${vol}\\pi$",
        [f"${r * r * h}\\pi$", f"${vol * 2}\\pi$", f"${r * h}\\pi$"],
        f"$V = \\frac{{1}}{{3}}\\pi({r})^2({h}) = \\frac{{{r * r * h}\\pi}}{{3}} = "
        f"{vol}\\pi$ cubic inches.",
        rng,
        stimulus=f"A right circular cone has a radius of {r} inches and a height of {h} "
        f"inches. The volume of a cone is $V = \\frac{{1}}{{3}}\\pi r^2 h$.",
    )


@template("geometry_trigonometry", "Lines, angles, and triangles", "hard")
def t_transversal(rng):
    a, b = rng.randint(2, 6), rng.randint(7, 12)
    x = rng.randint(5, 25)
    c = a * x + rng.randint(1, 20)
    d = b * x - (c - a * x) * 0  # keep simple: solve a*x + p = b*x - q
    p = c - a * x
    q = b * x - (a * x + p)
    if q <= 0:
        return None
    return mc(
        "What is the value of $x$?",
        x,
        [x + 5, x - 5, x * 2, p],
        f"Corresponding angles formed by a transversal cutting parallel lines are "
        f"congruent, so ${a}x + {p} = {b}x - {q}$. Solving: ${p + q} = {b - a}x$, "
        f"giving $x = {x}$.",
        rng,
        stimulus=f"Two parallel lines are cut by a transversal. One of the angles formed "
        f"measures $({a}x + {p})°$, and the corresponding angle on the other parallel "
        f"line measures $({b}x - {q})°$.",
    )


@template("geometry_trigonometry", "Circles", "hard")
def t_complete_square_grid(rng):
    h, k = rng.randint(-8, 8), rng.randint(-8, 8)
    r = rng.randint(2, 10)
    if h == 0 and k == 0:
        return None
    const = r * r - h * h - k * k
    return grid(
        "What is the radius of the circle?",
        r,
        f"Complete the square: $(x {'-' if h >= 0 else '+'} {abs(h)})^2 + "
        f"(y {'-' if k >= 0 else '+'} {abs(k)})^2 = {r * r}$. The radius is "
        f"$\\sqrt{{{r * r}}} = {r}$.",
        stimulus=f"A circle in the $xy$-plane has equation $x^2 + y^2 "
        f"{'-' if 2 * h >= 0 else '+'} {abs(2 * h)}x {'-' if 2 * k >= 0 else '+'} "
        f"{abs(2 * k)}y {'+' if -const >= 0 else '-'} {abs(const)} = 0$.",
    )


@template("geometry_trigonometry", "Right triangles and trigonometry", "hard")
def t_ladder(rng):
    adj = rng.randint(3, 12)
    return mc(
        "What is the length of the ladder, in feet?",
        adj * 2,
        # Delimited: a bare \sqrt would reach the page as literal backslash text.
        [adj, f"${adj}\\sqrt{{3}}$", adj * 3, adj + 5],
        f"The ground distance is adjacent to the $60°$ angle and the ladder is the "
        f"hypotenuse. Since $\\cos 60° = \\frac{{1}}{{2}} = \\frac{{{adj}}}{{L}}$, "
        f"the length is $L = {adj * 2}$ feet.",
        rng,
        stimulus=f"A ladder leans against a vertical wall, forming a $60°$ angle with "
        f"the level ground. The foot of the ladder is {adj} feet from the base of the wall.",
    )


# --- driver -------------------------------------------------------------


def generate(count, seed):
    rng = random.Random(seed)
    by_bucket = {}
    for t in TEMPLATES:
        by_bucket.setdefault(t["difficulty"], []).append(t)

    # Even split across difficulties, matching what form assembly drains.
    per = {d: count // 3 for d in ("easy", "medium", "hard")}
    for d in list(per)[: count % 3]:
        per[d] += 1

    out, seen_stems = [], set()
    for difficulty, target in per.items():
        pool = by_bucket.get(difficulty, [])
        if not pool:
            continue
        made, attempts = 0, 0
        while made < target and attempts < target * 80:
            attempts += 1
            t = pool[attempts % len(pool)]
            item = t["fn"](rng)
            if item is None:
                continue
            fingerprint = (item["stem"], json.dumps(item.get("stimulus")))
            if fingerprint in seen_stems:
                continue
            seen_stems.add(fingerprint)
            item.update(
                {
                    "section": "math",
                    "domain": t["domain"],
                    "skill": t["skill"],
                    "difficulty": difficulty,
                    "source": "self_authored",
                }
            )
            out.append(item)
            made += 1
    rng.shuffle(out)
    return out


def main():
    p = argparse.ArgumentParser(description="Generate original math bank items.")
    p.add_argument("--count", type=int, default=200)
    p.add_argument("--seed", type=int, default=7)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    questions = generate(args.count, args.seed)
    payload = {
        "_note": "Generated by scripts/generate_math_bank.py. Original items; answers "
        "are computed from the same parameters that build each stem.",
        "questions": questions,
    }
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    by = {}
    for q in questions:
        by[(q["domain"], q["difficulty"])] = by.get((q["domain"], q["difficulty"]), 0) + 1
    print(f"wrote {len(questions)} questions to {args.out}")
    for (dom, diff), n in sorted(by.items()):
        print(f"  {dom:32} {diff:7} {n}")


if __name__ == "__main__":
    main()
