#include <Adafruit_NeoPixel.h>
#include <avr/pgmspace.h>

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

// Estado do jogo na RAM
char grid[8][8];
int px = 0, py = 0;
int pMove = 0, pPush = 0;
uint8_t currentLevel = 0;
bool isPowered = false;
uint8_t pulseCounter = 0;

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
// CARREGAMENTO DE NÍVEL
// ==========================================
void loadLevel(uint8_t lvlIndex) {
  pMove = 0;
  pPush = 0;
  for (uint8_t y = 0; y < 8; y++) {
    for (uint8_t x = 0; x < 8; x++) {
      grid[y][x] = pgm_read_byte(&(levels[lvlIndex][y][x]));
      if (grid[y][x] == PLAYER || grid[y][x] == PLAYER_GOAL) {
        px = x;
        py = y;
      }
    }
  }
}

// ==========================================
// SETUP
// ==========================================
void setup() {
  Serial.begin(115200);

  pinMode(PIN_POWER, INPUT);
  pinMode(PIN_UP, INPUT_PULLUP);
  pinMode(PIN_DOWN, INPUT_PULLUP);
  pinMode(PIN_LEFT, INPUT_PULLUP);
  pinMode(PIN_RIGHT, INPUT_PULLUP);

  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.clear();
  strip.show();

  Serial.println(F("Sokoban Uno Standalone Iniciado."));
}

// ==========================================
// LOOP PRINCIPAL
// ==========================================
void loop() {
  // 1. Gerenciamento da Chave Liga/Desliga no pino 9
  bool powerState = digitalRead(PIN_POWER) == HIGH;

  if (!powerState) {
    if (isPowered) {
      strip.clear();
      strip.show();
      isPowered = false;
      Serial.println(F("Chave OFF -> Sistema pausado."));
    }
    delay(50);
    return; // Não executa lógica se a chave estiver desligada
  } else if (!isPowered) {
    // Chave ligada novamente: reinicia do zero (Nível 1)
    isPowered = true;
    currentLevel = 0;
    loadLevel(currentLevel);
    strip.setBrightness(BRIGHTNESS);
    Serial.println(F("Chave ON -> Jogo iniciado do zero."));
  }

  // 2. Leitura de Controles
  char dir = readKeys();
  if (dir != ' ') {
    movePlayer(dir);
  }

  // 3. Renderização visual
  renderScreen();

  // 4. Checagem de Vitória
  if (checkWin()) {
    winAnimation();
    currentLevel = (currentLevel + 1) % TOTAL_LEVELS;
    loadLevel(currentLevel);
  }

  delay(20);
}

// ==========================================
// MOVIMENTAÇÃO (Lógica Sokoban)
// ==========================================
void movePlayer(char dir) {
  int dx = 0, dy = 0;
  if (dir == 'U') dy = -1;
  else if (dir == 'D') dy = 1;
  else if (dir == 'R') dx = 1;
  else if (dir == 'L') dx = -1;

  int tx = px + dx;
  int ty = py + dy;

  // Limite do tabuleiro 8x8
  if (tx < 0 || tx > 7 || ty < 0 || ty > 7) return;
  if (grid[ty][tx] == WALL) return;

  // Empurrar Caixa
  if (grid[ty][tx] == BOX || grid[ty][tx] == BOX_GOAL) {
    int bx = tx + dx;
    int by = ty + dy;

    if (bx < 0 || bx > 7 || by < 0 || by > 7) return;
    if (grid[by][bx] == WALL || grid[by][bx] == BOX || grid[by][bx] == BOX_GOAL) return;

    if (grid[by][bx] == EMPTY) {
      grid[by][bx] = BOX;
      pPush++;
    } else if (grid[by][bx] == GOAL) {
      grid[by][bx] = BOX_GOAL;
      pPush++;
    }

    grid[ty][tx] = (grid[ty][tx] == BOX) ? EMPTY : GOAL;
  }

  // Mover Jogador
  if (grid[ty][tx] == EMPTY) {
    grid[ty][tx] = PLAYER;
    pMove++;
  } else if (grid[ty][tx] == GOAL) {
    grid[ty][tx] = PLAYER_GOAL;
    pMove++;
  }

  grid[py][px] = (grid[py][px] == PLAYER) ? EMPTY : GOAL;
  px = tx;
  py = ty;
}

// ==========================================
// LEITURA DOS BOTÕES (COM DEBOUNCE E HOLD)
// ==========================================
char readKeys() {
  if (digitalRead(PIN_UP) == LOW) {
    while (digitalRead(PIN_UP) == LOW) delay(10);
    return 'U';
  }
  if (digitalRead(PIN_DOWN) == LOW) {
    while (digitalRead(PIN_DOWN) == LOW) delay(10);
    return 'D';
  }
  if (digitalRead(PIN_LEFT) == LOW) {
    while (digitalRead(PIN_LEFT) == LOW) delay(10);
    return 'L';
  }
  if (digitalRead(PIN_RIGHT) == LOW) {
    while (digitalRead(PIN_RIGHT) == LOW) delay(10);
    return 'R';
  }
  return ' ';
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
// ANIMAÇÃO DE VITÓRIA (ARCO-ÍRIS)
// ==========================================
void winAnimation() {
  strip.setBrightness(8);
  for (uint16_t j = 0; j < 256 * 3; j += 4) {
    for (uint16_t i = 0; i < NUM_LEDS; i++) {
      strip.setPixelColor(i, strip.gamma32(strip.ColorHSV((i * 1024) + (j * 256))));
    }
    strip.show();
    delay(10);
  }
  strip.setBrightness(BRIGHTNESS);
}