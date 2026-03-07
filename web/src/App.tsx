import { useEffect, useState } from "react";
import SensorStatusList from "./components/SensorStatusList";
import type { SensorUpdateEntry } from "./components/SensorStatusList";
import { ReconnectingWebSocket } from "./utils/ReconnectingWebSocket";
import StatusIndicator from "./components/StatusIndicator";
import SessionCreationForm from "./components/SessionCreationForm";
import type { SensorSelectionEntry } from "./components/SensorSelectionList";
import type { RecordSession } from "./components/SessionList";
import SessionList from "./components/SessionList";
import MemoryUsage from "./components/MemoryUsage";
import * as GithubUtils from "./utils/github";
import { Version } from "./utils/version";
import VersionInfo from "./components/VersionInfo";
import UpdateDialog from "./components/UpdateDialog";
import SettingsPanel from "./components/SettingsPanel";

class ServerStatus {
  version: string = 'UNKNOWN';
  serverState: 'UNKNOWN' | 'UNINITIALIZE' | 'OPERATING' | 'UPDATING' = 'UNKNOWN';
  activeSessionId: number | null = null;
  totalRAM: number = 0;
  freeRAM: number = 0;
  totalDisk: number = 0;
  freeDisk: number = 0;
}

interface UpdateProgressEvent {
    eventType: 'None' | 'NewConsoleOutput' | 'DryRunReady' | 'CriticalFailure' | 'UpdateSuccess' | null;
    newOutput: string;
}

class Settings {
  useFahrenheit: boolean = true;
}

function serverStateToColor(state: string) {
  switch (state) {
    case 'UNINITIALIZE':
      return 'red';
    case 'OPERATING':
      return 'green';
    case 'UPDATING':
      return 'orange';
  }
  return 'white';
}

function App() {
  let baseUrl = location.host;
  if (location.host.endsWith(':5173')) {
    // when running directly from vite (port 5173), assume backend
    // server is running in dev mode (port 3000)
    baseUrl = `${location.hostname}:3000`;
  } else {
    // assume production case where websocket matches http server port
  }
  const [serverStatus, setServerStatus] = useState<ServerStatus>(new ServerStatus());
  const [settings, setSettings] = useState<Settings>(new Settings());
  const [showSettingsPanel, setShowSettingsPanel] = useState<boolean>(false);
  const [sensors, setSensors] = useState<SensorUpdateEntry[]>([]);
  const [sensorOptions, setSensorOptions] = useState<SensorSelectionEntry[]>([]);
  const [sessions, setSessions] = useState<RecordSession[]>([]);
  const [latestRelInfo, setLatestRelInfo] = useState<GithubUtils.ReleaseInfo | undefined>();
  const [showUpdateDialog, setShowUpdateDialog] = useState<boolean>(false);
  const [updateLogLines, setUpdateLogLines] = useState<string[]>([]);
  const [showAbortUpdateButton, setShowAbortUpdateButton] = useState<boolean>(true);
  const [showAcceptUpdateButton, setShowAcceptUpdateButton] = useState<boolean>(false);
  const [showCloseUpdateButton, setShowCloseUpdateButton] = useState<boolean>(false);

  const fetchLatestServerStatus = () => {
    fetch(`http://${baseUrl}/api/server_status`)
      .then(resp => {
        return resp.json();
      })
      .then(newStatus => {
        if (newStatus) {
          setServerStatus(newStatus);
          setShowSettingsPanel(true);
        } else {
          setServerStatus(new ServerStatus());
          setShowSettingsPanel(false);
        }
      });
  };

  const fetchLatestSettings = () => {
    fetch(`http://${baseUrl}/api/settings`)
      .then(resp => {
        return resp.json();
      })
      .then(restResp => {
        const newSettings = restResp.result as Settings;
        if (newSettings) {
          setSettings(newSettings);
        } else {
          setSettings(new Settings());
        }
      });
  };

  const fetchLatestSensorInfo = () => {
    fetch(`http://${baseUrl}/api/sensors`)
      .then(resp => {
        return resp.json();
      })
      .then(data => {
        if (data.result) {
          processLatestSensorInfo(data.result);
        }
      });
  };

  const fetchLatestSessions = () => {
    fetch(`http://${baseUrl}/api/sessions`)
      .then(resp => {
        return resp.json();
      })
      .then(data => {
        if (data.result) {
          setSessions(data.result);
        } else {
          setSessions([]);
        }
      });
  };

  const processLatestSensorInfo = (sensors: SensorUpdateEntry[]): void => {
    setSensors(sensors);

    // build a set of sensorIds that were available prior to this update
    // we'll use this to detect if one of them disappeared
    const prevAvailableSensorIds = new Set<number>;
    for (const sensor of sensorOptions) {
      prevAvailableSensorIds.add(sensor.sensorId);
    }

    const newSensorOptions: SensorSelectionEntry[] = [];
    const currAvailableSensorIds = new Set<number>;
    for (const sensor of sensors) {
      if ( ! sensor.available) {
        continue;
      }

      currAvailableSensorIds.add(sensor.sensorId);
      newSensorOptions.push({
        sensorId: sensor.sensorId,
        hardwareId: sensor.hardwareId,
        currentName: sensor.currentName
      });
    }

    const areSetsEqual = (a: Set<number>, b: Set<number>) =>
      a.size === b.size &&
      [...a].every((x) => b.has(x));
    if ( ! areSetsEqual(prevAvailableSensorIds, currAvailableSensorIds)) {
      setSensorOptions(newSensorOptions);
    }
  }

  // perform initial logic once (ie. not on each redraw/update)
  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${baseUrl}`, 1000, 1000);

    // WebSocket handlers
    ws.onconnect = () => {
      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);

        if (msg.msgType === "SensorUpdate") {
          processLatestSensorInfo(msg.sensors);
        } else if (msg.msgType === "UpdateProgress") {
          onConsoleProgressUpdate(msg.progressEvent as UpdateProgressEvent);
        } else {
          console.warn(`received unknown msg from server via websocket. msg: ${event.data}`);
        }
      });

      ws.addEventListener('close', () => {
        processLatestSensorInfo([]);
        setServerStatus(new ServerStatus());
      });

      fetchLatestServerStatus();
      fetchLatestSettings();
      fetchLatestSensorInfo();
      fetchLatestSessions();
    };

    // fetch latest github release info.
    // Note: in a timeout since we can't perform async functions in a useEffect.
    setTimeout(async () => {
      try {
        const relInfo = await GithubUtils.getLatestRelease('hankedan000', 'thermo-logger');
        setLatestRelInfo(relInfo);
      } catch (err: any) {
        console.error('Failed to fetch latest github release info. err: ', err);
        setLatestRelInfo(undefined);
      }
    }, 100);

    // cleanup when component closes
    return () => {
      ws.close();
    }
  }, []);

  const handleNameChange = (sensorId: number, newName: string) => {
    fetch(`http://${baseUrl}/api/rename_sensor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sensorId, newName }),
    });
  };

  const onStartSession = (sessionName: string, sampleRateMs: number, sensorIdsToRecord: number[], notes: string): void => {
    fetch(`http://${baseUrl}/api/start_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionName: sessionName,
        sampleRateMs: sampleRateMs,
        sensorIdsToRecord: sensorIdsToRecord,
        notes: notes
      }),
    })
    .then(resp => {
      return resp.json();
    })
    .then(data => {
      if ( ! data.result && data.error.length >= 0) {
        alert(data.error);
      } else {
        fetchLatestServerStatus();
        fetchLatestSessions();
      }
    });
  };

  const onSessionDelete = (sessionId: number) => {
    fetch(`http://${baseUrl}/api/delete_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId
      }),
    })
    .then(() => {
      fetchLatestServerStatus();
      fetchLatestSessions();
    });
  };

  const onSessionExport = (sessionId: number) => {
    fetch(`http://${baseUrl}/api/export_session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        sessionId: sessionId,
        useFahrenheit: settings.useFahrenheit
      }),
    })
    .then(() => {
      fetchLatestSessions();// to update if it's ready for download
    });
  };

  const onSessionStop = () => {
    fetch(`http://${baseUrl}/api/stop_session`, {
      method: "POST"
    })
    .then(() => {
      fetchLatestServerStatus();
      fetchLatestSessions();// to update if data can be exported, etc.
    });
  };

  const onStartServerUpdate = (newVersion: Version) => {
    fetch(`http://${baseUrl}/api/start_server_update`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        newVersion: newVersion.toString()
      }),
    })
    .then(() => {
      setShowUpdateDialog(true);
      setUpdateLogLines([]);
      fetchLatestServerStatus();
    });
  }

  const onConsoleProgressUpdate = (msg: UpdateProgressEvent) => {
    if (msg.newOutput.length > 0) {
      setUpdateLogLines(prevLines => [...prevLines, msg.newOutput]);
    }

    if (msg.eventType === 'None') {
      // nothing to do
    } else if (msg.eventType === 'NewConsoleOutput') {
      // nothing to do here since we already add the new output to the log lines above
    } else if (msg.eventType === 'DryRunReady') {
      // Handle dry run ready event
      setShowAcceptUpdateButton(true);
    } else if (msg.eventType === 'CriticalFailure') {
      // Handle critical failure event
      setShowCloseUpdateButton(true);
    } else if (msg.eventType === 'UpdateSuccess') {
      // nothing to do here since server will restart immenantly, but we will display
      // the close button to allow user to close the dialog if they want until the server goes down.
      setShowCloseUpdateButton(true);
    } else {
      console.warn(`received unknown update progress eventType: ${msg.eventType}`);
    }
  };

  const abortUpdate = () => {
    fetch(`http://${baseUrl}/api/cancel_server_update`, {
      method: "POST"
    })
    .then(() => {
      closeUpdateDialog();
      fetchLatestServerStatus();
    });
  };

  const acceptUpdate = () => {
    setShowAbortUpdateButton(false);
    setShowAcceptUpdateButton(false);
    setShowCloseUpdateButton(false);
    fetch(`http://${baseUrl}/api/accept_server_update`, {
      method: "POST"
    })
    .then(() => {
      // not much to do here since server will restart immenantly
    });
  };

  const updateSettings = (settingName: string, settingValue: any) => {
    fetch(`http://${baseUrl}/api/settings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        settingName: settingName,
        settingValue: settingValue
      }),
    })
    .then(() => {
      fetchLatestSettings();
    });
  };

  const closeUpdateDialog = () => {
    setShowUpdateDialog(false);
    setUpdateLogLines([]);
    setShowAbortUpdateButton(true);
    setShowAcceptUpdateButton(false);
    setShowCloseUpdateButton(false);
  };

  let currVersion: Version | undefined = undefined;
  if (serverStatus.version != 'UNKNOWN') {
    try {
      currVersion = Version.parse(serverStatus.version);
    } catch (err: any) {
      console.log(`failed to parse server Version from '${serverStatus.version}. err: `, err);
    }
  }

  return (
    <div style={{ padding: "2rem" }}>
      <SettingsPanel
        showPanel={showSettingsPanel}
        title="Settings"
        sections={[
          {
            title: "General",
            rows: [
              {
                label: "Use Fahrenheit",
                description: "Display temperatures in Fahrenheit",
                control: {
                  type: "toggle",
                  checked: settings.useFahrenheit,
                  onChange: (checked) => {updateSettings("useFahrenheit", checked);}
                }
              }
            ]
          }
        ]}/>
      <h3>Status</h3>
      <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
        <StatusIndicator
          labelText="Server State: "
          statusText={serverStatus.serverState}
          color={serverStateToColor(serverStatus.serverState)}/>
        <div>Version: <VersionInfo currentVersion={currVersion} latestVersionInfo={latestRelInfo} startServerUpdate={onStartServerUpdate}/></div>
        <div>RAM Usage: <MemoryUsage totalMem={serverStatus.totalRAM} freeMem={serverStatus.freeRAM}/></div>
        <div>Disk Usage: <MemoryUsage totalMem={serverStatus.totalDisk} freeMem={serverStatus.freeDisk}/></div>

        Sensors:
        <SensorStatusList
          sensors={sensors}
          useFahrenheit={settings.useFahrenheit}/>
      </div>

      <div hidden={serverStatus.activeSessionId != null}>
        <h3>New Recording Session</h3>
        <SessionCreationForm
          sensorOptions={sensorOptions}
          onStart={onStartSession}
          onNameChange={handleNameChange}/>
      </div>

      <h3>Recording Sessions</h3>
      <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
        <SessionList
          baseUrl={baseUrl}
          sessions={sessions}
          activeSessionId={serverStatus.activeSessionId}
          onDelete={onSessionDelete}
          onExport={onSessionExport}
          onStop={onSessionStop}/>
      </div>

      {/* Dialog box that gets displayed when updating the backend server */}
      <UpdateDialog
        open={showUpdateDialog}
        onClose={() => abortUpdate()}
        title="Update Console"
        lines={updateLogLines}
        buttons={[
          { show: showAbortUpdateButton, label: "Abort", onClick: () => abortUpdate(), variant: "danger" },
          { show: showAcceptUpdateButton, label: "Accept", onClick: () => acceptUpdate(), variant: "primary" },
          { show: showCloseUpdateButton, label: "Close", onClick: () => closeUpdateDialog(), variant: "ghost" },
        ]}
      />
    </div>
  );
}

export default App;