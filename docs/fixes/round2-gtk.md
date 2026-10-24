# Round 2: generated GTK views and traffic-light controls

## Scope, evidence and plan

Baseline `ffba24d4391e987fafbdf38fb9abb4fe4a0b91ae`. Only `openbar@neuromorph/stylesheets.js` production changes; no TODO, other production modules, installation, push or deployment.

Reports and full discussion:
- [#85 file picker](https://github.com/neuromorph/openbar/issues/85), [real light export](https://github.com/neuromorph/openbar/issues/85#issuecomment-2478517480).
- [#132 semantic note colors](https://github.com/neuromorph/openbar/issues/132), [candidate application style contract](https://github.com/vixalien/sticky/blob/main/data/stylus/style.styl).
- [#135 label rectangles](https://github.com/neuromorph/openbar/issues/135), [real export](https://github.com/user-attachments/files/21389080/openbar-config.txt).
- [#137 Evolution selection](https://github.com/neuromorph/openbar/issues/137).
- [#115 traffic-light capsules](https://github.com/neuromorph/openbar/issues/115).

Plan: native failing regressions first; narrow the actual collection-view/state cascade; preserve application-owned text canvases; independently reproduce stretched Adw controls before changing geometry; run native GTK3/GTK4 and all 23 existing writer tests; commit the two fixes separately.

## View fix

Root cause: `.view`/`.content-pane` at USER priority paints arbitrary class-bearing labels, selected TreeViews and application TextViews. Defining `view_fg_color` does not necessarily set a widget's foreground. Also, redefining native `view_bg_color` changes libadwaita's own `.view` rule even after direct selectors are narrowed.

Changes:
- Actual `treeview`, `iconview`, `listview`, `gridview`, `columnview` nodes with `.view` only; no generic `.view` or `.content-pane` painting.
- Couple normal background/foreground; exclude `:selected` entirely, preserving the native selected/focused/backdrop pair. Backdrop foreground is calculated against its own hint-mixed background.
- Namespace Open Bar view colors `obar_view_*` so native/application styles using toolkit named colors do not inherit an unintended global view palette.
- `label.view` explicitly has transparent background/no image, including libadwaita's own background rule.
- No direct TextView override. GTK exposes no reliable semantic-vs-generic editor selector. Both stay application/native-owned; this deliberately narrows default view-hint/transparency scope instead of pretending specificity can outrank USER CSS. Headerbar, collection-view, window, sidebar, card, accent and other theming remain enabled. No universal `!important`.

### Reproducible commands

```sh
# Run from checkout, using durable scratch (not the live user's HOME).
export TMPDIR=/path/to/disposable-durable-scratch
bash tests/round2-gtk-run.sh view3 view4
bash tests/round2-gtk-run.sh writers
# Optional coherent package-set pin:
NIXPKGS_REF=github:NixOS/nixpkgs/<revision> bash tests/round2-gtk-run.sh
```

The runner resolves coherent Nix dependencies/typelibs/schema/icon/Mesa paths rather than hardcoding this host's store paths. It compiles private schemas, uses memory GSettings, private HOME/XDG dirs, a private D-Bus and headless compositor; it unsets live display/bus/GTK_THEME. Actual exported `saveGtkCss` writes the tested files. Success requires post-assertion markers, subprocess success and absence of test critical/parser failures.

### RED → GREEN evidence

- RED, before production changes: `openbar-round2-gtk.NBzXFp`: GTK3 eight state/contrast failures; GTK4 label/background failure. Corrected semantic fixture to put red on TextView and transparent text child, matching application contract: `openbar-round2-gtk.78S7lT` then also fails semantic red and generic native preservation. These are expected assertion failures, not success claims.
- Early harness-only attempts lacked Atk/schema paths or incorrectly assumed writer returned a boolean. Corrected before valid RED. Initial Weston headless runs emitted missing-seat GTK3 warning; final portable runner uses a private GNOME compositor, eliminating that harness warning.
- GREEN: `openbar-round2-gtk.BKr7eS`, GTK3 **3.24.52**, GTK4 **4.22.4**, libadwaita **1.9.3**. Nine GTK3 assertions: selected, focused-selected and selected-backdrop exact native color-pair preservation/contrast; #85 actual light export on native dark remains light with matching foreground and unselected-backdrop contrast. Four GTK4 assertions: #135 actual export produces Label.view glyphs without any background color node; application-priority red note and its black foreground survive USER CSS; generic editor rendering matches provider removal control. Native serialized GSK nodes and JSON retained in artifact directory.
- Existing writer/ownership suite: `openbar-writes.pRZmc1`, **23 PASS**, including active/stale generations, snapshots, backup/restore/conflict/symlink handling and Flatpak ownership.

## Limits

These are actual toolkit CSS/cascade/rendering mechanisms, not full Evolution mailbox or identified Sticky Notes integration certification. Report #132 does not prove the candidate repository is the reporter's exact app. Application CSS using its own semantic classes/colors survives the narrowed TextView scope; an app intentionally using global window/accent variables can still opt into those palettes. Transparent views over arbitrary imagery cannot carry a universal contrast guarantee. Other apps/toolkits, old GNOME/GTK versions, host desktops, Flatpak sandbox transport and existing independent process provider reloads are not certified. The independent-process restart/reload limitation (#119/#133) is unchanged.
