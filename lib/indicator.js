// SPDX-License-Identifier: GPL-3.0-only
import GObject from 'gi://GObject';
import St from 'gi://St';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init(settings, onToggle, onOpenPrefs) {
            super._init(0.0, 'Fond d’écran animé');

            this._settings = settings;
            this._onToggle = onToggle;
            this._onOpenPrefs = onOpenPrefs;
            this._settingsSignal = settings.connect(
                'changed::active',
                () => this.sync()
            );

            this.add_child(
                new St.Icon({
                    icon_name: 'preferences-desktop-wallpaper-symbolic',
                    style_class: 'system-status-icon',
                })
            );

            this._switch = new PopupMenu.PopupSwitchMenuItem(
                'Fond d’écran animé',
                settings.get_boolean('active')
            );
            this._switch.connect('toggled', (_item, state) => this._onToggle(state));
            this.menu.addMenuItem(this._switch);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            const prefsItem = new PopupMenu.PopupMenuItem('Réglages…');
            prefsItem.connect('activate', () => this._onOpenPrefs());
            this.menu.addMenuItem(prefsItem);

            this.sync();
        }

        sync() {
            this._switch.setToggleState(this._settings.get_boolean('active'));
        }

        destroy() {
            if (this._settingsSignal) {
                this._settings.disconnect(this._settingsSignal);
                this._settingsSignal = null;
            }
            this._settings = null;
            this._onToggle = null;
            this._onOpenPrefs = null;
            super.destroy();
        }
    }
);
