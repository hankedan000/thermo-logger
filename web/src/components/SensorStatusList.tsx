import { convertTemp } from "../utils/units";

export interface SensorUpdateEntry {
  sensorId: number;   // id of the sensor in the database
  hardwareId: string; // hardware id burned into the sensor (1-wire specific)
  lastTempC: number;
  currentName: string;
  available: boolean;
}

interface Props {
  sensors: SensorUpdateEntry[];
  useFahrenheit: boolean;
}

export default function SensorStatusList({sensors, useFahrenheit}: Props) {
  const sensorRows = sensors.map((sensor) => (
    <tr key={sensor.sensorId}>
      <td>{sensor.hardwareId}</td>

      <td>{sensor.currentName}</td>

      <td>{convertTemp(sensor.lastTempC, useFahrenheit).toFixed(2)}</td>

      <td>{sensor.available ? "🟢" : "🔴"}</td>
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
        </tr>
      </thead>
      <tbody>
        {sensorRows}
      </tbody>
    </table>
  );
}