# flowvia-mods — guide for contributors and coding agents

This repository is a Claude Code plugin marketplace with two mods: `neon-sections` and `clutch`. User-facing docs are in [README.md](README.md). `CLAUDE.md` points here (`@AGENTS.md`), so keep the content in this file.

## Layout

```
.claude-plugin/marketplace.json   marketplace manifest (name: flowvia-mods)
neon-sections/                    answer-section boxes and work-log folding
  .claude-plugin/plugin.json      manifest and userConfig options
  hooks/                          hooks module (register.tsx is the entry)
  hooks/i18n.ts                   all user-facing strings, ko and en
  tests/                          `claude plugin test` suites
clutch/                           spinner minigame (terminal only)
  hooks/language.ts               all user-facing strings, ko and en
claude-code-api/                  where the local mod API declaration goes (see its README)
tsconfig.json                     type check for both mods
```

## Setup

The full type check needs the mod API declaration file `claude-code-api/claude-code.d.ts`. It is written by Claude Code, carries no license notice, and is git-ignored. Copy it in before running the type check; [claude-code-api/README.md](claude-code-api/README.md) explains where to get it.

## Commands

Run from the repository root:

```bash
npx -y -p typescript@5.6.3 tsc -p tsconfig.json
claude plugin validate neon-sections
claude plugin validate clutch
claude plugin validate .
claude plugin test neon-sections
claude plugin test clutch
```

All six must pass before a change is merged. `validate` must report no errors.

To try a mod in a live session without installing it, load it for that session only:

```bash
claude --plugin-dir ./neon-sections --plugin-dir ./clutch
```

A session-only copy takes the place of an installed plugin with the same name for that session. Changing options in `/plugin` or `/config` during such a session still writes to your settings file.

## Rules

- Every user-facing string lives in the language table (`neon-sections/hooks/i18n.ts`, `clutch/hooks/language.ts`) in both `ko` and `en`. Add a test when you add a string: the `en` output must contain no Hangul.
- Keep internal state and comparisons on language-neutral keys, never on display text.
- The `language` option resolves `auto` from the Claude Code `language` setting. Keep that rule identical in both mods.
- Code comments are in English.
- Do not commit personal paths, secrets, or `claude-code-api/claude-code.d.ts`.
- Plugin names must not start with `claude-` or `anthropic-` (`claude plugin validate` rejects them).
- Bump the plugin `version` and the matching entry in `.claude-plugin/marketplace.json` together.
- The mod API is in early access. When it changes, refresh the declaration file and fix the type check before anything else.
