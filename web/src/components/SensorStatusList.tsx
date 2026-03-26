import { convertTemp } from "../utils/units";

// use a very large negative number to indicate an error if we fail to sample for some reason.
// we want to avoid using NaN here because some databases don't support storing NaN values.
export const BAD_TEMPERATURE_READING = -1000.0;

export interface SensorUpdateEntry {
  sensorId: number;        // id of the sensor in the database
  hardwareId: string;      // hardware id burned into the sensor (1-wire specific)
  lastTempC: number | null;
  currentName: string;
  available: boolean;
}

interface Props {
  sensors: SensorUpdateEntry[];
  useFahrenheit: boolean;
  onDelete: (sensorId: number) => void;
}

export default function SensorStatusList({sensors, useFahrenheit, onDelete}: Props) {
  const formatTemp = (tempC: number | null) => {
    if ( ! tempC || isNaN(tempC) || tempC === BAD_TEMPERATURE_READING) {
      return "---";
    } else {
      return convertTemp(tempC, useFahrenheit).toFixed(2);
    }
  };

  const sensorRows = sensors.map((sensor) => (
    <tr key={sensor.sensorId}>
      <td>{sensor.hardwareId}</td>

      <td>{sensor.currentName}</td>

      <td>{formatTemp(sensor.lastTempC)}</td>

      <td>{sensor.available ? "🟢" : "🔴"}</td>

      <td>
        <button onClick={() => {onDelete(sensor.sensorId);}}>Delete</button>
      </td>
    </tr>
  ));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Hardware ID</th>
          <th>Current Name</th>
          <th>Current Reading ({useFahrenheit ? "°F" : "°C"})</th>
          <th>Connection Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {sensorRows}
      </tbody>
    </table>
  );
}