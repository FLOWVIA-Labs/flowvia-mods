# claude-code-api

The root `tsconfig.json` type-checks both mods against `claude-code.d.ts` in this folder: the TypeScript declarations of the Claude Code mod API.

## Why the file is not in git

Claude Code writes `claude-code.d.ts` itself, and the file carries no license notice, so this repository does not redistribute it. It is listed in `.gitignore`; each checkout keeps its own local copy.

Do not edit the file. Replace it whole with a newer copy written by Claude Code. Its first line, `// Written by Claude Code <version>.`, names the version it came from. The type check in this repository last passed with 2.1.299.

Each mod's own `tsconfig.json` extends `<mod>/.claude-plugin/types/`, which Claude Code writes next to a mod it loads from a folder you own. That folder is git-ignored as well and is separate from this copy.

## Getting a copy

Claude Code writes the declarations when an interactive session (terminal `claude` or the desktop app) loads the plugin-authoring skill. On macOS the file lands here:

```
/private/tmp/claude-$(id -u)/bundled-skills/<version>/<hash>/plugin-authoring/types/claude-code.d.ts
```

- `claude -p`, `claude plugin test`, and `claude plugin validate` do not write it.
- The OS clears `/private/tmp` after a few days, so copy the file as soon as it appears.
- The terminal CLI and the desktop app can be on different versions. If you find several copies, take the newest.

From the repository root:

```bash
ls /private/tmp/claude-$(id -u)/bundled-skills/*/*/plugin-authoring/types/claude-code.d.ts
SRC="/private/tmp/claude-$(id -u)/bundled-skills/<version>/<hash>/plugin-authoring/types/claude-code.d.ts"
head -1 "$SRC"
cp "$SRC" claude-code-api/claude-code.d.ts
npx -y -p typescript@5.6.3 tsc -p tsconfig.json
```

Replace `<version>` and `<hash>` with a path from the `ls` output.

## When to refresh

Refresh the copy when a mod starts using an API the current copy does not declare (a new prop, a new method on `$`). The type check then fails with errors such as TS2322 or TS2339.
