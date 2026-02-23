import { useEffect, useState } from "react";
import SensorStatusList from "./components/SensorStatusList";
import type { SensorUpdateEntry } from "./components/SensorStatusList";
import { ReconnectingWebSocket } from "./utils/ReconnectingWebSocket";
import StatusIndicator from "./components/StatusIndicator";
import SessionCreationForm from "./components/SessionCreationForm";
import type { SensorSelectionEntry } from "./components/SensorSelectionList";
import type { RecordSession } from "./components/SessionList";
import SessionList from "./components/SessionList";

class ServerState {
  activeSessionId: number | null = null;
}

function App() {
  const baseUrl = `${location.hostname}:3000`;
  const [serverState, setServerState] = useState<ServerState>(new ServerState());
  const [sensors, setSensors] = useState<SensorUpdateEntry[]>([]);
  const [sensorOptions, setSensorOptions] = useState<SensorSelectionEntry[]>([]);
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false);
  const [sessions, setSessions] = useState<RecordSession[]>([]);

  const fetchLatestServerState = () => {
    fetch(`http://${baseUrl}/api/server_state`)
      .then(resp => {
        return resp.json();
      })
      .then(newState => {
        if (newState) {
          setServerState(newState);
        } else {
          setServerState(new ServerState());
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
      });

      fetchLatestServerState();
      fetchLatestSensorInfo();
      fetchLatestSessions();
    };

    return () => ws.close();
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
        fetchLatestServerState();
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
      fetchLatestServerState();
      fetchLatestSessions();
    });
  };

  const onSessionExport = (sessionId: number) => {
    // TODO implement export logic
  };

  const onSessionStop = () => {
    fetch(`http://${baseUrl}/api/stop_session`, {
      method: "POST"
    })
    .then(() => {
      fetchLatestServerState();
      fetchLatestSessions();
    });
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h3>Status</h3>
      <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
        <StatusIndicator
          labelText="Server: "
          statusText={connectedToServer ? 'CONNECTED' : 'DISCONNECTED'}
          color={connectedToServer ? 'green' : 'red'}/>

        Sensors:
        <SensorStatusList sensors={sensors}/>
      </div>

      <div hidden={serverState.activeSessionId != null}>
        <h3>New Recording Session</h3>
        <SessionCreationForm
          sensorOptions={sensorOptions}
          onStart={onStartSession}
          onNameChange={handleNameChange}/>
      </div>

      <h3>Recording Sessions</h3>
      <div style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
        <SessionList
          sessions={sessions}
          activeSessionId={serverState.activeSessionId}
          onDelete={onSessionDelete}
          onExport={onSessionExport}
          onStop={onSessionStop}/>
      </div>
    </div>
  );
}

export default App;