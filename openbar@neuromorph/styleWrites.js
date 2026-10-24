// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const states = new WeakMap();
function stateFor(owner) {
    if (!states.has(owner))
        states.set(owner, {tail: Promise.resolve(), generation: 0, epoch: 0, active: true, cancellable: null});
    return states.get(owner);
}

// Keep the queue across enable/disable cycles: cleanup from an old cycle must
// finish before a new enable can touch the same paths.
export function beginStyleWrites(owner) {
    const state = stateFor(owner);
    state.active = true;
    state.epoch++;
    state.generation++;
}

export function invalidateStyleWrites(owner) {
    const state = stateFor(owner);
    state.active = false;
    state.epoch++;
    state.generation++;
    state.cancellable?.cancel();
    return state.tail;
}

export function queueStyleWrite(owner, task, {latest = false, cleanup = false} = {}) {
    const state = stateFor(owner);
    if (!state.active && !cleanup)
        return Promise.resolve(false);
    const generation = latest ? ++state.generation : state.generation;
    const epoch = state.epoch;
    const current = () => cleanup || (state.active && epoch === state.epoch && (!latest || generation === state.generation));
    const result = state.tail.then(async () => {
        if (!current()) return false;
        const cancellable = new Gio.Cancellable();
        state.cancellable = cleanup ? null : cancellable;
        try {
            return await task(cancellable, current);
        } catch (error) {
            if (!current() && error.matches?.(Gio.IOErrorEnum, Gio.IOErrorEnum.CANCELLED))
                return false;
            throw error;
        } finally {
            state.cancellable = null;
        }
    });
    state.tail = result.catch(() => {});
    return result;
}

// Completion includes the internal output stream close/atomic rename. Callback
// errors must reject the returned promise, not escape into the main loop.
export function replaceFile(file, contents, cancellable = null, etag = null) {
    const bytes = GLib.Bytes.new(new TextEncoder().encode(contents));
    return new Promise((resolve, reject) => {
        file.replace_contents_bytes_async(bytes, etag, false,
            Gio.FileCreateFlags.REPLACE_DESTINATION, cancellable, (object, result) => {
                try {
                    const [, newEtag] = object.replace_contents_finish(result);
                    resolve(newEtag);
                } catch (error) {
                    reject(error);
                }
            });
    });
}
