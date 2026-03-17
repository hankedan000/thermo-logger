import { convertTemp } from "../utils/units";

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
}

export default function SensorStatusList({sensors, useFahrenheit}: Props) {
  const formatTemp = (tempC: number | null) => {
    if (! tempC ||isNaN(tempC)) {
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