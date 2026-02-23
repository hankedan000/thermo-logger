import { useState } from "react";
import SensorSelectionList from "./SensorSelectionList";

const DEFAULT_SAMPLING_RATE_MS = 5000;

export interface SensorSelectionEntry {
  sensorId: number;   // id of the sensor in the database
  hardwareId: string; // hardware id burned into the sensor (1-wire specific)
  currentName: string;
}

interface Props {
    sensorOptions: SensorSelectionEntry[];
    onNameChange: (sensorId: number, newName: string) => void;
    onStart: (sessionName: string, sampleRateMs: number, sensorIdsToRecord: number[], notes: string) => void;
}

export default function SessionCreationForm({sensorOptions, onNameChange, onStart}: Props) {
    const [sessionName, setSessionName] = useState("");
    const [sampleRateMs, setSampleRateMs] = useState(DEFAULT_SAMPLING_RATE_MS);
    const [sensorIdsToRecord, setSensorIdsToRecord] = useState<number[]>([]);
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleRecordToggle = (sensorId: number) => {
        if (sensorIdsToRecord.indexOf(sensorId) >= 0) {
            setSensorIdsToRecord(sensorIdsToRecord.filter(s => s !== sensorId));
        } else {
            setSensorIdsToRecord(sensorIdsToRecord.concat([sensorId]));
        }
    };

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();

        setSubmitting(true);

        try {
            onStart(sessionName.trim(), sampleRateMs, sensorIdsToRecord, notes.trim());
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <form
            onSubmit={handleSubmit}
            style={{ border: "1px solid #ccc", padding: "1rem", borderRadius: "8px" }}>
            <div>
                <label>
                    Session Name:
                    <input
                        type="text"
                        value={sessionName}
                        onChange={(e) => setSessionName(e.target.value)}
                        style={{ marginLeft: "0.5rem" }}
                    />
                </label>
            </div>

            <div>
                <label>
                    Sample Rate (seconds):
                    <input
                        type="number"
                        value={sampleRateMs / 1000.0}
                        onChange={(e) => setSampleRateMs(Number(e.target.value) * 1000.0)}
                        min={1}
                        style={{ marginLeft: "0.5rem", width: "100px" }}
                    />
                </label>
            </div>

            <div>
                Sensor Selection:
                <SensorSelectionList
                    sensorOptions={sensorOptions}
                    sensorIdsToRecord={sensorIdsToRecord}
                    onNameChange={onNameChange}
                    onRecordToggle={handleRecordToggle}/>
            </div>

            <div style={{ marginBottom: "1rem" }}>
                <label>
                Notes:
                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    style={{ marginLeft: "0.5rem", display: "block", width: "100%" }}
                />
                </label>
            </div>

            <button type="submit" disabled={submitting}>
                {submitting ? "Starting..." : "Start Recording"}
            </button>
        </form>
    );
}