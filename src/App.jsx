import React, { useState, useEffect, useRef } from "react";

// ============================================================
// BRAINPET v2 — Now with EVOLUTION & LEVEL-UP SYSTEM
// ============================================================
// Core loop: focus → XP → level up → evolve through 5 stages
// XP is permanent (doomscrolling doesn't take it away).
// Energy is the daily mood. Level is the long-term identity.

const STORAGE_KEY = "brainpet-state-v2";

// ============================================================
// EVOLUTION SYSTEM
// ============================================================
const STAGES = [
  { id: "sprout", name: "Sprout", minLevel: 1, maxLevel: 3, blurb: "small, soft, full of potential." },
  { id: "bloom", name: "Bloom", minLevel: 4, maxLevel: 7, blurb: "stretching upward. growing leaves." },
  { id: "glow", name: "Glow", minLevel: 8, maxLevel: 12, blurb: "starting to shine from inside." },
  { id: "sage", name: "Sage", minLevel: 13, maxLevel: 18, blurb: "wise, calm, focused." },
  { id: "radiant", name: "Radiant", minLevel: 19, maxLevel: 999, blurb: "fully realized. luminous." },
];

// XP curve — gentler at start, steeper later
function xpForLevel(level) {
  return Math.floor(50 + level * level * 15);
}

function getStageForLevel(level) {
  return STAGES.find((s) => level >= s.minLevel && level <= s.maxLevel) || STAGES[0];
}

// Calculate level from total XP earned
function levelFromXp(totalXp) {
  let level = 1;
  let xpUsed = 0;
  while (xpUsed + xpForLevel(level) <= totalXp) {
    xpUsed += xpForLevel(level);
    level++;
  }
  return { level, xpInLevel: totalXp - xpUsed, xpToNext: xpForLevel(level) };
}

// XP rewards
const XP = {
  focusSession: (minutes) => {
    if (minutes >= 90) return Math.floor(minutes * 1.8);
    if (minutes >= 45) return Math.floor(minutes * 1.4);
    return minutes;
  },
  streakDay: 20,
  dailyCheckIn: 10,
};

const PET_LINES = {
  focusStart: ["ooh focus mode. i'll be right here.", "let's go. i'll be cheering quietly.", "yes. lock in."],
  focusComplete: ["we did that!! proud of us.", "look at you. that was real work.", "gold star. genuinely."],
  focusBroken: ["hey it's ok. wanna try again?", "no worries. resets are free.", "happens. we go again whenever."],
  doomscrollStart: ["...are we doing this again", "i'll be here when you're back", "ok but just a little ok"],
  doomscrollLong: ["i'm getting kinda tired", "been a while. you good?", "this isn't really fun anymore right"],
  recovery: ["feeling better already :)", "thank you for coming back", "ok we're ok"],
  streak: ["{n} days now. quietly amazing.", "{n} day streak. i noticed.", "we're really doing this huh. day {n}."],
  levelUp: ["level {n}!! i can feel it.", "we leveled up. did you feel that?", "level {n}. quietly powerful."],
  evolved: ["i'm... different now. {stage}.", "look at us. {stage} form.", "evolved! into {stage}. wow."],
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const STATES = {
  thriving: { label: "thriving", color: "#7dd87d", eyes: "^^", mouth: "ᴗ" },
  happy: { label: "happy", color: "#a8e6a8", eyes: "•‿•", mouth: "ᴗ" },
  neutral: { label: "ok", color: "#c9d6c9", eyes: "• •", mouth: "‿" },
  tired: { label: "tired", color: "#d4c896", eyes: "- -", mouth: "‿" },
  drained: { label: "drained", color: "#c4a878", eyes: "× ×", mouth: "︵" },
  wilted: { label: "wilted", color: "#a89878", eyes: "⌣ ⌣", mouth: "︵" },
};

function getState(energy) {
  if (energy >= 85) return STATES.thriving;
  if (energy >= 65) return STATES.happy;
  if (energy >= 45) return STATES.neutral;
  if (energy >= 25) return STATES.tired;
  if (energy >= 10) return STATES.drained;
  return STATES.wilted;
}

const defaultState = () => ({
  name: "blob",
  energy: 70,
  totalXp: 0,
  highestStageReached: "sprout",
  focusMinutes: 0,
  doomMinutes: 0,
  streak: 0,
  lastActiveDate: new Date().toDateString(),
  messages: [{ from: "pet", text: "hi! i'm your blob. let's grow together :)", t: Date.now() }],
  totalFocusSessions: 0,
  totalDoomMinutes: 0,
});

export default function BrainpetApp() {
  const [state, setState] = useState(defaultState);
  const [view, setView] = useState("home");
  const [chatInput, setChatInput] = useState("");
  const [focusTime, setFocusTime] = useState(25 * 60);
  const [focusActive, setFocusActive] = useState(false);
  const [focusInitial, setFocusInitial] = useState(25 * 60);
  const [bounce, setBounce] = useState(false);
  const [levelUpModal, setLevelUpModal] = useState(null);
  const [resetConfirm, setResetConfirm] = useState(false);
  const focusInterval = useRef(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.lastActiveDate !== new Date().toDateString()) {
          parsed.focusMinutes = 0;
          parsed.doomMinutes = 0;
          parsed.lastActiveDate = new Date().toDateString();
        }
        setState(parsed);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, [state]);

  const bouncePet = () => {
    setBounce(true);
    setTimeout(() => setBounce(false), 400);
  };

  const petSays = (text) => {
    setState((s) => ({
      ...s,
      messages: [...s.messages, { from: "pet", text, t: Date.now() }].slice(-50),
    }));
  };

  const addXp = (amount) => {
    setState((s) => {
      const oldLevel = levelFromXp(s.totalXp).level;
      const newTotal = s.totalXp + amount;
      const newLevel = levelFromXp(newTotal).level;

      let newHighestStage = s.highestStageReached;

      if (newLevel > oldLevel) {
        const oldStage = getStageForLevel(oldLevel);
        const newStage = getStageForLevel(newLevel);
        const evolved = newStage.id !== oldStage.id;
        if (evolved) newHighestStage = newStage.id;

        setTimeout(() => {
          setLevelUpModal({ newLevel, evolved, newStage: evolved ? newStage : null });
        }, 500);

        setTimeout(() => {
          if (evolved) petSays(pick(PET_LINES.evolved).replace("{stage}", newStage.name));
          else petSays(pick(PET_LINES.levelUp).replace("{n}", newLevel));
        }, 800);
      }

      return { ...s, totalXp: newTotal, highestStageReached: newHighestStage };
    });
  };

  const simulateDoomscroll = (minutes) => {
    setState((s) => {
      const energyDrop = Math.min(s.energy, minutes * 1.2);
      return {
        ...s,
        doomMinutes: s.doomMinutes + minutes,
        totalDoomMinutes: s.totalDoomMinutes + minutes,
        energy: Math.max(0, s.energy - energyDrop),
      };
    });
    bouncePet();
    if (minutes <= 10) petSays(pick(PET_LINES.doomscrollStart));
    else petSays(pick(PET_LINES.doomscrollLong));
  };

  const simulateFocus = (minutes) => {
    const xpGained = XP.focusSession(minutes);
    setState((s) => ({
      ...s,
      focusMinutes: s.focusMinutes + minutes,
      totalFocusSessions: s.totalFocusSessions + 1,
      energy: Math.min(100, s.energy + minutes * 0.8),
    }));
    bouncePet();
    petSays(pick(PET_LINES.focusComplete) + ` (+${xpGained} xp)`);
    addXp(xpGained);
  };

  const simulateRest = () => {
    setState((s) => ({ ...s, energy: Math.min(100, s.energy + 15) }));
    bouncePet();
    petSays(pick(PET_LINES.recovery));
  };

  const incrementStreak = () => {
    setState((s) => ({ ...s, streak: s.streak + 1 }));
    addXp(XP.streakDay);
    setTimeout(() => {
      setState((s) => {
        petSays(pick(PET_LINES.streak).replace("{n}", s.streak) + ` (+${XP.streakDay} xp)`);
        return s;
      });
    }, 100);
  };

  const dailyCheckIn = () => {
    addXp(XP.dailyCheckIn);
    petSays(`thanks for checking in (+${XP.dailyCheckIn} xp)`);
  };

  useEffect(() => {
    if (focusActive) {
      focusInterval.current = setInterval(() => {
        setFocusTime((t) => {
          if (t <= 1) {
            clearInterval(focusInterval.current);
            setFocusActive(false);
            simulateFocus(Math.floor(focusInitial / 60));
            return focusInitial;
          }
          return t - 1;
        });
      }, 1000);
    } else {
      clearInterval(focusInterval.current);
    }
    return () => clearInterval(focusInterval.current);
  }, [focusActive, focusInitial]);

  const startFocus = (minutes) => {
    setFocusInitial(minutes * 60);
    setFocusTime(minutes * 60);
    setFocusActive(true);
    petSays(pick(PET_LINES.focusStart));
  };

  const stopFocus = () => {
    setFocusActive(false);
    setFocusTime(focusInitial);
    petSays(pick(PET_LINES.focusBroken));
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setState((s) => ({
      ...s,
      messages: [...s.messages, { from: "user", text: userMsg, t: Date.now() }],
    }));
    setChatInput("");
    setTimeout(() => {
      let reply;
      const lower = userMsg.toLowerCase();
      if (lower.includes("level") || lower.includes("xp")) reply = "every focus session counts. we'll get there :)";
      else if (lower.includes("evolve")) reply = "evolution comes when it comes. don't force it.";
      else if (lower.includes("hi") || lower.includes("hello") || lower.includes("hey")) reply = "hi :)";
      else if (lower.includes("sorry")) reply = "no need. we just keep going.";
      else if (lower.includes("tired") || lower.includes("sad")) reply = "sit with me a minute. it'll pass.";
      else if (lower.includes("focus") || lower.includes("work")) reply = "ok start a session and i'll wait :)";
      else if (lower.includes("name")) reply = "rename me anytime. i'm just a blob.";
      else if (lower.includes("love") || lower.includes("thanks")) reply = "<3";
      else reply = pick(["i'm listening.", "mm. tell me more?", "ok.", "i hear you."]);
      setState((s) => ({
        ...s,
        messages: [...s.messages, { from: "pet", text: reply, t: Date.now() }],
      }));
    }, 600);
  };

  const resetPet = () => {
    setResetConfirm(true);
  };

  const confirmReset = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {}
    setState(defaultState());
    setResetConfirm(false);
  };

  const renamePet = () => {
    const n = prompt("name your pet:", state.name);
    if (n && n.trim()) setState((s) => ({ ...s, name: n.trim().toLowerCase() }));
  };

  const petState = getState(state.energy);
  const { level, xpInLevel, xpToNext } = levelFromXp(state.totalXp);
  const stage = getStageForLevel(level);
  const minutes = Math.floor(focusTime / 60);
  const seconds = focusTime % 60;

  return (
    <div style={styles.app}>
      <style>{globalCSS}</style>

      <div style={styles.header}>
        <div style={styles.logo}>brainpet</div>
        <div style={styles.headerRight}>
          <div style={styles.levelBadge}>
            <span style={styles.levelLabel}>LV</span>
            <span style={styles.levelNum}>{level}</span>
          </div>
          <div style={styles.energyBadge}>
            <div style={styles.energyDot(petState.color)} />
            <span style={{ fontSize: 12, opacity: 0.7 }}>{Math.round(state.energy)}%</span>
          </div>
        </div>
      </div>

      <div style={styles.main}>
        {view === "home" && (
          <HomeView
            state={state}
            petState={petState}
            stage={stage}
            level={level}
            xpInLevel={xpInLevel}
            xpToNext={xpToNext}
            bounce={bounce}
            onRename={renamePet}
            onCheckIn={dailyCheckIn}
          />
        )}
        {view === "focus" && (
          <FocusView
            active={focusActive}
            time={focusTime}
            minutes={minutes}
            seconds={seconds}
            initial={focusInitial}
            onStart={startFocus}
            onStop={stopFocus}
            petState={petState}
            stage={stage}
          />
        )}
        {view === "chat" && (
          <ChatView
            messages={state.messages}
            input={chatInput}
            setInput={setChatInput}
            onSend={sendChat}
            petName={state.name}
          />
        )}
        {view === "evolution" && (
          <EvolutionView currentStage={stage} highestReached={state.highestStageReached} />
        )}
        {view === "sim" && (
          <SimView
            onDoom={simulateDoomscroll}
            onFocus={simulateFocus}
            onRest={simulateRest}
            onStreak={incrementStreak}
            onReset={resetPet}
          />
        )}
        {view === "stats" && <StatsView state={state} level={level} stage={stage} />}
      </div>

      <div style={styles.nav}>
        <NavBtn active={view === "home"} onClick={() => setView("home")}>home</NavBtn>
        <NavBtn active={view === "focus"} onClick={() => setView("focus")}>focus</NavBtn>
        <NavBtn active={view === "evolution"} onClick={() => setView("evolution")}>evo</NavBtn>
        <NavBtn active={view === "chat"} onClick={() => setView("chat")}>chat</NavBtn>
        <NavBtn active={view === "stats"} onClick={() => setView("stats")}>stats</NavBtn>
        <NavBtn active={view === "sim"} onClick={() => setView("sim")}>sim</NavBtn>
      </div>

      {levelUpModal && (
        <LevelUpModal data={levelUpModal} onClose={() => setLevelUpModal(null)} petState={petState} />
      )}

      {resetConfirm && (
        <ResetConfirmModal
          onConfirm={confirmReset}
          onCancel={() => setResetConfirm(false)}
        />
      )}
    </div>
  );
}

// ============================================================
// PET BLOB — Stage-aware, distinct visuals per stage
// ============================================================
function PetBlob({ petState, stage, bounce, size = 220 }) {
  return (
    <div
      style={{
        ...styles.petContainer,
        transform: bounce ? "scale(1.08)" : "scale(1)",
        transition: "transform 0.4s cubic-bezier(.34,1.56,.64,1)",
      }}
    >
      <svg width={size} height={size} viewBox="0 0 200 200">
        {stage.id === "glow" && (
          <circle cx="100" cy="115" r="80" fill={petState.color} opacity="0.15" className="pulse-glow" />
        )}
        {stage.id === "sage" && (
          <circle cx="100" cy="115" r="85" fill="#a8b8e6" opacity="0.12" className="pulse-glow" />
        )}
        {stage.id === "radiant" && (
          <>
            <circle cx="100" cy="115" r="95" fill="#ffe4a8" opacity="0.2" className="pulse-glow" />
            <circle cx="100" cy="115" r="75" fill="#ffd47d" opacity="0.15" className="pulse-glow" />
          </>
        )}

        {(stage.id === "glow" || stage.id === "sage" || stage.id === "radiant") && (
          <>
            <text x="40" y="60" fontSize="14" fill="#d4a800" className="sparkle-1">✦</text>
            <text x="160" y="80" fontSize="12" fill="#d4a800" className="sparkle-2">✧</text>
            <text x="35" y="150" fontSize="10" fill="#d4a800" className="sparkle-3">✦</text>
            <text x="165" y="160" fontSize="14" fill="#d4a800" className="sparkle-1">✧</text>
          </>
        )}

        <ellipse cx="100" cy="180" rx="55" ry="6" fill="#000" opacity="0.08" />

        <g className="blob-breathe">
          {stage.id === "sprout" && (
            <path
              d="M 100 70 C 135 70, 150 95, 150 125 C 150 155, 130 175, 100 175 C 70 175, 50 155, 50 125 C 50 95, 65 70, 100 70 Z"
              fill={petState.color}
              stroke="#000"
              strokeWidth="2.5"
            />
          )}
          {stage.id === "bloom" && (
            <>
              <path d="M 100 50 Q 90 35, 100 28 Q 110 35, 100 50" fill="#7dc87d" stroke="#000" strokeWidth="2" />
              <line x1="100" y1="50" x2="100" y2="58" stroke="#000" strokeWidth="2" />
              <path
                d="M 100 55 C 145 55, 165 90, 165 122 C 165 155, 140 175, 100 175 C 60 175, 35 155, 35 122 C 35 90, 55 55, 100 55 Z"
                fill={petState.color}
                stroke="#000"
                strokeWidth="2.5"
              />
            </>
          )}
          {stage.id === "glow" && (
            <path
              d="M 100 50 C 148 50, 168 88, 168 122 C 168 158, 140 178, 100 178 C 60 178, 32 158, 32 122 C 32 88, 52 50, 100 50 Z"
              fill={petState.color}
              stroke="#000"
              strokeWidth="2.5"
            />
          )}
          {stage.id === "sage" && (
            <>
              <path
                d="M 100 50 C 150 50, 170 88, 170 122 C 170 158, 142 180, 100 180 C 58 180, 30 158, 30 122 C 30 88, 50 50, 100 50 Z"
                fill={petState.color}
                stroke="#000"
                strokeWidth="2.5"
              />
              <circle cx="78" cy="118" r="13" fill="none" stroke="#000" strokeWidth="2" />
              <circle cx="122" cy="118" r="13" fill="none" stroke="#000" strokeWidth="2" />
              <line x1="91" y1="118" x2="109" y2="118" stroke="#000" strokeWidth="2" />
            </>
          )}
          {stage.id === "radiant" && (
            <>
              <path d="M 75 55 L 80 40 L 90 50 L 100 35 L 110 50 L 120 40 L 125 55 Z" fill="#ffd47d" stroke="#000" strokeWidth="2" />
              <circle cx="100" cy="42" r="2.5" fill="#ff6b6b" />
              <path
                d="M 100 55 C 152 55, 172 90, 172 122 C 172 160, 144 182, 100 182 C 56 182, 28 160, 28 122 C 28 90, 48 55, 100 55 Z"
                fill={petState.color}
                stroke="#000"
                strokeWidth="2.5"
              />
            </>
          )}

          {stage.id !== "sage" && (
            <>
              <ellipse cx="60" cy="138" rx="10" ry="6" fill="#ff9999" opacity="0.5" />
              <ellipse cx="140" cy="138" rx="10" ry="6" fill="#ff9999" opacity="0.5" />
            </>
          )}

          {stage.id !== "sage" && (
            <text
              x="100"
              y="125"
              textAnchor="middle"
              fontSize="28"
              fontFamily="ui-monospace, monospace"
              fontWeight="700"
              fill="#000"
            >
              {petState.eyes}
            </text>
          )}
          {stage.id === "sage" && (
            <>
              <circle cx="78" cy="118" r="2" fill="#000" />
              <circle cx="122" cy="118" r="2" fill="#000" />
            </>
          )}

          <text
            x="100"
            y={stage.id === "sage" ? 152 : 150}
            textAnchor="middle"
            fontSize="20"
            fontFamily="ui-monospace, monospace"
            fill="#000"
          >
            {petState.mouth}
          </text>
        </g>
      </svg>
    </div>
  );
}

// ============================================================
// LEVEL UP MODAL
// ============================================================
function LevelUpModal({ data, onClose, petState }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalSparkles}>✦ ✧ ✦</div>
        <div style={styles.modalLabel}>{data.evolved ? "evolution!" : "level up!"}</div>
        <div style={styles.modalLevel}>level {data.newLevel}</div>
        {data.evolved && data.newStage && (
          <>
            <div style={styles.modalEvolution}>
              <PetBlob petState={petState} stage={data.newStage} bounce={false} size={160} />
            </div>
            <div style={styles.modalStageName}>{data.newStage.name}</div>
            <div style={styles.modalStageBlurb}>"{data.newStage.blurb}"</div>
          </>
        )}
        <button style={styles.modalBtn} onClick={onClose}>continue</button>
      </div>
    </div>
  );
}

// ============================================================
// RESET CONFIRMATION MODAL
// ============================================================
function ResetConfirmModal({ onConfirm, onCancel }) {
  return (
    <div style={styles.modalOverlay} onClick={onCancel}>
      <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalLabel}>are you sure?</div>
        <div style={{ ...styles.modalLevel, fontSize: 22, marginTop: 12 }}>
          reset your pet?
        </div>
        <div style={styles.modalStageBlurb}>
          this clears everything — levels, xp, streaks, messages.
          your blob starts over from scratch.
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button style={styles.modalBtnGhost} onClick={onCancel}>
            cancel
          </button>
          <button style={styles.modalBtn} onClick={onConfirm}>
            yes, reset
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VIEWS
// ============================================================
function HomeView({ state, petState, stage, level, xpInLevel, xpToNext, bounce, onRename, onCheckIn }) {
  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "good morning";
    if (h < 18) return "afternoon";
    return "evening";
  })();
  const xpProgress = (xpInLevel / xpToNext) * 100;

  return (
    <div style={styles.viewWrap}>
      <div style={styles.greeting}>
        {greeting}.{" "}
        <span onClick={onRename} style={styles.petNameInline}>{state.name}</span>{" "}
        is feeling <em>{petState.label}</em>.
      </div>

      <div style={styles.stageBadge}>
        <span style={styles.stageBadgeText}>{stage.name.toUpperCase()} · LV {level}</span>
      </div>

      <PetBlob petState={petState} stage={stage} bounce={bounce} />

      <div style={styles.xpBarWrap}>
        <div style={styles.xpBarLabel}>
          <span>{xpInLevel} / {xpToNext} xp</span>
          <span style={{ opacity: 0.5 }}>next: lv {level + 1}</span>
        </div>
        <div style={styles.xpBar}>
          <div style={{ ...styles.xpBarFill, width: `${xpProgress}%` }} />
        </div>
      </div>

      <div style={styles.statsRow}>
        <Stat label="energy" value={`${Math.round(state.energy)}`} />
        <Stat label="focus today" value={`${state.focusMinutes}m`} />
        <Stat label="streak" value={`${state.streak}d`} />
      </div>

      <div style={styles.cardSoft}>
        <div style={styles.cardLabel}>last message</div>
        <div style={styles.cardText}>"{state.messages[state.messages.length - 1]?.text || "..."}"</div>
      </div>

      <button style={styles.btnGhost} onClick={onCheckIn}>
        check in for today (+10 xp)
      </button>
    </div>
  );
}

function FocusView({ active, time, minutes, seconds, initial, onStart, onStop, petState, stage }) {
  const progress = ((initial - time) / initial) * 100;
  const pad = (n) => String(n).padStart(2, "0");

  return (
    <div style={styles.viewWrap}>
      <div style={styles.sectionTitle}>focus session</div>
      <PetBlob petState={petState} stage={stage} size={140} />
      <div style={styles.timer}>{pad(minutes)}:{pad(seconds)}</div>
      <div style={styles.progressBar}>
        <div style={{ ...styles.progressFill, width: `${progress}%` }} />
      </div>
      {!active ? (
        <>
          <div style={styles.presetRow}>
            {[
              { m: 15, xp: 15 },
              { m: 25, xp: 25 },
              { m: 45, xp: 63 },
              { m: 90, xp: 162 },
            ].map((p) => (
              <button key={p.m} style={styles.presetBtn} onClick={() => onStart(p.m)}>
                <div>{p.m}m</div>
                <div style={{ fontSize: 10, opacity: 0.6, marginTop: 2 }}>+{p.xp} xp</div>
              </button>
            ))}
          </div>
          <div style={styles.hint}>longer sessions earn bonus xp. deep work pays off.</div>
        </>
      ) : (
        <>
          <button style={styles.btnDanger} onClick={onStop}>stop session</button>
          <div style={styles.hint}>stay here. closing this would pause the timer in the real iOS app.</div>
        </>
      )}
    </div>
  );
}

function ChatView({ messages, input, setInput, onSend, petName }) {
  const scrollRef = useRef(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  return (
    <div style={styles.chatWrap}>
      <div style={styles.sectionTitle}>chat with {petName}</div>
      <div style={styles.chatScroll} ref={scrollRef}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              ...styles.bubble,
              alignSelf: m.from === "user" ? "flex-end" : "flex-start",
              background: m.from === "user" ? "#000" : "#f0ede5",
              color: m.from === "user" ? "#fff" : "#000",
            }}
          >
            {m.text}
          </div>
        ))}
      </div>
      <div style={styles.chatInputRow}>
        <input
          style={styles.chatInput}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onSend()}
          placeholder="say something..."
        />
        <button style={styles.sendBtn} onClick={onSend}>send</button>
      </div>
    </div>
  );
}

function EvolutionView({ currentStage, highestReached }) {
  const reachedIndex = STAGES.findIndex((s) => s.id === highestReached);

  return (
    <div style={styles.viewWrap}>
      <div style={styles.sectionTitle}>evolution path</div>
      <div style={styles.hint}>focus, grow, evolve. each stage unlocks at a milestone.</div>

      <div style={styles.evoList}>
        {STAGES.map((s, i) => {
          const unlocked = i <= reachedIndex;
          const isCurrent = s.id === currentStage.id;
          const previewState = STATES.happy;

          return (
            <div
              key={s.id}
              style={{
                ...styles.evoCard,
                opacity: unlocked ? 1 : 0.4,
                border: isCurrent ? "2px solid #000" : "1px solid rgba(0,0,0,0.1)",
                background: isCurrent ? "#fff" : "#f5f1e3",
              }}
            >
              <div style={styles.evoCardLeft}>
                {unlocked ? (
                  <PetBlob petState={previewState} stage={s} bounce={false} size={80} />
                ) : (
                  <div style={styles.evoLocked}>?</div>
                )}
              </div>
              <div style={styles.evoCardRight}>
                <div style={styles.evoCardName}>
                  {s.name}
                  {isCurrent && <span style={styles.evoCurrentTag}>current</span>}
                </div>
                <div style={styles.evoCardLevel}>
                  lv {s.minLevel}{s.maxLevel < 999 ? `–${s.maxLevel}` : "+"}
                </div>
                <div style={styles.evoCardBlurb}>
                  {unlocked ? `"${s.blurb}"` : "locked. keep going."}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SimView({ onDoom, onFocus, onRest, onStreak, onReset }) {
  return (
    <div style={styles.viewWrap}>
      <div style={styles.sectionTitle}>simulator</div>
      <div style={styles.hint}>
        in production, iOS Screen Time triggers these. here you trigger them
        manually to see how your pet & xp respond.
      </div>

      <div style={styles.simSection}>
        <div style={styles.simLabel}>simulate doomscroll (drains energy, no xp loss)</div>
        <div style={styles.simRow}>
          <button style={styles.simBtnDoom} onClick={() => onDoom(5)}>5m scroll</button>
          <button style={styles.simBtnDoom} onClick={() => onDoom(20)}>20m scroll</button>
          <button style={styles.simBtnDoom} onClick={() => onDoom(60)}>1hr binge</button>
        </div>
      </div>

      <div style={styles.simSection}>
        <div style={styles.simLabel}>simulate focus (gains xp + energy)</div>
        <div style={styles.simRow}>
          <button style={styles.simBtnFocus} onClick={() => onFocus(15)}>15m (+15 xp)</button>
          <button style={styles.simBtnFocus} onClick={() => onFocus(45)}>45m (+63 xp)</button>
          <button style={styles.simBtnFocus} onClick={() => onFocus(90)}>90m (+162 xp)</button>
        </div>
      </div>

      <div style={styles.simSection}>
        <div style={styles.simLabel}>other</div>
        <div style={styles.simRow}>
          <button style={styles.simBtnNeutral} onClick={onRest}>rest (+15 energy)</button>
          <button style={styles.simBtnNeutral} onClick={onStreak}>+1 streak (+20 xp)</button>
        </div>
      </div>

      <div style={styles.simSection}>
        <div style={styles.simLabel}>quick test (skip ahead)</div>
        <div style={styles.simRow}>
          <button
            style={styles.simBtnFocus}
            onClick={() => { for (let i = 0; i < 5; i++) onFocus(90); }}
          >
            +810 xp burst (test evolution)
          </button>
        </div>
      </div>

      <button style={styles.btnDanger} onClick={onReset}>reset pet</button>
    </div>
  );
}

function StatsView({ state, level, stage }) {
  return (
    <div style={styles.viewWrap}>
      <div style={styles.sectionTitle}>stats</div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>level</div>
        <div style={styles.statCardValue}>{level}</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>stage</div>
        <div style={styles.statCardValue}>{stage.name}</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>total xp</div>
        <div style={styles.statCardValue}>{state.totalXp}</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>focus sessions</div>
        <div style={styles.statCardValue}>{state.totalFocusSessions}</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>focus today</div>
        <div style={styles.statCardValue}>{state.focusMinutes}m</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>doomscroll today</div>
        <div style={styles.statCardValue}>{state.doomMinutes}m</div>
      </div>
      <div style={styles.statCard}>
        <div style={styles.statCardLabel}>streak</div>
        <div style={styles.statCardValue}>{state.streak}d</div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={styles.statBox}>
      <div style={styles.statValue}>{value}</div>
      <div style={styles.statLabel}>{label}</div>
    </div>
  );
}

function NavBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...styles.navBtn,
        opacity: active ? 1 : 0.4,
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

// ============================================================
// STYLES
// ============================================================
const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;1,9..144,400&family=JetBrains+Mono:wght@400;500&display=swap');
  
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #ebe6d8; }
  
  @keyframes breathe {
    0%, 100% { transform: scale(1) translateY(0); }
    50% { transform: scale(1.02) translateY(-2px); }
  }
  .blob-breathe { animation: breathe 3s ease-in-out infinite; transform-origin: center; }
  
  @keyframes pulse-glow {
    0%, 100% { opacity: 0.15; }
    50% { opacity: 0.25; }
  }
  .pulse-glow { animation: pulse-glow 2.5s ease-in-out infinite; }
  
  @keyframes sparkle-1 {
    0%, 100% { opacity: 0.3; }
    50% { opacity: 1; }
  }
  @keyframes sparkle-2 {
    0%, 100% { opacity: 0.8; }
    50% { opacity: 0.2; }
  }
  @keyframes sparkle-3 {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  .sparkle-1 { animation: sparkle-1 2s ease-in-out infinite; }
  .sparkle-2 { animation: sparkle-2 2.7s ease-in-out infinite; }
  .sparkle-3 { animation: sparkle-3 3.1s ease-in-out infinite; }
  
  @keyframes modal-in {
    0% { opacity: 0; transform: scale(0.85) translateY(20px); }
    100% { opacity: 1; transform: scale(1) translateY(0); }
  }
  
  button { font-family: inherit; cursor: pointer; border: none; }
  input { font-family: inherit; }
  button:active { transform: scale(0.97); }
`;

const styles = {
  app: {
    maxWidth: 440,
    margin: "0 auto",
    minHeight: "100vh",
    background: "#ebe6d8",
    fontFamily: "'Fraunces', Georgia, serif",
    color: "#1a1a1a",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  header: {
    padding: "20px 24px 12px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid rgba(0,0,0,0.06)",
  },
  logo: {
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: "-0.02em",
    fontStyle: "italic",
  },
  headerRight: { display: "flex", gap: 8, alignItems: "center" },
  levelBadge: {
    display: "flex",
    alignItems: "baseline",
    gap: 4,
    padding: "4px 10px",
    background: "#1a1a1a",
    borderRadius: 100,
    color: "#fff",
  },
  levelLabel: {
    fontSize: 9,
    fontFamily: "'JetBrains Mono', monospace",
    opacity: 0.7,
    letterSpacing: 1,
  },
  levelNum: {
    fontSize: 13,
    fontWeight: 600,
    fontFamily: "'JetBrains Mono', monospace",
  },
  energyBadge: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    background: "rgba(0,0,0,0.04)",
    borderRadius: 100,
  },
  energyDot: (color) => ({
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: color,
    boxShadow: `0 0 8px ${color}`,
  }),
  main: { flex: 1, overflowY: "auto", padding: "16px 0 100px" },
  viewWrap: {
    padding: "0 24px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
  },
  greeting: {
    fontSize: 17,
    textAlign: "center",
    lineHeight: 1.4,
    marginTop: 4,
    fontStyle: "italic",
  },
  petNameInline: {
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textUnderlineOffset: 4,
  },
  stageBadge: {
    padding: "4px 12px",
    background: "#1a1a1a",
    color: "#fff",
    borderRadius: 100,
  },
  stageBadgeText: {
    fontSize: 10,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: 1.5,
    fontWeight: 600,
  },
  petContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    margin: "4px 0",
  },
  xpBarWrap: { width: "100%" },
  xpBarLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    marginBottom: 6,
    opacity: 0.7,
  },
  xpBar: {
    width: "100%",
    height: 6,
    background: "rgba(0,0,0,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  xpBarFill: {
    height: "100%",
    background: "linear-gradient(90deg, #1a1a1a 0%, #4a4a4a 100%)",
    transition: "width 0.6s cubic-bezier(.34,1.56,.64,1)",
  },
  statsRow: { display: "flex", gap: 10, width: "100%", justifyContent: "space-between" },
  statBox: {
    flex: 1,
    background: "#fff",
    padding: "12px 10px",
    borderRadius: 14,
    textAlign: "center",
    boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
  },
  statValue: { fontSize: 20, fontWeight: 600, fontStyle: "italic" },
  statLabel: {
    fontSize: 10,
    opacity: 0.55,
    marginTop: 2,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "lowercase",
    letterSpacing: 0.5,
  },
  cardSoft: {
    width: "100%",
    background: "#f5f1e3",
    padding: 14,
    borderRadius: 14,
    border: "1px solid rgba(0,0,0,0.06)",
  },
  cardLabel: {
    fontSize: 10,
    opacity: 0.5,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 6,
  },
  cardText: { fontSize: 15, fontStyle: "italic", lineHeight: 1.4 },
  btnGhost: {
    background: "transparent",
    border: "1.5px dashed rgba(0,0,0,0.3)",
    padding: "12px 20px",
    borderRadius: 100,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
  },
  btnDanger: {
    background: "#1a1a1a",
    color: "#fff",
    padding: "14px 28px",
    borderRadius: 100,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 600,
    fontStyle: "italic",
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  timer: {
    fontSize: 64,
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
    letterSpacing: -2,
    margin: "8px 0",
  },
  progressBar: {
    width: "100%",
    height: 4,
    background: "rgba(0,0,0,0.08)",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "#1a1a1a",
    transition: "width 1s linear",
  },
  presetRow: { display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" },
  presetBtn: {
    background: "#fff",
    padding: "12px 16px",
    borderRadius: 16,
    fontSize: 16,
    fontWeight: 500,
    fontFamily: "'JetBrains Mono', monospace",
    border: "1.5px solid #1a1a1a",
    minWidth: 70,
  },
  hint: {
    fontSize: 13,
    opacity: 0.6,
    textAlign: "center",
    fontStyle: "italic",
    lineHeight: 1.5,
    maxWidth: 320,
  },
  chatWrap: {
    padding: "0 24px",
    display: "flex",
    flexDirection: "column",
    height: "calc(100vh - 200px)",
    gap: 12,
  },
  chatScroll: {
    flex: 1,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "8px 0",
  },
  bubble: {
    maxWidth: "75%",
    padding: "10px 14px",
    borderRadius: 18,
    fontSize: 15,
    lineHeight: 1.4,
  },
  chatInputRow: { display: "flex", gap: 8, paddingBottom: 8 },
  chatInput: {
    flex: 1,
    padding: "12px 16px",
    borderRadius: 100,
    border: "1.5px solid rgba(0,0,0,0.15)",
    fontSize: 15,
    background: "#fff",
    outline: "none",
  },
  sendBtn: {
    background: "#1a1a1a",
    color: "#fff",
    padding: "0 20px",
    borderRadius: 100,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
  },
  evoList: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  evoCard: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    display: "flex",
    gap: 12,
    alignItems: "center",
    transition: "all 0.3s",
  },
  evoCardLeft: {
    width: 80,
    height: 80,
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  evoCardRight: { flex: 1 },
  evoCardName: {
    fontSize: 18,
    fontWeight: 600,
    fontStyle: "italic",
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  evoCurrentTag: {
    fontSize: 9,
    background: "#1a1a1a",
    color: "#fff",
    padding: "2px 8px",
    borderRadius: 100,
    fontFamily: "'JetBrains Mono', monospace",
    fontStyle: "normal",
    letterSpacing: 1,
  },
  evoCardLevel: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    opacity: 0.6,
    marginTop: 2,
  },
  evoCardBlurb: {
    fontSize: 13,
    fontStyle: "italic",
    marginTop: 4,
    opacity: 0.8,
    lineHeight: 1.3,
  },
  evoLocked: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.06)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 24,
    opacity: 0.5,
  },
  simSection: { width: "100%", background: "#fff", padding: 14, borderRadius: 14 },
  simLabel: {
    fontSize: 10,
    opacity: 0.6,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  simRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  simBtnDoom: {
    background: "#f4d4c4",
    padding: "10px 14px",
    borderRadius: 100,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    border: "1px solid #c4886a",
  },
  simBtnFocus: {
    background: "#d4ecd4",
    padding: "10px 14px",
    borderRadius: 100,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    border: "1px solid #6aa86a",
  },
  simBtnNeutral: {
    background: "#f0ede5",
    padding: "10px 14px",
    borderRadius: 100,
    fontSize: 12,
    fontFamily: "'JetBrains Mono', monospace",
    border: "1px solid rgba(0,0,0,0.2)",
  },
  statCard: {
    width: "100%",
    background: "#fff",
    padding: 16,
    borderRadius: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statCardLabel: {
    fontSize: 12,
    opacity: 0.6,
    fontFamily: "'JetBrains Mono', monospace",
  },
  statCardValue: { fontSize: 24, fontWeight: 600, fontStyle: "italic" },
  nav: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    maxWidth: 440,
    margin: "0 auto",
    background: "rgba(235, 230, 216, 0.95)",
    backdropFilter: "blur(20px)",
    padding: "12px 8px 20px",
    display: "flex",
    justifyContent: "space-around",
    borderTop: "1px solid rgba(0,0,0,0.08)",
  },
  navBtn: {
    background: "transparent",
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    padding: "8px 6px",
    color: "#1a1a1a",
    textTransform: "lowercase",
    letterSpacing: 0.5,
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    backdropFilter: "blur(8px)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    animation: "modal-in 0.4s cubic-bezier(.34,1.56,.64,1)",
  },
  modalContent: {
    background: "#ebe6d8",
    padding: "32px 28px",
    borderRadius: 24,
    maxWidth: 340,
    width: "85%",
    textAlign: "center",
    border: "2px solid #1a1a1a",
    animation: "modal-in 0.5s cubic-bezier(.34,1.56,.64,1)",
  },
  modalSparkles: {
    fontSize: 24,
    letterSpacing: 6,
    marginBottom: 4,
    color: "#d4a800",
  },
  modalLabel: {
    fontSize: 11,
    fontFamily: "'JetBrains Mono', monospace",
    textTransform: "uppercase",
    letterSpacing: 3,
    opacity: 0.6,
    marginBottom: 4,
  },
  modalLevel: {
    fontSize: 36,
    fontWeight: 600,
    fontStyle: "italic",
    marginBottom: 8,
  },
  modalEvolution: { margin: "8px 0" },
  modalStageName: {
    fontSize: 22,
    fontWeight: 600,
    fontStyle: "italic",
    marginTop: 4,
  },
  modalStageBlurb: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
    marginTop: 4,
    marginBottom: 16,
  },
  modalBtn: {
    background: "#1a1a1a",
    color: "#fff",
    padding: "12px 32px",
    borderRadius: 100,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 8,
  },
  modalBtnGhost: {
    background: "transparent",
    color: "#1a1a1a",
    padding: "12px 24px",
    borderRadius: 100,
    fontSize: 14,
    fontFamily: "'JetBrains Mono', monospace",
    marginTop: 8,
    border: "1.5px solid rgba(0,0,0,0.2)",
  },
};