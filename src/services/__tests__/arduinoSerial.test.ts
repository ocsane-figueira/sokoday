import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArduinoSerialService, type WebSerialPort } from '../arduinoSerial';

describe('ArduinoSerialService', () => {
    let service: ArduinoSerialService;

    beforeEach(() => {
        service = new ArduinoSerialService();
        vi.useFakeTimers();
    });

    it('gerencia bufferização por \\n e descarta \\r', async () => {
        const receivedLines: string[] = [];
        service.onLine((line) => receivedLines.push(line));

        // Simula stream de leitura
        let streamController: ReadableStreamDefaultController<Uint8Array>;
        const readable = new ReadableStream<Uint8Array>({
            start(controller) {
                streamController = controller;
            },
        });

        const writtenChunks: Uint8Array[] = [];
        const writable = new WritableStream<Uint8Array>({
            write(chunk) {
                writtenChunks.push(chunk);
            },
        });

        const mockPort: WebSerialPort = {
            open: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            readable,
            writable,
        };

        const connectPromise = service.connect(mockPort);
        // Avança o timer de 1.5s do DTR reset
        await vi.advanceTimersByTimeAsync(1500);
        await connectPromise;

        expect(service.isConnected()).toBe(true);
        expect(mockPort.open).toHaveBeenCalledWith({ baudRate: 115200 });

        const encoder = new TextEncoder();
        // Envia chunk partido com \r\n
        streamController!.enqueue(encoder.encode('SYNC:NATIVE,1,0\r\nINFO:Ignorar\r\nPARTIAL_'));
        streamController!.enqueue(encoder.encode('LINE\n'));

        // Deixa microtasks e timers rodarem para processar os chunks do stream
        await vi.advanceTimersByTimeAsync(20);

        expect(receivedLines).toEqual([
            'SYNC:NATIVE,1,0',
            'INFO:Ignorar',
            'PARTIAL_LINE',
        ]);

        await service.disconnect();
        expect(service.isConnected()).toBe(false);
    });

    it('enfileira atomicamente o envio de comandos e mapas sem intercalação', async () => {
        const writtenLines: string[] = [];
        const decoder = new TextDecoder();

        const readable = new ReadableStream<Uint8Array>({
            start() { },
        });

        const writable = new WritableStream<Uint8Array>({
            write(chunk) {
                writtenLines.push(decoder.decode(chunk));
            },
        });

        const mockPort: WebSerialPort = {
            open: vi.fn().mockResolvedValue(undefined),
            close: vi.fn().mockResolvedValue(undefined),
            readable,
            writable,
        };

        const connectPromise = service.connect(mockPort);
        await vi.advanceTimersByTimeAsync(1500);
        await connectPromise;

        // Dispara sendMap e comandos simultaneamente
        const mapPromise = service.sendMap(5, [
            '########',
            '#      #',
            '#  $   #',
            '#  .   #',
            '#  @   #',
            '#      #',
            '#      #',
            '########',
        ]);
        const movePromise = service.sendCommand('MV:U');

        // Avança timers para as pausas entre linhas
        await vi.advanceTimersByTimeAsync(300);
        await Promise.all([mapPromise, movePromise]);

        const fullWritten = writtenLines.join('');
        expect(fullWritten).toContain('SET_MAP:5\n');
        expect(fullWritten).toContain('MAP_ROW:0,########\n');
        expect(fullWritten).toContain('MAP_ROW:7,########\n');
        expect(fullWritten).toContain('MAP_LOAD\n');
        expect(fullWritten).toContain('MV:U\n');

        // MV:U deve aparecer estritamente APÓS MAP_LOAD devido à fila atômica
        const loadIndex = fullWritten.indexOf('MAP_LOAD\n');
        const moveIndex = fullWritten.indexOf('MV:U\n');
        expect(moveIndex).toBeGreaterThan(loadIndex);

        await service.disconnect();
    });
});
