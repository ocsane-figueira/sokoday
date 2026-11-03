#include <Adafruit_NeoPixel.h>
#include <avr/pgmspace.h>
#include <string.h>
#include <stdlib.h>

// ==========================================
// PINAGEM DEFINIDA NO HARDWARE
// ==========================================
#define PIN_RIGHT   2
#define PIN_LEFT    3
#define PIN_DOWN    4
#define PIN_UP      5
#define PIN_MATRIX  6
#define PIN_POWER   9

#define NUM_LEDS    64
#define BRIGHTNESS  25   // 10% de 255 (~25)

Adafruit_NeoPixel strip(NUM_LEDS, PIN_MATRIX, NEO_GRB + NEO_KHZ800);

// ==========================================
// PARAMETROS DE TEMPORIZACAO / PROTOCOLO
// ==========================================
#define SERIAL_BAUD        115200
#define DEBOUNCE_MS        35
#define UNDO_HOLD_MS       1000UL   // UP + DOWN
#define RESET_HOLD_MS      3000UL   // UP sozinho
#define FRAME_MS           20       // periodo de renderizacao
#define WIN_FRAME_MS       10       // periodo de cada quadro da animacao de vitoria
#define MAP_RX_TIMEOUT_MS  10000UL  // tempo maximo entre linhas de um SET_MAP (folga p/ digitar no Monitor Serial)
#define RX_BUF_SIZE        40       // maior linha esperada: "MAP_ROW:0,########" (18 chars)
#define UNDO_CAPACITY      80       // passos de historico

// ==========================================
// PALETA DE CORES SOKOBAN
// ==========================================
#define COLOR_WALL        strip.Color(25, 38, 60)      // Azul claro
#define COLOR_GOAL        strip.Color(0, 85, 0)      // Verde
#define COLOR_BOX         strip.Color(120, 53, 15)     // Marrom
#define COLOR_BOX_GOAL    strip.Color(0, 170, 170)   // Ciano
#define COLOR_FLOOR       strip.Color(0, 0, 0)       // Apagado

// Elementos em notação clássica
const char WALL        = '#';
const char PLAYER      = '@';
const char GOAL        = '.';
const char BOX         = '$';
const char EMPTY       = ' ';
const char PLAYER_GOAL = '+';
const char BOX_GOAL    = '*';

// Origem da fase ativa
#define SRC_NATIVE 0
#define SRC_CUSTOM 1

// ==========================================
// MAPAS 8x8 (GRAVADOS NA MEMÓRIA FLASH)
// ==========================================
const char levels[][8][9] PROGMEM = {
  // Nível 1: Introdução
  {
    "########",
    "#      #",
    "#  $   #",
    "#  .   #",
    "#  @   #",
    "#      #",
    "#      #",
    "########"
  },
  // Nível 2: Duplo Alvo
  {
    "########",
    "#      #",
    "#  .   #",
    "#  $   #",
    "#  $   #",
    "#  @   #",
    "#  .   #",
    "########"
  },
  // Nível 3: O Contorno
  {
    "########",
    "#  .   #",
    "#  ##$ #",
    "#  #   #",
    "#  $ . #",
    "#  #   #",
    "#  @   #",
    "########"
  },
  // Nível 4: Pequeno Labirinto
  {
    "########",
    "# .$ . #",
    "#  $   #",
    "#  ##  #",
    "#      #",
    "#   @  #",
    "#      #",
    "########"
  }
};

const uint8_t TOTAL_LEVELS = sizeof(levels) / sizeof(levels[0]);

// ==========================================
// ESTADO NA RAM
// ==========================================
// Jogo
char grid[8][8];
int8_t px = 0, py = 0;
int pMove = 0, pPush = 0;
uint8_t currentLevel = 0;     // indice (0-based) da fase nativa ativa
bool isCustomMap = false;     // true = fase remota (customMap) ativa
char customMap[8][8];         // fase enviada pela Web (gabarito do undo/reset)
uint16_t customId = 0;        // id da fase remota ativa
bool hasCustomMap = false;    // true apos um SET_MAP/MAP_LOAD bem-sucedido

// Recepcao de mapa (SET_MAP ... MAP_LOAD) em area de staging
char stagingMap[8][8];
uint16_t stagingId = 0;
uint8_t stagingRows = 0;      // bitmask das linhas recebidas
bool stagingError = false;
bool receivingMap = false;
uint32_t lastMapRxMs = 0;

// Historico de undo: 1 nibble por passo (bit 0-1 = direcao, bit 2 = empurrou caixa)
uint8_t undoBuf[(UNDO_CAPACITY + 1) / 2];
uint8_t undoHead = 0;         // proxima posicao de escrita
uint8_t undoCount = 0;

// Direcoes: 0=U 1=D 2=L 3=R
const int8_t DIR_DX[4] = { 0, 0, -1, 1 };
const int8_t DIR_DY[4] = { -1, 1, 0, 0 };
const char DIR_CHAR[4] = { 'U', 'D', 'L', 'R' };

// Sistema
bool isPowered = false;
uint8_t pulseCounter = 0;
uint32_t lastFrameMs = 0;
bool pcConnected = false;

// Animacao de vitoria (nao bloqueante)
bool winAnimating = false;
uint16_t winJ = 0;
uint32_t lastWinFrameMs = 0;

// Serial
char rxBuf[RX_BUF_SIZE];
uint8_t rxLen = 0;
bool rxOverflow = false;

// Botoes: ordem UP, DOWN, LEFT, RIGHT
const uint8_t BTN_PINS[4] = { PIN_UP, PIN_DOWN, PIN_LEFT, PIN_RIGHT };
const char BTN_DIR[4] = { 'U', 'D', 'L', 'R' };
bool btnRaw[4];
bool btnStable[4];
uint32_t btnChangedMs[4];
bool comboActive = false;     // UP + DOWN pressionados
uint32_t comboStartMs = 0;
bool undoFired = false;
bool upAloneActive = false;   // apenas UP pressionado
uint32_t upAloneStartMs = 0;
bool resetFired = false;
bool resetLocked = false;     // bloqueia reset de UP ate soltar UP

// ==========================================
// MAPEAMENTO DA MATRIZ 8x8
// ==========================================
// Mapeamento original do Sokoban (matriz rotacionada 90 graus no case)
uint16_t mapLED(uint8_t x, uint8_t y) {
  return (7 - x) * 8 + y;
  // Se após testar o movimento parecer invertido ou deitado,
  // basta trocar esta linha por: return y * 8 + x; ou serpentina.
}

// ==========================================
// HISTORICO DE UNDO (pilha circular compacta)
// ==========================================
void clearUndo() {
  undoHead = 0;
  undoCount = 0;
}

void pushUndo(uint8_t dirCode, bool pushed) {
  uint8_t v = (dirCode & 0x03) | (pushed ? 0x04 : 0x00);
  uint8_t b = undoHead >> 1;
  if (undoHead & 1) undoBuf[b] = (undoBuf[b] & 0x0F) | (v << 4);
  else              undoBuf[b] = (undoBuf[b] & 0xF0) | v;
  undoHead = (undoHead + 1) % UNDO_CAPACITY;
  if (undoCount < UNDO_CAPACITY) undoCount++;
}

uint8_t popUndo() {
  undoHead = (undoHead + UNDO_CAPACITY - 1) % UNDO_CAPACITY;
  undoCount--;
  uint8_t b = undoBuf[undoHead >> 1];
  return (undoHead & 1) ? (b >> 4) : (b & 0x0F);
}

// ==========================================
// GABARITO DA FASE ATIVA (Flash ou customMap)
// ==========================================
char templateAt(uint8_t x, uint8_t y) {
  if (isCustomMap) return customMap[y][x];
  return (char)pgm_read_byte(&(levels[currentLevel][y][x]));
}

bool isGoalCell(uint8_t x, uint8_t y) {
  char c = templateAt(x, y);
  return (c == GOAL || c == PLAYER_GOAL || c == BOX_GOAL);
}

// ==========================================
// CARREGAMENTO DE NÍVEL
// ==========================================
// source == SRC_NATIVE: lvlIndex (0-based) copia da PROGMEM.
// source == SRC_CUSTOM: copia de customMap (lvlIndex ignorado; id em customId).
void loadLevel(uint8_t lvlIndex, uint8_t source) {
  pMove = 0;
  pPush = 0;
  clearUndo();

  if (source == SRC_CUSTOM) {
    isCustomMap = true;
  } else {
    isCustomMap = false;
    currentLevel = lvlIndex;
  }

  for (uint8_t y = 0; y < 8; y++) {
    for (uint8_t x = 0; x < 8; x++) {
      grid[y][x] = templateAt(x, y);
      if (grid[y][x] == PLAYER || grid[y][x] == PLAYER_GOAL) {
        px = x;
        py = y;
      }
    }
  }
}

// Reinicia a fase ativa (nativa ou remota)
void reloadCurrentLevel() {
  loadLevel(currentLevel, isCustomMap ? SRC_CUSTOM : SRC_NATIVE);
}

// ==========================================
// PROTOCOLO: RESPOSTAS
// ==========================================
void sendOrigin() {
  Serial.print(isCustomMap ? F("CUSTOM") : F("NATIVE"));
}

uint16_t activeLevelId() {
  return isCustomMap ? customId : (uint16_t)(currentLevel + 1);
}

void sendSync() {
  Serial.print(F("SYNC:"));
  sendOrigin();
  Serial.print(',');
  Serial.print(activeLevelId());
  Serial.print(',');
  Serial.println(pMove);
}

// Despeja uma fase nativa (id 1..TOTAL_LEVELS) no formato MAP_*
void dumpMap(int id) {
  if (id < 1 || id > TOTAL_LEVELS) {
    Serial.println(F("MAP_ERR"));
    return;
  }
  uint8_t idx = id - 1;
  Serial.print(F("MAP_START:NATIVE,"));
  Serial.println(id);
  for (uint8_t y = 0; y < 8; y++) {
    Serial.print(F("MAP_ROW:"));
    Serial.print(y);
    Serial.print(',');
    for (uint8_t x = 0; x < 8; x++) {
      Serial.write(pgm_read_byte(&(levels[idx][y][x])));
    }
    Serial.println();
  }
  Serial.println(F("MAP_END"));
}

// Despeja o ESTADO ATUAL do tabuleiro (jogador, caixas, destinos) da fase ativa,
// nativa ou remota. Mesmos simbolos do mapa: # @ + $ * . e espaco.
void dumpState() {
  Serial.print(F("STATE_START:"));
  sendOrigin();
  Serial.print(',');
  Serial.print(activeLevelId());
  Serial.print(',');
  Serial.println(pMove);
  for (uint8_t y = 0; y < 8; y++) {
    Serial.print(F("STATE_ROW:"));
    Serial.print(y);
    Serial.print(',');
    for (uint8_t x = 0; x < 8; x++) {
      Serial.write(grid[y][x]);
    }
    Serial.println();
  }
  Serial.println(F("STATE_END"));
}

// ==========================================
// PROTOCOLO: CARGA DE FASE REMOTA (SET_MAP)
// ==========================================
void beginSetMap(int id) {
  if (winAnimating) {
    winAnimating = false;
    strip.setBrightness(BRIGHTNESS);
  }
  receivingMap = true;
  stagingId = (id < 0) ? 0 : (uint16_t)id;
  stagingRows = 0;
  stagingError = false;
  lastMapRxMs = millis();
  memset(stagingMap, EMPTY, sizeof(stagingMap));
}

bool isValidCell(char c) {
  return (c == WALL || c == PLAYER || c == GOAL || c == BOX ||
          c == EMPTY || c == PLAYER_GOAL || c == BOX_GOAL);
}

// p aponta para "<y>,<conteudo>"
void handleMapRow(const char* p) {
  if (!receivingMap) {
    Serial.println(F("MAP_ERR"));
    return;
  }
  lastMapRxMs = millis();

  if (p[0] < '0' || p[0] > '7' || p[1] != ',') {
    stagingError = true;
    return;
  }
  uint8_t y = p[0] - '0';
  const char* content = p + 2;
  if (strlen(content) != 8) {
    stagingError = true;
    return;
  }
  for (uint8_t x = 0; x < 8; x++) {
    if (!isValidCell(content[x])) {
      stagingError = true;
      return;
    }
    stagingMap[y][x] = content[x];
  }
  stagingRows |= (1 << y);
}

// SET_LEVEL:<1-4>   -> carrega fase nativa
// SET_LEVEL:CUSTOM  -> volta para a ultima fase remota enviada (SET_MAP)
// Reinicia a fase (movimentos zerados, historico limpo). Sem eco de MV.
void setLevelCmd(const char* arg) {
  if (!isPowered || receivingMap) {
    Serial.println(F("LEVEL_ERR"));
    return;
  }
  if (winAnimating) {
    winAnimating = false;
    strip.setBrightness(BRIGHTNESS);
  }
  if (strcmp_P(arg, PSTR("CUSTOM")) == 0) {
    if (!hasCustomMap) {
      Serial.println(F("LEVEL_ERR"));
      return;
    }
    loadLevel(0, SRC_CUSTOM);
  } else {
    int id = atoi(arg);
    if (id < 1 || id > TOTAL_LEVELS) {
      Serial.println(F("LEVEL_ERR"));
      return;
    }
    loadLevel(id - 1, SRC_NATIVE);
  }
  Serial.println(F("LEVEL_OK"));
}

void commitMap() {
  if (!receivingMap) {
    Serial.println(F("MAP_ERR"));
    return;
  }
  receivingMap = false;

  if (!isPowered || stagingError || stagingRows != 0xFF) {
    Serial.println(F("MAP_ERR"));
    return;
  }

  uint8_t players = 0;
  for (uint8_t y = 0; y < 8; y++) {
    for (uint8_t x = 0; x < 8; x++) {
      char c = stagingMap[y][x];
      if (c == PLAYER || c == PLAYER_GOAL) players++;
    }
  }
  if (players != 1) {
    Serial.println(F("MAP_ERR"));
    return;
  }

  memcpy(customMap, stagingMap, sizeof(customMap));
  customId = stagingId;
  hasCustomMap = true;
  winAnimating = false;
  strip.setBrightness(BRIGHTNESS);
  loadLevel(0, SRC_CUSTOM);
  Serial.println(F("MAP_OK"));
}

// ==========================================
// MOVIMENTAÇÃO (Lógica Sokoban)
// ==========================================
// fromSerial == false: movimento de botao fisico -> envia "MV:<dir>".
// fromSerial == true : movimento vindo do PC       -> sem eco.
// Retorna true se o jogador realmente se moveu.
bool movePlayer(char dir, bool fromSerial) {
  uint8_t code;
  if (dir == 'U') code = 0;
  else if (dir == 'D') code = 1;
  else if (dir == 'L') code = 2;
  else if (dir == 'R') code = 3;
  else return false;

  int8_t dx = DIR_DX[code];
  int8_t dy = DIR_DY[code];

  int8_t tx = px + dx;
  int8_t ty = py + dy;

  // Limite do tabuleiro 8x8
  if (tx < 0 || tx > 7 || ty < 0 || ty > 7) return false;
  if (grid[ty][tx] == WALL) return false;

  bool pushed = false;

  // Empurrar Caixa
  if (grid[ty][tx] == BOX || grid[ty][tx] == BOX_GOAL) {
    int8_t bx = tx + dx;
    int8_t by = ty + dy;

    if (bx < 0 || bx > 7 || by < 0 || by > 7) return false;
    if (grid[by][bx] == WALL || grid[by][bx] == BOX || grid[by][bx] == BOX_GOAL) return false;

    if (grid[by][bx] == EMPTY) {
      grid[by][bx] = BOX;
    } else if (grid[by][bx] == GOAL) {
      grid[by][bx] = BOX_GOAL;
    }
    pPush++;
    pushed = true;

    grid[ty][tx] = (grid[ty][tx] == BOX) ? EMPTY : GOAL;
  }

  // Mover Jogador
  if (grid[ty][tx] == EMPTY) {
    grid[ty][tx] = PLAYER;
  } else if (grid[ty][tx] == GOAL) {
    grid[ty][tx] = PLAYER_GOAL;
  }
  pMove++;

  grid[py][px] = (grid[py][px] == PLAYER) ? EMPTY : GOAL;
  px = tx;
  py = ty;

  pushUndo(code, pushed);

  if (!fromSerial) {
    Serial.print(F("MV:"));
    Serial.println(dir);
  }
  return true;
}

// ==========================================
// DESFAZER (UNDO)
// ==========================================
// fromButton == true: acionado pelos botoes -> envia "CMD:UNDO".
// Retorna true se um passo foi desfeito.
bool undoMove(bool fromButton) {
  if (undoCount == 0) return false;

  uint8_t rec = popUndo();
  uint8_t code = rec & 0x03;
  bool pushed = (rec & 0x04) != 0;
  int8_t dx = DIR_DX[code];
  int8_t dy = DIR_DY[code];

  int8_t ox = px - dx;   // casa anterior do jogador
  int8_t oy = py - dy;

  if (pushed) {
    // A caixa esta a frente do jogador: traz de volta para a posicao atual do jogador
    int8_t bx = px + dx;
    int8_t by = py + dy;
    grid[by][bx] = isGoalCell(bx, by) ? GOAL : EMPTY;
    grid[py][px] = isGoalCell(px, py) ? BOX_GOAL : BOX;
    if (pPush > 0) pPush--;
  } else {
    grid[py][px] = isGoalCell(px, py) ? GOAL : EMPTY;
  }

  grid[oy][ox] = isGoalCell(ox, oy) ? PLAYER_GOAL : PLAYER;
  px = ox;
  py = oy;
  if (pMove > 0) pMove--;

  if (fromButton) Serial.println(F("CMD:UNDO"));
  return true;
}

// ==========================================
// DISPATCH DE COMANDOS SERIAIS
// ==========================================
void dispatchCommand(char* buf) {
  pcConnected = true;

  if (strcmp_P(buf, PSTR("SYNC")) == 0) {
    sendSync();
  } else if (strncmp_P(buf, PSTR("SET_LEVEL:"), 10) == 0) {
    setLevelCmd(buf + 10);
  } else if (strcmp_P(buf, PSTR("GET_STATE")) == 0) {
    dumpState();
  } else if (strncmp_P(buf, PSTR("GET_MAP:"), 8) == 0) {
    dumpMap(atoi(buf + 8));
  } else if (strncmp_P(buf, PSTR("SET_MAP:"), 8) == 0) {
    beginSetMap(atoi(buf + 8));
  } else if (strncmp_P(buf, PSTR("MAP_ROW:"), 8) == 0) {
    handleMapRow(buf + 8);
  } else if (strcmp_P(buf, PSTR("MAP_LOAD")) == 0) {
    commitMap();
  } else if (strncmp_P(buf, PSTR("MV:"), 3) == 0) {
    if (isPowered && !receivingMap) {
      if (winAnimating) {
        winAnimating = false;
        strip.setBrightness(BRIGHTNESS);
      }
      movePlayer(buf[3], true);   // sem eco
    }
  } else if (strcmp_P(buf, PSTR("UNDO")) == 0) {
    if (isPowered && !receivingMap) {
      if (winAnimating) {
        winAnimating = false;
        strip.setBrightness(BRIGHTNESS);
      }
      undoMove(false);
    }
  } else if (strcmp_P(buf, PSTR("RESET")) == 0) {
    if (isPowered && !receivingMap) {
      if (winAnimating) {
        winAnimating = false;
        strip.setBrightness(BRIGHTNESS);
      }
      reloadCurrentLevel();
    }
  }
  // Comandos desconhecidos sao ignorados.
}

// Leitura nao bloqueante: acumula bytes ate '\n'
void readSerial() {
  while (Serial.available() > 0) {
    char c = (char)Serial.read();
    if (c == '\n') {
      if (!rxOverflow && rxLen > 0) {
        rxBuf[rxLen] = '\0';
        dispatchCommand(rxBuf);
      }
      rxLen = 0;
      rxOverflow = false;
    } else if (c == '\r') {
      // ignora CR
    } else if (rxLen < RX_BUF_SIZE - 1) {
      rxBuf[rxLen++] = c;
    } else {
      rxOverflow = true;
    }
  }
}

// ==========================================
// BOTOES (DEBOUNCE, UNDO E RESET TEMPORIZADOS)
// ==========================================
// Sincroniza o estado interno com os pinos sem gerar eventos
void syncButtons() {
  uint32_t now = millis();
  for (uint8_t i = 0; i < 4; i++) {
    bool raw = (digitalRead(BTN_PINS[i]) == LOW);
    btnRaw[i] = raw;
    btnStable[i] = raw;
    btnChangedMs[i] = now;
  }
  comboActive = false;
  undoFired = false;
  upAloneActive = false;
  resetFired = false;
  resetLocked = true;   // so libera apos soltar UP
}

void updateButtons() {
  uint32_t now = millis();
  uint8_t pressEdges = 0;

  // Debounce por amostragem continua
  for (uint8_t i = 0; i < 4; i++) {
    bool raw = (digitalRead(BTN_PINS[i]) == LOW);
    if (raw != btnRaw[i]) {
      btnRaw[i] = raw;
      btnChangedMs[i] = now;
    } else if (raw != btnStable[i] && (now - btnChangedMs[i]) >= DEBOUNCE_MS) {
      btnStable[i] = raw;
      if (raw) pressEdges |= (1 << i);   // borda de descida (pull-up)
    }
  }

  bool upP = btnStable[0];
  bool dnP = btnStable[1];

  // Movimento simples na borda de pressionamento.
  // Se UP/DOWN e pressionado enquanto o oposto ja esta segurado, e um combo (undo): sem movimento.
  for (uint8_t i = 0; i < 4; i++) {
    if (!(pressEdges & (1 << i))) continue;
    if (i == 0 && dnP) continue;
    if (i == 1 && upP) continue;
    movePlayer(BTN_DIR[i], false);
  }

  if (upP && dnP) {
    // UP + DOWN continuamente: undo apos 3 s
    upAloneActive = false;
    resetLocked = true;   // nao deixa UP restante disparar reset
    if (!comboActive) {
      comboActive = true;
      comboStartMs = now;
      undoFired = false;
    } else if (!undoFired && (now - comboStartMs) >= UNDO_HOLD_MS) {
      undoMove(true);
      undoFired = true;   // travado ate soltar pelo menos um botao
    }
  } else {
    comboActive = false;
    undoFired = false;

    if (upP) {
      // Apenas UP: reset apos 5 s
      if (!resetLocked) {
        if (!upAloneActive) {
          upAloneActive = true;
          upAloneStartMs = now;
        } else if (!resetFired && (now - upAloneStartMs) >= RESET_HOLD_MS) {
          reloadCurrentLevel();
          Serial.println(F("CMD:RESET"));
          resetFired = true;   // travado ate soltar UP
        }
      }
    } else {
      upAloneActive = false;
      resetFired = false;
      resetLocked = false;
    }
  }
}

// ==========================================
// CONDIÇÃO DE VITÓRIA
// ==========================================
bool checkWin() {
  uint8_t boxesOnTarget = 0;
  for (uint8_t y = 0; y < 8; y++) {
    for (uint8_t x = 0; x < 8; x++) {
      // Se ainda houver destino vago, o jogo continua
      if (grid[y][x] == GOAL || grid[y][x] == PLAYER_GOAL) {
        return false;
      }
      if (grid[y][x] == BOX_GOAL) {
        boxesOnTarget++;
      }
    }
  }
  return (boxesOnTarget > 0);
}

// ==========================================
// RENDERIZAÇÃO E PULSO DO JOGADOR
// ==========================================
void renderScreen() {
  pulseCounter++;
  if (pulseCounter > 38) pulseCounter = 0;

  // Variação senoidal de brilho para o jogador
  float pulse = (cos(((float)pulseCounter / 38.0) * 3.1415 * 2) + 1.0) / 2.0;
  uint8_t rPulse = (uint8_t)(80 + (175 * pulse));

  uint32_t colorPlayer = strip.Color(rPulse, 0, 0);
  uint32_t colorPlayerGoal = strip.Color(rPulse, rPulse, 0); // Amarelo pulsante

  for (uint8_t y = 0; y < 8; y++) {
    for (uint8_t x = 0; x < 8; x++) {
      char cell = grid[y][x];
      uint32_t color = COLOR_FLOOR;

      switch (cell) {
        case WALL:        color = COLOR_WALL;        break;
        case GOAL:        color = COLOR_GOAL;        break;
        case BOX:         color = COLOR_BOX;         break;
        case BOX_GOAL:    color = COLOR_BOX_GOAL;    break;
        case PLAYER:      color = colorPlayer;       break;
        case PLAYER_GOAL: color = colorPlayerGoal;   break;
        default:          color = COLOR_FLOOR;       break;
      }

      strip.setPixelColor(mapLED(x, y), color);
    }
  }
  strip.show();
}

// ==========================================
// ANIMAÇÃO DE VITÓRIA (ARCO-ÍRIS, NÃO BLOQUEANTE)
// ==========================================
void startWinAnimation() {
  winAnimating = true;
  winJ = 0;
  lastWinFrameMs = 0;
  strip.setBrightness(8);
}

void stepWinAnimation() {
  uint32_t now = millis();
  if (now - lastWinFrameMs < WIN_FRAME_MS) return;
  lastWinFrameMs = now;

  for (uint16_t i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.gamma32(strip.ColorHSV((i * 1024) + ((uint32_t)winJ * 256))));
  }
  strip.show();
  winJ += 4;

  if (winJ >= 256) {
    winAnimating = false;
    strip.setBrightness(BRIGHTNESS);
    // Se conectado ao site ou em fase remota, mantem o nivel atual para aguardar
    // a decisao do jogador no site (repetir a fase ou avancar para o proximo nivel).
    // No modo puramente standalone (sem PC), avanca automaticamente para a proxima fase.
    if (isCustomMap || pcConnected) {
      reloadCurrentLevel();
    } else {
      loadLevel((currentLevel + 1) % TOTAL_LEVELS, SRC_NATIVE);
    }
    syncButtons();
    sendSync();
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(SERIAL_BAUD);

  pinMode(PIN_POWER, INPUT);
  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);

  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.clear();
  strip.show();

  syncButtons();

  Serial.println(F("INFO:Sokoban Uno Standalone Iniciado."));
}

// ==========================================
// LOOP PRINCIPAL (NÃO BLOQUEANTE)
// ==========================================
void loop() {
  // 1. Gerenciamento da Chave Liga/Desliga no pino 9
  bool powerState = digitalRead(PIN_POWER) == HIGH;

  if (!powerState) {
    if (isPowered) {
      strip.clear();
      strip.show();
      isPowered = false;
      winAnimating = false;
      receivingMap = false;
      strip.setBrightness(BRIGHTNESS);
      Serial.println(F("INFO:Chave OFF -> Sistema pausado."));
    }
    readSerial();   // mantem SYNC/GET_MAP disponiveis e evita estouro do buffer
    return;         // Não executa lógica de jogo se a chave estiver desligada
  } else if (!isPowered) {
    // Chave ligada novamente: reinicia do zero (Nível 1 nativo)
    isPowered = true;
    loadLevel(0, SRC_NATIVE);
    strip.setBrightness(BRIGHTNESS);
    syncButtons();
    Serial.println(F("INFO:Chave ON -> Jogo iniciado do zero."));
    sendSync();
  }

  uint32_t now = millis();

  // 2. Entrada serial (PC -> Uno)
  readSerial();

  // Descarta recepcao de mapa incompleta
  if (receivingMap && (now - lastMapRxMs) > MAP_RX_TIMEOUT_MS) {
    receivingMap = false;
    Serial.println(F("MAP_ERR"));
  }

  // 3. Animação de vitória em andamento: ignora jogo e botões
  if (winAnimating) {
    stepWinAnimation();
    return;
  }

  // 4. Leitura de Controles (botões físicos)
  if (!receivingMap) {
    updateButtons();
  }

  // 5. Checagem de Vitória
  if (!receivingMap && checkWin()) {
    Serial.print(F("WIN:"));
    sendOrigin();
    Serial.print(',');
    Serial.println(activeLevelId());
    startWinAnimation();
    return;
  }

  // 6. Renderização visual (periódica; suspensa durante recepção de mapa,
  //    pois strip.show() desabilita interrupções e poderia perder bytes seriais)
  if (!receivingMap && (now - lastFrameMs) >= FRAME_MS) {
    lastFrameMs = now;
    renderScreen();
  }
}
