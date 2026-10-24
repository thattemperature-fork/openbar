// Execute the real extension class in a VM; only GNOME host boundaries are faked.
import fs from 'node:fs';
import vm from 'node:vm';
export class Emitter {
    ids = new Map(); next = 1;
    connect(signal, fn) { const id = this.next++; this.ids.set(id, {signal, fn}); return id; }
    disconnect(id) { if (!this.ids.delete(id)) throw Error(`unknown signal ${id}`); }
    emit(signal, ...args) { for (const {signal: s, fn} of [...this.ids.values()]) if (s === signal) fn(this, ...args); }
    count(signal) { return [...this.ids.values()].filter(c => c.signal === signal).length; }
}
export class Settings extends Emitter {
    constructor(values = {}) { super(); this.values = values; }
    get_string(k) { return this.values[k] ?? ''; }
    set_string(k, v) { this.values[k] = v; this.emit('changed', k); }
    get_boolean(k) { return this.values[k] ?? false; }
    set_boolean(k, v) { this.values[k] = v; }
    get_double(k) { return this.values[k] ?? 0; }
    set_int(k, v) { this.values[k] = v; }
}
export function fixture() {
    const timers = new Map(); let next = 1;
    const panelBox = {x: 0, y: 0, set_position(x,y) {this.x=x;this.y=y;}, set_size(w,h) {this.width=w;this.height=h;}, remove_style_class_name() {}};
    class Layout extends Emitter {}
    const layoutManager = Object.assign(new Layout(), {monitors: [], primaryIndex: -1, _bgManagers: [], panelBox});
    const panel = {has_style_pseudo_class: () => false, remove_style_pseudo_class() {}, remove_style_class_name() {}};
    const Main = {layoutManager, panel, messageTray: {_bannerBin: {}}};
    const context = {console, Main, Gio: {Settings, File: {prototype: {}}, _promisify() {}},
        Meta: {WorkspaceManager: class {}, Display: class {}}, LayoutManager: {LayoutManager: Layout},
        Extension: class {}, Calendar: {Calendar: class {}}, Clutter: {ActorAlign: {START: 0}},
        AutoThemes: {getClosestGnomeAccent: () => 'red', getClosestYaruTheme: () => 'red'},
        StyleSheets: {saveGtkCss() {}, saveFlatpakOverrides() {}, reloadStyle() {}},
        PanelMenu: {Button: class {}, ButtonBox: class {}},
        setTimeout(fn) {const id = next++; timers.set(id, fn); return id;}, clearTimeout(id) {timers.delete(id);}};
    vm.createContext(context);
    const source = fs.readFileSync(new URL('../openbar@neuromorph/extension.js', import.meta.url), 'utf8')
        .replace(/^import .*;\n/gm, '').replace('export default class Openbar', 'class Openbar');
    vm.runInContext(`${source}\nglobalThis.Openbar = Openbar; globalThis.ConnectManager = ConnectManager;`, context);
    const ext = new context.Openbar({});
    ext._settings = new Settings(); ext._bgSettings = new Settings(); ext._intSettings = new Settings();
    ext._connections = new context.ConnectManager(); ext.themeContext = {scale_factor: 1};
    return {ext, Main, context, timers, flush() {for (const [id, fn] of [...timers]) {timers.delete(id);fn();}}};
}
