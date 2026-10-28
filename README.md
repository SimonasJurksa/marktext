<p align="center"><img src="docs/assets/logo-small.png" alt="MarkText" width="100" height="100"></p>

<h1 align="center">MarkText — Linux fork</h1>

A Linux-only (Ubuntu-first) fork of [MarkText](https://github.com/marktext/marktext), tuned as a lightweight
editor for working on Markdown alongside AI coding agents such as Claude Code.

For everything else — features, documentation, keybindings, contributing — see the
[upstream repository](https://github.com/marktext/marktext). This README only covers what this fork adds.

## What this fork adds

Status: 🚧 planned · ✅ done

| Feature | Status |
|---|---|
| **Ctrl+E — switch to open file**: PhpStorm-style switcher over open tabs, filtered by name, path or content; a content hit jumps to the tab with Find prefilled | ✅ |
| Folder search improvements (file names + content, ripgrep, no indexing) | 🚧 |
| Git change markers in the gutter and diff against `HEAD` | 🚧 |
| Git blame for the current line / file | 🚧 |
| **Plan questions**: documents using the `**K1. Question**` / `a) … b) …` / `Atsakymas:` template show an answered/total badge (red until complete, green when done) in the title bar and on the tab; **Ctrl+Shift+K** opens a wizard that walks through unanswered questions (letter keys pick an option, Enter moves on) and writes `a` or `a — comment` straight into the document | ✅ |
| Auto save on by default, 2 s after the last change | ✅ |

## Changed keybindings

| Action | Upstream | This fork |
|---|---|---|
| Switch to open file | — | <kbd>Ctrl</kbd>+<kbd>E</kbd> |
| Source code mode | <kbd>Ctrl</kbd>+<kbd>E</kbd> | <kbd>Ctrl</kbd>+<kbd>/</kbd> |
| Answer plan questions (wizard) | — | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> |
| Insert code fence | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> |

## Plan question template

```markdown
**K1. Question title?**

**Trumpai:** optional explanation.

a) first option (rekomenduojama)
b) second option

Atsakymas:
```

Any short letter prefix works (`K1`, `N3`, `Q12`). A question counts as answered when text follows
`Atsakymas:` on the same line or on the lines below it. `---` or a heading ends a question.

## Scope

- **Linux only**, primarily Ubuntu (tested on 20.04+). Windows and macOS builds are not maintained here.
- Shipped as a `.deb` package, versioned `<upstream>-sj.<n>` (e.g. `0.24.0-sj.1`).
- Regularly rebased on upstream `develop`.

## Install

Download the `.deb` from [Releases](https://github.com/SimonasJurksa/marktext/releases) and run:

```sh
sudo apt install ./marktext_*.deb
```

## Build from source

Requires Node.js ≥ 22.12 and pnpm 10.

```sh
pnpm install
pnpm run build:linux:x64   # output in packages/desktop/dist/
```

## License

[MIT](LICENSE), same as upstream. Copyright of the original code belongs to the MarkText authors.
