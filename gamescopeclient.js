import Gio from 'gi://Gio';
import { EventEmitter } from "resource:///org/gnome/shell/misc/signals.js";

export class GamescopeConfig {
    fullscreen = true;
    mangohud = false;
    width = null;
    height = null;
    refreshRate = null;
}

export class GamescopeClient extends EventEmitter {
    constructor() {
        super();
        this._process = null;
    }
    setConfig(config) {
        this._cmd = ['gamescope'];
        if (config.width) {
            this._cmd.push('-W');
            this._cmd.push(config.width);
        }
        if (config.height) {
            this._cmd.push('-H');
            this._cmd.push(config.height);
        }
        if (config.refreshRate) {
            this._cmd.push('-r');
            this._cmd.push(config.refreshRate);
        }
        if (config.fullscreen) {
            this._cmd.push('-f');
        }
        if (config.mangohud) {
            this._cmd.push('--mangoapp');
        }
    }

    launch() {
        this.kill();
        this._execGamescope();
    }

    async _execGamescope() {
        try {
            this._process = Gio.Subprocess.new(
                this._cmd,
                // Gio.SubprocessFlags.NONE
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
            );
            const cancellable = new Gio.Cancellable();
            this.emit("gamescope-running", true);
            this._process.wait_async(cancellable, (status) => {
                this.emit("gamescope-exited", true);
            });
        } catch (e) {
            logError(e);
        }
    }

    kill() {
        if (this._process != null) {
            this._process.force_exit();
            this._process = null;
        }
    }
}
