const maxPages = 40;
const maxImageBytes = 55e4;
function timeline(pageCount, questions) {
  const steps = [];
  for (let page = 1; page <= pageCount; page++) {
    steps.push({ type: "slide", page });
    questions.forEach(({ after }, index) => {
      if (after === page) steps.push({ type: "question", index });
    });
  }
  steps.push({ type: questions.length ? "ranking" : "end" });
  return steps;
}
function visibleStep(state, steps, player) {
  if (player) {
    for (let position = player.firstPosition; position <= state.furthest; position++) {
      const step = steps[position];
      if (step?.type === "question" && player.answers[step.index] === void 0) return step;
    }
  }
  return steps[state.position] ?? { type: "waiting" };
}
function ranking(state) {
  const players = Object.values(state.players).map((player) => ({
    name: player.name,
    score: state.questions.reduce((score, question, index) => score + Number(player.answers[index] === question.correct), 0)
  })).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fa"));
  let rank = 0;
  return players.map((player, index) => {
    if (player.score !== players[index - 1]?.score) rank = index + 1;
    return { ...player, rank };
  });
}
function readQuestions(value, pageCount) {
  if (!Array.isArray(value) || value.length > 20) throw new Error("\u062D\u062F\u0627\u06A9\u062B\u0631 \u06F2\u06F0 \u0633\u0624\u0627\u0644 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F.");
  return value.map((question, index) => {
    const { after, correct } = question ?? {};
    const text = typeof question?.text === "string" ? question.text.trim() : "";
    const options = Array.isArray(question?.options) ? question.options.map((item) => typeof item === "string" ? item.trim() : "") : [];
    if (!Number.isInteger(after) || after < 1 || after >= pageCount || !text || text.length > 300 || options.length < 2 || options.length > 4 || options.some((option) => !option || option.length > 140) || new Set(options).size !== options.length || !Number.isInteger(correct) || correct < 0 || correct >= options.length) {
      throw new Error(`\u0633\u0624\u0627\u0644 ${index + 1} \u0631\u0627 \u06A9\u0627\u0645\u0644 \u06A9\u0646\u06CC\u062F\u061B \u0634\u0645\u0627\u0631\u0647\u0654 \u0627\u0633\u0644\u0627\u06CC\u062F\u060C \u06AF\u0632\u06CC\u0646\u0647\u200C\u0647\u0627\u06CC \u0645\u062A\u0645\u0627\u06CC\u0632 \u0648 \u067E\u0627\u0633\u062E \u062F\u0631\u0633\u062A \u0644\u0627\u0632\u0645\u200C\u0627\u0646\u062F.`);
    }
    return { after, text, options, correct };
  });
}
export {
  maxImageBytes,
  maxPages,
  ranking,
  readQuestions,
  timeline,
  visibleStep
};
