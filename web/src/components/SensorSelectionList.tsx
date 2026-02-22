import { useEffect, useState } from "react";

export interface SensorSelectionEntry {
  sensorId: string;   // uuid of the sensor in the database
  hardwareId: string; // hardware id burned into the sensor (1-wire specific)
  currentName: string;
}

interface Props {
  sensorOptions: SensorSelectionEntry[];
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

export default function SensorSelectionList({
  sensorOptions,
  sensorIdsToRecord,
  onNameChange,
  onRecordToggle,
}: Props) {
  const sensorRows = sensorOptions.map((sensor) => (
    <tr key={sensor.hardwareId}>
      <td>{sensor.hardwareId}</td>

      <td>
        <CommitInput
          initialName={sensor.currentName}
          onCommit={(newName) => {onNameChange(sensor.sensorId, newName);}}
        />
      </td>

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
          <th>Record It?</th>
        </tr>
      </thead>
      <tbody>
        {sensorRows}
      </tbody>
    </table>
  );
}