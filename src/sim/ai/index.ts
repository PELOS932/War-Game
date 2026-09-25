/**
 * SHARED CONTRACT — AI entry point (implemented by the AI agent).
 * The simulation calls these hooks from its tick loop:
 *   - onHour(hour) every game hour (keep it cheap; stagger work across nations)
 *   - onDay(day) once per game day at hour % 24 === 0
 * The AI controls every nation where `!nation.isPlayer`, and for the player
 * nation only the departments where `nation.autonomy[dept]` is true.
 * The AI must issue orders exclusively through the GameAPI commands.
 */
import type { GameAPI } from '../api';

export interface AIController {
  onHour(hour: number): void;
  onDay(day: number): void;
}

export function createAI(game: GameAPI): AIController {
  void game;
  return {
    onHour() {},
    onDay() {},
  };
}
