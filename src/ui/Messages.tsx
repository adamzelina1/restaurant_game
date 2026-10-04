import type { GameRunner } from '../game/runner';

const SHOW_FOR = 8;

export function Messages({ runner }: { runner: GameRunner }) {
  const s = runner.state;
  const recent = s.messages.filter((m) => s.time - m.t < SHOW_FOR * runner.speed).slice(-5);
  return (
    <div class="messages">
      {recent.map((m) => (
        <div key={m.id} class={`toast ${m.kind}`}>
          {m.text}
        </div>
      ))}
    </div>
  );
}
