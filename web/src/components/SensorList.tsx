import { useEffect, useState } from "react";

export interface SensorUpdateEntry {
  sensorId: string;   // uuid of the sensor in the database
  hardwareId: string; // hardware id burned into the sensor (1-wire specific)
  lastTempC: number;
  currentName: string;
  available: boolean;
}

interface Props {
  sensors: SensorUpdateEntry[];
  sensorIdsToRecord: string[];
  onNameChange: (sensorId: string, newName: string) => void;
  onRecordToggle: (sensorId: string) => void;
}

function CommitInput({
  initialName: initialValue,
  onCommit,
}: {
  initialName: string;
  onCommit: (newName: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  // Keep local value in sync if backend updates name
  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  const commitIfChanged = () => {
    if (value !== initialValue) {
      onCommit(value);
    }
  };

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commitIfChanged}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur(); // triggers onBlur
        }
      }}
    />
  );
}

export default function SensorList({
  sensors,
  sensorIdsToRecord,
  onNameChange,
  onRecordToggle,
}: Props) {
  const sensorRows = sensors.map((sensor) => (
    <tr key={sensor.hardwareId}>
      <td>{sensor.hardwareId}</td>

      <td>
        <CommitInput
          initialName={sensor.currentName}
          onCommit={(newName) => {onNameChange(sensor.sensorId, newName);}}
        />
      </td>

      <td>{sensor.lastTempC.toFixed(2)}</td>

      <td>{sensor.available ? "🟢" : "🔴"}</td>

      <td>
        <input
          type="checkbox"
          checked={sensorIdsToRecord.indexOf(sensor.sensorId) >= 0}
          onChange={() => onRecordToggle(sensor.sensorId)}
        />
      </td>
    </tr>
  ));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Hardware ID</th>
          <th>Name</th>
          <th>Temp (°C)</th>
          <th>Status</th>
          <th>Record It?</th>
        </tr>
      </thead>
      <tbody>
        {sensorRows}
      </tbody>
    </table>
  );
}