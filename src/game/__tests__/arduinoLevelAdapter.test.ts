import { describe, expect, it } from 'vitest';
import { isWin, move, parseLevel } from '../engine';
import { LEVELS } from '../levels';
import { solve } from '../solver';
import {
    DEFAULT_ARDUINO_LEVELS,
    directionToUno,
    extractNumericLevelId,
    formatLevelForUno,
    parseArduinoMapToLevel,
    unoToDirection,
} from '../arduinoLevelAdapter';

describe('arduinoLevelAdapter', () => {
    describe('formatLevelForUno', () => {
        it('formata todos os 12 níveis nativos do site estritamente em 8x8 com padding de espaços', () => {
            for (const level of LEVELS) {
                const rows = formatLevelForUno(level);
                expect(rows).toHaveLength(8);
                for (const row of rows) {
                    expect(row).toHaveLength(8);
                }
            }
        });

        it('preenche com espaços linhas com menos de 8 colunas e adiciona linhas vazias até 8', () => {
            const smallLevel = {
                id: 'TEST:SMALL',
                name: 'Pequeno',
                rows: ['###', '#@#', '###'],
            };
            const formatted = formatLevelForUno(smallLevel);
            expect(formatted).toHaveLength(8);
            expect(formatted[0]).toBe('###     ');
            expect(formatted[1]).toBe('#@#     ');
            expect(formatted[2]).toBe('###     ');
            for (let i = 3; i < 8; i++) {
                expect(formatted[i]).toBe('        ');
            }
        });

        it('lança erro se o nível tiver mais de 8 linhas', () => {
            const tallLevel = {
                id: 'TEST:TALL',
                name: 'Alto',
                rows: Array(9).fill('########'),
            };
            expect(() => formatLevelForUno(tallLevel)).toThrow(/8x8/);
        });

        it('lança erro se alguma linha tiver mais de 8 colunas', () => {
            const wideLevel = {
                id: 'TEST:WIDE',
                name: 'Largo',
                rows: ['#########'],
            };
            expect(() => formatLevelForUno(wideLevel)).toThrow(/8 colunas/);
        });
    });

    describe('parseArduinoMapToLevel', () => {
        it('converte linhas recebidas do Uno em LevelDefinition com id UNO:<id>', () => {
            const rawRows = [
                '########',
                '#      #',
                '#  $   #',
                '#  .   #',
                '#  @   #',
                '#      #',
                '#      #',
                '########',
            ];
            const level = parseArduinoMapToLevel(1, rawRows);
            expect(level.id).toBe('UNO:1');
            expect(level.name).toBe('Arduino Fase 1');
            expect(level.rows).toHaveLength(8);

            const state = parseLevel(level);
            expect(state.player).toEqual({ row: 4, col: 3 });
            expect(state.boxes.size).toBe(1);
            expect(state.targets.size).toBe(1);
        });
    });

    describe('A* Solver com os 4 níveis nativos do Arduino Uno', () => {
        it('resolve o Nível 1 do Arduino na solução ótima de 6 movimentos', () => {
            const level1 = DEFAULT_ARDUINO_LEVELS[0];
            const state = parseLevel(level1);
            const solution = solve(state);

            expect(solution.status).toBe('solved');
            if (solution.status === 'solved') {
                expect(solution.directions).toHaveLength(6);
                let currentState = state;
                for (const dir of solution.directions) {
                    currentState = move(currentState, dir).state;
                }
                expect(isWin(currentState)).toBe(true);
            }
        });

        it('resolve com sucesso os 4 níveis nativos do Arduino Uno', () => {
            for (const level of DEFAULT_ARDUINO_LEVELS) {
                const state = parseLevel(level);
                const solution = solve(state);
                expect(solution.status).toBe('solved');
                if (solution.status === 'solved') {
                    expect(solution.directions.length).toBeGreaterThan(0);
                }
            }
        });
    });

    describe('helpers de direção e ID', () => {
        it('converte direções do site para caracteres do Uno e vice-versa', () => {
            expect(directionToUno('up')).toBe('U');
            expect(directionToUno('down')).toBe('D');
            expect(directionToUno('left')).toBe('L');
            expect(directionToUno('right')).toBe('R');

            expect(unoToDirection('U')).toBe('up');
            expect(unoToDirection('D')).toBe('down');
            expect(unoToDirection('L')).toBe('left');
            expect(unoToDirection('R')).toBe('right');
            expect(unoToDirection('X')).toBeNull();
        });

        it('extrai id numérico corretamente', () => {
            expect(extractNumericLevelId('LVL:5')).toBe(5);
            expect(extractNumericLevelId('UNO:3')).toBe(3);
            expect(extractNumericLevelId('12')).toBe(12);
            expect(extractNumericLevelId('INVALID')).toBe(1);
        });
    });
});
