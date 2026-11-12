// SPDX-License-Identifier: GPL-3.0-only
import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCALING_VALUES = ['cover', 'contain', 'stretch'];

export default class AnimatedWallpaperPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        window.search_enabled = true;

        const page = new Adw.PreferencesPage({
            title: 'Général',
            icon_name: 'preferences-system-symbolic',
        });
        window.add(page);

        page.add(this._buildVideoGroup(window, settings));
        page.add(this._buildBehaviorGroup(settings));
        page.add(this._buildAboutGroup());
    }

    _buildVideoGroup(window, settings) {
        const group = new Adw.PreferencesGroup({
            title: 'Vidéo',
            description: 'La vidéo est lue en boucle derrière les fenêtres. Le fond d’écran statique de GNOME n’est jamais modifié.',
        });

        const videoRow = new Adw.ActionRow({ title: 'Vidéo de fond' });
        const chooseButton = new Gtk.Button({
            label: 'Choisir…',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        videoRow.add_suffix(chooseButton);
        videoRow.activatable_widget = chooseButton;
        group.add(videoRow);

        const updateVideoRow = () => {
            const path = settings.get_string('video-path');
            videoRow.subtitle = path
                ? GLib.path_get_basename(path)
                : 'Aucune vidéo sélectionnée';
            videoRow.tooltip_text = path;
        };
        updateVideoRow();

        const videoSignal = settings.connect('changed::video-path', updateVideoRow);
        window.connect('close-request', () => {
            settings.disconnect(videoSignal);
            return false;
        });

        chooseButton.connect('clicked', () => {
            const dialog = new Gtk.FileDialog({ title: 'Choisir une vidéo' });

            const filter = new Gtk.FileFilter({ name: 'Vidéos' });
            filter.add_mime_type('video/*');
            const filters = new Gio.ListStore({ item_type: Gtk.FileFilter.$gtype });
            filters.append(filter);
            dialog.filters = filters;
            dialog.default_filter = filter;

            const videosDir = GLib.get_user_special_dir(
                GLib.UserDirectory.DIRECTORY_VIDEOS
            );
            if (videosDir)
                dialog.set_initial_folder(Gio.File.new_for_path(videosDir));

            dialog.open(window, null, (self, result) => {
                try {
                    const file = self.open_finish(result);
                    if (file)
                        settings.set_string('video-path', file.get_path());
                } catch (error) {
                    if (error?.code !== Gtk.DialogError?.DISMISSED)
                        logError(error);
                }
            });
        });

        const scalingRow = new Adw.ComboRow({
            title: 'Cadrage',
            subtitle: 'Comment la vidéo remplit l’écran',
        });
        scalingRow.model = Gtk.StringList.new([
            'Remplir (cover)',
            'Ajuster (contain)',
            'Étirer (stretch)',
        ]);

        const currentIndex = SCALING_VALUES.indexOf(settings.get_string('scaling'));
        scalingRow.selected = currentIndex >= 0 ? currentIndex : 0;
        scalingRow.connect('notify::selected', () => {
            const value = SCALING_VALUES[scalingRow.selected];
            if (value)
                settings.set_string('scaling', value);
        });
        group.add(scalingRow);

        return group;
    }

    _buildBehaviorGroup(settings) {
        const group = new Adw.PreferencesGroup({ title: 'Comportement' });

        group.add(this._switchRow(
            'Activer le fond animé',
            'La vidéo est jouée immédiatement et reste active après reconnexion.',
            settings,
            'active'
        ));
        group.add(this._switchRow(
            'Pause en plein écran',
            'Arrête la vidéo quand une application passe en plein écran.',
            settings,
            'pause-on-fullscreen'
        ));
        group.add(this._switchRow(
            'Pause sur batterie',
            'Arrête la vidéo quand l’ordinateur est sur batterie.',
            settings,
            'pause-on-battery'
        ));
        group.add(this._switchRow(
            'Icône dans la barre',
            'Affiche l’interrupteur dans la barre supérieure.',
            settings,
            'show-indicator'
        ));

        return group;
    }

    _buildAboutGroup() {
        const group = new Adw.PreferencesGroup({ title: 'À propos' });

        group.add(new Adw.ActionRow({
            title: 'mpv',
            subtitle: GLib.find_program_in_path('mpv')
                ? 'Installé'
                : 'Absent — installez-le avec « sudo dnf install mpv »',
        }));

        group.add(new Adw.ActionRow({
            title: 'Fond d’écran statique',
            subtitle: 'Cette extension ne modifie jamais le réglage « Arrière-plan » de GNOME.',
        }));

        return group;
    }

    _switchRow(title, subtitle, settings, key) {
        const row = new Adw.ActionRow({ title, subtitle });
        const toggle = new Gtk.Switch({ valign: Gtk.Align.CENTER });
        settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
        row.add_suffix(toggle);
        row.activatable_widget = toggle;
        return row;
    }
}
