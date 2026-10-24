# Preferences horizontal resize regression

Baseline: `65e9523636ba572baa0aae9ec2261468723c43b8` (`fixing`).

## Cause and fix

The custom two-column UI was inside Adw.PreferencesPage's internal Adw.Clamp.
Its default600sp maximum/400sp tightening threshold stopped the gray container
following the window. Reduced minimum requests exposed the inherited cap.
The explicit inner Gtk.Viewport also used NATURAL, forcing a preferred-width
page rather than shrinking within its native minimum/natural range.

Use MINIMUM horizontal scroll policy. After the preferences group is attached,
find its actual Adw.Clamp ancestor, verify that its parent is a Gtk.Viewport,
and unwrap that clamp's child into the same viewport. This is localized to this
page, retains the native page/group/window and outer scrolling lifecycle, and
avoids magic huge clamp limits, global CSS and resize-signal ownership. If a
future Adwaita layout no longer has this exact typed wrapper, skip the unwrap
rather than assuming positional children. Tested current implementations do.

Source contracts:
- [Adwaita1.9.3 PreferencesPage template](https://github.com/GNOME/libadwaita/blob/1.9.3/src/adw-preferences-page.ui).
- [GTK scroll policies](https://docs.gtk.org/gtk4/enum.ScrollablePolicy.html).

## Regression and real execution

`bash tests/prefs-native.sh resize` executes actual exported preferences in a
private compositor/settings/HOME. Grow/shrink640→820→1000→820→640, at96/120dpi,
all13 pages. Require the gray box to use available window width; require the
active stack allocation to equal max(available width,native minimum), allowing
one pixel rounding, and retain scroll reachability below minimum. Output persists
all native measurements. Existing minimum/scroll-only tests did not check this.

RED before production edits: `openbar-prefs.jguWz1`, expected failure:
`gray settings box uses available window width at640px/96dpi (got532)`.

GREEN: new resize plus all five existing preferences modes (lifecycle, layout,
transactions, actual service, service-error) pass on GTK4.18.6/4.20.3/4.22.4.
[Machine-readable parent result readbacks](prefs-resize-results.json):18 runs,
1152 assertions,390 page/resize measurements; no preferences JS ERROR/CRITICAL
or unhandled promises in successful result logs. Syntax/diff checks pass.

GTK4.22 normal-font example: gray box640/820/1000px; GTK/Flatpak settings
450/630/810px respectively, then back to630/450px; no horizontal overflow.
GTK4.18/4.20 have a genuine one-pixel minimum overflow at640px on that page;
full growth/shrink still verified, not hidden or clipped native controls.

Select coherent older package sets with `REF`:
-49: `github:NixOS/nixpkgs/b6018f87da91d19d0ab4cf979885689b469cdd41`
-48: `github:NixOS/nixpkgs/nixos-25.05`

Only prefs.js and its native tests change executable behavior. No shell/runtime,
schema, app GTK CSS, host settings or deployed extension was changed. Native
layout measurements are not physical pointer/keyboard or every locale testing.
Future libadwaita internal-template changes require revisiting this bounded
compatibility adjustment. Commit locally; no push or deployment in this task.
