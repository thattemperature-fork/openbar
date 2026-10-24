/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 * author: neuromorph
 */

/* exported Openbar */

import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import GdkPixbuf from 'gi://GdkPixbuf';
import Meta from 'gi://Meta';
import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Calendar from 'resource:///org/gnome/shell/ui/calendar.js';
import * as LayoutManager from 'resource:///org/gnome/shell/ui/layout.js';
import * as Config from 'resource:///org/gnome/shell/misc/config.js';
import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Quantize from './quantize.js';
import * as AutoThemes from './autothemes.js';
import * as StyleSheets from './stylesheets.js';

Gio._promisify(Gio.File.prototype, "copy_async", "copy_finish");

// ConnectManager class to manage connections for events to trigger Openbar style updates
// This class is modified from Floating Panel extension (Thanks Aylur!)
class ConnectManager{
    constructor(list = []){
        this.connections = [];
        this.destroyConnections = new Map();

        list.forEach(c => {
            let [obj, signal, callback, callback_param] = c;
            this.connect(obj, signal, callback, callback_param);
        });
    }

    connect(obj, signal, callback, callback_param){
        if(this.connections.some(c => c.obj === obj && c.sig === signal &&
            c.callback === callback && c.callback_param === callback_param))
            return;
        this.connections.push({
            id : obj.connect(signal, (object, signal_param) => {callback(object, signal, signal_param, callback_param)}),
            obj: obj,
            sig: signal,
            callback, callback_param
        });
        // Remove obj on destroy except following that don't have destroy signal
        if(!this.destroyConnections.has(obj) && !(obj instanceof Gio.Settings || obj instanceof LayoutManager.LayoutManager || obj instanceof Meta.WorkspaceManager || obj instanceof Meta.Display || obj instanceof Meta.Window)) {
            this.destroyConnections.set(obj, obj.connect('destroy', () => {
                this.removeObject(obj)
            }));
        }
    }

    // remove an object WITHOUT disconnecting it, use only when you know the object is destroyed
    removeObject(object){
        this.connections = this.connections.filter(({id, obj, sig}) => obj != object);
        this.destroyConnections.delete(object);
    }

    disconnect(object, signal){
        let disconnections = this.connections.filter(({id, obj, sig}) => obj == object && sig == signal);
        disconnections.forEach(c => {
            c.obj.disconnect(c.id);
        });
        this.connections = this.connections.filter(({id, obj, sig}) => obj != object || sig != signal);
        if(!this.connections.some(c => c.obj === object) && this.destroyConnections.has(object)) {
            object.disconnect(this.destroyConnections.get(object));
            this.destroyConnections.delete(object);
        }
    }

    disconnectAll(){
        this.connections.forEach(c => {
            // console.log('Disconnect All - c.id: ', c.id);
            if(c.obj && c.id > 0)
                c.obj.disconnect(c.id);
        })
        this.connections = [];
        for(const [obj, id] of this.destroyConnections)
            obj.disconnect(id);
        this.destroyConnections.clear();
    }
}


// Openbar Extension main class
export default class Openbar extends Extension {
    constructor(metadata) {
        super(metadata);
        this._settings = null;
        this._bgSettings = null;
        this._intSettings = null;
        this._hcSettings = null;
        this._connections = null;
        this._injections = [];
        this.panelBoxes = [];
        this.msgLists = [];
        this.msgListIds = [];
        this._timeouts = new Map();
        this._appearance = new Map();
    }

    _queueTimeout(name, callback, delay) {
        if(this[name])
            clearTimeout(this[name]);
        this[name] = null;
        this._timeouts ??= new Map();
        this._timeouts.delete(name);
        if(this.disabling)
            return;
        this[name] = setTimeout(() => {
            this._timeouts.delete(name);
            this[name] = null;
            if(!this.disabling)
                callback();
        }, delay);
        this._timeouts.set(name, this[name]);
    }

    _cancelTimeouts() {
        for(const [name, id] of this._timeouts ?? []) {
            clearTimeout(id);
            this[name] = null;
        }
        this._timeouts?.clear();
    }

    // Shell callbacks are synchronous; own every detached completion/rejection.
    _runStyleTask(label, task) {
        try {
            return Promise.resolve(task()).catch(error => {
                console.error(`Open Bar: ${label} failed: ${error.message}`);
                return false;
            });
        } catch(error) {
            console.error(`Open Bar: ${label} failed: ${error.message}`);
            return Promise.resolve(false);
        }
    }

    _writeAppearance(key, value) {
        const settings = this._intSettings;
        const current = settings.get_string(key);
        let owned = this._appearance.get(key);
        if(owned && current !== owned.last) {
            this._restoreAppearance([key]); // releases ownership, preserves the user's change
            owned = null;
        }
        if(current === value)
            return; // no change, no new ownership
        if(!owned) {
            owned = {original: current, last: current, writing: false};
            owned.id = settings.connect(`changed::${key}`, () => {
                if(!owned.writing && settings.get_string(key) !== owned.last) {
                    settings.disconnect(owned.id);
                    this._appearance.delete(key);
                }
            });
            this._appearance.set(key, owned);
        }
        owned.writing = true;
        try {
            if(settings.set_string(key, value))
                owned.last = value;
        } finally {
            owned.writing = false;
        }
    }

    _restoreAppearance(keys = [...this._appearance.keys()]) {
        for(const key of keys) {
            const owned = this._appearance.get(key);
            if(!owned)
                continue;
            this._appearance.delete(key);
            this._intSettings.disconnect(owned.id);
            if(this._intSettings.get_string(key) === owned.last)
                this._intSettings.set_string(key, owned.original);
        }
    }

    _updateAppearance(key) {
        if(!['mscolor', 'set-yarutheme', 'enabled'].includes(key))
            return;
        if(key !== 'set-yarutheme' && this.gnomeVersion >= 47)
            this._writeAppearance('accent-color', AutoThemes.getClosestGnomeAccent(this));
        if(this._settings.get_boolean('set-yarutheme')) {
            const suffix = this._intSettings.get_string('color-scheme') === 'prefer-dark' ? '-dark' : '';
            const color = AutoThemes.getClosestYaruTheme(this);
            const theme = 'Yaru' + (color === 'default' ? '' : '-' + color) + suffix;
            this._writeAppearance('gtk-theme', theme);
            this._writeAppearance('icon-theme', theme);
        } else {
            this._restoreAppearance(['gtk-theme', 'icon-theme']);
        }
    }

    // Generate a color palette from desktop background image
    async getPaletteFromImage(pictureUri, cancellable = null) {
        if(!pictureUri || /\.xml$/i.test(pictureUri))
            return [null, null];
        const pictureFile = Gio.File.new_for_uri(pictureUri);
        const stream = await new Promise((resolve, reject) => {
            pictureFile.read_async(GLib.PRIORITY_DEFAULT, cancellable, (file, result) => {
                try { resolve(file.read_finish(result)); } catch(error) { reject(error); }
            });
        });
        let pixbuf;
        try {
            // Decoding runs off the Shell thread; keep both dimensions bounded.
            pixbuf = await new Promise((resolve, reject) => {
                GdkPixbuf.Pixbuf.new_from_stream_at_scale_async(stream, 256, 256, true,
                    cancellable, (_source, result) => {
                        try { resolve(GdkPixbuf.Pixbuf.new_from_stream_finish(result)); }
                        catch(error) { reject(error); }
                    });
            });
        } finally {
            await new Promise((resolve, reject) => {
                // Closing must still run when the decode was cancelled.
                stream.close_async(GLib.PRIORITY_DEFAULT, null, (input, result) => {
                    try { input.close_finish(result); resolve(); } catch(error) { reject(error); }
                });
            });
        }
        if(cancellable?.is_cancelled())
            return [null, null];
        const width = pixbuf.get_width(), height = pixbuf.get_height();
        const channels = pixbuf.n_channels, rowstride = pixbuf.get_rowstride();
        const pixels = pixbuf.get_pixels();
        const pixelArray = [];
        // Bound JS allocations/quantizer work even for large or portrait images.
        const step = Math.max(1, Math.ceil(width * height / 10000));
        for(let i = 0; i < width * height; i += step) {
            const index = Math.floor(i / width) * rowstride + (i % width) * channels;
            const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
            if(channels === 4 && pixels[index + 3] < 125)
                continue;
            if(!(r > 250 && g > 250 && b > 250) && !(r < 5 && g < 5 && b < 5))
                pixelArray.push([r, g, b]);
        }
        const cmap = Quantize.quantize(pixelArray, 12);
        if(!cmap)
            return [null, null];
        const counts = cmap.colorCounts();
        // Never detach a population from its color while sorting.
        const entries = cmap.palette().map((color, i) => [color, counts[i]])
            .filter(([, count]) => Number.isFinite(count) && count > 0)
            .sort((a, b) => b[1] - a[1]);
        return [entries.map(([color]) => color), entries.map(([, count]) => count)];
    }

    async backgroundPalette() {
        if(!this._settings || !this._intSettings || this._settings.get_boolean('import-export'))
            return;
        this._paletteCancellable?.cancel();
        const cancellable = new Gio.Cancellable();
        this._paletteCancellable = cancellable;
        const settings = this._settings;
        const isCurrent = () => this._paletteCancellable === cancellable &&
            !cancellable.is_cancelled() && this._settings === settings &&
            !settings.get_boolean('import-export');
        const uris = [settings.get_string('dark-bguri'), settings.get_string('light-bguri')];
        // Deliberately scoped to this refresh: same URI may contain new image data.
        const results = new Map();
        try {
            for(const [index, mode] of ['dark', 'light'].entries()) {
                if(!isCurrent())
                    return;
                const uri = uris[index];
                if(!uri || /\.xml$/i.test(uri))
                    continue;
                let result = results.get(uri);
                if(!result) {
                    try {
                        result = await this.getPaletteFromImage(uri, cancellable);
                    } catch(error) {
                        if(!isCurrent())
                            return;
                        console.warn(`Open Bar: could not read wallpaper: ${error.message}`);
                        continue;
                    }
                    results.set(uri, result);
                }
                if(!isCurrent())
                    return;
                const [palette, counts] = result;
                if(!palette?.length || palette.length > 12 || palette.length !== counts?.length ||
                    counts.some(count => !Number.isFinite(count) || count < 0) ||
                    counts.reduce((a, b) => a + b, 0) <= 0 ||
                    palette.some(color => color.length !== 3 || color.some(c => !Number.isFinite(c) || c < 0 || c > 255)))
                    continue;
                // Fill all slots so a short palette cannot retain older colors/counts.
                const colors = Array.from({length: 12}, (_, i) => palette[i] ?? palette[0]);
                const populations = Array.from({length: 12}, (_, i) => counts[i] ?? 0);
                // Until the whole mode is published, old counts no longer
                // describe its (possibly partially replaced) palette.
                if(this._paletteCounts)
                    delete this._paletteCounts[mode];
                const currentMode = this._intSettings.get_string('color-scheme') === 'prefer-dark' ? 'dark' : 'light';
                for(let i = 0; i < 12; i++) {
                    const color = colors[i].map(String);
                    if(!isCurrent())
                        return;
                    this._setPaletteSetting(settings, `${mode}-palette${i + 1}`, color, 'strv');
                    if(mode === currentMode) {
                        if(!isCurrent())
                            return;
                        this._setPaletteSetting(settings, `palette${i + 1}`, color, 'strv');
                        if(!isCurrent())
                            return;
                        this._setPaletteSetting(settings, `count${i + 1}`, populations[i], 'int');
                    }
                }
                if(!isCurrent())
                    return;
                this._paletteCounts ??= {};
                this._paletteCounts[mode] = populations;
                if(mode === currentMode)
                    settings.set_boolean('bg-change', !settings.get_boolean('bg-change'));
                if(!isCurrent())
                    return;
                if(settings.get_boolean('autotheme-refresh') && settings.get_string(`autotheme-${mode}`) !== 'Select Theme')
                    AutoThemes.autoApplyBGPalette(this, mode);
            }
        } catch(error) {
            // This entry point is also invoked by synchronous settings signals;
            // consume failures rather than leaving an unobserved rejected promise.
            if(isCurrent())
                console.warn(`Open Bar: could not update wallpaper palette: ${error.message}`);
        } finally {
            if(this._paletteCancellable === cancellable)
                this._paletteCancellable = null;
        }
    }

    // Lifecycle owner calls this before clearing settings (and before re-enable).
    cancelBackgroundPalette(clearCounts = true) {
        this._paletteCancellable?.cancel();
        this._paletteCancellable = null;
        if(clearCounts)
            this._paletteCounts = null;
    }

    // A single expected notification, not a broad publication guard: a settings
    // observer may synchronously import/reset another key during our setter.
    _setPaletteSetting(settings, key, value, kind) {
        const previous = this._paletteWrite;
        this._paletteWrite = {settings, key, value};
        try {
            settings[`set_${kind}`](key, value);
        } finally {
            this._paletteWrite = previous;
        }
    }

    _onPaletteSettingChanged(settings, key) {
        if(key === 'import-export') {
            if(settings.get_boolean(key))
                this.cancelBackgroundPalette(false);
            return;
        }
        const match = /^(?:(dark|light)-)?(palette|count)([1-9]|1[0-2])$/.exec(key);
        if(!match)
            return;
        const expected = this._paletteWrite;
        const value = match[2] === 'count' ? settings.get_int(key) : settings.get_strv(key);
        if(expected?.settings === settings && expected.key === key &&
            JSON.stringify(expected.value) === JSON.stringify(value)) {
            this._paletteWrite = null;
            return;
        }
        this.cancelBackgroundPalette(false);
        if(match[1] && !settings.get_boolean('import-export')) {
            if(this._paletteCounts)
                delete this._paletteCounts[match[1]];
        } else {
            // Imports/resets replace a settings bundle; even unchanged shared
            // counts may be imported, with no notification for those values.
            this._paletteCounts = null;
        }
    }

    _injectToFunction(parent, name, func) {
        let origin = parent[name];
        parent[name] = function () {
          let ret;
          ret = origin.apply(this, arguments);
          if (ret === undefined) ret = func.apply(this, arguments);
          return ret;
        };
        return origin;
    }

    _removeInjection(object, injection, name) {
        if (injection[name] === undefined) delete object[name];
        else object[name] = injection[name];
    }

    unloadStylesheet() {
        const theme = this.themeContext.get_theme();
        const stylesheet = this.obarRunDir.get_child('stylesheet.css');
        try {
            theme.unload_stylesheet(stylesheet);
        }
        catch (e) {
            console.log('Openbar: Error unloading stylesheet: ', e);
        }
    }

    loadStylesheet() {
        // Generation, reloadstyle, startup and Overview converge here. Read live
        // policy at the native load boundary, not a delayed reset flag.
        if(!this._settings || this.disabling)
            return false;
        if(this._fullscreenStyleBlocked()) {
            this.unloadStylesheet();
            this.isObarReset = true;
            return false;
        }
        const theme = this.themeContext.get_theme();
        const stylesheet = this.obarRunDir.get_child('stylesheet.css');
        try {
            theme.load_stylesheet(stylesheet);
            this.isObarReset = false;
            return true;
        }
        catch (e) {
            console.log('Openbar: Error loading stylesheet: ', e);
            return false;
        }
    }

    _fullscreenStyleBlocked() {
        return !this._settings.get_boolean('set-fullscreen') &&
            !!this.getPanelMonitor()[0]?.inFullscreen;
    }

    reloadStylesheet() {
        // Unload stylesheet
        this.unloadStylesheet();

        // Load stylesheet
        this.loadStylesheet();
    }

    // Add or remove 'openmenu' class
    applyMenuClass(obj, add) {
        if(!obj)
            return;
        if(add) {
            if(obj.add_style_class_name)
                obj.add_style_class_name('openmenu');
        }
        else {
            if(obj.remove_style_class_name)
                obj.remove_style_class_name('openmenu');
        }
    }

    // Add/Remove openmenu class to the object and its children/subchildren
    applyBoxStyles(box, add) {
        this.applyMenuClass(box, add);

        let menuChildren = box.get_children();
        menuChildren.forEach(menuItem => {
            this.applyMenuClass(menuItem, add);
            if(menuItem.menu) {
                this.applyMenuClass(menuItem.menu.box, add);
                menuItem.menu.box.get_children().forEach(child => {
                    this.applyMenuClass(child, add);
                });
            }

            let subChildren = menuItem.get_children(); // Required for submenus, at least in Gnome 42 settings menu
            subChildren.forEach(menuchild => {
                this.applyMenuClass(menuchild, add);
                if(menuchild.menu) {
                    this.applyMenuClass(menuchild.menu.box, add);
                    menuchild.menu.box.get_children().forEach(child => {
                        this.applyMenuClass(child, add);
                    });
                }
            });
        });
    }

    // Add/Remove openmenu class to Notifications and Media message lists
    // as well as to any other lists added by other extensions
    applySectionStyles(list, add) {
        // Since GNOME 48 the scroll child is a MessageView, not a section list.
        // Scope its descendants in CSS: groups and their messages are created,
        // reordered and expanded dynamically, without needing actor observers.
        if(list.has_style_class_name?.('message-view')) {
            this.applyMenuClass(list, add);
            return;
        }
        list.get_children().forEach((section, idx) => {
            let msgList = section._list;
            if(add && !this.msgListIds[idx]) {
                this.msgListIds[idx] = msgList?.connect(this.addedSignal, (container, actor) => {
                    this.applyMenuClass(actor.child, add);
                });
                this.msgLists[idx] = msgList;
            }
            else if(!add && this.msgListIds[idx]) {
                msgList?.disconnect(this.msgListIds[idx]);
                this.msgListIds[idx] = null;
                this.msgLists[idx] = null;
            }
            msgList?.get_children().forEach(msg => {
                this.applyMenuClass(msg.child, add);
            });
        });
    }

    // Go through each panel button's menu to add/remove openmenu class to its children
    applyMenuStyles(panel, add, menuButton = null) {
        // A button may survive off-panel across disable, so membership belongs
        // to the active connection manager, not to the extension instance.
        if(this._menuStyleConnections !== this._connections) {
            this._menuStyleButtons = new WeakSet();
            this._menuStyleConnections = this._connections;
        }
        this._menuStyleButtons ??= new WeakSet();
        for(const box of this.panelBoxes) {
            for(const btn of box) { // btn is a bin, parent of indicator button
                if(menuButton && btn.child !== menuButton)
                    continue;
                if(btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) { // btn.child is the indicator
                    // setMenu replaces the root without adding/removing a panel
                    // button. Track only the native Button signal, not menu trees.
                    if(btn.child instanceof PanelMenu.Button) {
                        if(add && this._connections && !this._menuStyleButtons.has(btn.child)) {
                            this._connections.connect(btn.child, 'menu-set', () => {
                                this.applyMenuStyles(panel,
                                    !this.disabling && !!this._settings?.get_boolean('menustyle'), btn.child);
                            });
                            this._menuStyleButtons.add(btn.child);
                        }
                        // Keep this owned hook until disable; disconnect(button,
                        // 'menu-set') would also delete the independent QSAP hook.
                    }

                    // box pointer case, to update -arrow-rise for bottom panel
                    if(btn.child.menu?._boxPointer) {
                        this.applyMenuClass(btn.child.menu._boxPointer, add);
                    }

                    // special case for Quick Settings Audio Panel, because it changes the layout of the Quick Settings menu
                    if(btn.child.menu?.constructor.name == "PanelGrid") {
                        for(const panel of btn.child.menu._get_panels()) {
                            this.applyBoxStyles(panel, add);
                        }
                    }
                    // general case
                    else if(btn.child.menu?.box) {
                        this.applyBoxStyles(btn.child.menu.box, add);
                    }

                    // special case for Arc Menu, because it removes default menu and creates its own menu
                    if(btn.child.constructor.name === 'ArcMenuMenuButton') {
                        let menu = btn.child.arcMenu;
                        this.applyMenuClass(menu, add);
                        if(menu.box)
                            this.applyBoxStyles(menu.box, add);

                        let ctxMenu = btn.child.arcMenuContextMenu;
                        this.applyMenuClass(ctxMenu, add);
                        if(ctxMenu.box)
                            this.applyBoxStyles(ctxMenu.box, add);
                    }

                    // DateMenu: Notifications (messages and media), DND and Clear buttons
                    //           Calendar Grid, Events, World Clock, Weather
                    if(btn.child.constructor.name === 'DateMenuButton') {
                        const bin = btn.child.menu.box.get_child_at_index(0); // CalendarArea
                        const hbox = bin.get_child_at_index(0); // hbox with left and right sections

                        const msgList = hbox.get_child_at_index(0); // Left Pane/Section with notifications etc
                        this.applyMenuClass(msgList, add);
                        const placeholder = msgList.get_child_at_index(0); // placeholder for 'No Notifications'
                        this.applyMenuClass(placeholder, add);
                        const msgbox = msgList.get_child_at_index(1);
                        const msgScroll = msgbox.get_child_at_index(0);
                        const sectionList = msgList._messageView ?? msgScroll.child;
                        if(!msgList._messageView && add) {
                            this._connections.disconnect(sectionList, this.addedSignal);
                            this._connections.connect(sectionList, this.addedSignal, () => {
                                this.applySectionStyles(sectionList, true);
                            });
                        }
                        else if(!msgList._messageView)
                            this._connections?.disconnect(sectionList, this.addedSignal);
                        this.applySectionStyles(sectionList, add);

                        if(this.gnomeVersion < 49) {
                            this.applyMenuClass(msgList._dndButton, add);
                            this.applyMenuClass(msgList._dndSwitch, add);
                        }
                        this.applyMenuClass(msgList._clearButton, add);

                        const vbox = hbox.get_child_at_index(1); // Right Pane/Section vbox for calendar etc
                        vbox.get_children().forEach(item => {
                            this.applyMenuClass(item, add);
                            item.get_children().forEach(child => {
                                this.applyMenuClass(child, add);
                                child.get_children().forEach(subch => {
                                    this.applyMenuClass(subch, add);
                                })
                            });

                            if(item.constructor.name === 'Calendar') {
                                this.applyCalendarGridStyle(item, add);
                                this._queueTimeout('calendarTimeoutId', () => {
                                    this.applyCalendarGridStyle(item, add);
                                }, 250);
                            }
                        });
                    }

                }
            }
        }
    }

    applyCalendarGridStyle(item, add) { // calendar days grid with week numbers
        for(let i=0; i<8; i++) {
            for(let j=0; j<8; j++) {
                const child = item.layout_manager.get_child_at(i, j);
                this.applyMenuClass(child, add);
             }
        }
    }

    // Add OpenBar style classes to Panel and Panel-Buttons
    setPanelStyle(obj, key, sig_param, callbk_param) {
        // console.log('setPanelStyle: ', String(obj), key, String(sig_param), callbk_param);
        const panel = Main.panel;
        const bartype = this._settings.get_string('bartype');
        const buttonBgWMax = this._settings.get_boolean('buttonbg-wmax');
        const candybar = this._settings.get_boolean('candybar');
        const setOverview = this._settings.get_boolean('set-overview');
        // Add/remove candybar class as per settings
        if(candybar &&
            (setOverview || !panel.has_style_pseudo_class('overview')) &&
            (buttonBgWMax || !panel.has_style_pseudo_class('windowmax')))
            panel.add_style_class_name('candybar');
        else
            panel.remove_style_class_name('candybar');
        // Add/remove trialnds class as per bartype
        if(bartype == 'Trilands')
            panel.add_style_class_name('trilands');
        else
            panel.remove_style_class_name('trilands');

        let i = 0;
        for(const box of this.panelBoxes) {
            const visible = [...box].filter(btn =>
                (btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) && btn.child.visible);
            const rtl = box.get_text_direction() === Clutter.TextDirection.RTL;
            const left = rtl ? visible.at(-1) : visible[0];
            const right = rtl ? visible[0] : visible.at(-1);
            for(const btn of box) {
                for(const edge of ['left', 'right']) {
                    const name = `trilands-${edge}`;
                    if(bartype === 'Trilands' && btn === (edge === 'left' ? left : right))
                        btn.add_style_pseudo_class(name);
                    else
                        btn.remove_style_pseudo_class(name);
                }
                // Screen recording/share indicators use ButtonBox instead of Button
                if(btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) {
                    // Hidden native recording/sharing actors must be ready on their
                    // first show, independently of the optional Fitts observers.
                    btn.add_style_class_name('button-container');
                    if(this._connections && !this._connections.connections.some(c =>
                        c.obj === btn.child && c.sig === 'notify::visible'))
                        this._connections.connect(btn.child, 'notify::visible', this.setPanelStyle.bind(this));
                    if(btn.child.visible) {
                        // Add candybar classes if enabled else remove them
                        if(key == 'enabled' || key == 'candybar' || key == 'showing' || key == 'hiding' || key == 'overview'
                            || key == 'notify::visible' || key == this.addedSignal || key == this.removedSignal) {
                            for(let j=1; j<=16; j++) {
                                btn.child.remove_style_pseudo_class('candy'+j);
                            }
                            i++; i = i%16; i = i==0? 16: i; // Cycle through candybar palette
                            if(candybar) {
                                btn.child.add_style_pseudo_class('candy'+i);
                            }
                        }

                        if(btn.child.constructor.name === 'DateMenuButton') {
                            // Remove padding widget to get rid of empty space on left when Message/DND indicator is on right
                            if(!this.dateMenuLeftPadWidget) {
                                this.dateMenuBtnBox = btn.child.get_first_child();
                                this.dateMenuLeftPadWidget = this.dateMenuBtnBox.get_first_child();
                                this.dateMenuBtnBox.remove_child(this.dateMenuLeftPadWidget);
                            }
                        }
                    }
                }
            }
        }
    }

    // Update panel style when Settings change
    updatePanelStyle(obj, key, sig_param, callbk_param) {
        // console.log('update called with ', key, sig_param, callbk_param);
        let panel = Main.panel;

        if(!this._settings || this.disabling)
            return;

        // Observe imports and external palette/count replacement before the
        // palette early return. Our own exact writes retain paired populations.
        if(obj === this._settings)
            this._onPaletteSettingChanged(obj, key);

        // Nothing to update if it's a color palette setting
        if(key.startsWith('palette') || key.startsWith('prominent') ||
            key.startsWith('dark-') || key.startsWith('light-') || /^count\d+$/.test(key))
            return;

        // Generate background color palette
        if(key == 'bgpalette' || key == 'bguri') {
            const importExport = this._settings.get_boolean('import-export');
            if(!importExport) {
                if(key == 'bgpalette')
                    this.updateBguri(this, 'updatePanelStyle');
                else
                    this.backgroundPalette();
            }
            return;
        }

        // Window-Max bar settings
        if(key == 'wmaxbar') {
            this.onWindowMaxBar();
            return;
        }
        if(key == 'cust-margin-wmax' || key == 'margin-wmax') {
            this.setPanelBoxPosWindowMax(this.wmax, key);
            return;
        }
        if(key == 'buttonbg-wmax' && panel.has_style_pseudo_class('windowmax')) {
            const btnBgWMax = this._settings.get_boolean('buttonbg-wmax');
            const candybar = this._settings.get_boolean('candybar');
            if(candybar)
                btnBgWMax?
                panel.add_style_class_name('candybar'):
                panel.remove_style_class_name('candybar');
            return;
        }

        // Generate and save autothemes for Dark and Light modes
        if(key == 'trigger-autotheme') {
            AutoThemes.autoApplyBGPalette(this, 'dark');
            AutoThemes.autoApplyBGPalette(this, 'light');
            return;
        }

        // Update styles on Dark/Light mode change
        if(callbk_param == 'color-scheme') {
            this.onModeChange();
            return;
        }

        // Continue to update triland classes if actor (panel button) removed in trilands mode else return
        let bartype = this._settings.get_string('bartype');
        if(key == this.removedSignal && bartype != 'Trilands')
            return;

        // Generate/Reload stylesheet
        if(key == 'trigger-reload') { // A toggle key to trigger generation and reload of stylesheet
            this._runStyleTask('stylesheet generation', () => StyleSheets.reloadStyle(this, this));
            return;
        }
        if(callbk_param == 'high-contrast') { // Reload stylesheet to pick up high contrast icons
            this._runStyleTask('stylesheet generation', () => StyleSheets.reloadStyle(this, this));
            return;
        }
        if(key == 'reloadstyle') { // A toggle key to trigger reload of existing stylesheet
            this.reloadStylesheet();
            // continue to style
        }

        // Set bgalpha on change of bartype
        if(key == 'bartype') {
            if(bartype == 'Trilands' || bartype == 'Islands') {
                this._settings.set_double('bgalpha', 0);
            }
            else {
                this._settings.set_double('bgalpha', 0.9);
            }
        }

        // Overview style
        let setOverview = this._settings.get_boolean('set-overview');
        if(key == 'showing' || panel.has_style_pseudo_class('overview')) {
            if(setOverview) {
                if(this.isObarReset) { // Overview style is enabled but obar was reset due to Fullscreen
                    this.loadStylesheet();
                }
            }
        }
        else if(key == 'hiding') {
            this.setWindowMaxBar('hiding');
            this.onFullScreen(null, 'hiding');
        }

        // Fullscreen style
        if(key == 'set-fullscreen') {
            const fullscreen = this._settings.get_boolean('set-fullscreen');
            if(fullscreen && this.isObarReset) {
                this.loadStylesheet();
            }
            else if(!fullscreen && !this.isObarReset) {
                this.onFullScreen(null, 'fullscreen');
            }
            return;
        }

        // GTK Apps styles
        let gtkKeys = ['apply-gtk', 'headerbar-hint', 'hbar-gtk3only', 'sidebar-hint', 'sbar-gradient', 'card-hint', 'view-hint', 'window-hint', 'winbradius', 'corner-radius',
            'winbcolor', 'winbalpha', 'winbwidth', 'traffic-light', 'menu-radius', 'gtk-transparency', 'gtk-popover', 'mscolor', 'msalpha', 'hscd-color', 'vw-color', 'gtk-shadow'];
        if(gtkKeys.includes(key)) {
            // console.log('Call saveGtkCss from extension for key: ', key);
            this.gtkCSS = true;
            // For mscolor/msalpha, stylesheet will be generated/reloaded and also saveGtkCss will be called (in styleSheets.js)
            // For other keys, call saveGtkCss from here
            if(key != 'mscolor' && key != 'msalpha') {
                this._runStyleTask('GTK styling', () => StyleSheets.saveGtkCss(this, 'enable'));
                const wmaxHbar = this._settings.get_boolean('wmax-hbarhint');
                // Reload styelsheet to match WMax bar with Gtk headerbar
                if((key == 'headerbar-hint' || key == 'hscd-color') && wmaxHbar)
                    this._runStyleTask('stylesheet generation', () => StyleSheets.reloadStyle(this, this));
                return;
            }
        }
        // Flatpak overrides
        if(key == 'apply-flatpak') {
            this._runStyleTask('Flatpak permissions', () => StyleSheets.saveFlatpakOverrides(this, 'enable'));
            return;
        }

        // Menu style
        let menustyle = this._settings.get_boolean('menustyle');
        if(['reloadstyle', 'removestyle', 'menustyle'].includes(key) ||
            (key == this.addedSignal && callbk_param != 'message-banner')) {
            this.applyMenuStyles(panel, menustyle);
        }
        if(key == 'menustyle') {
            this._runStyleTask('stylesheet generation', () => StyleSheets.reloadStyle(this, this));
        }

        this._updateAppearance(key);

        // Set SVG icons update flags
        if(key == 'mscolor') {
            this.msSVG = true;
            this.smfgSVG = true;
        }
        else if(key == 'mfgcolor' || key == 'mbgcolor' || key == 'smbgcolor' || key == 'smbgoverride') {
            this.smfgSVG = true;
        }
        else if(key == 'mhcolor') {
            this.mhSVG = true;
        }

        // Manual override disables Auto theme font
        if(key == 'font') {
            this._settings.set_boolean('autotheme-font', false);
        }

        // Enable/Disable Fitts Widgets
        if(key == 'fitts-widgets') {
            const fittsWidgets = this._settings.get_boolean('fitts-widgets');
            if(fittsWidgets)
                this.enableFittsWidgets();
            else
                this.disableFittsWidgets();
        }

        let menuKeys = ['trigger-reload', 'reloadstyle', 'removestyle', 'menustyle', 'mfgcolor', 'mfgalpha', 'mbgcolor', 'mbgalpha', 'mbcolor', 'mbalpha',
        'mhcolor', 'mhalpha', 'mscolor', 'msalpha', 'mshcolor', 'mshalpha', 'smbgoverride', 'smbgcolor', 'qtoggle-radius', 'slider-height', 'mbg-gradient'];
        let barKeys = ['bgcolor', 'gradient', 'gradient-direction', 'bgcolor2', 'bgalpha', 'bgalpha2', 'fgcolor', 'fgalpha', 'bcolor', 'balpha', 'bradius',
        'bordertype', 'shcolor', 'shalpha', 'iscolor', 'isalpha', 'neon', 'shadow', 'font', 'default-font', 'hcolor', 'halpha', 'heffect', 'bgcolor-wmax',
        'bgalpha-wmax', 'neon-wmax', 'boxcolor', 'boxalpha', 'autofg-bar', 'autofg-menu', 'width-top', 'width-bottom', 'width-left', 'width-right',
        'radius-topleft', 'radius-topright', 'radius-bottomleft', 'radius-bottomright'];
        let keys = [...barKeys, ...menuKeys, 'autotheme-dark', 'autotheme-light', 'autotheme-refresh', 'accent-override', 'accent-color', 'apply-menu-shell',
        'dashdock-style', 'dbgcolor', 'dbgalpha', 'dborder', 'dshadow'];
        if(keys.includes(key)) {
            return;
        }

        // Set PanelBox position
        let position = this._settings.get_string('position');
        if(position == 'Bottom' || key == 'position' || key == 'monitors-changed') {
            // Settings/reloads must use the same geometry policy as window events.
            this.setPanelBoxPosWindowMax(!!this.wmax, key);
        }
        // Reset Fitts Widgets
        const fittsWidgets = this._settings.get_boolean('fitts-widgets');
        if(key == 'position' && fittsWidgets) {
            this.disableFittsWidgets();
            this.enableFittsWidgets();
        }

        // Update background-manager if monitors changed
        if(key == 'monitors-changed')
            this.connectPrimaryBGChanged();

        // Notifications position
        let setNotifications = this._settings.get_boolean('set-notifications');
        let setNotifPos = this._settings.get_boolean('set-notif-position');
        let notifKeys = ['set-notif-position', 'position', 'monitors-changed', 'updated', 'enabled'];
        if(notifKeys.includes(key) && setNotifPos) {
            if(position == 'Bottom')
                Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.END;
            else
                Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.START;
        }
        // Notifications style
        if(key == this.addedSignal && callbk_param == 'message-banner' && setNotifications) {
            Main.messageTray._banner?.add_style_class_name('openmenu');
        }

        this.setPanelStyle(null, key);
    }

    // QSAP replaces menu on the same emitter. Own this graph separately from
    // native menu styling: toggling menustyle must not remove its menu-set hook.
    setupLibpanel(obj, signal, sig_param, menu) {
        menu = this.disabling ? null : (obj ? obj.menu : menu);
        const grid = menu?.constructor.name === 'PanelGrid' ? menu : null;
        if(this._libpanelMenu !== grid || this._libpanelOwner !== this._connections) {
            this._libpanelConnections?.disconnectAll();
            for(const panel of this._libpanelPanels ?? [])
                this.applyBoxStyles(panel, false);
            this._libpanelMenu = grid;
            this._libpanelOwner = this._connections;
            this._libpanelColumns = new Set();
            this._libpanelPanels = new Set();
            this._libpanelConnections = new ConnectManager();
            if(grid) {
                const refresh = () => {
                    this.setupLibpanel(obj, 'panels-changed', null, grid);
                };
                this._libpanelConnections.connect(grid.box, this.addedSignal, refresh);
                this._libpanelConnections.connect(grid.box, this.removedSignal, refresh);
                this._libpanelConnections.connect(grid.box, 'destroy', () => {
                    this.setupLibpanel(null, 'destroy', null, null);
                });
                this._libpanelRefresh = refresh;
            }
        }
        if(!grid)
            return;

        const columns = new Set(grid.box.get_children());
        for(const column of this._libpanelColumns) {
            if(!columns.has(column)) {
                this._libpanelConnections.disconnect(column, this.addedSignal);
                this._libpanelConnections.disconnect(column, this.removedSignal);
                this._libpanelConnections.disconnect(column, 'destroy');
            }
        }
        for(const column of columns) {
            if(!this._libpanelColumns.has(column)) {
                this._libpanelConnections.connect(column, this.addedSignal, this._libpanelRefresh);
                this._libpanelConnections.connect(column, this.removedSignal, this._libpanelRefresh);
                this._libpanelConnections.connect(column, 'destroy', () => {
                    this._libpanelColumns.delete(column);
                });
            }
        }
        this._libpanelColumns = columns;
        const panels = new Set(grid._get_panels());
        for(const panel of this._libpanelPanels) {
            if(!panels.has(panel)) {
                this._libpanelConnections.disconnect(panel, 'destroy');
                this.applyBoxStyles(panel, false);
            }
        }
        for(const panel of panels) {
            if(!this._libpanelPanels.has(panel)) {
                this._libpanelConnections.connect(panel, 'destroy', () => {
                    this._libpanelPanels.delete(panel);
                });
            }
            this.applyBoxStyles(panel, this._settings.get_boolean('menustyle'));
        }
        this._libpanelPanels = panels;
    }

    // Find the monitor which has the panel/panelBox
    getPanelMonitor() {
        let panelMonIndex = 0;
        const LM = Main.layoutManager;
        const monitors = LM.monitors;
        const panelBox = LM.panelBox;
        for(let i=0; i<monitors.length; i++) {
            let monitor = monitors[i];
            if(panelBox.x >= monitor.x && panelBox.x < (monitor.x + monitor.width) &&
                panelBox.y >= monitor.y && panelBox.y < (monitor.y + monitor.height)) {
                panelMonIndex = i;
                break;
            }
        }
        return [monitors[panelMonIndex], panelMonIndex];
    }

    setPanelBoxPosition(position, height, margin, setBottomMargin, bottomMargin, borderWidth, bartype) {
        let panelMonitor = this.getPanelMonitor()[0];
        if(!panelMonitor)
            return;
        let panelBox = Main.layoutManager.panelBox;
        if(position == 'Top') {
            let topX = panelMonitor.x;
            let topY = panelMonitor.y;
            panelBox.set_position(topX, topY);
            panelBox.set_size(panelMonitor.width, -1);
        }
        else if(position == 'Bottom') {
            margin = (bartype == 'Mainland')? 0: margin;
            borderWidth = (bartype == 'Trilands' || bartype == 'Islands')? 0: borderWidth;
            let windowGap = setBottomMargin? bottomMargin: margin;
            let panelBoxHeight = height + 2*borderWidth + margin + windowGap;
            // Scale height by Display Scaling factor
            panelBoxHeight = this.themeContext.scale_factor * panelBoxHeight;
            let bottomX = panelMonitor.x;
            let bottomY = panelMonitor.y + panelMonitor.height - panelBoxHeight;
            panelBox.set_position(bottomX, bottomY);
            panelBox.set_size(panelMonitor.width, panelBoxHeight);
        }
    }

    // Set panelbox position for window max
    // Need to set panelBox position since bar margins/height can change with WMax
    setPanelBoxPosWindowMax(wmax, signal) {
        const position = this._settings.get_string('position');
        // These are policy state, not a geometry cache. Settings, scale and the
        // monitor can change without a WMax transition (including no monitors).
        this.wmax = !!wmax;
        this.position = position;
        if(position == 'Bottom') {
            const bartype = this._settings.get_string('bartype');
            const borderWidth = this._settings.get_double('bwidth');
            const custMarginWmax = this._settings.get_boolean('cust-margin-wmax');
            const marginWMax = this._settings.get_double('margin-wmax');
            let margin = this._settings.get_double('margin');
            let bottomMargin = this._settings.get_double('bottom-margin');
            const height = this._settings.get_double('height');
            if(wmax) {
                margin = custMarginWmax? marginWMax: margin;
            }
            const setBottomMargin = !wmax && this._settings.get_boolean('set-bottom-margin');
            this.setPanelBoxPosition(position, height, margin, setBottomMargin, bottomMargin, borderWidth, bartype);
        }
        else if(position == 'Top') {
            this.setPanelBoxPosition(position);
        }
    }

    // Check for maximized window on Panel monitor
    setWindowMaxBar(obj, signal, sig2) {
        // Retain wmax status as-is in Overview (do nothing here)
        if(!this._settings || Main.panel.has_style_pseudo_class('overview'))
            return;

        const wmaxbar = this._settings.get_boolean('wmaxbar');
        if(!wmaxbar) {
            if(Main.panel.has_style_pseudo_class('windowmax')) {
                Main.panel.remove_style_pseudo_class('windowmax');
                this.setPanelBoxPosWindowMax(false, signal);
            }
            return;
        }

        // Find out index of the monitor which has the panel/panelBox
        let panelMonIndex = this.getPanelMonitor()[1];

        // Get valid windows maximized on the monitor with panel
        const workspace = global.workspace_manager.get_active_workspace();
        const windows = workspace.list_windows().filter(window =>
            window.get_monitor() == panelMonIndex &&
            window.showing_on_its_workspace() &&
            !window.is_hidden() &&
            window.get_window_type() !== Meta.WindowType.DESKTOP && // exclude Desktop
            window.get_gtk_application_id() !== "com.rastersoft.ding" && // exclude Desktop Icons NG
            (window.maximized_horizontally || window.maximized_vertically) &&
            !window.fullscreen
        );
        // for(const window of windows)
        //     console.log('window:', window.get_gtk_application_id());

        const btnBgWMax = this._settings.get_boolean('buttonbg-wmax');
        const candybar = this._settings.get_boolean('candybar');
        if(windows.length) {
            Main.panel.add_style_pseudo_class('windowmax');
            if(candybar && !btnBgWMax) // Disable candybar button-colors when in WMax
                Main.panel.remove_style_class_name('candybar');
            this.setPanelBoxPosWindowMax(true, signal);
        }
        else {
            Main.panel.remove_style_pseudo_class('windowmax');
            if(candybar && !btnBgWMax) // Enable candybar button-colors when not in WMax
                Main.panel.add_style_class_name('candybar');
            this.setPanelBoxPosWindowMax(false, signal);
        }
    }

    onWindowAdded(obj, signal, windowActor){
        if(!this._windowSignals || this.disabling)
            return;
        if(windowActor && !this._windowSignals.has(windowActor)) {
            const manager = new ConnectManager();
            this._windowSignals.set(windowActor, manager);
            manager.connect(windowActor, 'notify::visible', () => this.setWindowMaxBar('notify-visible'));
            manager.connect(windowActor, 'destroy', () => {
                manager.disconnectAll();
                this._windowSignals?.delete(windowActor);
            });
            if(windowActor.meta_window) {
                for(const event of ['notify::minimized', 'size-changed', 'shown'])
                    manager.connect(windowActor.meta_window, event, () => this.setWindowMaxBar(event));
            }
        }
        this.setWindowMaxBar(this.addedSignal);
    }

    onWindowRemoved(obj, signal, windowActor){
        this._windowSignals?.get(windowActor)?.disconnectAll();
        this._windowSignals?.delete(windowActor);
        this.setWindowMaxBar(this.removedSignal);
    }

    // Connect/disconnect window signals based on Window-Max bar On/Off
    onWindowMaxBar() {
        let wmaxbar = this._settings.get_boolean('wmaxbar');
        if(wmaxbar) {
            if(this._windowSignals)
                return;
            this._windowSignals = new Map();
            const windowActors = this.gnomeVersion < 48? global.get_window_actors() : global.compositor.get_window_actors();
            for(const window of windowActors){
                this.onWindowAdded(null, 'enabled', window);
            }
            this._connections.connect(global.window_group, this.addedSignal, this.onWindowAdded.bind(this));
            this._connections.connect(global.window_group, this.removedSignal, this.onWindowRemoved.bind(this));
        }
        else {
            this._connections.disconnect(global.window_group, this.addedSignal);
            this._connections.disconnect(global.window_group, this.removedSignal);
            this.disconnectWindowSignals();
            Main.panel.remove_style_pseudo_class('windowmax');
            this.setPanelBoxPosWindowMax(false);
        }
    }

    disconnectWindowSignals() {
        if(this._windowSignals) {
            for(const manager of this._windowSignals.values())
                manager.disconnectAll();
        }
        this._windowSignals = null;
    }

    onFullScreen(obj, signal, sig_param, timeout = 0) {
        if(this.onFullScrTimeoutId) {
            clearTimeout(this.onFullScrTimeoutId);
            this._timeouts?.delete('onFullScrTimeoutId');
            this.onFullScrTimeoutId = null;
        }
        if(!this._settings || this.disabling)
            return;

        // Timeout to allow other extensions to move panel to another monitor
        this._queueTimeout('onFullScrTimeoutId', () => {
            // Re-evaluate both policy and monitor after the delay. The load
            // boundary also owns isObarReset, so failed/blocked loads retain it.
            if(this._fullscreenStyleBlocked() || this.isObarReset)
                this.loadStylesheet();
        }, timeout);
    }

    onModeChange() {
        this.gtkCSS = true;
        this._runStyleTask('GTK styling', () => StyleSheets.saveGtkCss(this, 'enable'));
        AutoThemes.onModeChange(this);
        this._updateAppearance('enabled');
    }

    // Coalesce bursts, but always read the latest settings on the trailing edge.
    updateBguri(obj, signal) {
        if(!this._settings || this.disabling)
            return;
        // A newer request supersedes decoding now, not only after debounce.
        this._paletteCancellable?.cancel();
        this._queueTimeout('updateBguriId', () => {
            if(!this._settings || !this._bgSettings || !this._intSettings ||
                this._settings.get_boolean('import-export'))
                return;
            const colorScheme = this._intSettings.get_string('color-scheme');
            this.colorScheme = colorScheme;
            const bguriDark = this._bgSettings.get_string('picture-uri-dark');
            const bguriLight = this._bgSettings.get_string('picture-uri');
            this._settings.set_string('dark-bguri', bguriDark);
            this._settings.set_string('light-bguri', bguriLight);
            const bguriOld = this._settings.get_string('bguri');
            const bguriNew = colorScheme === 'prefer-dark' ? bguriDark : bguriLight;
            this._settings.set_string('bguri', bguriNew);
            // A changed file may keep the same URI (GNOME's copied wallpaper).
            if(bguriOld === bguriNew)
                this.updatePanelStyle(this._settings, 'bguri');
        }, 200);
    }

    // Connect multiple signals to ensure detecting background-change in all Gnome versions
    connectPrimaryBGChanged() {
        if(!this._connections || !this._settings || this.disabling)
            return;
        const LM = Main.layoutManager;
        const panelMonitor = this.getPanelMonitor()[0];
        if(panelMonitor) {
            this._settings.set_int('monitor-height', panelMonitor.height);
            this._settings.set_int('monitor-width', panelMonitor.width);
        }
        const manager = LM.monitors.length ? LM._bgManagers?.[LM.primaryIndex] : null;
        if(this._primaryBGManager !== manager) {
            if(this._primaryBGManager)
                this._connections.disconnect(this._primaryBGManager, 'changed');
            this._primaryBGManager = manager;
            if(manager)
                this._connections.connect(manager, 'changed', this.updateBguri.bind(this));
        }
        if(!this._backgroundSettingsConnected) {
            this._connections.connect(this._bgSettings, 'changed::picture-uri', this.updateBguri.bind(this));
            this._connections.connect(this._bgSettings, 'changed::picture-uri-dark', this.updateBguri.bind(this));
            this._connections.connect(this._intSettings, 'changed::color-scheme', this.updatePanelStyle.bind(this), 'color-scheme');
            this._backgroundSettingsConnected = true;
        }
    }

    supportsFittsWidgets() {
        // Gate every entry point, including delayed callbacks and position resets.
        return !this.disabling && this.gnomeVersion < 50 &&
            !!this._settings?.get_boolean('fitts-widgets') &&
            !this._shellSettings?.get_strv('enabled-extensions')
                .includes('dash-to-panel@jderose9.github.com');
    }

    createFittsWidget(box, btn) {
        if (!this._fittsActive || !this.supportsFittsWidgets() ||
            !this.panelBoxes?.includes(box) || btn.get_parent() !== box)
            return;
        let panel = Main.panel;
        let panelBox = Main.layoutManager.panelBox;
        let position = this._settings.get_string('position');

        if( !btn.FittsWidget &&
            (btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) &&
            btn.child.visible ) {

            btn.FittsWidget = new St.Widget({
                x: panelBox.x + panel.x + box.x + btn.x,
                width: btn.width,
                y: panelBox.y,
                height: panel.y + btn.child.y,
                reactive: true,
                track_hover: true,
                visible: true,
                // style: 'background-color: rgba(200, 200, 0, 0.35);'
            });
            if(position == 'Bottom')
                btn.FittsWidget.y = panelBox.y + panelBox.height - btn.FittsWidget.height;

            // Connect to btn destroy signal to also destroy its FittsWidget
            if (!btn.destroyFittsId)
                btn.destroyFittsId = btn.connect('destroy', () => {
                    this.destroyFittsWidget(btn);
                    delete btn.destroyFittsId;
                });

            // Bind x of FittsWidget to params it depends on: panelBox.x + panel.x + box.x + btn.x
            btn.bind_property_full('x', btn.FittsWidget, 'x', GObject.BindingFlags.SYNC_CREATE,
                (bind, value) => [true, panelBox.x + panel.x + box.x + value], null);
            box.bind_property_full('x', btn.FittsWidget, 'x', GObject.BindingFlags.SYNC_CREATE,
                (bind, value) => [true, panelBox.x + panel.x + value + btn.x], null);
            panel.bind_property_full('x', btn.FittsWidget, 'x', GObject.BindingFlags.SYNC_CREATE,
                (bind, value) => [true, panelBox.x + value + box.x + btn.x], null);
            panelBox.bind_property_full('x', btn.FittsWidget, 'x', GObject.BindingFlags.SYNC_CREATE,
                (bind, value) => [true, value + panel.x + box.x + btn.x], null);

            // Bind width of FittsWidget to params it depends on: btn.width
            btn.bind_property('width', btn.FittsWidget, 'width', GObject.BindingFlags.SYNC_CREATE);

            // Bind y of FittsWidget to params it depends on: Top Panel => panelBox.y OR
            // Bottom Panel => panelBox.y + panelBox.height - btn.FittsWidget.height
            if(position == 'Top')
                panelBox.bind_property('y', btn.FittsWidget, 'y', GObject.BindingFlags.SYNC_CREATE);
            else if(position == 'Bottom') {
                panelBox.bind_property_full('y', btn.FittsWidget, 'y', GObject.BindingFlags.SYNC_CREATE,
                    (bind, value) => [true, value + panelBox.height - btn.FittsWidget.height], null);
                panelBox.bind_property_full('height', btn.FittsWidget, 'y', GObject.BindingFlags.SYNC_CREATE,
                    (bind, value) => [true, panelBox.y + value - btn.FittsWidget.height], null);
                btn.FittsWidget.bind_property_full('height', btn.FittsWidget, 'y', GObject.BindingFlags.SYNC_CREATE,
                    (bind, value) => [true, panelBox.y + panelBox.height - value], null);
            }

            // Bind height of FittsWidget to params it depends on: panel.y + btn.child.y
            panel.bind_property_full('y', btn.FittsWidget, 'height', GObject.BindingFlags.SYNC_CREATE,
                (bind, value) => [true, value + btn.child.y], null);
            btn.child.bind_property_full('y', btn.FittsWidget, 'height', GObject.BindingFlags.SYNC_CREATE,
                    (bind, value) => [true, panel.y + value], null);

            // Connect signals for hover
            btn.FittsWidget.connect('enter-event', (actor, event) => {
                btn.child.add_style_pseudo_class('hover');
                return Clutter.EVENT_PROPAGATE;
            });
            btn.FittsWidget.connect('leave-event', (actor, event) => {
                btn.child.remove_style_pseudo_class('hover');
                return Clutter.EVENT_PROPAGATE;
            });

            // Connect signals for captured-event
            btn.FittsWidget.connect('captured-event', (actor, event) => {
                btn.child.event(event, false);
                return Clutter.EVENT_PROPAGATE;
            });

            Main.layoutManager.addChrome(btn.FittsWidget, {trackFullscreen: true});
        }
    }

    destroyFittsWidget(btn) {
        if(btn.FittsWidget) {
            Main.layoutManager.removeChrome(btn.FittsWidget);
            btn.FittsWidget.destroy();
            delete btn.FittsWidget;
        }
    }

    createFittsCornerWidgets() {
        if (!this._fittsActive || !this.supportsFittsWidgets())
            return;
        const panel = Main.panel;
        const panelBox = Main.layoutManager.panelBox;
        // _leftBox/_rightBox are logical: Shell swaps their allocations in RTL.
        // Select by actual stage bounds instead of assuming child list order.
        const buttons = this.panelBoxes.flatMap(box => [...box]).filter(btn =>
            btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox);
        for (const side of ['left', 'right']) {
            const widgetKey = `${side}FittsWidget`;
            const buttonKey = `${side}CornerButton`;
            if (panel[widgetKey])
                continue;
            const widget = new St.Widget({reactive: true, track_hover: true});
            const update = () => {
                const visible = this.panelBoxes.flatMap(box => [...box])
                    .filter(btn => (btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) &&
                        btn.child.visible && btn.width > 0)
                    .map(btn => {
                        const [x] = btn.get_transformed_position();
                        const [width] = btn.get_transformed_size();
                        return {btn, x, right: x + width};
                    });
                const edge = side === 'left'
                    ? visible.sort((a, b) => a.x - b.x)[0]
                    : visible.sort((a, b) => b.right - a.right)[0];
                panel[buttonKey] = edge?.btn;
                if (!edge) {
                    widget.hide();
                    return;
                }
                const [x, y] = panelBox.get_transformed_position();
                const [width, height] = panelBox.get_transformed_size();
                // At most two border pixels overlap the target, never the menu.
                const boundary = side === 'left'
                    ? Math.min(x + width, Math.max(x, edge.x + 2))
                    : Math.max(x, Math.min(x + width, edge.right - 2));
                widget.set_position(side === 'left' ? x : boundary, y);
                widget.set_size(side === 'left' ? boundary - x : x + width - boundary, height);
                widget.visible = widget.width > 0 && height > 0;
            };
            // Widget destruction releases these geometry/visibility connections.
            for (const actor of [panelBox, panel, ...this.panelBoxes, ...buttons])
                actor.connectObject('notify::allocation', update, widget);
            for (const btn of buttons)
                btn.child.connectObject('notify::visible', update, widget);
            widget.connect('enter-event', () => {
                panel[buttonKey]?.child.add_style_pseudo_class('hover');
                return Clutter.EVENT_PROPAGATE;
            });
            widget.connect('leave-event', () => {
                panel[buttonKey]?.child.remove_style_pseudo_class('hover');
                return Clutter.EVENT_PROPAGATE;
            });
            widget.connect('captured-event', (actor, event) => {
                panel[buttonKey]?.child.event(event, false);
                return Clutter.EVENT_PROPAGATE;
            });
            panel[widgetKey] = widget;
            Main.layoutManager.addChrome(widget, {trackFullscreen: true});
            update();
        }
    }

    destroyFittsCornerWidgets() {
        let panel = Main.panel;
        if(panel.leftFittsWidget) {
            // console.log('Destroy Left Corner', String(panel.leftFittsWidget));
            Main.layoutManager.removeChrome(panel.leftFittsWidget);
            panel.leftFittsWidget.destroy();
            panel.leftFittsWidget = null;
            delete panel.leftFittsWidget;
            panel.leftCornerButton = null;
            delete panel.leftCornerButton;
        }
        if(panel.rightFittsWidget) {
            // console.log('Destroy Right Corner', String(panel.rightFittsWidget));
            Main.layoutManager.removeChrome(panel.rightFittsWidget);
            panel.rightFittsWidget.destroy();
            panel.rightFittsWidget = null;
            delete panel.rightFittsWidget;
            panel.rightCornerButton = null;
            delete panel.rightCornerButton;
        }
    }

    // Add / Remove Fitts Button Widgets and Corner Widgets
    addRemoveFittsWidgets(add) {
        for(const box of this.panelBoxes) {
            for(const btn of box) {
                if(add)
                    this.createFittsWidget(box, btn);
                else {
                    this.destroyFittsWidget(btn);
                    if(btn.destroyFittsId > 0)
                        btn.disconnect(btn.destroyFittsId);
                    delete btn.destroyFittsId;
                }
            }
        }

        if(add) {
            this.createFittsCornerWidgets();
        }
        else
            this.destroyFittsCornerWidgets();
    }

    updateFittsWidgetVisible(btn, child) {
        if(btn.child.visible)
            this.createFittsWidget(btn.get_parent(), btn);
        else
            this.destroyFittsWidget(btn);
    }

    connectFittsWidgetVisible(connect) {
        for(const box of this.panelBoxes) {
            for(const btn of box) {
                if(btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox) {
                    if(connect)
                        this._fittsConnections.connect(btn.child, 'notify::visible', this.updateFittsWidgetVisible.bind(this, btn));
                    else
                        this._fittsConnections.disconnect(btn.child, 'notify::visible');
                }
            }
        }
    }

    updateFittsWidgetAddRemove(box, key, btn) {
        // Only relevant corner changes replace the named timer below; unrelated
        // button events must not cancel recreation already in flight.
        if(this.disabling) {
            return;
        }

        let panel = Main.panel;
        if( (key == this.addedSignal &&
            (btn == this.panelBoxes[0].get_first_child() || btn == this.panelBoxes[2].get_last_child())) ||
            (key == this.removedSignal &&
            (btn == panel.leftCornerButton || btn == panel.rightCornerButton)) ) {
            this.destroyFittsCornerWidgets();
            // Wait for Panel to update its x, width then create CornerWidgets
            this._queueTimeout('fittsCornerTimeoutId', () => {
                this.createFittsCornerWidgets();
            }, 500);
        }

        if(!(btn.child instanceof PanelMenu.Button || btn.child instanceof PanelMenu.ButtonBox))
            return;

        if(key == this.addedSignal) {
            this._fittsConnections.disconnect(btn.child, 'notify::visible');
            this._fittsConnections.connect(btn.child, 'notify::visible', this.updateFittsWidgetVisible.bind(this, btn));
            if(btn.child.visible)
                this.createFittsWidget(box, btn);
        }
        else if(key == this.removedSignal) {
            this._fittsConnections.disconnect(btn.child, 'notify::visible');
            this.destroyFittsWidget(btn);
            if(btn.destroyFittsId > 0)
                btn.disconnect(btn.destroyFittsId);
            delete btn.destroyFittsId;
        }
    }

    connectFittsWidgetAddRemove(connect) {
        for(const box of this.panelBoxes) {
            if(connect) {
                this._fittsConnections.connect(box, this.addedSignal, this.updateFittsWidgetAddRemove.bind(this));
                this._fittsConnections.connect(box, this.removedSignal, this.updateFittsWidgetAddRemove.bind(this));
            }
            else {
                this._fittsConnections.disconnect(box, this.addedSignal);
                this._fittsConnections.disconnect(box, this.removedSignal);
            }
        }
    }

    enableFittsWidgets() {
        if (!this.supportsFittsWidgets()) {
            if (this._fittsActive)
                this.disableFittsWidgets();
            return;
        }
        if (this._fittsActive)
            return;
        this._fittsActive = true;
        this._fittsConnections = new ConnectManager();
        this.addRemoveFittsWidgets(true);
        this.connectFittsWidgetVisible(true);
        this.connectFittsWidgetAddRemove(true);
    }

    disableFittsWidgets() {
        this._fittsActive = false;
        for(const name of ['fittsEnableTimeoutId', 'fittsCornerTimeoutId']) {
            if(this[name])
                clearTimeout(this[name]);
            this[name] = null;
            this._timeouts?.delete(name);
        }
        this._fittsConnections?.disconnectAll();
        this._fittsConnections = null;
        if(this.panelBoxes)
            this.addRemoveFittsWidgets(false);
    }

    postStartup() {
        this._queueTimeout('postStartupId', () => {
            this.setPanelStyle(null, 'post-startup');
        }, 2000);
    }

    enable() {
        StyleSheets.beginStyleWrites(this);
        this.cancelBackgroundPalette();
        // Get Gnome version
        const [major, minor] = Config.PACKAGE_VERSION.split('.').map(s => Number(s));
        this.gnomeVersion = major;

        // Get the top panel
        let panel = Main.panel;
        this.panelBoxes = [panel._leftBox, panel._centerBox, panel._rightBox];

        this.main = Main;
        this.msSVG = true;
        this.mhSVG = true;
        this.smfgSVG = true;
        this.gtkCSS = true;
        this.position = null;
        this.wmax = null;
        this.isObarReset = false;
        this.addedSignal = this.gnomeVersion > 45? 'child-added': 'actor-added';
        this.removedSignal = this.gnomeVersion > 45? 'child-removed': 'actor-removed';
        this.calendarTimeoutId = null;
        this.bgMgrTimeOutId = null;
        this.onFullScrTimeoutId = null;
        this.msgLists = [];
        this.msgListIds = [];
        this.styleUnloaded = false;
        this.updateBguriId = null;
        this.postStartupId = null;
        this.disabling = false;
        this._primaryBGManager = null;
        this._backgroundSettingsConnected = false;

        // Settings for desktop background image (set bg-uri as per color scheme)
        this._bgSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
        this._intSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
        this._hcSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.a11y.interface' });
        this.colorScheme = this._intSettings.get_string('color-scheme');

        // Get global theme context (for display scaling)
        this.themeContext = St.ThemeContext.get_for_stage(global.stage);

        this._settings = this.getSettings();
        // this.bgalpha = this._settings.get_double('bgalpha');
        this._settings.set_boolean('import-export', false);
        this._settings.set_boolean('pause-reload', false);

        let panelMonitor = this.getPanelMonitor()[0];
        if(panelMonitor) {
            this._settings.set_int('monitor-height', panelMonitor.height);
            this._settings.set_int('monitor-width', panelMonitor.width);
        }

        // Initialize paths before any settings callback or saved-mode catch-up.
        const userRunDir = GLib.get_user_runtime_dir();
        this.obarRunDir = Gio.File.new_for_path(`${userRunDir}/io.github.neuromorph.openbar`);
        this.obarAssetsDir = this.obarRunDir.get_child('assets');
        if(!this.obarAssetsDir.query_exists(null))
            this.obarAssetsDir.make_directory_with_parents(null);
        this._runtimeAssetsReady = StyleSheets.prepareRuntimeAssets(this);
        this._runStyleTask('runtime assets', () => this._runtimeAssetsReady);

        // Connect to the settings changes
        this._connections = new ConnectManager();
        this._connections.connect(this._settings, 'changed', (settings, signal, key) => {
            this.updatePanelStyle(settings, key);
        });

        let connections = [
            [ Main.overview, 'hiding', this.updatePanelStyle.bind(this) ],
            [ Main.overview, 'showing', this.updatePanelStyle.bind(this) ],
            [ Main.layoutManager, 'monitors-changed', this.updatePanelStyle.bind(this) ],
            [ Main.messageTray._bannerBin, this.addedSignal, this.updatePanelStyle.bind(this), 'message-banner' ],
            [ global.display, 'in-fullscreen-changed', this.onFullScreen.bind(this), 100 ],
            [ global.display, 'window-entered-monitor', this.setWindowMaxBar.bind(this), 'window-entered-monitor' ],
            [ global.display, 'window-left-monitor', this.setWindowMaxBar.bind(this), 'window-left-monitor' ],
            [ Main.layoutManager, 'startup-complete', this.postStartup.bind(this) ],
            // [ Main.sessionMode, 'updated', this.updatePanelStyle.bind(this), 'session-mode-updated' ],
        ];
        // Connections for actor-added/removed OR child-added/removed as per Gnome version
        for(const panelBox of this.panelBoxes) {
            connections.push([panelBox, this.addedSignal, this.updatePanelStyle.bind(this)]);
            connections.push([panelBox, this.removedSignal, this.updatePanelStyle.bind(this)]);
        }
        // Connection for Toggle Switch status shapes in High Contrast
        if(this.gnomeVersion <= 45) {
            connections.push( [ this._hcSettings, 'changed::high-contrast', this.updatePanelStyle.bind(this), 'high-contrast' ] );
        }
        // Connection specific to QSAP extension (Quick Settings)
        if(this.gnomeVersion > 42) {
            let qSettings = Main.panel.statusArea.quickSettings;
            connections.push( [qSettings, 'menu-set', this.setupLibpanel.bind(this)] );
        }
        // Connection specific to Workspace indicator dots
        if(this.gnomeVersion > 44) {
            connections.push([global.workspace_manager, 'notify::n-workspaces', this.updatePanelStyle.bind(this)]);
        }

        // Setup all connections
        for(const [obj, signal, callback, param] of connections)
            this._connections.connect(obj, signal, callback, param);

        // Setup connections for addition of new QSAP extension panels
        if(this.gnomeVersion > 42)
            this.setupLibpanel(Main.panel.statusArea.quickSettings, 'enabled');

        // Connect to background manager (give time for it to be available)
        this._queueTimeout('bgMgrTimeOutId', () => {
            this.connectPrimaryBGChanged();
        }, 2000);
        // Set initial bguri as per color-scheme
        const bguri = this._settings.get_string('bguri');
        this.updateBguri(); // Session-only per-mode populations must be regenerated.
        if(bguri != '') {
            // If mode was changed (by script/extension) while OpenBar was disabled (screen-lock),
            // detect mode-change and update styles
            let obarScheme = this._settings.get_string('color-scheme');
            if(obarScheme != this.colorScheme)
                this.onModeChange();
        }

        // Update calendar style on Calendar rebuild through fn injection
        const obar = this;
        this._calendarInjectionTarget = Main.panel.statusArea.dateMenu._calendar;
        this._injections["_rebuildCalendar"] = this._injectToFunction(
            this._calendarInjectionTarget,
            "_rebuildCalendar",
            function () {
                if(!obar._settings) {
                    return;
                }
                let menustyle = obar._settings.get_boolean('menustyle');
                if(menustyle) {
                    obar.applyCalendarGridStyle(this, menustyle);
                }
            }
        );

        // Add 'openbar' class to top panel and panelBox
        panel.add_style_class_name('openbar');
        Main.layoutManager.panelBox.add_style_class_name('openbar');
        // Cause stylesheet to save and reload on Enable (also creates gtk css)
        this._runStyleTask('stylesheet generation', () => StyleSheets.reloadStyle(this, this));
        // Add Open Bar Flatpak Overrides
        this._runStyleTask('Flatpak permissions', () => StyleSheets.saveFlatpakOverrides(this, 'enable'));

        // Apply the initial style
        this.updatePanelStyle(null, 'enabled');
        let menustyle = this._settings.get_boolean('menustyle');
        this.applyMenuStyles(panel, menustyle);
        // Refresh to fix any indicators added during initial styling
        this._queueTimeout('enableStyleTimeoutId', () => {
            this.updatePanelStyle(null, 'enabled');
            this.applyMenuStyles(panel, menustyle);
        }, 1000);

        // Set initial Window Max Bar
        this.onWindowMaxBar();

        // Set fullscreen mode if in Fullscreen when extension is enabled
        this.onFullScreen(null, 'enabled', null, 100);

        /* Fitts Widgets:
         * Add a widget to PanelBox for each button.
         * Widget x1,x2 as per btn and y1,y2 to extend button interaction to screen-edge.
         * Track widget events and send to button.
         */
        // Do not enable if Dash-to-Panel is On
        this._shellSettings = new Gio.Settings({ schema_id: 'org.gnome.shell' });
        let enabledExtensions = this._shellSettings.get_strv('enabled-extensions');
        let dtpOn = enabledExtensions.includes('dash-to-panel@jderose9.github.com');
        // Enable button proximity to interact with panel buttons without having to point precisely at them.
        const fittsWidgets = this._settings.get_boolean('fitts-widgets');
        if(fittsWidgets && !dtpOn)
            this._queueTimeout('fittsEnableTimeoutId', () => {
                this.enableFittsWidgets();
            }, 5000);
    }

    disable() {
        this.disabling = true;
        const writers = StyleSheets.invalidateStyleWrites(this);
        this.cancelBackgroundPalette();
        this._cancelTimeouts();

        // Get the top panel
        let panel = Main.panel;

        this.disableFittsWidgets();

        // Release the independent QSAP graph, including surviving off-panel roots.
        this.setupLibpanel(null, 'disabled');
        this._libpanelConnections?.disconnectAll();
        this._libpanelConnections = null;
        this._libpanelOwner = null;
        this._libpanelRefresh = null;
        this._connections?.disconnectAll();
        this._connections = null;
        this._primaryBGManager = null;
        this._backgroundSettingsConnected = false;

        this.disconnectWindowSignals();
        this._restoreAppearance();


        for(let i=0; i<this.msgLists.length; i++) {
            if(this.msgListIds[i]) {
                // console.log('Disable - msgListIds: ', this.msgListIds[i]);
                if(this.msgLists[i] && this.msgListIds[i] > 0)
                    this.msgLists[i].disconnect(this.msgListIds[i]);
                this.msgListIds[i] = null;
                this.msgLists[i] = null;
            }
        }
        this.msgLists = [];
        this.msgListIds = [];

        if(Object.hasOwn(this._injections, '_rebuildCalendar'))
            this._removeInjection(this._calendarInjectionTarget, this._injections, "_rebuildCalendar");
        this._calendarInjectionTarget = null;
        this._injections = [];

        // Remove style class from Panel and PanelBox
        Main.layoutManager.panelBox.remove_style_class_name('openbar');
        panel.remove_style_class_name('openbar');
        panel.remove_style_class_name('candybar');
        panel.remove_style_class_name('trilands');
        for(const box of this.panelBoxes) {
            for(const btn of box) {
                btn.remove_style_pseudo_class('trilands-left');
                btn.remove_style_pseudo_class('trilands-right');
            }
        }
        // Reset left padding widget into DateMenu button
        if(this.dateMenuLeftPadWidget) {
            this.dateMenuBtnBox.insert_child_at_index(this.dateMenuLeftPadWidget, 0);
            this.dateMenuLeftPadWidget = null;
        }
        // Reset the style for Menus
        this.applyMenuStyles(panel, false);

        // Unload stylesheet
        if(this.themeContext && this.obarRunDir)
            this.unloadStylesheet();

        // Reset panel and banner position to Top
        this.setPanelBoxPosition('Top');
        Main.messageTray._bannerBin.y_align = Clutter.ActorAlign.START;

        // Clear/Restore Gtk css and Flatpak override
        this._styleCleanup = Promise.all([
            writers,
            this._runStyleTask('GTK restoration', () => StyleSheets.saveGtkCss(this, 'disable')),
            this._runStyleTask('Flatpak restoration', () => StyleSheets.saveFlatpakOverrides(this, 'disable')),
        ]);

        this.main = null;
        this._settings = null;
        this._bgSettings = null;
        this._intSettings = null;
        this._hcSettings = null;
        this._shellSettings = null;
    }
}

