interface Props {
  totalMem: number;
  freeMem: number;
}

function formatBytes(bytes: number, decimals = 2): string {
    if (bytes === 0) return "0 B";

    const k = 1024; // or 1000 for decimal
    const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];

    const i = Math.floor(Math.log(bytes) / Math.log(k));
    const value = bytes / Math.pow(k, i);

    return `${value.toFixed(decimals)} ${sizes[i]}`;
}

export default function MemoryUsage({ totalMem: total, freeMem: free }: Props) {
    function makePercent(value: number): string {
        return `${((value / total) * 100).toFixed(2)}%`;
    }

    const used = total - free;

    if (total == 0) {
        return (<span>UNKNOWN</span>);
    } else {
        return (
            <span>
                total={formatBytes(total, 2)}, used={formatBytes(used, 2)} ({makePercent(used)}), free={formatBytes(free, 2)} ({makePercent(free)})
            </span>
        );
    }
}