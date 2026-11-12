// SPDX-License-Identifier: GPL-3.0-only
/*
 * Animated Wallpaper — GNOME Shell extension
 * Copyright (C) 2026 Animated Wallpaper contributors
 *
 * The renderer is adapted from GNOME Live Wallpaper Engine by achu94
 * <https://github.com/achu94/gnome-wallpaper-engine>, licensed GPL-3.0.
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 */

import cairo from 'gi://cairo';
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const WINDOW_PREFIX = 'aw-wallpaper-';

// Mutter élague les acteurs entièrement masqués. Avec un effet actif, l'acteur
// source hors écran n'est plus considéré comme invisible : les clones
// continuent donc de recevoir des images, même en mise à l'échelle fractionnaire.
const NoCullEffect = GObject.registerClass(
    class NoCullEffect extends Clutter.Effect {}
);

function unionBounds(monitors) {
    if (!monitors.length)
        return null;

    const x = Math.min(...monitors.map(m => m.x));
    const y = Math.min(...monitors.map(m => m.y));
    const right = Math.max(...monitors.map(m => m.x + m.width));
    const bottom = Math.max(...monitors.map(m => m.y + m.height));
    return { x, y, width: right - x, height: bottom - y };
}

function relativeBounds(bounds, monitor) {
    return {
        x: monitor.x - bounds.x,
        y: monitor.y - bounds.y,
        width: monitor.width,
        height: monitor.height,
    };
}

/**
 * Lance mpv comme client Wayland du shell, puis greffe sa fenêtre dans la
 * couche d'arrière-plan de GNOME. Le fond d'écran statique n'est jamais touché.
 */
export class Renderer {
    constructor(settings, onError) {
        this._settings = settings;
        this._onError = onError;
        this._process = null;
        this._sessionId = null;
        this._sourceActor = null;
        this._clones = [];
        this._mapTimeoutId = null;

        this._windowMapId = global.window_manager.connect_after(
            'map',
            (_windowManager, windowActor) => this._onWindowMapped(windowActor)
        );
        this._monitorsChangedId = Main.layoutManager.connect(
            'monitors-changed',
            () => {
                if (this.running)
                    this.start();
            }
        );
    }

    get running() {
        return this._process !== null;
    }

    start() {
        this.stop();

        const videoPath = this._settings.get_string('video-path');
        if (!videoPath)
            return;

        if (!GLib.file_test(videoPath, GLib.FileTest.EXISTS)) {
            Main.notify('Fond d’écran animé', 'La vidéo sélectionnée est introuvable.');
            this._fail();
            return;
        }

        if (!GLib.getenv('WAYLAND_DISPLAY') || !Meta.WaylandClient?.new_subprocess) {
            Main.notify('Fond d’écran animé', 'Cette extension nécessite une session Wayland (GNOME 50 ou plus).');
            this._fail();
            return;
        }

        const mpvPath = GLib.find_program_in_path('mpv');
        if (!mpvPath) {
            Main.notify('Fond d’écran animé', 'mpv est introuvable. Installez-le avec : sudo dnf install mpv');
            this._fail();
            return;
        }

        const monitors = [...Main.layoutManager.monitors].sort(
            (a, b) => a.x - b.x || a.y - b.y
        );
        if (!monitors.length)
            return;
        const sourceMonitor = monitors[0];

        const sessionId = GLib.uuid_string_random();
        this._sessionId = sessionId;
        const title = `${WINDOW_PREFIX}${sessionId}`;

        const scaling = this._settings.get_string('scaling');
        let scalingArgs;
        if (scaling === 'contain')
            scalingArgs = ['--panscan=0.0'];
        else if (scaling === 'stretch')
            scalingArgs = ['--panscan=0.0', '--keepaspect=no'];
        else
            scalingArgs = ['--panscan=1.0'];

        const argv = [
            mpvPath,
            '--vo=gpu',
            '--gpu-context=wayland',
            '--hwdec=auto',
            '--no-border',
            '--loop-file=inf',
            '--no-audio',
            '--force-window=immediate',
            `--title=${title}`,
            `--geometry=${sourceMonitor.width}x${sourceMonitor.height}+0+0`,
            '--keepaspect-window=no',
            '--no-auto-window-resize',
            ...scalingArgs,
            '--video-unscaled=no',
            '--osc=no',
            '--osd-bar=no',
            '--input-default-bindings=no',
            '--input-vo-keyboard=no',
            '--cursor-autohide=no',
            '--no-terminal',
            videoPath,
        ];

        try {
            const launcher = new Gio.SubprocessLauncher({
                flags: Gio.SubprocessFlags.NONE,
            });
            try {
                const client = Meta.WaylandClient.new_subprocess(
                    global.context,
                    launcher,
                    argv
                );
                this._process = client.get_subprocess();
            } finally {
                if (launcher.close)
                    launcher.close();
            }

            if (!this._process)
                throw new Error('Impossible de lancer mpv');

            const process = this._process;
            process.wait_async(null, (subprocess, result) => {
                try {
                    subprocess.wait_finish(result);
                } catch (error) {
                    logError(error);
                }

                if (this._process !== process)
                    return;

                this._process = null;
                this._sessionId = null;
                this._sourceActor = null;
                this._destroyClones();
                this._clearMapTimeout();
                Main.notify('Fond d’écran animé', 'mpv s’est arrêté de façon inattendue.');
                this._fail();
            });

            this._mapTimeoutId = GLib.timeout_add(
                GLib.PRIORITY_DEFAULT,
                5000,
                () => {
                    this._mapTimeoutId = null;
                    if (this._sessionId === sessionId && !this._sourceActor) {
                        Main.notify('Fond d’écran animé', 'La fenêtre vidéo n’a pas pu être attachée.');
                        this.stop();
                        this._fail();
                    }
                    return GLib.SOURCE_REMOVE;
                }
            );
        } catch (error) {
            console.error('[AnimatedWallpaper]', error);
            Main.notify('Fond d’écran animé', error.message);
            this.stop();
            this._fail();
        }
    }

    _onWindowMapped(windowActor) {
        if (!this._sessionId || this._sourceActor)
            return;

        const metaWindow = windowActor.get_meta_window();
        const title = metaWindow?.get_title();
        if (!title?.startsWith(WINDOW_PREFIX))
            return;
        if (title !== `${WINDOW_PREFIX}${this._sessionId}`)
            return;

        const monitors = [...Main.layoutManager.monitors].sort(
            (a, b) => a.x - b.x || a.y - b.y
        );
        const bounds = unionBounds(monitors);
        const sourceMonitor = monitors[0];
        const backgroundGroup = Main.layoutManager._backgroundGroup;

        if (!bounds || !sourceMonitor || !backgroundGroup) {
            Main.notify('Fond d’écran animé', 'La couche de fond d’écran de GNOME est indisponible.');
            this.stop();
            this._fail();
            return;
        }

        try {
            const sourceBounds = relativeBounds(bounds, sourceMonitor);
            const localBounds = monitors.map(monitor =>
                relativeBounds(bounds, monitor)
            );

            metaWindow.set_type(Meta.WindowType.DESKTOP);
            metaWindow.stick();
            metaWindow.focus_on_click = false;
            if (typeof metaWindow.set_accept_focus === 'function')
                metaWindow.set_accept_focus(false);
            try {
                metaWindow.set_input_region(new cairo.Region());
            } catch (_e) {
                // Certains backends ne permettent pas de vider la zone d'entrée.
            }

            metaWindow.move_resize_frame(
                true,
                sourceMonitor.x,
                sourceMonitor.y,
                sourceMonitor.width,
                sourceMonitor.height
            );
            windowActor.set_position(sourceBounds.x, sourceBounds.y);
            windowActor.set_size(sourceBounds.width, sourceBounds.height);

            this._sourceActor = windowActor;
            const parent = windowActor.get_parent();
            if (parent)
                parent.remove_child(windowActor);
            backgroundGroup.add_child(windowActor);
            windowActor.set_opacity(255);
            windowActor.set_reactive(false);
            windowActor.add_effect_with_name('aw-no-cull', new NoCullEffect());

            this._clones = localBounds.map(localBoundsItem => {
                const clone = new Clutter.Clone({ source: windowActor });
                clone.set_position(localBoundsItem.x, localBoundsItem.y);
                clone.set_size(localBoundsItem.width, localBoundsItem.height);
                clone.set_clip_to_allocation(true);
                clone.set_reactive(false);
                backgroundGroup.add_child(clone);
                return clone;
            });

            // La fenêtre source est déplacée hors écran : seuls les clones sont visibles.
            const hiddenX = bounds.x - sourceMonitor.width - 1;
            metaWindow.move_resize_frame(
                true,
                hiddenX,
                sourceMonitor.y,
                sourceMonitor.width,
                sourceMonitor.height
            );
            windowActor.set_position(
                -sourceMonitor.width - 1,
                sourceMonitor.y - bounds.y
            );
            metaWindow.lower();

            this._clearMapTimeout();

            windowActor.connect('destroy', () => {
                this._destroyClones();
                if (this._sourceActor === windowActor)
                    this._sourceActor = null;
            });
        } catch (error) {
            console.error('[AnimatedWallpaper]', error);
            Main.notify('Fond d’écran animé', error.message);
            this.stop();
            this._fail();
        }
    }

    stop() {
        this._sessionId = null;
        this._clearMapTimeout();
        this._destroyClones();
        this._sourceActor = null;

        if (this._process) {
            const process = this._process;
            this._process = null;
            try {
                process.force_exit();
            } catch (error) {
                logError(error);
            }
        }
    }

    destroy() {
        this.stop();

        if (this._windowMapId) {
            global.window_manager.disconnect(this._windowMapId);
            this._windowMapId = null;
        }
        if (this._monitorsChangedId) {
            Main.layoutManager.disconnect(this._monitorsChangedId);
            this._monitorsChangedId = null;
        }
    }

    _clearMapTimeout() {
        if (this._mapTimeoutId) {
            GLib.source_remove(this._mapTimeoutId);
            this._mapTimeoutId = null;
        }
    }

    _destroyClones() {
        for (const clone of this._clones)
            clone.destroy();
        this._clones = [];
    }

    _fail() {
        if (this._onError)
            this._onError();
    }
}
