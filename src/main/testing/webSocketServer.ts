import type { AddressInfo } from "node:net";
import type { Duplex } from "node:stream";

import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";

/** Servidor WebSocket mínimo (RFC 6455) — só frames de texto/close curtos, o bastante para o teste. */
export class TestWebSocketServer {
  readonly server: Server = createServer();
  readonly sockets = new Set<Duplex>();
  readonly received: string[] = [];
  readonly handshakes: IncomingHttpHeaders[] = [];
  /** Quantos upgrades recusar com 401 antes de aceitar. */
  rejectUpgrades = 0;
  onConnect: ((socket: Duplex) => void) | null = null;
  port = 0;

  async start(): Promise<void> {
    this.server.on("upgrade", (req, socket: Duplex) => {
      this.handshakes.push(req.headers);
      if (this.rejectUpgrades > 0) {
        this.rejectUpgrades -= 1;
        socket.end("HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n");
        return;
      }
      const key = String(req.headers["sec-websocket-key"]);
      const accept = createHash("sha1")
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest("base64");
      const offered = String(req.headers["sec-websocket-protocol"] ?? "")
        .split(",")[0]
        .trim();
      socket.write(
        "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          (offered ? `Sec-WebSocket-Protocol: ${offered}\r\n` : "") +
          "\r\n",
      );
      this.sockets.add(socket);
      socket.on("close", () => this.sockets.delete(socket));
      socket.on("error", () => undefined);
      socket.on("data", chunk => this.read(socket, chunk as Buffer));
      this.onConnect?.(socket);
    });
    await new Promise<void>(resolve => this.server.listen(0, "127.0.0.1", resolve));
    this.port = (this.server.address() as AddressInfo).port;
  }

  get url(): string {
    return `ws://127.0.0.1:${this.port}/chat`;
  }

  private read(socket: Duplex, buffer: Buffer): void {
    const opcode = buffer[0] & 0x0f;
    if (opcode === 0x8) {
      socket.end(Buffer.from([0x88, 0x00]));
      return;
    }
    if (opcode !== 0x1) return;
    let length = buffer[1] & 0x7f;
    let offset = 2;
    if (length === 126) {
      length = buffer.readUInt16BE(2);
      offset = 4;
    }
    const mask = buffer.subarray(offset, offset + 4);
    const payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
    for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
    const text = payload.toString("utf8");
    this.received.push(text);
    this.push(socket, `echo:${text}`);
  }

  push(socket: Duplex, text: string): void {
    const payload = Buffer.from(text);
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
  }

  /** Derruba as conexões sem handshake de close — simula queda de rede. */
  dropAll(): void {
    for (const socket of this.sockets) socket.destroy();
  }

  async stop(): Promise<void> {
    this.dropAll();
    await new Promise<void>(resolve => this.server.close(() => resolve()));
  }
}
