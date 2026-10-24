// SPDX-License-Identifier: GPL-2.0-or-later
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import {replaceFile} from './styleWrites.js';

Gio._promisify(Gio.File.prototype, 'create_async', 'create_finish');
Gio._promisify(Gio.OutputStream.prototype, 'close_async', 'close_finish');

const requested = ['xdg-config/gtk-3.0:ro', 'xdg-config/gtk-4.0:ro'];
const owners = new WeakMap();
function stat(file) {
    try {
        return file.query_info('standard::type', Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, null);
    } catch (error) {
        if (error.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.NOT_FOUND)) return null;
        throw error;
    }
}
function scope(token) { return token.replace(/^!/, '').replace(/:(ro|rw|create)$/, ''); }

export async function updateFlatpakOverrides(owner, apply) {
    let record = owners.get(owner);
    if (!apply && !record) return false;
    const directory = Gio.File.new_for_path(`${GLib.get_user_data_dir()}/flatpak/overrides`);
    const directoryInfo = stat(directory);
    if (directoryInfo && directoryInfo.get_file_type() !== Gio.FileType.DIRECTORY)
        throw new Error('Refusing symlink/non-directory Flatpak overrides directory');
    if (!directoryInfo) {
        if (!apply) return false;
        directory.make_directory_with_parents(null);
    }
    const file = directory.get_child('global');
    const fileInfo = stat(file);
    if (fileInfo && fileInfo.get_file_type() !== Gio.FileType.REGULAR)
        throw new Error('Refusing symlink/nonregular Flatpak global overrides');
    let text = '', etag = null;
    if (fileInfo) {
        const [, bytes, tag] = file.load_contents(null);
        text = new TextDecoder().decode(bytes);
        etag = tag;
    }
    const keyfile = GLib.KeyFile.new();
    if (text) keyfile.load_from_data(text, new TextEncoder().encode(text).length, GLib.KeyFileFlags.KEEP_COMMENTS | GLib.KeyFileFlags.KEEP_TRANSLATIONS);
    const hasKey = keyfile.has_group('Context') && keyfile.get_keys('Context')[0].includes('filesystems');
    const tokens = hasKey ? keyfile.get_string_list('Context', 'filesystems').filter(Boolean) : [];
    if (!record) record = {added: new Set(), blocked: new Set(), hadKey: hasKey};
    const next = {added: new Set(record.added), blocked: new Set(record.blocked), hadKey: record.hadKey};
    // An externally removed/changed/duplicated permission no longer belongs to
    // us. Do not resurrect it on the next enable or remove its replacement.
    for (const token of next.added) {
        if (tokens.filter(value => value === token).length !== 1 ||
            tokens.some(value => value !== token && scope(value) === scope(token))) {
            next.added.delete(token);
            next.blocked.add(token);
        }
    }
    let merged = [...tokens];
    if (apply) {
        for (const token of requested) {
            if (!next.blocked.has(token) && !merged.some(value => scope(value) === scope(token))) {
                merged.push(token);
                next.added.add(token);
            }
        }
    } else {
        merged = merged.filter(token => !next.added.has(token));
    }
    const changed = tokens.join('\0') !== merged.join('\0');
    if (changed) {
        if (merged.length || next.hadKey) keyfile.set_string_list('Context', 'filesystems', merged);
        else if (hasKey) keyfile.remove_key('Context', 'filesystems');
        const [output] = keyfile.to_data();
        if (!fileInfo) {
            const stream = await file.create_async(Gio.FileCreateFlags.PRIVATE, GLib.PRIORITY_DEFAULT, null);
            await stream.close_async(GLib.PRIORITY_DEFAULT, null);
            etag = stream.get_etag();
        }
        // Do not cancel a half-committed ownership transaction. Disable waits in
        // the shared queue, then removes the successfully published additions.
        await replaceFile(file, output, null, etag);
    }
    if (apply) owners.set(owner, next);
    else owners.delete(owner);
    return changed;
}
