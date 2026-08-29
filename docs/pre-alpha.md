# Adversarial pre-alpha

The pre-alpha uses browser-driving language models as synthetic users before Interlocks is offered to practicing lawyers. It is exploratory evidence, not a substitute for deterministic tests or substantive legal validation.

## Why this is separate from the browser suite

`scripts/browser-e2e.mjs` proves expected flows with explicit assertions. A synthetic user receives a role, a goal, and the rendered application without implementation knowledge. It can misunderstand language, take an unanticipated path, abandon a form, switch identities, combine features, and explain why a technically functioning result is unusable or misleading.

The two methods answer different questions:

| Method | Primary question |
| --- | --- |
| Deterministic browser suite | Did the known contract continue to work? |
| Synthetic-user campaign | What happens when an unfamiliar or hostile user behaves differently from the contract author? |
| Lawyer validation | Did Interlocks encode and explain the right conflict-clearance propositions? |

## Recommended browser agent

Claude Code with Claude in Chrome is the first-wave runner. It can navigate the local application, click and type, take screenshots, and read console, network, DOM, and accessibility state. It uses a direct paid Anthropic plan rather than requiring API computer-use infrastructure.

Prerequisites:

1. Install current Claude Code.
2. Install Claude in Chrome version 1.0.36 or later.
3. Sign Claude Code into a direct Anthropic account with `/login`.
4. Start an interactive session with `claude --chrome`; `/chrome` should report that the extension is installed and enabled.

Do not run the synthetic-user session from the Interlocks repository. Start Claude Code in an empty temporary directory so it cannot rescue itself by reading source code.

## Running one campaign

In the Interlocks repository:

```bash
npm ci
npm run dev
npm run prealpha:list
npm run --silent prealpha:prompt -- harried-partner-intake --run-id hp-001 > /tmp/interlocks-hp-001.md
```

In another terminal:

```bash
prealpha_session_dir="$(mktemp -d)"
cd "$prealpha_session_dir"
claude --chrome
```

Paste the contents of `/tmp/interlocks-hp-001.md` into the Claude session. Keep Interlocks restricted to its seeded fictional data. Save Claude's final report and referenced screenshots before resetting the demo.

The prompt deliberately prohibits repository, terminal, database, documentation, and direct API access during the run. Console and network evidence may be inspected only after the persona has attempted the ordinary browser task.

## Campaign waves

Run the catalog in three waves:

1. **Isolated baseline** — reset the demo before every campaign. This produces reproducible usability and workflow evidence.
2. **Dirty workspace** — run several campaigns sequentially without resetting. This finds stale state, duplicate records, confusing history, and assumptions that only hold for pristine seed data.
3. **Cross-session abuse** — use multiple browser tabs and identities for the tenant, view-as, consent, and state-abuse campaigns.

Do not run concurrent agents against one local database until isolated baseline reports are complete. Concurrency makes evidence harder to reproduce and can cause one agent to invalidate another agent's assumptions.

## Triage

Every report receives one disposition:

- reproducible product defect;
- policy-pack or legal-model question;
- missing deterministic coverage;
- expected behavior with inadequate explanation;
- synthetic-user mistake that the interface should prevent;
- unreproducible;
- reasonable professional disagreement reserved for lawyer validation.

For each accepted defect:

1. reproduce it manually or with a deterministic script;
2. add the lowest-layer regression test that can prove the failure;
3. add an integration or browser assertion when it crosses boundaries;
4. fix it;
5. rerun the originating prompt against a fresh demo;
6. retain the original report and the verification result.

Synthetic agents are good at breadth, persistence, and strange combinations. They are not authoritative on law and can invent complaints. No policy pack moves out of substantive-review status solely because synthetic users approve it.
