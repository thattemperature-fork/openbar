// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {replaceFile} from './styleWrites.js';

Gio._promisify(Gio.File.prototype, 'create_async', 'create_finish');
Gio._promisify(Gio.OutputStream.prototype, 'close_async', 'close_finish');

// Never infer ownership from a comment/header: users can edit generated CSS.
// Keep this ledger across disable/re-enable on the same extension instance.
const owners = new WeakMap();
function ledgerFor(owner) {
    if (!owners.has(owner)) owners.set(owner, new Map());
    return owners.get(owner);
}
function info(file) {
    try {
        return file.query_info('standard::type,etag::value', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch (error) {
        if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return null;
        throw error;
    }
}
function regular(file) {
    const stat = info(file);
    if (stat && stat.get_file_type() !== Gio.FileType.REGULAR)
        throw new Error(`Refusing nonregular GTK file: ${file.get_path()}`);
    return stat;
}
function read(file) {
    if (!regular(file)) return null;
    const [ok, bytes, etag] = file.load_contents(null);
    if (!ok) throw new Error(`Cannot read ${file.get_path()}`);
    return {bytes, etag};
}
function equalBytes(a, b) {
    return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
function matches(a, b) {
    return a !== null && b !== null && equalBytes(a.bytes, b.bytes) && a.etag === b.etag;
}
function copyExclusive(source, destination) {
    return new Promise((resolve, reject) => {
        source.copy_async(destination, Gio.FileCopyFlags.NOFOLLOW_SYMLINKS,
            GLib.PRIORITY_DEFAULT, null, null, (object, result) => {
                try { object.copy_finish(result); resolve(); } catch (error) { reject(error); }
            });
    });
}

export async function updateGtkFile(owner, directory, css) {
    const ledger = ledgerFor(owner);
    const key = directory.get_path();
    const file = directory.get_child('gtk.css');
    const backup = directory.get_child('gtk_backup_byOpenBar.css');
    let record = ledger.get(key);
    if (css === null && !record) return;
    const dirInfo = info(directory);
    if (dirInfo && dirInfo.get_file_type() !== Gio.FileType.DIRECTORY)
        throw new Error(`Refusing non-directory/symlink GTK directory: ${key}`);
    if (!dirInfo) directory.make_directory_with_parents(null);
    const current = read(file);
    if (record && !matches(current, record.last)) {
        // Keep the backup, but never overwrite or remove independently edited CSS.
        throw new Error(`GTK CSS changed outside Open Bar; leaving file and backup untouched: ${key}`);
    }
    if (record?.pendingCleanup) {
        // Restore already committed. Verify both restored target (above) and
        // backup before completing cleanup; never infer ownership from bytes alone.
        if (!matches(read(backup), record.backup))
            throw new Error(`GTK backup changed outside Open Bar: ${key}`);
        backup.delete(null);
        ledger.delete(key);
        record = null;
        if (css === null) return;
    }
    if (css === null) {
        if (record.original !== null) {
            const saved = read(backup);
            if (!matches(saved, record.backup))
                throw new Error(`GTK backup changed outside Open Bar: ${key}`);
            const etag = await replaceFile(file, saved.bytes, null, current.etag);
            // Commit ownership metadata before the fallible unlink. A retry or
            // new enable must recognize the restored original, not generated CSS.
            record.last = {bytes: saved.bytes, etag};
            record.pendingCleanup = true;
            if (!matches(read(backup), record.backup))
                throw new Error(`GTK backup changed outside Open Bar: ${key}`);
            backup.delete(null);
        } else {
            file.delete(null);
        }
        ledger.delete(key);
        return;
    }
    if (!record) {
        // An existing backup (including a symlink/directory) is never ours to erase.
        if (info(backup)) throw new Error(`GTK backup already exists: ${backup.get_path()}`);
        if (current !== null) {
            await copyExclusive(file, backup);
            const saved = read(backup);
            if (!saved || !equalBytes(saved.bytes, current.bytes) || !matches(read(file), current))
                throw new Error(`GTK CSS changed while backing up: ${key}`);
            record = {original: current, backup: saved, last: current};
        } else {
            record = {original: null, backup: null, last: null};
        }
        ledger.set(key, record);
    }
    // Once a GTK transaction starts, finish it before queued disable cleanup.
    // Cancelling between backup and publication would strand ownership metadata.
    if (current === null) {
        const stream = await file.create_async(Gio.FileCreateFlags.PRIVATE, GLib.PRIORITY_DEFAULT, null);
        await stream.close_async(GLib.PRIORITY_DEFAULT, null);
        record.last = {bytes: new Uint8Array(), etag: stream.get_etag()};
        const etag = await replaceFile(file, css, null, record.last.etag);
        record.last = {bytes: new TextEncoder().encode(css), etag};
    } else {
        const etag = await replaceFile(file, css, null, current.etag);
        record.last = {bytes: new TextEncoder().encode(css), etag};
    }
}
