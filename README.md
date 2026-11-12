# Fond d'écran animé — extension GNOME

Une extension GNOME Shell autonome qui joue **une vidéo en boucle** comme fond
d'écran. Contrairement à l'ancien « Gnome Live Wallpaper », elle ne modifie
jamais le fond d'écran statique de GNOME (`picture-uri`) : quand on la coupe,
le fond statique choisi dans les Paramètres réapparaît, intact.

## Publier sur extensions.gnome.org

Le fichier à envoyer sur <https://extensions.gnome.org/upload/> est :

```text
dist/animated-wallpaper@jeremy.zip
```

Il contient uniquement les fichiers nécessaires ( `metadata.json` à la racine,
le code, le schéma GSettings compilé et la licence ) — sans les scripts de
build/installation ni le README. Après l'envoi, le site ajoute lui-même le
champ `version` et les captures d'écran.

## Prérequis

- GNOME Shell 50, session **Wayland** (Fedora 43+)
- `mpv` : `sudo dnf install mpv`

## Installation

```bash
cd ~/Dossier_de_travail/animated-wallpaper
./install.sh
```

Puis **déconnectez-vous et reconnectez-vous** (GNOME ne scanne les nouvelles
extensions qu'au démarrage de la session). Activez ensuite l'extension :

```bash
gnome-extensions enable animated-wallpaper@jeremy
```

ou via l'application **Extensions** → « Fond d'écran animé ».

Pour produire un paquet distribuable :

```bash
./build.sh   # crée animated-wallpaper@jeremy.shell-extension.zip
```

## Utilisation

- Cliquez sur l'icône dans la barre supérieure → « Fond d'écran animé ».
- Ou ouvrez les réglages de l'extension : `gnome-extensions prefs animated-wallpaper@jeremy`
- Choisissez une vidéo, puis activez l'interrupteur. À la connexion suivante,
  la vidéo revient **uniquement si l'interrupteur est resté activé**.

L'extension est **inactive par défaut** : rien ne se lance tant que vous ne
l'activez pas explicitement.

## Réglages

| Clé | Défaut | Rôle |
|---|---|---|
| `active` | `false` | Interrupteur général, persistant |
| `video-path` | `''` | Chemin absolu de la vidéo |
| `scaling` | `cover` | `cover`, `contain` ou `stretch` |
| `pause-on-fullscreen` | `true` | Coupe la vidéo en plein écran |
| `pause-on-battery` | `false` | Coupe la vidéo sur batterie |
| `show-indicator` | `true` | Icône dans la barre supérieure |

## Désinstallation

```bash
gnome-extensions disable animated-wallpaper@jeremy
rm -rf ~/.local/share/gnome-shell/extensions/animated-wallpaper@jeremy
```

## Notes techniques

- mpv est lancé via `Meta.WaylandClient.new_subprocess`, puis sa fenêtre est
  greffée dans `Main.layoutManager._backgroundGroup` (même technique que
  l'extension d'origine, réécrite sans filtrage global des fenêtres).
- Un `Clutter.Clone` par moniteur permet d'afficher la vidéo sur tous les
  écrans, y compris avec des résolutions différentes.
- L'extension utilise le mode de session par défaut : elle est déchargée
  pendant le verrouillage de l'écran (la vidéo s'arrête), puis relancée au
  déverrouillage si `active` est vrai.
