import St from 'gi://St';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as QuickSettings from 'resource:///org/gnome/shell/ui/quickSettings.js';
import { GamescopeClient, GamescopeConfig } from "./gamescopeclient.js";

export default class GamescopeExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._indicator = new GamescopeIndicator(this, this._settings);
        this._menu = new GamescopeMenuToggle(this, this._settings);
        this._indicator.quickSettingsItems.push(this._menu);

        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator.quickSettingsItems.forEach(item => item.destroy());
        this._settings = null;

        if (this._indicator != null) {
            this._indicator.destroy();
            this._indicator = null;
        }
        if (this._menu != null) {
            this._menu.destroy();
            this._menu = null;
        }

        // This extension requires the `unlock-dialog` session-mode because it spawns Gamescope using Gio.Subprocess.new() and Gamescope should not be killed if the screen is locked. If a game is running inside the Gamescope window it would crash if the extension is disabled, and this is undesirable behaviour (and would invalidate the purpose of the extension).
    }
}

const GamescopeIndicator = GObject.registerClass(
    class GamescopeIndicator extends QuickSettings.SystemIndicator {
        _init(extension, settings) {
            super._init();
            this._indicator = this._addIndicator();
            this._indicator.icon_name = 'applications-games-symbolic';

            // Showing an indicator when Gamescope session is running
            settings.bind('gamescope-enabled',
                this._indicator, 'visible',
                Gio.SettingsBindFlags.DEFAULT);
        }
    });

// const PopupMenuSelectItem = GObject.registerClass({
//     Properties: { "selected": GObject.ParamSpec.boolean("selected", "", "", GObject.ParamFlags.READABLE, false), }
// }, class PopupMenuSelectItem extends PopupMenu.PopupMenuItem {
//     _init(text, selected) {
//         super._init(text, selected);
//         this._selected = selected;
//
//         this._selectedIcon = new St.Icon({
//             style_class: 'popup-menu-item-icon',
//             icon_name: 'object-select-symbolic',
//         });
//         this.add_child(this._selectedIcon);
//         this.bind_property("selected", this._selectedIcon, "visible", GObject.BindingFlags.SYNC_CREATE);
//     }
//     get selected() {
//         return this._selected;
//     }
// });

const GamescopeMenuToggle = GObject.registerClass(
    class GamescopeMenuToggle extends QuickSettings.QuickMenuToggle {
        _init(extension, settings) {
            super._init({
                title: _('Gamescope'),
                iconName: 'applications-games-symbolic',
                toggleMode: true,
            });
            this.menu.setHeader('applications-games-symbolic', _('Gamescope Launcher'));

            this._settings = settings;
            this._gamescopeClient = new GamescopeClient();
            this._settings.set_boolean('gamescope-enabled', false); // always set to false on startup.

            this._settings.bind('gamescope-enabled',
                this, 'checked',
                Gio.SettingsBindFlags.DEFAULT);

            this._gamescopeClient.connect('gamescope-exited', () => {
                this._settings.set_boolean('gamescope-enabled', false);
            });

            this._settings.connect('changed::gamescope-enabled', () => {
                if (this._settings.get_boolean('gamescope-enabled')) {
                    this._gamescopeClient.setConfig(this._getGamescopeConfig()); // set config before launch in case any settings have been changed
                    this._gamescopeClient.launch();
                } else {
                    this._gamescopeClient.kill();
                }
            });

            this._addRefreshMenu();
            this._addResolutionMenu();
            this._addMangoHUDToggle();
            this._addFullscreenToggle();

            // Add an entry-point for more settings
            // this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            // const settingsItem = this.menu.addAction('More Settings',
            // () => extensionObject.openPreferences());

            // Ensure the settings are unavailable when the screen is locked
            // settingsItem.visible = Main.sessionMode.allowSettings;
            // this.menu._settingsActions[extensionObject.uuid] = settingsItem;
        }

        _addRefreshMenu() {
            this._refreshMenu = new PopupMenu.PopupSubMenuMenuItem('Refresh Rate');
            this._refreshEntryItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false
            });
            this._refreshEntry = new St.Entry({
                name: 'refreshEntry',
                x_expand: true,
                y_expand: true,
            });
            this._refreshEntry.set_text(this._settings.get_string('gamescope-refresh-rate'));

            ["240", "165", "144", "120", "90", "60", "40", "30"
            ].forEach(item => {
                this._refreshMenu.menu.addAction(_(item + 'hz'), () => {
                    this._settings.set_string('gamescope-refresh-rate', item);
                });
            });
            this._settings.connect('changed::gamescope-refresh-rate', () => {
                this._refreshEntry.set_text(this._settings.get_string('gamescope-refresh-rate'));
            });
            this._refreshEntry.get_clutter_text().connect('text-changed', () => {
                let hz = this._refreshEntry.get_text();
                if (/^\d+$/.test(hz))
                    this._settings.set_string('gamescope-refresh-rate', hz);
            });

            this._refreshEntryItem.add_child(this._refreshEntry);
            this._refreshMenu.menu.addMenuItem(this._refreshEntryItem);
            this.menu.addMenuItem(this._refreshMenu);
        }

        _addResolutionMenu() {
            this._resolutionMenu = new PopupMenu.PopupSubMenuMenuItem('Resolution');
            this._resolutionEntryItem = new PopupMenu.PopupBaseMenuItem({
                reactive: false,
                can_focus: false
            });
            this._resolutionEntry = new St.Entry({
                name: 'resolutionEntry',
                x_expand: true,
                y_expand: true,
            });
            const get_resolution = () => {
                this._resolutionEntry.set_text(
                    this._settings.get_string('gamescope-width') +
                    'x' +
                    this._settings.get_string('gamescope-height')
                );
            }
            get_resolution();

            const set_resolution = (res) => {
                if (! /^\d+[x]\d+$/.test(res)) {
                    console.log('error: ' + res + ' is not valid');
                    return;
                }
                let [w, h] = res.split('x');
                this._settings.set_string('gamescope-width', w);
                this._settings.set_string('gamescope-height', h);
            }

            ["1920x1200", "1920x1080",
                "1680x1050", "1600x900", "1280x800", "1280x720"
            ].forEach(item => {
                this._resolutionMenu.menu.addAction(_(item), () => {
                    set_resolution(item);
                });
            });
            this._settings.connect('changed::gamescope-width', () => {
                get_resolution();
            });
            this._settings.connect('changed::gamescope-height', () => {
                get_resolution();
            });
            this._resolutionEntry.get_clutter_text().connect('text-changed', () => {
                let res = this._resolutionEntry.get_text();
                set_resolution(res);
            });

            this._resolutionEntryItem.add_child(this._resolutionEntry);
            this._resolutionMenu.menu.addMenuItem(this._resolutionEntryItem);
            this.menu.addMenuItem(this._resolutionMenu);
        }

        _addFullscreenToggle() {
            this._fullscreenToggle = new PopupMenu.PopupSwitchMenuItem(_("Fullscreen"),
                this._settings.get_boolean('gamescope-fullscreen'), { reactive: true });
            this._fullscreenToggle.connect('toggled', (_, value) => {
                this._settings.set_boolean('gamescope-fullscreen', value);
            });
            this.menu.addMenuItem(this._fullscreenToggle);
        }

        _addMangoHUDToggle() {
            this._mangohudToggle = new PopupMenu.PopupSwitchMenuItem(_("MangoHUD"), this._settings.get_boolean('gamescope-mangohud'), { reactive: true });
            this._mangohudToggle.connect('toggled', (_, value) => {
                this._settings.set_boolean('gamescope-mangohud', value);
            });
            this.menu.addMenuItem(this._mangohudToggle);
        }

        _getGamescopeConfig() {
            let cfg = new GamescopeConfig();
            cfg.fullscreen = this._settings.get_boolean('gamescope-fullscreen');
            cfg.mangohud = this._settings.get_boolean('gamescope-mangohud');
            cfg.width = this._settings.get_string('gamescope-width');
            cfg.height = this._settings.get_string('gamescope-height');
            cfg.refreshRate = this._settings.get_string('gamescope-refresh-rate');
            return cfg;
        }

        destroy() {
            this._gamescopeClient.kill();
            this._gamescopeClient.destroy();
            super.destroy();
        }
    });
