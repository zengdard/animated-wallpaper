// SPDX-License-Identifier: GPL-3.0-only
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Renderer } from './lib/renderer.js';
import { AutoPause } from './lib/autopause.js';
import { Indicator } from './lib/indicator.js';

export default class AnimatedWallpaperExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._renderer = new Renderer(this._settings, () => this._onRendererError());
        this._autoPause = new AutoPause(this._settings, this._renderer);
        this._indicator = null;
        this._settingsSignals = [];

        this._settingsSignals.push(
            this._settings.connect('changed::active', () => this._applyActive()),
            this._settings.connect('changed::video-path', () => this._restartIfActive()),
            this._settings.connect('changed::scaling', () => this._restartIfActive()),
            this._settings.connect('changed::show-indicator', () => this._syncIndicator())
        );

        this._syncIndicator();
        this._autoPause.start();
        this._applyActive();
    }

    disable() {
        for (const id of this._settingsSignals)
            this._settings.disconnect(id);
        this._settingsSignals = [];

        if (this._autoPause) {
            this._autoPause.destroy();
            this._autoPause = null;
        }
        if (this._renderer) {
            this._renderer.destroy();
            this._renderer = null;
        }
        if (this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }

        this._settings = null;
    }

    _applyActive() {
        if (!this._settings)
            return;

        if (this._settings.get_boolean('active')) {
            if (!this._settings.get_string('video-path')) {
                this._settings.set_boolean('active', false);
                return;
            }
            if (!this._renderer.running)
                this._renderer.start();
        } else {
            this._renderer.stop();
        }

        this._syncIndicatorState();
    }

    _restartIfActive() {
        if (!this._settings?.get_boolean('active'))
            return;
        if (!this._settings.get_string('video-path'))
            return;

        this._renderer.stop();
        this._renderer.start();
        this._syncIndicatorState();
    }

    _toggleActive(state) {
        if (state && !this._settings.get_string('video-path')) {
            Main.notify('Fond d’écran animé', 'Choisissez d’abord une vidéo dans les réglages.');
            this.openPreferences();
            this._syncIndicatorState();
            return;
        }

        this._settings.set_boolean('active', state);
    }

    _onRendererError() {
        if (this._settings)
            this._settings.set_boolean('active', false);
    }

    _syncIndicator() {
        if (!this._settings)
            return;

        const show = this._settings.get_boolean('show-indicator');
        if (show && !this._indicator) {
            this._indicator = new Indicator(
                this._settings,
                state => this._toggleActive(state),
                () => this.openPreferences()
            );
            Main.panel.addToStatusArea(this.uuid, this._indicator);
        } else if (!show && this._indicator) {
            this._indicator.destroy();
            this._indicator = null;
        }
    }

    _syncIndicatorState() {
        this._indicator?.sync();
    }
}
