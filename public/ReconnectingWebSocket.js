class ReconnectingWebSocket {
    constructor(url, initRetryDelay_ms=1000, maxRetryDelay_ms=30000) {
        this.url = url;
        this.socket = null;
        this.onconnect = null;
        this.onclose = null;

        this.initRetryDelay_ms = initRetryDelay_ms;
        this.retryDelay_ms = initRetryDelay_ms;
        this.maxRetryDelay_ms = maxRetryDelay_ms;
        this.shouldReconnect = true;
        this.connected = false;

        this.connect();
    }

    connect() {
        this.socket = new WebSocket(this.url);

        this.socket.onopen = () => {
            console.log("WebSocket connected");
            this.retryDelay_ms = this.initRetryDelay_ms; // reset backoff
            this.connected = true;

            if (this.onconnect) {
                this.onconnect();
            }
        };

        this.socket.onclose = () => {
            if (this.connected) {
                console.log("WebSocket closed");
                this.connected = false;
            }
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }

            if (this.onclose) {
                this.onclose();
            }
        };

        this.socket.onerror = () => {
            // Errors usually lead to close anyway
            this.socket.close();
        };
    }

    scheduleReconnect() {
        console.log(`Will try reconnecting in ${this.retryDelay_ms/1000} s ...`);
        setTimeout(() => {
            this.retryDelay_ms = Math.min(this.retryDelay_ms * 2, this.maxRetryDelay_ms);
            this.connect();
        }, this.retryDelay_ms);
    }

    addEventListener(event, callback) {
        if (this.socket) {
            this.socket.addEventListener(event, callback);
        }
    }

    send(data) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
        }
    }

    close() {
        this.shouldReconnect = false;
        if (this.socket) {
            this.socket.close();
        }
    }
}