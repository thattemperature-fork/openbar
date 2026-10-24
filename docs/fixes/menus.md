# DateMenu notifications/media and menu-root fixes

Baseline: `1aa1eb345530df8b6e362a5fa1362d48ac8cffc6`. No user-session installation,
settings changes, push or deployment. All runtime runs use private buses and
headless compositors.

## TODO 6: modern notifications/media

### Research and root cause

- [Open Bar #181](https://github.com/neuromorph/openbar/issues/181) proposes
  MessageView/group traversal and media selector changes, but provides no patch
  or independent evidence that every item in its broad audit is correct. This
  fix was investigated and tested separately.
- Native sources, checked at tags
  [49.4 messageList.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/messageList.js),
  [50.4 messageList.js](https://github.com/GNOME/gnome-shell/blob/50.4/js/ui/messageList.js),
  [49.4 calendar.js](https://github.com/GNOME/gnome-shell/blob/49.4/js/ui/calendar.js),
  [50.4 calendar.js](https://github.com/GNOME/gnome-shell/blob/50.4/js/ui/calendar.js):
  `CalendarMessageList._messageView` is the scroll child. `MessageView` contains
  bins wrapping `NotificationMessageGroup`/`MediaMessage`, not sections with
  `_list`. Groups contain further bins wrapping notifications. The old optional
  `_list` traversal silently skips these actors. Media controls still use
  `.message-media-control`; it was primarily their unstyled parent, not a renamed
  control class, that broke their palette.
- [48.0](https://github.com/GNOME/gnome-shell/blob/48.0/js/ui/messageList.js)
  already has MessageView/groups. The fix detects the actual actor shape rather
  than introducing a 49-only version gate.
- [47.0 messageList.js](https://github.com/GNOME/gnome-shell/blob/47.0/js/ui/messageList.js)
  and [calendar.js](https://github.com/GNOME/gnome-shell/blob/47.0/js/ui/calendar.js)
  retain the old section `_list`/bin shape. That fallback remains intact.
- [50.4 native SCSS](https://github.com/GNOME/gnome-shell/blob/50.4/data/theme/gnome-shell-sass/widgets/_message-list.scss)
  adds `.message-group-title`, `.message-collapse-button` and
  `.media-message .message-icon.message-themed-icon`. The old
  `.media-message-cover-icon .fallback` cannot match modern symbolic cover icons.
  49.4 source has the same modern structure/selectors.

### Plan and implementation

1. Reproduce with native DateMenu groups using the actual extension methods and
   contrasting custom colors; query real St theme-node foreground/background.
2. Tag the stable MessageView root and scope message descendants beneath it in
   CSS, retaining existing per-message selectors. New groups, new notifications
   inside existing groups and rebuilt media are covered without observers or
   recursively tagging/reparenting native actors.
3. Apply the existing button palette to modern group headers/collapse controls
   and support the modern symbolic media icon alongside the old selector.
4. Do not subscribe to modern MessageView child-added; preserve old sections.
5. Verify native create/remove/expand/collapse and real external D-Bus transport,
   then rerun ordinary-menu, Clear-control and full extension lifecycle tests.

The group itself intentionally remains untagged: its descendant messages are
styled through the root. Tests assert rendered palette, not an implementation
requirement to add a redundant class to every group. Detaching a notification
removes its scoped palette automatically. No new modern notification signal or
lifecycle cleanup glue is needed.

### RED → GREEN evidence

- First native 50.4 run, before production edits:
  `.menu-modern-run.MXP1Qe/shell.log`: existing grouped notification stayed
  `#ffffffff,#54545aff`, expected `#cc334cff,#4c3319f3`.
- Root-scoped CSS fixed existing/late notification tests; next run
  `.menu-modern-run.5Shcm8` failed on group collapse button foreground. Group
  controls/header selectors were then added.
- With actual Adwaita icons installed/mapped, `.menu-modern-run.Vc46ni` failed
  the symbolic icon background (`#ffffff11`, expected `#19334cff`) before the
  modern icon selector was added. Earlier no-icon fixtures were corrected,
  rather than treating an uninitialized icon as evidence.
- Final expanded suite on **49.4 and 50.4**: **46 assertions** each. Includes
  existing/new native groups, messages added inside groups, hover, native
  expand/collapse methods, group title/collapse palette, removal, reparenting,
  repeated add/remove classes, no modern observers, real Notify/CloseNotification,
  MPRIS discovery and artist/title updates, actual PlayPause D-Bus method call,
  media control normal/hover/focus/insensitive palettes, CanPlay off/on
  recreation, media removal and disable/re-enable cleanup. A pre-48 section
  fixture uses real St actors and tests existing/late messages and disconnect;
  this is **not** a GNOME 47 runtime test.
- Real transport: launches the matching GNOME Shell notification proxy service;
  external `gdbus call org.freedesktop.Notifications.Notify` crosses the private
  bus to Shell, then the native DateMenu group is inspected. External GJS MPRIS
  service exports `/org/mpris/MediaPlayer2`, owns a real MPRIS bus name and sends
  `PropertiesChanged`; Shell discovers it normally. No `_addPlayer` or fake
  native player is used in this smoke test.
- `tests/menu-modern-scope.js`: **59 assertions** versus baseline `1aa1eb3`.
  Every existing selector/declaration/order survives in scoped and both global
  modes; only documented modern additions are allowed; disabled CSS is byte
  identical. The older `stylesheet-scope.js` test documents a previous
  ordinary-menu-only change and its no-new-rules assertion is not a suitable
  oracle for intentional new modern selectors.
- Existing suites, independently on **49.4 and 50.4**: ordinary menus **1319**,
  DateMenu Clear **9**, real full enable/disable lifecycle **24** assertions.
  `git diff --check` and runner shell syntax checks passed.

Artifacts retained locally in this worktree (not committed):
50.4 `.menu-modern-run.zSqljg`, `openbar-menu-test.TY1Eq0`,
`openbar-date-menu-test.aYCapm`, `openbar-lifecycle-test.izfKQN`;
49.4 `.menu-modern-run.rscI6D`, `openbar-menu-test.2HvTkf`,
`openbar-date-menu-test.Yczktq`, `openbar-lifecycle-test.xdGlLn`.

### Exact runtime commands

Run in the repository worktree:

```sh
ref=nixpkgs
# For Shell 49.4 instead:
# ref=github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41
mesa=$(nix eval --raw "$ref#mesa.outPath")
icons=$(nix eval --raw "$ref#adwaita-icon-theme.outPath")
XDG_DATA_DIRS="$icons/share:$XDG_DATA_DIRS" \
__EGL_VENDOR_LIBRARY_FILENAMES="$mesa/share/glvnd/egl_vendor.d/50_mesa.json" \
  nix shell "$ref#gnome-shell" "$ref#dbus" "$ref#glib.dev" "$ref#glib.bin" \
    "$ref#mesa" "$ref#gjs" "$ref#adwaita-icon-theme" -c bash -ec '
      bash tests/menu-modern-run.sh
      TMPDIR="$PWD" bash tests/run-menu-tests.sh
      TMPDIR="$PWD" bash tests/run-date-menu-tests.sh date-menu
      TMPDIR="$PWD" bash tests/run-date-menu-tests.sh lifecycle
    '
```

`glib.bin` supplies gdbus (glib.dev alone does not on Nix); Adwaita icons and
its `share` path are required to exercise the actual symbolic fallback icon.
The runner infers the matching Shell proxy service from the gnome-shell binary.

```sh
mkdir -p .menu-modern-css/schemas
cp openbar@neuromorph/schemas/*.xml .menu-modern-css/schemas/
git show 1aa1eb3:openbar@neuromorph/stylesheets.js > .menu-modern-css/baseline.js
types=''
for pkg in pango gobject-introspection harfbuzz; do
  p=$(nix eval --raw "nixpkgs#$pkg.out.outPath")
  types="$types:$p/lib/girepository-1.0"
done
GI_TYPELIB_PATH="$types" GSETTINGS_BACKEND=memory \
  nix shell nixpkgs#gjs nixpkgs#glib.dev nixpkgs#pango \
    nixpkgs#gobject-introspection nixpkgs#harfbuzz -c bash -ec '
      glib-compile-schemas .menu-modern-css/schemas
      gjs -m tests/menu-modern-scope.js .menu-modern-css/baseline.js .menu-modern-css
    '
```

### Limits

Private compositor only; no user desktop installation, visual judgment, QSAP,
third-party MediaControls/AppIndicator service or actual audio playback. Native
expansion/collapse methods are exercised with DateMenu closed; final media icon
assertions open the real menu. Early open-notification fixtures produced native
zero-size Cogl paint warnings with the minimal calendar backend; moving expansion
assertions offscreen eliminated these in final runs, rather than claiming a
native compositor bug was fixed. Final logs contain expected missing service
warnings (CalendarServer, GDM, colord/audio, etc.); no extension JS exceptions or
St/Cogl errors. Older native Shells are source-checked plus shape-fixture tested,
not runtime-certified. Private fields are not a public stable Shell API.
