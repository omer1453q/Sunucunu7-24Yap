import { describe, expect, it, vi } from "vitest";

// Test VarInt encoding/decoding
function encodeVarInt(value: number): Buffer {
  const bytes: number[] = [];
  do {
    let temp = value & 0x7f;
    value >>>= 7;
    if (value !== 0) temp |= 0x80;
    bytes.push(temp);
  } while (value !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer: Buffer, offset: number): { value: number; size: number } {
  let value = 0, size = 0, shift = 0;
  while (true) {
    if (offset + size >= buffer.length) break;
    const byte = buffer[offset + size];
    value |= (byte & 0x7f) << shift;
    size++;
    if (!(byte & 0x80)) break;
    shift += 7;
    if (size > 5) break;
  }
  return { value, size };
}

// Test MOTD parsing
function parseMinecraftMotd(desc: any): string {
  if (typeof desc === "string") return desc;
  if (!desc) return "";
  if (desc.text) return desc.text;
  if (desc.extra) {
    return desc.extra.map((e: any) => typeof e === "string" ? e : (e.text || "")).join("");
  }
  return JSON.stringify(desc);
}

describe("VarInt encoding/decoding", () => {
  it("should encode 0 correctly", () => {
    const encoded = encodeVarInt(0);
    expect(encoded.toString("hex")).toBe("00");
  });

  it("should encode 1 correctly", () => {
    const encoded = encodeVarInt(1);
    expect(encoded.toString("hex")).toBe("01");
  });

  it("should encode 33 correctly", () => {
    const encoded = encodeVarInt(33);
    expect(encoded.toString("hex")).toBe("21");
  });

  it("should encode -1 (protocol version) correctly", () => {
    const encoded = encodeVarInt(-1);
    // -1 in VarInt is 5 bytes: ff ff ff ff 0f
    expect(encoded.toString("hex")).toBe("ffffffff0f");
    expect(encoded.length).toBe(5);
  });

  it("should decode VarInt correctly", () => {
    const encoded = encodeVarInt(33);
    const { value, size } = readVarInt(encoded, 0);
    expect(value).toBe(33);
    expect(size).toBe(1);
  });

  it("should decode VarInt(-1) correctly", () => {
    const encoded = encodeVarInt(-1);
    const { value, size } = readVarInt(encoded, 0);
    expect(value).toBe(-1);
    expect(size).toBe(5);
  });

  it("should encode and decode large numbers", () => {
    for (const num of [0, 1, 127, 128, 255, 767, 1000, 25565, 65535, -1]) {
      const encoded = encodeVarInt(num);
      const { value } = readVarInt(encoded, 0);
      expect(value).toBe(num);
    }
  });
});

describe("MOTD parsing", () => {
  it("should return string directly", () => {
    expect(parseMinecraftMotd("Hello World")).toBe("Hello World");
  });

  it("should handle null/undefined", () => {
    expect(parseMinecraftMotd(null)).toBe("");
    expect(parseMinecraftMotd(undefined)).toBe("");
  });

  it("should handle text component format", () => {
    expect(parseMinecraftMotd({ text: "Hello" })).toBe("Hello");
  });

  it("should handle extra array format", () => {
    const desc = {
      extra: [
        { text: "Hello ", color: "red" },
        { text: "World", color: "blue" }
      ]
    };
    expect(parseMinecraftMotd(desc)).toBe("Hello World");
  });

  it("should handle mixed extra array with strings", () => {
    const desc = {
      extra: ["§aGreen ", { text: "Text", color: "blue" }]
    };
    expect(parseMinecraftMotd(desc)).toBe("§aGreen Text");
  });

  it("should handle complex nested format", () => {
    const desc = {
      text: "",
      extra: [
        { text: "", extra: [{ text: "Nested", color: "gold" }] },
        { text: " End" }
      ]
    };
    // Top level has no text, has extra
    expect(parseMinecraftMotd(desc)).toBe(" End");
  });
});

describe("SLP Packet construction", () => {
  it("should build valid handshake packet for Hypixel", () => {
    const host = "mc.hypixel.net";
    const port = 25565;
    const hostBuffer = Buffer.from(host, "utf-8");

    const packetId = encodeVarInt(0x00);
    const protocolVarInt = encodeVarInt(-1);
    const serverAddr = Buffer.concat([encodeVarInt(hostBuffer.length), hostBuffer]);
    const serverPort = Buffer.alloc(2);
    serverPort.writeUInt16BE(port, 0);
    const nextState = Buffer.from([0x01]);

    const handshakePayload = Buffer.concat([packetId, protocolVarInt, serverAddr, serverPort, nextState]);
    const handshakePacket = Buffer.concat([encodeVarInt(handshakePayload.length), handshakePayload]);
    const statusRequest = Buffer.concat([encodeVarInt(1), Buffer.from([0x00])]);
    const fullPacket = Buffer.concat([handshakePacket, statusRequest]);

    // Verify packet structure
    const { value: payloadLen, size: lenSize } = readVarInt(fullPacket, 0);
    expect(payloadLen).toBe(handshakePayload.length);

    const pktId = fullPacket[lenSize];
    expect(pktId).toBe(0x00);

    expect(fullPacket.length).toBeGreaterThan(20);
  });

  it("should build valid handshake packet for Aternos-style server", () => {
    const host = "test.aternos.me";
    const port = 25565;
    const hostBuffer = Buffer.from(host, "utf-8");

    const packetId = encodeVarInt(0x00);
    const protocolVarInt = encodeVarInt(-1);
    const serverAddr = Buffer.concat([encodeVarInt(hostBuffer.length), hostBuffer]);
    const serverPort = Buffer.alloc(2);
    serverPort.writeUInt16BE(port, 0);
    const nextState = Buffer.from([0x01]);

    const handshakePayload = Buffer.concat([packetId, protocolVarInt, serverAddr, serverPort, nextState]);
    const handshakePacket = Buffer.concat([encodeVarInt(handshakePayload.length), handshakePayload]);
    const statusRequest = Buffer.concat([encodeVarInt(1), Buffer.from([0x00])]);
    const fullPacket = Buffer.concat([handshakePacket, statusRequest]);

    // Verify total packet can be constructed
    expect(fullPacket.length).toBeGreaterThan(0);

    // Verify we can decode the packet length correctly
    const { value: payloadLen } = readVarInt(fullPacket, 0);
    expect(payloadLen).toBe(handshakePayload.length);
  });

  it("should handle different port numbers in packet", () => {
    const host = "server.example.com";
    for (const port of [25565, 19132, 30000, 65535, 1]) {
      const hostBuffer = Buffer.from(host, "utf-8");
      const serverPort = Buffer.alloc(2);
      serverPort.writeUInt16BE(port, 0);
      expect(serverPort.readUInt16BE(0)).toBe(port);
    }
  });
});

describe("SLP Response Parsing", () => {
  it("should simulate buffering multi-chunk response", () => {
    // Simulate a response that arrives in 3 chunks
    const mockResponse = JSON.stringify({
      version: { name: "1.20.4", protocol: 765 },
      players: { max: 20, online: 5, sample: [{ name: "Player1", id: "123" }] },
      description: { text: "Welcome to the server!", extra: [{ text: " (Aternos)" }] },
    });

    // Encode as SLP response packet
    const jsonBytes = Buffer.from(jsonResponse(mockResponse));
    const responsePacket = Buffer.concat([
      encodeVarInt(0x00),
      encodeVarInt(mockResponse.length),
      jsonBytes,
    ]);
    const responseWithLength = Buffer.concat([encodeVarInt(responsePacket.length), responsePacket]);

    // Split into 3 chunks
    const chunk1 = responseWithLength.slice(0, 5);
    const chunk2 = responseWithLength.slice(5, 20);
    const chunk3 = responseWithLength.slice(20);

    // Simulate buffering
    const buffer: Buffer[] = [];
    buffer.push(chunk1);
    const full1 = Buffer.concat(buffer);
    const { value: packetLen1, size: varIntSize1 } = readVarInt(full1, 0);
    // Should not be complete yet
    expect(full1.length).toBeLessThan(varIntSize1 + packetLen1);

    buffer.push(chunk2);
    const full2 = Buffer.concat(buffer);
    const { value: packetLen2, size: varIntSize2 } = readVarInt(full2, 0);
    // Might still be incomplete
    const isComplete2 = full2.length >= varIntSize2 + packetLen2;

    buffer.push(chunk3);
    const full3 = Buffer.concat(buffer);
    const { value: packetLen3, size: varIntSize3 } = readVarInt(full3, 0);
    // Should be complete now
    expect(full3.length).toBeGreaterThanOrEqual(varIntSize3 + packetLen3);

    // Parse the JSON
    const jsonStr = full3.slice(varIntSize3 + 1 + encodeVarInt(mockResponse.length).length,
      varIntSize3 + 1 + encodeVarInt(mockResponse.length).length + mockResponse.length).toString("utf-8");
    const parsed = JSON.parse(jsonStr);
    expect(parsed.version.name).toBe("1.20.4");
    expect(parsed.players.online).toBe(5);
    expect(parsed.players.max).toBe(20);
  });

  it("should correctly parse VarInt in multi-byte responses", () => {
    // Hypixel-like response with 9000+ byte payload
    const largePayloadLen = 9288;
    const encoded = encodeVarInt(largePayloadLen);
    const { value } = readVarInt(encoded, 0);
    expect(value).toBe(largePayloadLen);
    expect(encoded.length).toBe(2); // 2-byte VarInt for 9288
  });
});

// Helper to create mock JSON response buffer
function jsonResponse(jsonStr: string): Buffer {
  return Buffer.from(jsonStr, "utf-8");
}
