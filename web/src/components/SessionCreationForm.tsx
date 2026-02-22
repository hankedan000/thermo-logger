import { useState } from "react";

const DEFAULT_SAMPLING_RATE_MS = 5000;

interface Props {
    onStart: (sessionName: string, sampleRateMs: number, notes: string) => void;
}

export function SessionCreationForm({onStart}: Props) {
    const [sessionName, setSessionName] = useState("");
    const [sampleRateMs, setSampleRateMs] = useState(DEFAULT_SAMPLING_RATE_MS);
    const [notes, setNotes] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.SubmitEvent<HTMLFormElement>) => {
        e.preventDefault();

        setSubmitting(true);

        try {
            onStart(sessionName.trim(), sampleRateMs, notes.trim());
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