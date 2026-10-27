(()=>{const exports={};
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.command = exports.VERSION = exports.CHANNEL = void 0;
exports.parseSceneEvent = parseSceneEvent;
exports.newDemo = newDemo;
exports.sceneRound = sceneRound;
exports.transition = transition;
exports.CHANNEL = "cue-iq/trine-godot";
exports.VERSION = 1;
const command = (type, values = {}) => ({
    ...values,
    channel: exports.CHANNEL,
    version: exports.VERSION,
    type,
});
exports.command = command;
const events = new Set([
    "ready",
    "choose",
    "continue",
    "replay",
    "next_ready",
    "feedback_complete",
    "time_up",
    "exit",
    "toggle_sound",
    "toggle_pause",
]);
function parseSceneEvent(raw) {
    try {
        const value = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (!value ||
            typeof value !== "object" ||
            value.channel !== exports.CHANNEL ||
            value.version !== exports.VERSION ||
            !events.has(value.type))
            return null;
        if (["choose", "continue", "next_ready", "feedback_complete", "time_up", "replay"].includes(value.type) &&
            typeof value.roundId !== "string")
            return null;
        if (value.type === "choose" && typeof value.animal !== "string")
            return null;
        return value;
    }
    catch {
        return null;
    }
}
function newDemo(rounds, run = 0, previousTrine) {
    if (!rounds.length)
        throw new Error("Trine demo needs at least one round");
    const ordered = spaceTrines(rounds, previousTrine, run === 0 ? rounds[0].prompt : undefined);
    return {
        rounds: ordered,
        index: 0,
        selected: [],
        phase: "choosing",
        correct: 0,
        answered: 0,
        nextReady: false,
        lastCorrect: null,
        run,
        cycle: 0,
    };
}
function sceneRound(state) {
    const round = state.rounds[state.index];
    return (0, exports.command)("round", {
        roundId: `${state.run}:${state.cycle}:${round.id}`,
        run: state.run,
        anchor: round.prompt,
        options: round.options.map((option) => option.id),
        roundIndex: state.index,
        total: state.rounds.length,
        score: state.correct,
    });
}
function shuffled(items) {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}
function trineKey(round) {
    return [round.prompt, ...round.correctOptionId.split("|")].sort().join("|");
}
function spaceTrines(rounds, previousTrine, openingPrompt) {
    const pools = new Map();
    for (const round of rounds) {
        const key = trineKey(round);
        pools.set(key, [...(pools.get(key) ?? []), round]);
    }
    for (const [key, pool] of pools)
        pools.set(key, shuffled(pool));
    const ordered = [];
    if (openingPrompt) {
        const first = rounds.find((round) => round.prompt === openingPrompt);
        const key = trineKey(first);
        const pool = pools.get(key);
        pool.splice(pool.indexOf(first), 1);
        ordered.push(first);
        previousTrine = key;
    }
    const fill = (lastTrine) => {
        if (ordered.length === rounds.length)
            return true;
        const candidates = shuffled([...pools.keys()])
            .filter((key) => key !== lastTrine && pools.get(key).length > 0)
            .sort((a, b) => pools.get(b).length - pools.get(a).length);
        for (const key of candidates) {
            const pool = pools.get(key);
            const next = pool.pop();
            ordered.push(next);
            if (fill(key))
                return true;
            ordered.pop();
            pool.push(next);
        }
        return false;
    };
    if (!fill(previousTrine))
        throw new Error("Could not space the trine rounds");
    return ordered;
}
function freshReplayRounds(rounds) {
    const animals = rounds.map((round) => round.prompt);
    const ordered = shuffled(rounds);
    return ordered.map((round, index) => {
        const partners = round.correctOptionId.split("|");
        const excluded = new Set([round.prompt, ...partners]);
        const distractors = shuffled(animals.filter((animal) => !excluded.has(animal)));
        const previous = new Set(round.options.map((option) => option.id).filter((animal) => !partners.includes(animal)));
        const chosen = distractors.slice(0, 4);
        if (chosen.length === previous.size && chosen.every((animal) => previous.has(animal))) {
            const replacement = distractors.find((animal) => !chosen.includes(animal));
            if (replacement)
                chosen[0] = replacement;
        }
        const options = shuffled([...partners, ...chosen]).map((animal) => ({
            id: animal,
            label: animal,
        }));
        return {
            ...round,
            id: `trine-builder-replay-${index}-${round.prompt}-${options.map((option) => option.id).join("-")}`,
            options,
        };
    });
}
function transition(state, event) {
    const round = state.rounds[state.index];
    const id = `${state.run}:${state.cycle}:${round.id}`;
    if (event.roundId !== id)
        return { state, commands: [] };
    if (event.type === "replay") {
        const next = newDemo(freshReplayRounds(state.rounds), state.run + 1, trineKey(round));
        return {
            state: next,
            commands: [sceneRound(next)],
            announcement: "New constellation. Choose two partners.",
        };
    }
    if (event.type === "time_up" && state.phase !== "complete") {
        return {
            state: { ...state, phase: "complete" },
            commands: [(0, exports.command)("complete", { score: state.correct })],
            completion: { run: state.run, correct: state.correct, total: state.answered },
            announcement: `Time's up. ${state.correct} trines completed.`,
        };
    }
    if (event.type === "choose" &&
        state.phase === "choosing" &&
        round.options.some((option) => option.id === event.animal)) {
        const selected = state.selected.includes(event.animal)
            ? state.selected.filter((animal) => animal !== event.animal)
            : [...state.selected, event.animal];
        if (selected.length < 2) {
            return {
                state: { ...state, selected },
                commands: [(0, exports.command)("selection", { roundId: id, selected })],
                announcement: selected.length
                    ? `${selected[0]} selected. Choose one more partner.`
                    : "Selection cleared.",
            };
        }
        const correct = [...selected].sort().join("|") === round.correctOptionId;
        const next = {
            ...state,
            selected,
            phase: "animating",
            lastCorrect: correct,
            correct: state.correct + Number(correct),
            answered: state.answered + 1,
        };
        return {
            state: next,
            commands: [
                (0, exports.command)("result", {
                    roundId: id,
                    selected,
                    correct,
                    correctPair: round.correctOptionId.split("|"),
                    explanation: round.explanation,
                    score: next.correct,
                }),
            ],
            announcement: `${correct ? "Correct." : "Not this trine."} ${round.explanation}`,
        };
    }
    if (event.type === "feedback_complete" && state.phase === "animating") {
        const feedback = { ...state, phase: "feedback" };
        return state.lastCorrect ? advance(feedback) : { state: feedback, commands: [] };
    }
    if (event.type === "next_ready" &&
        state.phase === "animating" &&
        state.lastCorrect &&
        !state.nextReady) {
        return { state: { ...state, nextReady: true }, commands: [] };
    }
    if (event.type === "continue" &&
        (state.phase === "feedback" ||
            (state.phase === "animating" && state.lastCorrect && state.nextReady))) {
        return advance(state);
    }
    return { state, commands: [] };
}
function advance(state) {
    if (state.index + 1 === state.rounds.length) {
        const next = {
            ...state,
            rounds: spaceTrines(freshReplayRounds(state.rounds), trineKey(state.rounds[state.index])),
            cycle: state.cycle + 1,
            index: 0,
            selected: [],
            phase: "choosing",
            nextReady: false,
            lastCorrect: null,
        };
        return {
            state: next,
            commands: [sceneRound(next)],
            announcement: `Complete ${next.rounds[0].prompt}'s trine.`,
        };
    }
    const next = {
        ...state,
        index: state.index + 1,
        selected: [],
        phase: "choosing",
        nextReady: false,
        lastCorrect: null,
    };
    return {
        state: next,
        commands: [sceneRound(next)],
        announcement: `Complete ${next.rounds[next.index].prompt}'s trine.`,
    };
}

let state = null, ready = false, paused = false, sound = true;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
let status = 'Waiting for Godot';
const send = message => window.CueTrine.receive(message);
function start() {
  if (!ready || !state) return;
  send(exports.command('settings', { paused, sound, reducedMotion: reduced.matches }));
  send(exports.sceneRound(state));
  status = 'choosing';
}
function receive(raw) {
  const event = exports.parseSceneEvent(raw);
  if (!event) return;
  if (event.type === 'ready') { ready = true; start(); return; }
  if (!state) return;
  if (event.type === 'toggle_sound') { sound = !sound; send(exports.command('settings', { sound })); return; }
  if (event.type === 'toggle_pause') { paused = !paused; send(exports.command('settings', { paused })); return; }
  if (event.type === 'exit') { paused = true; send(exports.command('settings', { paused: true, sound: false })); location.href = '/'; return; }
  if (paused) return;
  const next = exports.transition(state, event);
  state = next.state; status = state.phase;
  next.commands.forEach(send);
}
window.addEventListener('cue-trine-event', event => receive(event.detail));
reduced.addEventListener('change', () => send(exports.command('settings', { reducedMotion: reduced.matches })));
// Read-only diagnostics help check the real exported engine and host agree.
window.CueTrineDemo = { snapshot: () => ({ ready, status, phase: state?.phase, roundIndex: state?.index, score: state?.correct, selected: state?.selected, paused, sound }) };
fetch('rounds.json').then(response => { if (!response.ok) throw new Error('Round data unavailable'); return response.json(); }).then(rounds => {
  state = exports.newDemo(rounds); ready = window.CueTrine.isReady === true; start();
}).catch(error => { document.getElementById('loading').style.display='grid'; document.getElementById('loading-label').textContent=error.message; });

})();