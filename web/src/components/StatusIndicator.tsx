interface Props {
  labelText: string;
  statusText: string;
  color: string;
}

export function StatusIndicator({labelText, statusText, color}: Props) {
  return (
    <div>{labelText}<span style={{color: color}}>{statusText}</span></div>
  );
}