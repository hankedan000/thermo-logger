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

class ServerStatus {
  version: string = 'UNKNOWN';
  serverState: 'UNKNOWN' | 'UNINITIALIZE' | 'OPERATING' | 'UPDATING' = 'UNKNOWN';
  activeSessionId: number | null = null;
  totalRAM: number = 0;
  freeRAM: number = 0;
  totalDisk: number = 0;
  freeDisk: number = 0;
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
  const [sensors, setSensors] = useState<SensorUpdateEntry[]>([]);
  const [sensorOptions, setSensorOptions] = useState<SensorSelectionEntry[]>([]);
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false);
  const [sessions, setSessions] = useState<RecordSession[]>([]);
  const [latestRelInfo, setLatestRelInfo] = useState<GithubUtils.ReleaseInfo | undefined>();

  const fetchLatestServerStatus = () => {
    fetch(`http://${baseUrl}/api/server_status`)
      .then(resp => {
        return resp.json();
      })
      .then(newStatus => {
        if (newStatus) {
          setServerStatus(newStatus);
        } else {
          setServerStatus(new ServerStatus());
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
      setConnectedToServer(true);

      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);

        if (msg.msgType === "SensorUpdate") {
          processLatestSensorInfo(msg.sensors);
        }
      });

      ws.addEventListener('close', () => {
        processLatestSensorInfo([]);
        setConnectedToServer(false);
        setServerStatus(new ServerStatus());
      });

      fetchLatestServerStatus();
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
        console.log('Failed to fetch latest github release info. err: ', err);
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
        sessionId: sessionId
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
      <h3>Status</h3>
      <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
        <StatusIndicator
          labelText=""
          statusText={connectedToServer ? 'CONNECTED' : 'DISCONNECTED'}
          color={connectedToServer ? 'green' : 'red'}/>
        <div>Version: <VersionInfo currentVersion={currVersion} latestVersionInfo={latestRelInfo}/></div>
        <StatusIndicator
          labelText="Server State: "
          statusText={serverStatus.serverState}
          color={serverStateToColor(serverStatus.serverState)}/>
        <div>RAM Usage: <MemoryUsage totalMem={serverStatus.totalRAM} freeMem={serverStatus.freeRAM}/></div>
        <div>Disk Usage: <MemoryUsage totalMem={serverStatus.totalDisk} freeMem={serverStatus.freeDisk}/></div>

        Sensors:
        <SensorStatusList sensors={sensors}/>
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
    </div>
  );
}

export default App;