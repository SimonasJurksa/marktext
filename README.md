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
| [Fork defaults: auto save, tab bar, sidebar, session restore, newest files first](#fork-defaults) | ✅ since 0.24.0-sj.2, extended in sj.7 |
| [Find in Files](#find-in-files-ctrlshiftf) (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>) | ✅ since 0.24.0-sj.3 |
| [Git annotations: blame, changes, commit details](#git-annotations-ctrlaltg) (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>G</kbd>) | ✅ since 0.24.0-sj.4 |
| [Back and forward through editing places](#back-and-forward-mouse-side-buttons-ctrlaltleftright) (mouse side buttons, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>) | ✅ since 0.24.0-sj.6 |
| [Double Shift opens the file search](#double-shift-find-a-file) | ✅ since 0.24.0-sj.6 |
| [File tree: plan status dots, empty folders hidden](#file-tree-plan-status-dots-and-empty-folders) | ✅ since 0.24.0-sj.6 |
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

### Fork defaults

The fork ships with the settings a plan-review workflow needs, so a fresh install needs no
configuration:

| Setting | Fork | Upstream |
|---|---|---|
| Auto save (agents read files from disk, unsaved edits are invisible to them) | on, 2 s | off, 5 s |
| Tab bar | shown | hidden |
| Sidebar | shown | hidden |
| Title bar | in-app (custom) | in-app (custom) |
| On startup | restore all windows, files, layout and caret positions | same |
| File tree order | by modification time, newest first | by creation time, oldest first |

Every one of them can still be changed in *Preferences*. A `preferences.json` written by upstream
MarkText or by an older fork build is brought up to these defaults **once** on the next start
(the file records `forkDefaultsVersion`); choices made after that are respected. *Preferences →
General → Fork defaults → Restore all defaults* puts every setting back to the table above
(keybindings are kept).

Two upstream behaviours that fought these defaults were changed as well:

- *View → Toggle Tab Bar* now writes `tabBarVisibility`, like the sidebar toggle always did, so a
  hidden or shown tab bar survives a restart.
- Launching MarkText with a file (double click in the file manager, `marktext note.md`) used to
  throw the saved session away and open only that file. With *Restore all windows* the previous
  session comes back and the file is added to it.

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
- **Title bar** — a commit glyph next to the word count stands for the commit of the block under
  the caret (dashed and blue while the block is not committed). Hover it for author, relative and
  absolute date, subject and short SHA; clicking it opens the same dialog.
- **File tree** — modified files are shown in blue, added or untracked files in green.
- Data refreshes 1 s after you stop typing, on save, when the window regains focus, when another
  program (an agent) changes the file, and when switching tabs. The column state is remembered per
  window.

Limitations of this first iteration: read-only (no stage, commit or revert), no list of changed
files beyond the tree colours, and the WYSIWYG mapping is per block, so a one-word change still
marks the whole paragraph.

### Back and forward (mouse side buttons, Ctrl+Alt+Left/Right)

MarkText remembers the places you edited, the way an IDE does, and the *back* / *forward* side
buttons of a mouse (or <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd>, *View → Back /
Forward*) walk through them.

- A place is a file plus a line. A new entry is recorded whenever you land in another file (tab,
  file tree, <kbd>Ctrl</kbd>+<kbd>E</kbd>, <kbd>Ctrl</kbd>+<kbd>P</kbd>, Find in Files, the plan
  wizard) and whenever the caret jumps more than 10 lines inside the same file. Smaller caret
  moves only update the current entry, so *back* returns to where you worked, not to the previous
  line.
- Works in both WYSIWYG and source code mode; in WYSIWYG the caret lands on the block that
  contains the line.
- A place in a file you have closed since is reopened at the same spot. Places in untitled
  buffers disappear when the buffer is closed.
- Going back and then editing somewhere else drops the forward history, like a browser.

### Double Shift: find a file

Two quick taps of the **left** <kbd>Shift</kbd> open the project-wide file search
(<kbd>Ctrl</kbd>+<kbd>P</kbd>: files by name in the open folders plus recently opened files). The
second tap has to come within 300 ms, each press must be short, and any other key in between
cancels the gesture, so typing capital letters never triggers it.

### File tree: plan status dots and empty folders

- Every Markdown file with [plan questions](#plan-questions-badge-and-answer-wizard-ctrlshiftk)
  shows a dot after its name in the file tree and in the *Opened files* list: **red** while
  questions are still open, **green** when all are answered. Hover for `3 of 5 plan questions
  answered`. Files that are open are counted from the editor buffer (unsaved answers count
  immediately); everything else is read from disk and refreshed when the file changes.
- Folders that contain no listed file, directly or in any subfolder, are hidden. *Show empty
  folders* in the tree's right-click menu lists them again (remembered per machine). A folder you
  create from the tree stays visible while it is still empty.

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
| Back / forward through editing places | — | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd> / <kbd>→</kbd>, mouse side buttons |
| Project-wide file search | <kbd>Ctrl</kbd>+<kbd>P</kbd> | <kbd>Ctrl</kbd>+<kbd>P</kbd> or double <kbd>Shift</kbd> (left) |

All of them can be changed in *Preferences → Keybindings*.

## Scope

- **Linux only**, primarily Ubuntu (built and tested on 20.04; newer releases need nothing
  special). Windows and macOS builds are not maintained here.
- Shipped as a `.deb`, versioned `<upstream>-sj.<n>` (for example `0.24.0-sj.3`).
- Regularly rebased on upstream `develop`.

## Install

Download the `.deb` from [Releases](https://github.com/SimonasJurksa/marktext/releases) and run:

```sh
wget https://github.com/SimonasJurksa/marktext/releases/download/v0.24.0-sj.8/marktext-linux-0.24.0-sj.8.deb
sudo apt install ./marktext-linux-0.24.0-sj.8.deb
```

Debian treats `0.24.0~sj.8` as *older* than upstream's `0.24.0~dev`; remove upstream first
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

- **0.24.0-sj.8** — the title-bar blame text is replaced by a commit glyph; the details moved to
  its tooltip, clicking it still opens the commit dialog.
- **0.24.0-sj.7** — fork defaults extended (tab bar and sidebar shown, session restore, files
  newest first) with a one-time migration of existing preference files and a *Restore all
  defaults* button; the tab bar toggle is persisted; launching with a file no longer discards
  the saved session.
- **0.24.0-sj.6** — back/forward navigation through editing places (mouse side buttons,
  <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>←</kbd>/<kbd>→</kbd>); double left <kbd>Shift</kbd> opens
  the file search; plan status dots in the file tree; empty folders hidden.
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
