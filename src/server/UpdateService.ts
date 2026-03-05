import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import path from "node:path";
import { Version } from "../utils/version";
import { listen } from "node:quic";

const SCRIPTS_DIR = path.join(__dirname, '../../scripts');
const DOWNLOAD_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'downloadUpdateTar.bash');
const INSTALL_SCRIPT_PATH = path.join(SCRIPTS_DIR, 'installUpdateTar.bash');

export enum UpdateEvent {
    None = 'None',
    NewConsoleOutput = 'NewConsoleOutput',
    DryRunReady = 'DryRunReady',
    CriticalFailure = 'CriticalFailure',
    UpdateSuccess = 'UpdateSuccess',
}

export class UpdateProgressEvent {
    eventType: UpdateEvent = UpdateEvent.None;
    newOutput: string = '';
}

export interface UpdateListener {
    onUpdateProgress(event: UpdateProgressEvent): void;
}

export class UpdateService {
    private listener: UpdateListener | undefined = undefined;
    private downloadChild: ChildProcessWithoutNullStreams | undefined;
    private installChild: ChildProcessWithoutNullStreams | undefined;
    
    constructor (listener: UpdateListener | undefined) {
        this.listener = listener;
    }

    public isRunning(): boolean {
        return this.downloadChild != undefined || this.installChild != undefined;
    }

    public cancel() {
        if (this.downloadChild) {
            this.downloadChild.kill('SIGTERM');
        }
        if (this.installChild) {
            this.installChild.kill('SIGTERM');
        }
    }

    public startUpdate(newVersion: Version): boolean {
        if (this.isRunning()) {
            console.warn(`an update is already running. ignoring request.`);
            return false;
        }

        // start the download script in a subprocess
        console.log(`starting download of update ${newVersion.toTag()} ...`);
        this.downloadChild = spawn(
            'bash', [DOWNLOAD_SCRIPT_PATH, newVersion.toString()],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        );

        this.downloadChild.stdout.on('data', (data: string) => {
            this.onNewConsoleOutput('download', data);
        });

        this.downloadChild.stderr.on('data', (data: string) => {
            this.onNewConsoleOutput('download', data);
        });

        this.downloadChild.on("exit", (code: number, signal) => {
            console.log(`download - exited with code ${code}, signal ${signal}`);
            if (code == 0) {
                console.log('download was successful! starting install ...');
                this.startInstall('/tmp/thermo-logger/downloads/update.tar.gz');
            } else if (this.listener) {
                const event = new UpdateProgressEvent();
                event.eventType = UpdateEvent.CriticalFailure;
                this.listener.onUpdateProgress(event);
                console.error('download failed!');
            }
            this.downloadChild = undefined;
        });

        return true;
    }

    public acceptUpdate(): boolean {
        if ( ! this.installChild) {
            console.warn(`Install child process isn't running. Nothing to accept.`);
            return false;
        }

        this.installChild.stdin.write('y\n');
        this.installChild.stdin.end();
        return true;
    }

    private startInstall(updateTarPath: string): boolean {
        console.log(`starting install of  '${updateTarPath}' ...`);
        this.installChild = spawn(
            'bash', [INSTALL_SCRIPT_PATH, updateTarPath],
            { stdio: ['pipe', 'pipe', 'pipe'] }
        );

        this.installChild.stdout.on('data', (data) => {
            this.onNewConsoleOutput('install', data);
        });

        this.installChild.stderr.on('data', (data) => {
            this.onNewConsoleOutput('install', data);
        });

        this.installChild.on("exit", (code: number, signal) => {
            console.log(`install - exited with code ${code}, signal ${signal}`);
            if (code != 0 && this.listener) {
                console.error('install failed!');
                const event = new UpdateProgressEvent();
                event.eventType = UpdateEvent.CriticalFailure;
                this.listener.onUpdateProgress(event);
            }
            this.installChild = undefined;
        });

        return true;
    }

    private onNewConsoleOutput(prefix: string, newOutput: string) {
        console.log(`${prefix} - ${newOutput}`);
        if (this.listener) {
            const event = new UpdateProgressEvent();
            event.eventType = UpdateEvent.NewConsoleOutput;
            event.newOutput = newOutput.toString();
            this.listener.onUpdateProgress(event);
        }

        if (newOutput.toString().includes('Dry run started!')) {
            // Handle dry run started event
            if (this.listener) {
                const event = new UpdateProgressEvent();
                event.eventType = UpdateEvent.DryRunReady;
                this.listener.onUpdateProgress(event);
            }
        } else if (newOutput.toString().includes('Dry run failed to start!')) {
            // Handle dry run failure event
            if (this.listener) {
                const event = new UpdateProgressEvent();
                event.eventType = UpdateEvent.CriticalFailure;
                this.listener.onUpdateProgress(event);
            }
        } else if (newOutput.toString().includes('Upgrade complete!')) {
            if (this.listener) {
                const event = new UpdateProgressEvent();
                event.eventType = UpdateEvent.UpdateSuccess;
                this.listener.onUpdateProgress(event);
            }
        }
    }
}