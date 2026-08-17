"""Generates Standard English Conventions items.

Conventions is the one Reading & Writing domain that templates honestly: the
question tests a rule, not a passage, so varying the content slots produces
genuinely distinct items rather than filler. The key follows from the rule, so
it is correct by construction - the same reason the math bank is generated.

The other three R&W domains are hand-authored, because a comprehension question
needs a passage worth comprehending.

Usage:
    python -m scripts.generate_rw_conventions --count 90 --seed 11 \
        --out data/question_bank/rw_conventions_generated.json
"""

import argparse
import json
import random

TEMPLATES = []


def template(skill, difficulty):
    def decorator(fn):
        TEMPLATES.append({"skill": skill, "difficulty": difficulty, "fn": fn})
        return fn

    return decorator


def mc(stimulus, stem, correct, distractors, rationale, rng):
    options, seen = [correct], {correct}
    for d in distractors:
        if d not in seen:
            seen.add(d)
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
        "choices": [{"id": ids[i], "text": v} for i, v in enumerate(options)],
        "correct_answer": ids[options.index(correct)],
        "rationale": rationale,
    }


CONVENTIONS_STEM = (
    "Which choice completes the text so that it conforms to the conventions of "
    "Standard English?"
)

# --- content pools -----------------------------------------------------

PEOPLE = ["Okonjo", "Nakamura", "Villanueva", "Petrov", "Adeyemi", "Lindqvist",
          "Haddad", "Moreau", "Sattar", "Delgado", "Bergström", "Ibrahim"]
FIELDS = ["marine biology", "urban planning", "astrophysics", "archaeology",
          "linguistics", "civil engineering", "musicology", "epidemiology"]
CITIES = ["Lisbon", "Osaka", "Nairobi", "Montreal", "Valparaíso", "Helsinki",
          "Jaipur", "Reykjavík"]
PLURAL_NOUNS = ["results", "samples", "findings", "recordings", "sketches",
                "manuscripts", "specimens", "measurements"]
COLLECTIVES = ["committee", "panel", "board", "team", "commission", "jury"]
GROUPS = ["consultants", "reviewers", "engineers", "volunteers", "trustees"]
PLACES = ["the archive", "the laboratory", "the observatory", "the workshop",
          "the greenhouse", "the foundry"]
INSTITUTIONS = ["library", "museum", "conservatory", "institute", "observatory"]
TASKS = ["extended", "reduced", "published", "revised", "catalogued"]


# --- subject-verb agreement --------------------------------------------


@template("Form, Structure, and Sense", "easy")
def t_plural_subject(rng):
    noun = rng.choice(PLURAL_NOUNS)
    return mc(
        f"The {noun} of the experiment ______ published in a journal last spring.",
        CONVENTIONS_STEM,
        "were",
        ["was", "is", "has been"],
        f"The subject is “{noun},” which is plural, so the verb must be plural "
        f"and past tense to match “last spring.”",
        rng,
    )


@template("Form, Structure, and Sense", "easy")
def t_each_singular(rng):
    group = rng.choice(GROUPS)
    return mc(
        f"Each of the {group} ______ asked to complete a short questionnaire before "
        f"the session began.",
        CONVENTIONS_STEM,
        "was",
        ["were", "have been", "are"],
        f"The subject is “Each,” a singular pronoun; “of the {group}” "
        f"is a prepositional phrase that does not change the subject's number.",
        rng,
    )


@template("Form, Structure, and Sense", "medium")
def t_along_with(rng):
    coll = rng.choice(COLLECTIVES)
    group = rng.choice(GROUPS)
    return mc(
        f"The {coll}, along with several outside {group}, ______ scheduled to review "
        f"the proposal next month.",
        CONVENTIONS_STEM,
        "is",
        ["are", "were", "have been"],
        f"The subject is the singular “{coll}.” A phrase beginning "
        f"“along with” is parenthetical and does not make a subject plural.",
        rng,
    )


@template("Form, Structure, and Sense", "medium")
def t_neither_nor(rng):
    single = rng.choice(["director", "curator", "architect", "editor"])
    plural = rng.choice(["producers", "trustees", "engineers", "reviewers"])
    return mc(
        f"Neither the {single} nor the {plural} ______ willing to comment on the delay.",
        CONVENTIONS_STEM,
        "were",
        ["was", "is", "has been"],
        f"In a “neither...nor” construction the verb agrees with the nearer "
        f"subject, here the plural “{plural}.”",
        rng,
    )


@template("Form, Structure, and Sense", "medium")
def t_number_of(rng):
    thing = rng.choice(["applications", "submissions", "inquiries", "enrolments"])
    return mc(
        f"The number of {thing} the office receives each spring ______ risen sharply "
        f"since the program was expanded.",
        CONVENTIONS_STEM,
        "has",
        ["have", "were", "are"],
        f"The subject is “The number,” which is singular; the modifying phrase "
        f"does not change its number.",
        rng,
    )


@template("Form, Structure, and Sense", "hard")
def t_neither_of(rng):
    thing = rng.choice(["proposed routes", "candidate sites", "draft designs",
                        "prototype engines"])
    return mc(
        f"Neither of the two {thing} ______ without significant drawbacks, according "
        f"to the engineers who evaluated them.",
        CONVENTIONS_STEM,
        "is",
        ["are", "were", "have been"],
        f"“Neither” functions as a singular subject, and “of the two "
        f"{thing}” is a prepositional phrase that does not affect agreement.",
        rng,
    )


# --- pronouns and possessives ------------------------------------------


@template("Form, Structure, and Sense", "easy")
def t_its(rng):
    inst = rng.choice(INSTITUTIONS)
    verb = rng.choice(TASKS)
    return mc(
        f"The {inst} {verb} ______ hours during the examination period.",
        CONVENTIONS_STEM,
        "its",
        ["it's", "its'", "their"],
        f"A possessive pronoun is needed for the singular “{inst}.” "
        f"“Its” is that possessive; “it's” means “it is.”",
        rng,
    )


@template("Form, Structure, and Sense", "hard")
def t_whom(rng):
    who = rng.choice(["correspondents", "contributors", "donors", "petitioners"])
    return mc(
        f"The archive holds letters from dozens of {who}, many of ______ were never "
        f"identified by name.",
        CONVENTIONS_STEM,
        "whom",
        ["who", "which", "them"],
        f"The pronoun is the object of the preposition “of,” which requires "
        f"the objective form “whom.” “Which” cannot refer to people.",
        rng,
    )


# --- verb tense and mood ------------------------------------------------


@template("Form, Structure, and Sense", "easy")
def t_past_perfect(rng):
    who = rng.choice(["hikers", "climbers", "surveyors", "researchers"])
    return mc(
        f"By the time the rescue team arrived, the {who} ______ shelter under an "
        f"overhang.",
        CONVENTIONS_STEM,
        "had taken",
        ["take", "will take", "takes"],
        f"The sheltering happened before the team's arrival and both are in the past, "
        f"so the past perfect “had taken” marks the earlier action.",
        rng,
    )


@template("Form, Structure, and Sense", "hard")
def t_subjunctive(rng):
    thing = rng.choice(["sample", "specimen", "culture", "core"])
    return mc(
        f"If the {thing} ______ contaminated during transport, the entire analysis "
        f"would have to be repeated.",
        CONVENTIONS_STEM,
        "were to be",
        ["was", "is being", "has been"],
        f"The main clause uses “would have to be,” signalling a hypothetical "
        f"condition, which calls for the subjunctive in the “if” clause.",
        rng,
    )


# --- parallelism and modifiers -----------------------------------------


@template("Form, Structure, and Sense", "medium")
def t_parallel_series(rng):
    a, b, c = rng.choice([
        ("observe fainter objects", "map distant galaxies", "determine"),
        ("catalogue new species", "track migration routes", "measure"),
        ("restore damaged panels", "document pigment layers", "identify"),
    ])
    tail = {"determine": "the composition of exoplanet atmospheres",
            "measure": "the effects of habitat loss",
            "identify": "the workshop that produced them"}[c]
    return mc(
        f"The new project will allow researchers to {a}, {b}, and ______ {tail}.",
        CONVENTIONS_STEM,
        c,
        [c + "ing" if not c.endswith("e") else c[:-1] + "ing", "to " + c, "will " + c],
        f"The series follows “to” once, so parallel structure requires the "
        f"bare form to match the earlier verbs.",
        rng,
    )


@template("Form, Structure, and Sense", "medium")
def t_dangling(rng):
    who = rng.choice(["the researchers", "the archivists", "the surveyors"])
    return mc(
        "Having reviewed the data for several weeks, ______",
        CONVENTIONS_STEM,
        f"{who} revised their conclusion.",
        ["the conclusion was revised.", "it was decided to revise the conclusion.",
         "there was a revision of the conclusion."],
        f"The introductory participial phrase must modify whoever did the reviewing, "
        f"so “{who}” has to follow it directly; otherwise the modifier dangles.",
        rng,
    )


@template("Form, Structure, and Sense", "hard")
def t_comparison(rng):
    a, b = rng.choice([("coastal", "inland"), ("northern", "southern"),
                       ("urban", "rural")])
    return mc(
        f"The survey found that residents of the {a} districts were more likely to "
        f"support the levy than ______",
        CONVENTIONS_STEM,
        f"residents of the {b} districts were.",
        [f"the {b} districts.", f"{b}.", f"that of the {b} districts."],
        f"The comparison is between two groups of residents, so both terms must be "
        f"parallel: residents compared to residents, not to districts.",
        rng,
    )


# --- boundaries ---------------------------------------------------------


@template("Boundaries", "easy")
def t_comma_fanboys(rng):
    a, b = rng.choice([
        ("The storm knocked out power to the entire district", "classes were canceled for two days"),
        ("The bridge closed for repairs in March", "commuters were rerouted through the valley"),
        ("The grant was approved in the autumn", "fieldwork began the following spring"),
    ])
    return mc(
        f"{a} ______ {b}.",
        CONVENTIONS_STEM,
        ", and",
        [",", " and", ""],
        "Both halves are independent clauses, so joining them requires a comma plus a "
        "coordinating conjunction. A comma alone creates a comma splice.",
        rng,
    )


@template("Boundaries", "easy")
def t_intro_comma(rng):
    person = rng.choice(PEOPLE)
    field = rng.choice(FIELDS)
    city = rng.choice(CITIES)
    return mc(
        f"After finishing her degree in {field} ______ {person} spent two years "
        f"working in {city}.",
        CONVENTIONS_STEM,
        ",",
        [";", ":", ""],
        "The opening phrase is an introductory modifier, not an independent clause, so "
        "it is set off with a comma. Semicolons and colons require an independent "
        "clause before them.",
        rng,
    )


@template("Boundaries", "easy")
def t_colon_list(rng):
    items = rng.choice([
        ("three ingredients", "flour, butter, and salt"),
        ("two instruments", "a barometer and a hygrometer"),
        ("three materials", "clay, straw, and lime"),
    ])
    return mc(
        f"The recipe calls for {items[0]} ______ {items[1]}.",
        CONVENTIONS_STEM,
        ":",
        [";", "", " and"],
        f"A colon introduces a list after an independent clause, which "
        f"“The recipe calls for {items[0]}” is.",
        rng,
    )


@template("Boundaries", "easy")
def t_semicolon(rng):
    person = rng.choice(PEOPLE)
    field = rng.choice(FIELDS)
    city = rng.choice(CITIES)
    return mc(
        f"{person} studied {field} in {city} ______ she now designs public libraries.",
        CONVENTIONS_STEM,
        ";",
        [",", " and,", ""],
        "Two independent clauses may be joined by a semicolon. A comma alone creates a "
        "splice, and omitting punctuation creates a run-on.",
        rng,
    )


@template("Boundaries", "medium")
def t_colon_explain(rng):
    thing = rng.choice(["technique", "instrument", "method", "alloy"])
    limit = rng.choice([
        "it cannot be used on samples smaller than a cubic centimeter",
        "it requires recalibration after every twelve readings",
        "it fails at temperatures below freezing",
    ])
    return mc(
        f"The {thing} has one significant drawback ______ {limit}.",
        CONVENTIONS_STEM,
        ":",
        [",", " and", ""],
        "The first clause is independent and the second explains the drawback it "
        "announces, which is what a colon signals. A comma alone would splice.",
        rng,
    )


@template("Boundaries", "medium")
def t_paired_commas(rng):
    person = rng.choice(PEOPLE)
    detail = rng.choice([
        "who trained as a cartographer",
        "whose earliest recordings survive only on wax",
        "who spent a decade in the field",
    ])
    return mc(
        f"The composer {person} ______ {detail} ______ was also active in the "
        f"campaign for suffrage.",
        CONVENTIONS_STEM,
        ", . . . ,",
        ["(no punctuation) . . . ,", ", . . . (no punctuation)", ": . . . ,"],
        "The relative clause is nonessential, since the composer is already identified "
        "by name, so it takes a matching pair of commas. Omitting either leaves the "
        "interruption unbalanced.",
        rng,
    )


@template("Boundaries", "medium")
def t_comma_and_clauses(rng):
    a, b = rng.choice([
        ("Marie Tharp mapped the ocean floor for decades", "her work helped confirm plate tectonics"),
        ("The society catalogued the collection for years", "its index is still in use today"),
    ])
    return mc(
        f"{a} ______ {b}.",
        CONVENTIONS_STEM,
        ", and",
        [", however", " but", ","],
        "Two independent clauses in an additive relationship need a comma plus a "
        "coordinating conjunction. “However” after only a comma creates a splice.",
        rng,
    )


@template("Boundaries", "hard")
def t_conjunctive_adverb(rng):
    a, b = rng.choice([
        ("Researchers had expected the compound to degrade within hours",
         "instead, it remained stable for more than three weeks"),
        ("The team predicted the glacier would retreat steadily",
         "instead, it advanced for two consecutive seasons"),
    ])
    return mc(
        f"{a} ______ {b}.",
        CONVENTIONS_STEM,
        ";",
        [",", " and", ""],
        "Both clauses are independent, and “instead” is a conjunctive adverb "
        "rather than a coordinating conjunction, so a semicolon is required before it.",
        rng,
    )


@template("Boundaries", "hard")
def t_semicolon_list(rng):
    a, b, c = rng.choice([
        (("Lisbon", "Portugal"), ("Valencia", "Spain"), ("Genoa", "Italy")),
        (("Kyoto", "Japan"), ("Busan", "South Korea"), ("Taipei", "Taiwan")),
    ])
    return mc(
        f"The vessel carried cargo from three ports ______ {a[0]}, {a[1]} ______ "
        f"{b[0]}, {b[1]} ______ and {c[0]}, {c[1]}.",
        CONVENTIONS_STEM,
        ": . . . ; . . . ;",
        [", . . . , . . . ,", "; . . . , . . . ,", ": . . . , . . . ,"],
        "A colon introduces the list after the independent clause, and because each "
        "item already contains a comma separating city from country, semicolons must "
        "separate the items.",
        rng,
    )


@template("Boundaries", "hard")
def t_contrast_clauses(rng):
    a, b = rng.choice([
        ("The 1906 earthquake destroyed much of the city",
         "rebuilding began almost immediately"),
        ("The fire consumed the original wing of the museum",
         "the collection had been moved to storage weeks earlier"),
    ])
    return mc(
        f"{a} ______ {b}, and within a decade the site had been transformed.",
        CONVENTIONS_STEM,
        ", but",
        [", nevertheless", " however", ","],
        "Two independent clauses in a contrastive relationship require a comma plus a "
        "coordinating conjunction. “Nevertheless” and “however” are "
        "conjunctive adverbs that cannot join clauses with only a comma.",
        rng,
    )


# --- driver -------------------------------------------------------------


def generate(count, seed):
    rng = random.Random(seed)
    by_difficulty = {}
    for t in TEMPLATES:
        by_difficulty.setdefault(t["difficulty"], []).append(t)

    per = {d: count // 3 for d in ("easy", "medium", "hard")}
    for d in list(per)[: count % 3]:
        per[d] += 1

    out, seen = [], set()
    for difficulty, target in per.items():
        pool = by_difficulty.get(difficulty, [])
        if not pool:
            continue
        made, attempts = 0, 0
        while made < target and attempts < target * 120:
            attempts += 1
            t = pool[attempts % len(pool)]
            item = t["fn"](rng)
            if item is None:
                continue
            key = (item["stimulus"], tuple(c["text"] for c in item["choices"]))
            if key in seen:
                continue
            seen.add(key)
            item.update({
                "section": "reading_writing",
                "domain": "standard_english_conventions",
                "skill": t["skill"],
                "difficulty": difficulty,
                "source": "self_authored",
            })
            out.append(item)
            made += 1
    rng.shuffle(out)
    return out


def main():
    p = argparse.ArgumentParser(description="Generate R&W conventions items.")
    p.add_argument("--count", type=int, default=90)
    p.add_argument("--seed", type=int, default=11)
    p.add_argument("--out", required=True)
    args = p.parse_args()

    questions = generate(args.count, args.seed)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(
            {
                "_note": "Generated by scripts/generate_rw_conventions.py. Original "
                "items; each key follows from the grammatical rule being tested.",
                "questions": questions,
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    counts = {}
    for q in questions:
        counts[q["difficulty"]] = counts.get(q["difficulty"], 0) + 1
    print(f"wrote {len(questions)} questions to {args.out}")
    for k, v in sorted(counts.items()):
        print(f"  {k:7} {v}")


if __name__ == "__main__":
    main()
