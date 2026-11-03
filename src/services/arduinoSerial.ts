/**
 * Driver Web Serial e Gerenciador de Linhas para o Arduino Uno.
 * Implementa comunicação a 115200 baud, bufferização por '\n' e fila atômica de escrita.
 */

export interface WebSerialPort {
    open(options: { baudRate: number }): Promise<void>;
    close(): Promise<void>;
    readable: ReadableStream<Uint8Array> | null;
    writable: WritableStream<Uint8Array> | null;
}

export type LineListener = (line: string) => void;
export type DisconnectListener = () => void;

export function isWebSerialSupported(): boolean {
    return (
        typeof navigator !== 'undefined' &&
        'serial' in navigator &&
        typeof (navigator as unknown as { serial?: { requestPort?: unknown } }).serial?.requestPort ===
        'function'
    );
}

export class ArduinoSerialService {
    private port: WebSerialPort | null = null;
    private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
    private isReading = false;
    private lineListeners: Set<LineListener> = new Set();
    private disconnectListeners: Set<DisconnectListener> = new Set();
    private writeQueue: Promise<void> = Promise.resolve();
    private textDecoder = new TextDecoder();
    private textEncoder = new TextEncoder();
    private dtrTimer: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        if (typeof navigator !== 'undefined' && 'serial' in navigator) {
            const serial = (navigator as unknown as { serial: EventTarget }).serial;
            serial.addEventListener?.('disconnect', () => {
                this.disconnect();
            });
        }
    }

    public isConnected(): boolean {
        return this.port !== null && this.writer !== null;
    }

    /**
     * Conecta à porta serial USB do Arduino Uno a 115200 baud.
     * Aguarda 1.5s após a abertura da porta (tratamento de DTR reset)
     * antes de disparar o comando inicial SYNC.
     */
    public async connect(customPort?: WebSerialPort): Promise<void> {
        if (this.isConnected()) {
            await this.disconnect();
        }

        let selectedPort: WebSerialPort;
        if (customPort) {
            selectedPort = customPort;
        } else {
            if (!isWebSerialSupported()) {
                throw new Error('Web Serial API não é suportada por este navegador.');
            }
            const nav = navigator as unknown as { serial: { requestPort: () => Promise<WebSerialPort> } };
            selectedPort = await nav.serial.requestPort();
        }

        await selectedPort.open({ baudRate: 115200 });
        this.port = selectedPort;

        if (selectedPort.writable) {
            this.writer = selectedPort.writable.getWriter();
        }

        if (selectedPort.readable) {
            this.reader = selectedPort.readable.getReader();
            this.startReading();
        }

        // Tratamento para DTR reset: o Uno reinicia ao abrir a porta Serial.
        // Aguarda 1.5s para o bootloader terminar e o firmware inicializar.
        await new Promise((resolve) => {
            this.dtrTimer = setTimeout(resolve, 1500);
        });
        this.dtrTimer = null;

        if (this.isConnected()) {
            await this.sendCommand('SYNC');
        }
    }

    /**
     * Encerra a conexão serial com segurança, liberando locks e fechando streams.
     */
    public async disconnect(): Promise<void> {
        if (this.dtrTimer !== null) {
            clearTimeout(this.dtrTimer);
            this.dtrTimer = null;
        }

        this.isReading = false;

        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch {
                // Ignora erros ao cancelar reader
            }
            try {
                this.reader.releaseLock();
            } catch {
                // Ignora erros ao liberar lock
            }
            this.reader = null;
        }

        if (this.writer) {
            try {
                this.writer.releaseLock();
            } catch {
                // Ignora erros ao liberar writer
            }
            this.writer = null;
        }

        if (this.port) {
            try {
                await this.port.close();
            } catch {
                // Ignora erros ao fechar porta
            }
            this.port = null;
        }

        this.notifyDisconnect();
    }

    /**
     * Envia um comando simples com terminação '\n'.
     * Enfileirado na fila atômica.
     */
    public sendCommand(cmd: string): Promise<void> {
        const trimmed = cmd.trim();
        if (!trimmed) return Promise.resolve();
        return this.enqueueWrite(`${trimmed}\n`);
    }

    /**
     * Envia um mapa inteiro em bloco atômico:
     * SET_MAP:<id>
     * MAP_ROW:0,########
     * ...
     * MAP_ROW:7,########
     * MAP_LOAD
     */
    public sendMap(id: string | number, rows: string[]): Promise<void> {
        const lines: string[] = [
            `SET_MAP:${id}`,
            ...rows.map((row, y) => `MAP_ROW:${y},${row}`),
            'MAP_LOAD',
        ];

        return this.enqueueWriteSequence(lines);
    }

    public onLine(listener: LineListener): () => void {
        this.lineListeners.add(listener);
        return () => {
            this.lineListeners.delete(listener);
        };
    }

    public onDisconnect(listener: DisconnectListener): () => void {
        this.disconnectListeners.add(listener);
        return () => {
            this.disconnectListeners.delete(listener);
        };
    }

    private notifyLine(line: string) {
        for (const listener of this.lineListeners) {
            try {
                listener(line);
            } catch (err) {
                console.error('Erro no listener de linha serial:', err);
            }
        }
    }

    private notifyDisconnect() {
        for (const listener of this.disconnectListeners) {
            try {
                listener();
            } catch (err) {
                console.error('Erro no listener de desconexão:', err);
            }
        }
    }

    private async startReading(): Promise<void> {
        this.isReading = true;
        let buffer = '';

        try {
            while (this.isReading && this.reader) {
                const { value, done } = await this.reader.read();
                if (done) break;

                if (value) {
                    buffer += this.textDecoder.decode(value, { stream: true });
                    let newlineIndex: number;
                    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                        const rawLine = buffer.slice(0, newlineIndex);
                        buffer = buffer.slice(newlineIndex + 1);
                        const cleanLine = rawLine.replace(/\r$/, '');
                        if (cleanLine.length > 0) {
                            this.notifyLine(cleanLine);
                        }
                    }
                }
            }
        } catch {
            // Stream interrompido ou encerrado
        } finally {
            this.isReading = false;
            if (this.port) {
                this.disconnect();
            }
        }
    }

    private enqueueWrite(lineWithNewline: string): Promise<void> {
        this.writeQueue = this.writeQueue
            .then(async () => {
                if (!this.writer) {
                    throw new Error('Arduino Uno não está conectado.');
                }
                const data = this.textEncoder.encode(lineWithNewline);
                await this.writer.write(data);
            })
            .catch((err) => {
                console.error('Falha ao enviar comando para o Arduino:', err);
                throw err;
            });
        return this.writeQueue;
    }

    private enqueueWriteSequence(lines: string[]): Promise<void> {
        this.writeQueue = this.writeQueue
            .then(async () => {
                if (!this.writer) {
                    throw new Error('Arduino Uno não está conectado.');
                }
                for (const line of lines) {
                    const data = this.textEncoder.encode(`${line}\n`);
                    await this.writer.write(data);
                    // Pausa de 20ms entre linhas para prevenir overflow na UART do ATmega328P
                    await new Promise((resolve) => setTimeout(resolve, 20));
                }
            })
            .catch((err) => {
                console.error('Falha ao enviar sequência de mapa para o Arduino:', err);
                throw err;
            });
        return this.writeQueue;
    }
}

export const arduinoSerial = new ArduinoSerialService();
