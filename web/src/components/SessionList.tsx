import SensorNames from "./SensorNames";

export interface SessionSensor {
  id: number;
  sessionId: number;
  sensorId: number;
  name: string;
};

export interface RecordSession {
    id: number;
    name: string;
    startedAt: Date;
    endedAt: Date | null;
    sampleRateMs: number;
    notes: string;
    sessionSensors: SessionSensor[];
};

interface Props {
  sessions: RecordSession[];
  activeSessionId: number | null;
  onDelete: (sessionId: number) => void;
  onExport: (sessionId: number) => void;
  onStop: () => void;
}

export default function SessionList({sessions, activeSessionId, onDelete, onExport, onStop}: Props) {
  const handleDeleteClick = (sessionName: string, sessionId: number) => {
    if (confirm(`Are you sure you want to delete session '${sessionName}'?`)) {
        onDelete(sessionId);
    }
  };

  const sessionRows = sessions.map((session) => (
    <tr key={session.id}>
      <td>{session.name}</td>

      <td>{session.startedAt.toString()}</td>

      <td>
        <SensorNames sensorNames={session.sessionSensors.map((sensor) => sensor.name)}/>
      </td>

      <td>
        <button hidden={session.id != activeSessionId} onClick={() => {onStop();}}>Stop</button>
        <button hidden={session.id == activeSessionId} onClick={() => {onExport(session.id);}}>Download CSV</button>
        <button hidden={session.id == activeSessionId} onClick={() => {handleDeleteClick(session.name, session.id);}}>Delete</button>
      </td>
    </tr>
  ));

  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          <th>Name</th>
          <th>Created</th>
          <th>Sensors</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {sessionRows}
      </tbody>
    </table>
  );
}