export class ReconnectingWebSocket {
    private url: string;
    private socket: WebSocket | null = null;

    public onconnect: (() => void) | null = null;
    public onclose: (() => void) | null = null;

    private initRetryDelay_ms: number;
    private retryDelay_ms: number;
    private maxRetryDelay_ms: number;

    private shouldReconnect: boolean = true;
    private connected: boolean = false;

    constructor(
        url: string,
        initRetryDelay_ms: number = 1000,
        maxRetryDelay_ms: number = 30000
    ) {
        this.url = url;
        this.initRetryDelay_ms = initRetryDelay_ms;
        this.retryDelay_ms = initRetryDelay_ms;
        this.maxRetryDelay_ms = maxRetryDelay_ms;

        this.connect();
    }

    private connect(): void {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log("WebSocket connected");
            this.retryDelay_ms = this.initRetryDelay_ms; // reset backoff
            this.connected = true;

            this.onconnect?.();
        };

        this.socket.onclose = () => {
            if (this.connected) {
                console.log("WebSocket closed");
                this.connected = false;
            }

            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }

            this.onclose?.();
        };

        this.socket.onerror = () => {
            // Errors typically trigger onclose anyway
            this.socket?.close();
        };
    }

    private scheduleReconnect(): void {
        console.log(
            `Will try reconnecting in ${this.retryDelay_ms / 1000} s ...`
        );

        setTimeout(() => {
            this.retryDelay_ms = Math.min(
                this.retryDelay_ms * 2,
                this.maxRetryDelay_ms
            );

            this.connect();
        }, this.retryDelay_ms);
    }

    public addEventListener<K extends keyof WebSocketEventMap>(
        type: K,
        listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any
    ): void {
        this.socket?.addEventListener(type, listener);
    }

    public send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
        }
    }

    public close(): void {
        this.shouldReconnect = false;
        this.socket?.close();
    }

    public isConnected(): boolean {
        return this.connected;
    }
}