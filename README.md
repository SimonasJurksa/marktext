<p align="center"><img src="docs/assets/logo-small.png" alt="MarkText" width="100" height="100"></p>

<h1 align="center">MarkText — Linux fork for working with AI agents</h1>

A Linux-only (Ubuntu-first) fork of [MarkText](https://github.com/marktext/marktext), tuned as a
lightweight Markdown editor for people who work next to AI coding agents such as Claude Code:
review the agent's plans, answer the questions it leaves in them, and search quickly across
everything on disk — without a full IDE.

Everything that upstream MarkText does is documented in the
[upstream repository](https://github.com/marktext/marktext). This README only covers what
this fork changes.

## What this fork adds

| Feature | Status |
|---|---|
| [Switch to open file](#switch-to-open-file-ctrle) (<kbd>Ctrl</kbd>+<kbd>E</kbd>) | ✅ since 0.24.0-sj.1 |
| [Plan questions: badge and answer wizard](#plan-questions-badge-and-answer-wizard-ctrlshiftk) (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd>) | ✅ since 0.24.0-sj.2 |
| [Auto save on by default](#auto-save-on-by-default) | ✅ since 0.24.0-sj.2 |
| [Find in Files](#find-in-files-ctrlshiftf) (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) | ✅ since 0.24.0-sj.3 |
| [Git annotations: blame, changes, commit details](#git-annotations-ctrlaltg) (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>) | ✅ since 0.24.0-sj.4 |
| Git: changed-files panel, revert hunk / file | 🚧 planned |

### Switch to open file (Ctrl+E)

A switcher that lists **only the files open in the current window**.

- The next tab is preselected, so <kbd>Ctrl</kbd>+<kbd>E</kbd>, <kbd>Enter</kbd> jumps to the
  previous document.
- Typing filters by file name and path.
- The same query also searches the **content** of every open file. Content hits are listed in a
  second group with their line number (`notes.md:12`); choosing one switches to that file and
  opens Find with the query already filled in, so <kbd>Enter</kbd> walks through the matches.
- Unsaved files are marked with `●`; untitled buffers are listed too.

Upstream's source code mode used <kbd>Ctrl</kbd>+<kbd>E</kbd>; it moved to
<kbd>Ctrl</kbd>+<kbd>/</kbd>.

### Plan questions: badge and answer wizard (Ctrl+Shift+K)

AI agents often end a plan with a list of questions for the human. This fork understands a simple
template for them (full example: [`docs/examples/plan-example.md`](docs/examples/plan-example.md)):

```markdown
**Q1. Which framework should the new site use?**

**In short:** optional explanation.

a) Astro with Markdown content files (recommended)
b) WordPress
c) keep static HTML

Answer:
```

- A question is a bold line `**<id>. title**`. The id is a short letter prefix plus a number:
  `Q1`, `K3`, `N12`.
- Options are lettered lines `a)`, `b)` …; a wrapped option continues on the following lines.
  `(recommended)` / `(rekomenduojama)` marks the suggested option.
- The answer line is `Answer:` or `Atsakymas:` (Lithuanian). A question counts as answered when
  text follows the keyword on the same line or on the lines below it.
- `---` or a heading ends a question.

What you get:

- **Badge** — every document with at least one question shows `answered/total` in the title bar
  and on its tab: red while questions are open, green when all are answered. The number follows
  your edits live.
- **Wizard** — <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> (or the badge, or *Edit → Answer Plan
  Questions…*) opens a dialog that starts at the first unanswered question. The list on the left
  shows progress and lets you jump around.
  - Letter keys <kbd>a</kbd>–<kbd>z</kbd> pick an option, <kbd>Enter</kbd> (or
    <kbd>Ctrl</kbd>+<kbd>Enter</kbd> inside the comment box) saves and moves on,
    *Skip* leaves a question open, *Back* returns.
  - The answer is written into the document immediately as `a`, `a — your comment`, or free text
    when no option fits, on the `Answer:` line. The file is saved by auto save (below) or
    <kbd>Ctrl</kbd>+<kbd>S</kbd>; the write is a single undo step.

The code fence shortcut that upstream had on <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> moved
to <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd>.

### Auto save on by default

Agents read files from disk, so unsaved edits are invisible to them. Auto save is enabled by
default with a 2 s delay (upstream: off, 5 s). Both can still be changed in *Preferences → General*.

A `preferences.json` written by upstream MarkText keeps its own `autoSave: false`, so the fork
switches it on once on first start and records `forkDefaultsVersion` in the file. Turning auto
save off again afterwards is respected.

### Find in Files (Ctrl+Shift+F)

A *Find in Files* dialog that searches **any directory**, not only the open
project (upstream's sidebar search stays available from *Edit → Find in Folder*, but is no longer
bound to a key on Linux).

- **Directory**: defaults to the last directory you searched (or the open folder / the current
  file's folder). Type a path, pick one from the 10-entry history, or use the *…* button.
- **File mask**: `*.md, *.txt, !*.min.js`. Remembered between searches; empty means every file.
- **Cc / W / .\***: case sensitive, whole word, regular expression — remembered too.
- **Multi-line queries**: <kbd>Shift</kbd>+<kbd>Enter</kbd> adds a line to the query, or write
  `\n` in regex mode. Line breaks match both `\n` and `\r\n` files. Example: `Answer:` followed by
  an empty line finds every unanswered question under a directory tree.
- **Preview**: the selected hit shows the whole file as plain text, scrolled to the match with the
  matching lines highlighted. <kbd>↑</kbd>/<kbd>↓</kbd> move through results,
  <kbd>Enter</kbd> or a double click opens the file at that line (in the existing tab when it is
  already open).
- Searches hidden files and files listed in `.gitignore`; stops after 100 matches and says so.
  *Stop* cancels a long search. Powered by upstream's bundled ripgrep, no indexing.

### Git annotations (Ctrl+Alt+G)

Blame and change markers next to the text: who changed what, and what differs from the last
commit, for any file inside a Git repository. Everything runs through the `git` command that Ubuntu already has; nothing
else to install.

- **Annotate column** — <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> (or *View → Git Annotate*)
  toggles a column on the left of the text. In WYSIWYG mode it has one row per block (paragraph,
  heading, list, code block …) showing the date and author of the newest commit that touched it;
  in source code mode it is a CodeMirror gutter with one row per line. Rows are tinted per author.
- **Changes against HEAD** — a green edge marks added blocks/lines, blue marks modified ones, and a
  red underline marks the place where text was deleted (hover to read the deleted lines). Blocks
  edited since the last commit read *Not committed*. Unsaved edits count too: the blame and the
  diff are computed from the editor buffer, not only from the file on disk.
- **Commit dialog** — click a row (or *View → Show Git Commit for Current Line*) to see the full
  SHA with a *Copy SHA* button, author, date, the complete commit message and the files that commit
  changed.
- **Title bar** — the commit of the block under the caret is summarised next to the word count
  (`author · 2 hours ago · subject`); clicking it opens the same dialog.
- **File tree** — modified files are shown in blue, added or untracked files in green.
- Data refreshes 1 s after you stop typing, on save, when the window regains focus, when another
  program (an agent) changes the file, and when switching tabs. The column state is remembered per
  window.

Limitations of this first iteration: read-only (no stage, commit or revert), no list of changed
files beyond the tree colours, and the WYSIWYG mapping is per block, so a one-word change still
marks the whole paragraph.

## Changed keybindings (Linux)

| Action | Upstream | This fork |
|---|---|---|
| Switch to open file | — | <kbd>Ctrl</kbd>+<kbd>E</kbd> |
| Source code mode | <kbd>Ctrl</kbd>+<kbd>E</kbd> | <kbd>Ctrl</kbd>+<kbd>/</kbd> |
| Find in Files dialog | — | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> |
| Sidebar Find in Folder | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | unbound (Edit menu, command palette) |
| Answer plan questions | — | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> |
| Insert code fence | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>K</kbd> | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd> |
| Git annotations (blame and changes) | — | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd> |

All of them can be changed in *Preferences → Keybindings*.

## Scope

- **Linux only**, primarily Ubuntu (built and tested on 20.04; newer releases need nothing
  special). Windows and macOS builds are not maintained here.
- Shipped as a `.deb`, versioned `<upstream>-sj.<n>` (for example `0.24.0-sj.3`).
- Regularly rebased on upstream `develop`.

## Install

Download the `.deb` from [Releases](https://github.com/SimonasJurksa/marktext/releases) and run:

```sh
wget https://github.com/SimonasJurksa/marktext/releases/download/v0.24.0-sj.5/marktext-linux-0.24.0-sj.5.deb
sudo apt install ./marktext-linux-0.24.0-sj.5.deb
```

Debian treats `0.24.0~sj.5` as *older* than upstream's `0.24.0~dev`; remove upstream first
(`sudo apt remove marktext`) if apt refuses to downgrade. The Git features need `git` installed.

Releases are built by GitHub Actions (`.github/workflows/release.yml`, Linux x64 only): pushing a
`v*` tag builds the `.deb` inside an Ubuntu 20.04 container, so the package runs on Ubuntu 20.04
and newer, and publishes it with a `SHA256SUMS.txt`. The same workflow can be started by hand from
the *Actions* tab for an existing tag. On a fresh fork, GitHub keeps workflows disabled until they
are enabled once on the *Actions* tab.

## Build from source

Requirements: Node.js ≥ 22.12, pnpm 10 (`corepack enable`), a C++ toolchain that understands
C++20 (GCC 13 is known to work), and the X11 headers for `native-keymap`.

On Ubuntu 20.04 specifically:

```sh
sudo apt install libx11-dev libxkbfile-dev
sudo add-apt-repository ppa:ubuntu-toolchain-r/test && sudo apt install g++-13
export CC=gcc-13 CXX=g++-13
export LDFLAGS="-static-libstdc++ -static-libgcc"
```

The `LDFLAGS` line makes the native modules carry their own libstdc++; without it the `.deb` only
runs on machines that also have GCC 13's runtime library.

Then:

```sh
pnpm install
pnpm run build:linux:x64        # .deb lands in dist/
pnpm --filter marktext test:unit
pnpm --filter marktext test:e2e  # Playwright, needs a display
```

Only the `deb` target is built; AppImage/snap/rpm were dropped from `electron-builder.yml`.

## Release notes

- **0.24.0-sj.5** — first build published on GitHub Releases; same features as sj.4, but the
  native modules carry their own libstdc++, so the `.deb` installs on a stock Ubuntu 20.04 or
  newer without GCC 13's runtime library.
- **0.24.0-sj.4** — Git annotations (blame column in both modes, changes against HEAD, commit
  dialog, title-bar blame line, file tree colours); auto save is switched on once for preference
  files inherited from upstream.
- **0.24.0-sj.3** — Find in Files dialog; `Answer:` accepted next to `Atsakymas:`.
- **0.24.0-sj.2** — plan question badge and wizard; auto save on by default (2 s); code fence on
  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>K</kbd>.
- **0.24.0-sj.1** — <kbd>Ctrl</kbd>+<kbd>E</kbd> open-file switcher; source code mode on
  <kbd>Ctrl</kbd>+<kbd>/</kbd>; Linux build limited to `.deb`.

## License

[MIT](LICENSE), same as upstream. Copyright of the original code belongs to the MarkText authors.
