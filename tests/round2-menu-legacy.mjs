// Tagged GNOME 45–47 DateMenu shape; actual extension methods, fake actor boundary.
import assert from 'node:assert/strict';
import {fixture, Emitter} from './runtime-harness.mjs';
class Actor extends Emitter {
    children = []; classes = new Set(); parent = null;
    constructor(children = []) { super(); children.forEach(c => this.add(c)); }
    add(c) { c.parent = this; this.children.push(c); }
    get_parent() { return this.parent; }
    get_children() { return this.children; }
    get_child_at_index(i) { return this.children[i]; }
    add_style_class_name(c) { this.classes.add(c); }
    remove_style_class_name(c) { this.classes.delete(c); }
    has_style_class_name(c) { return this.classes.has(c); }
}
class Calendar extends Actor { layout_manager = {get_child_at: (i,j) => this.children[i * 8 + j]}; }
for (const version of [45, 46, 47]) {
    const {ext: o, context, Main, flush} = fixture();
    const date = new context.PanelMenu.Button();
    Object.assign(date, new Emitter());
    for (const name of ['connect', 'disconnect', 'emit', 'count']) date[name] = Emitter.prototype[name];
    date._messageList = new Actor();
    const list = date._messageList, section = new Actor(), messages = new Actor();
    section._list = messages; messages.add(Object.assign(new Actor(), {child: new Actor()}));
    list._sectionList = new Actor([section]);
    list._placeholder = new Actor(); list._clearButton = new Actor(); list._dndButton = new Actor(); list._dndSwitch = new Actor();
    list.add(list._placeholder); list.add(new Actor([list._sectionList, list._clearButton, list._dndButton]));
    date._calendar = new Calendar([new Actor(), new Actor()]);
    date._date = new Actor(); date._displaysSection = new Actor([new Actor([new Actor()])]);
    const right = new Actor([date._date, date._calendar, date._displaysSection]);
    date.menu = {box: new Actor([new Actor([new Actor([list, right])])])};
    Main.panel.statusArea = {dateMenu: date}; o.panelBoxes = [[{child: date}]];
    o.addedSignal = version === 45 ? 'actor-added' : 'child-added'; o.gnomeVersion = version;
    for (const add of [true, false, true, false]) {
        o.applyMenuStyles(Main.panel, add); flush();
        for (const a of [list, list._placeholder, list._clearButton, list._dndButton, list._dndSwitch, date._calendar, date._date, date._displaysSection, messages.children[0].child])
            assert.equal(a.classes.has('openmenu'), add, `${version}: legacy semantic actors ${add}`);
        assert.equal(messages.count(o.addedSignal), add ? 1 : 0, `${version}: legacy message observer owned`);
        if (add) {
            const late = Object.assign(new Actor(), {child: new Actor()}); messages.add(late); messages.emit(o.addedSignal, late);
            assert.ok(late.child.classes.has('openmenu'), `${version}: late legacy message styled`);
        }
    }
    o._connections.disconnectAll();
    console.log(`PASS round2-menu-legacy GNOME ${version} source-shaped fixture`);
}
