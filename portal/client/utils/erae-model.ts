export const maxPages = 40;
export const maxImageBytes = 550_000;

export interface Question { after: number; text: string; options: string[]; correct: number }
export interface Player { name: string; firstPosition: number; answers: Record<number, number> }
export interface RoomState { position: number; furthest: number; players: Record<string, Player>; questions: Question[] }
export type Step = { type: 'slide'; page: number } | { type: 'question'; index: number } | { type: 'waiting' | 'ranking' | 'end' };

export function timeline(pageCount: number, questions: Question[]): Step[] {
  const steps: Step[] = [];
  for (let page = 1; page <= pageCount; page++) {
    steps.push({ type: 'slide', page });
    questions.forEach(({ after }, index) => { if (after === page) steps.push({ type: 'question', index }); });
  }
  steps.push({ type: questions.length ? 'ranking' : 'end' });
  return steps;
}

export function visibleStep(state: RoomState, steps: Step[], player?: Player): Step {
  if (player) {
    for (let position = player.firstPosition; position <= state.furthest; position++) {
      const step = steps[position];
      if (step?.type === 'question' && player.answers[step.index] === undefined) return step;
    }
  }
  return steps[state.position] ?? { type: 'waiting' };
}

export function ranking(state: RoomState) {
  const players = Object.values(state.players).map((player) => ({ name: player.name,
    score: state.questions.reduce((score, question, index) => score + Number(player.answers[index] === question.correct), 0),
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'fa'));
  let rank = 0;
  return players.map((player, index) => {
    if (player.score !== players[index - 1]?.score) rank = index + 1;
    return { ...player, rank };
  });
}

export function readQuestions(value: unknown, pageCount: number): Question[] {
  if (!Array.isArray(value) || value.length > 20) throw new Error('حداکثر ۲۰ سؤال وارد کنید.');
  return value.map((question, index) => {
    const { after, correct } = question ?? {};
    const text = typeof question?.text === 'string' ? question.text.trim() : '';
    const options = Array.isArray(question?.options) ? question.options.map((item: unknown) => typeof item === 'string' ? item.trim() : '') : [];
    if (!Number.isInteger(after) || after < 1 || after >= pageCount || !text || text.length > 300 || options.length < 2 || options.length > 4
      || options.some((option: string) => !option || option.length > 140) || new Set(options).size !== options.length
      || !Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      throw new Error(`سؤال ${index + 1} را کامل کنید؛ شمارهٔ اسلاید، گزینه‌های متمایز و پاسخ درست لازم‌اند.`);
    }
    return { after, text, options, correct };
  });
}
