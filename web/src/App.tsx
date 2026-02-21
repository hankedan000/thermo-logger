import { useEffect, useState } from "react";
import SensorList from "./components/SensorList";
import type { SensorUpdateEntry } from "./components/SensorList";

const DEFAULT_SENSOR_UPDATE_ENTRIES: SensorUpdateEntry[] = [
  {sensorId: '1', hardwareId: '1234', lastTempC: 20.0, currentName: 'sensor0', available: true},
  {sensorId: '2', hardwareId: '5678', lastTempC: 21.0, currentName: 'sensor1', available: true},
  {sensorId: '3', hardwareId: 'abcd', lastTempC: 25.0, currentName: 'sensor3', available: false}
];

function App() {
  const baseUrl = `${location.hostname}:3000`;
  const [sensors, setSensors] = useState<SensorUpdateEntry[]>(DEFAULT_SENSOR_UPDATE_ENTRIES);
  const [sensorIdsToRecord, setSensorIdsToRecord] = useState<string[]>([]);

  useEffect(() => {
    const ws = new WebSocket(`ws://${baseUrl}`);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.msgType === "SensorUpdate") {
        setSensors(msg.sensors);
      }
    };

    return () => ws.close();
  }, []);

  const handleNameChange = (sensorId: string, newName: string) => {
    fetch(`http://${baseUrl}/api/rename-sensor`, {
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

  return (
    <div style={{ padding: "2rem" }}>
      <h1>Sensor Monitor</h1>

      <SensorList
        sensors={sensors}
        sensorIdsToRecord={sensorIdsToRecord}
        onNameChange={handleNameChange}
        onRecordToggle={handleRecordToggle}
      />
    </div>
  );
}

export default App;