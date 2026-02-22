import { useEffect, useState } from "react";
import SensorList from "./components/SensorList";
import type { SensorUpdateEntry } from "./components/SensorList";
import { ReconnectingWebSocket } from "./utils/ReconnectingWebSocket";
import { StatusIndicator } from "./components/StatusIndicator";
import { SessionCreationForm } from "./components/SessionCreationForm";

function App() {
  const baseUrl = `${location.hostname}:3000`;
  const [sensors, setSensors] = useState<SensorUpdateEntry[]>([]);
  const [sensorIdsToRecord, setSensorIdsToRecord] = useState<string[]>([]);
  const [connectedToServer, setConnectedToServer] = useState<boolean>(false);

  useEffect(() => {
    const ws = new ReconnectingWebSocket(`ws://${baseUrl}`, 1000, 1000);

    const fetchLatestSensorInfo = () => {
      fetch(`http://${baseUrl}/api/sensors`)
        .then(resp => {
          return resp.json();
        })
        .then(data => {
          if (data.result) {
            setSensors(data.result);
          }
        });
    };

    // WebSocket handlers
    ws.onconnect = () => {
      setConnectedToServer(true);

      ws.addEventListener('message', (event) => {
        const msg = JSON.parse(event.data);

        if (msg.msgType === "SensorUpdate") {
          setSensors(msg.sensors);
        }
      });

      ws.addEventListener('close', () => {
        setSensors([]);
        setSensorIdsToRecord([]);
        setConnectedToServer(false);
      });

      fetchLatestSensorInfo();
    };

    return () => ws.close();
  }, []);

  const handleNameChange = (sensorId: string, newName: string) => {
    fetch(`http://${baseUrl}/api/rename_sensor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sensorId, newName }),
    });
  };

  const handleRecordToggle = (sensorId: string) => {
    if (sensorIdsToRecord.indexOf(sensorId) >= 0) {
      setSensorIdsToRecord(sensorIdsToRecord.filter(s => s !== sensorId));
    } else {
      setSensorIdsToRecord(sensorIdsToRecord.concat([sensorId]));
    }
  };

  const onStartSession = (sessionName: string, sampleRateMs: number, notes: string): void => {
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
        return false;
      }
    });
    return true;
  };

  return (
    <div style={{ padding: "2rem" }}>
      <h2>Recorder Status</h2>
      <StatusIndicator
        labelText="Server: "
        statusText={connectedToServer ? 'CONNECTED' : 'DISCONNECTED'}
        color={connectedToServer ? 'green' : 'red'}/>

      <SensorList
        sensors={sensors}
        sensorIdsToRecord={sensorIdsToRecord}
        onNameChange={handleNameChange}
        onRecordToggle={handleRecordToggle}
      />

      <SessionCreationForm
        onStart={onStartSession}
      />
    </div>
  );
}

export default App;