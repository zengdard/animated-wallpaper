// SPDX-License-Identifier: GPL-3.0-only
/*
 * Animated Wallpaper — GNOME Shell extension
 * Copyright (C) 2026 Animated Wallpaper contributors
 *
 * The auto-pause logic is adapted from GNOME Live Wallpaper Engine by achu94
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

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const WINDOW_PREFIX = 'aw-wallpaper-';

/**
 * Met la vidéo en pause (arrêt de mpv) quand une application plein écran est
 * visible ou quand la machine est sur batterie, puis la relance ensuite.
 */
export class AutoPause {
    constructor(settings, renderer) {
        this._settings = settings;
        this._renderer = renderer;
        this._timeoutId = null;
        this._paused = false;

        this._onBattery = false;
        this._upower = null;
        this._upowerSignalId = null;

        this._initBattery();
    }

    start() {
        if (this._timeoutId)
            return;

        this._timeoutId = GLib.timeout_add(
            GLib.PRIORITY_DEFAULT,
            1000,
            () => {
                this._check();
                return GLib.SOURCE_CONTINUE;
            }
        );
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = null;
        }
        if (this._upower && this._upowerSignalId) {
            this._upower.disconnect(this._upowerSignalId);
            this._upowerSignalId = null;
        }
        this._upower = null;
    }

    _initBattery() {
        try {
            this._upower = Gio.DBusProxy.new_for_bus_sync(
                Gio.BusType.SYSTEM,
                Gio.DBusProxyFlags.NONE,
                null,
                'org.freedesktop.UPower',
                '/org/freedesktop/UPower',
                'org.freedesktop.UPower',
                null
            );

            this._onBattery =
                this._upower.get_cached_property('OnBattery')?.deep_unpack() ?? false;

            this._upowerSignalId = this._upower.connect(
                'g-properties-changed',
                () => {
                    this._onBattery =
                        this._upower.get_cached_property('OnBattery')?.deep_unpack() ?? false;
                }
            );
        } catch (error) {
            logError(error);
        }
    }

    _check() {
        if (!this._settings.get_boolean('active')) {
            this._paused = false;
            return;
        }

        const shouldPause =
            (this._settings.get_boolean('pause-on-fullscreen') && this._hasFullscreenWindow()) ||
            (this._settings.get_boolean('pause-on-battery') && this._onBattery);

        if (shouldPause && !this._paused && this._renderer.running) {
            this._paused = true;
            this._renderer.stop();
        } else if (!shouldPause && this._paused) {
            this._paused = false;
            this._renderer.start();
        }
    }

    _hasFullscreenWindow() {
        for (const actor of global.get_window_actors()) {
            const metaWindow = actor.get_meta_window();
            if (!metaWindow)
                continue;
            if (metaWindow.get_title()?.startsWith(WINDOW_PREFIX))
                continue;
            if (metaWindow.is_fullscreen())
                return true;
        }
        return false;
    }
}
