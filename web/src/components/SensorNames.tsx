interface Props {
  sensorNames: string[];
}

export default function SensorNames({ sensorNames }: Props) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.5rem",
      }}>
      {sensorNames.map((name) => (
        <div
          key={name}
          style={{
            backgroundColor: "#1a1a1a",
            color: "#0369a1",
            padding: "0.4rem 0.75rem",
            borderRadius: "0.5rem",
            fontSize: "0.85rem",
            fontWeight: 500,
          }}>
          {name}
        </div>
      ))}
    </div>
  );
}