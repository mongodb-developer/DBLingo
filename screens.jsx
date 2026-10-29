/* DBLingo — screens: Home (world map), Level, Leaderboard. */

const { useState: u_s, useEffect: u_e, useRef: u_r, useMemo: u_m, useCallback: u_c } = React;

/* ============================================================
 * Landing / assignment setup
 * ============================================================ */
const COMPARISON_PACK_IDS = ['postgres'];

function LandingScreen({ profile, packs, onStart, event }) {
  const allPacks = Object.values(packs || {});
  const generalPack = packs.general;
  const comparisonPacks = allPacks.filter(pack => COMPARISON_PACK_IDS.includes(pack.id));
  const industryPacks = allPacks.filter(pack => pack.id !== 'general' && !COMPARISON_PACK_IDS.includes(pack.id));

  const initialPathType = profile?.pathType || 'general';
  const [draft, setDraft] = u_s({
    learnerName: profile?.learnerName || '',
    company: profile?.company || '',
    pathType: initialPathType,
    selectedPackId: profile?.selectedPackId || 'general'
  });

  // An event invite may pin everyone to one assignment so scores are comparable.
  const lockedPackId = event && event.pack && packs[event.pack] ? event.pack : null;
  u_e(() => {
    if (!lockedPackId) return;
    const pathType = lockedPackId === 'general' ? 'general' : (COMPARISON_PACK_IDS.includes(lockedPackId) ? 'comparison' : 'industry');
    setDraft(prev => ({ ...prev, pathType, selectedPackId: lockedPackId }));
  }, [lockedPackId]);

  function selectPath(pathType) {
    if (lockedPackId) return;
    const selectedPackId = pathType === 'general'
      ? 'general'
      : pathType === 'industry'
        ? (industryPacks[0]?.id || 'general')
        : (comparisonPacks[0]?.id || 'postgres');
    setDraft(prev => ({ ...prev, pathType, selectedPackId }));
  }

  const canStart = draft.learnerName.trim() && draft.company.trim() && draft.selectedPackId;
  const selectedPack = packs[draft.selectedPackId] || generalPack;

  return (
    <div className="ml-landing">
      <section className="ml-landing__hero">
        <div className="ml-landing__eyebrow">{event ? 'Event invite' : 'DBLingo assignment'}</div>
        <h1>Choose the learning path that fits the conversation.</h1>
        <p>
          Start with MongoDB foundations, tailor the exercise path to an industry,
          or compare MongoDB against another technology.
        </p>
      </section>

      {event && (
        <div className="ml-event-banner" role="status">
          <Icon name="Person" size={16} color="var(--lg-spring)" />
          <div>
            <strong>You're joining {event.name}</strong>
            <span>
              Your XP will rank on this event's leaderboard.
              {lockedPackId && <> Everyone plays the <b>{packs[lockedPackId].name}</b> assignment.</>}
              {event.status === 'upcoming' && event.startsAt && <> Scoring starts {new Date(event.startsAt).toLocaleString()}.</>}
            </span>
          </div>
        </div>
      )}

      <section className="ml-landing__panel" data-locked={!!lockedPackId}>
        <div className="ml-form-grid">
          <label className="ml-field">
            <span>Your name</span>
            <input
              value={draft.learnerName}
              placeholder="Ada Lovelace"
              onChange={(e) => setDraft(prev => ({ ...prev, learnerName: e.target.value }))}
            />
          </label>
          <label className="ml-field">
            <span>Company</span>
            <input
              value={draft.company}
              placeholder="Example Corp"
              onChange={(e) => setDraft(prev => ({ ...prev, company: e.target.value }))}
            />
          </label>
        </div>

        {!lockedPackId && <div className="ml-path-grid" role="radiogroup" aria-label="Assignment path">
          <PathCard
            selected={draft.pathType === 'general'}
            title="General"
            badge="Foundations"
            description="Learn MongoDB documents, queries, aggregation, indexing, and Atlas capabilities."
            onClick={() => selectPath('general')}
          />
          <PathCard
            selected={draft.pathType === 'industry'}
            title="Industry specific"
            badge="Domain examples"
            description="Use examples and AHA moments tailored to an industry conversation."
            onClick={() => selectPath('industry')}
          >
            <select
              value={draft.pathType === 'industry' ? draft.selectedPackId : (industryPacks[0]?.id || '')}
              onChange={(e) => setDraft(prev => ({ ...prev, pathType: 'industry', selectedPackId: e.target.value }))}
              onClick={(e) => e.stopPropagation()}
            >
              {industryPacks.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
            </select>
          </PathCard>
          <PathCard
            selected={draft.pathType === 'comparison'}
            title="Technology comparison"
            badge="Value prop"
            description="Explore where MongoDB shines compared with another technology."
            onClick={() => selectPath('comparison')}
          >
            <select
              value={draft.pathType === 'comparison' ? draft.selectedPackId : (comparisonPacks[0]?.id || '')}
              onChange={(e) => setDraft(prev => ({ ...prev, pathType: 'comparison', selectedPackId: e.target.value }))}
              onClick={(e) => e.stopPropagation()}
            >
              {comparisonPacks.map(pack => <option key={pack.id} value={pack.id}>{pack.name}</option>)}
            </select>
          </PathCard>
        </div>}

        <div className="ml-assignment-summary">
          <div>
            <div className="ml-pane__label">{lockedPackId ? 'Event assignment' : 'Selected assignment'}</div>
            <strong>{selectedPack?.name || 'General MongoDB Foundations'}</strong>
            <p>{selectedPack?.description || selectedPack?.promise}</p>
          </div>
          <button
            className="ml-btn ml-btn--primary ml-btn--lg"
            disabled={!canStart}
            onClick={() => onStart({ ...draft, learnerName: draft.learnerName.trim(), company: draft.company.trim() })}
          >
            {event ? 'Join event' : 'Start Assignment'} <Icon name="ChevronRight" size={13} color="currentColor" />
          </button>
        </div>
      </section>
    </div>
  );
}

function PathCard({ selected, title, badge, description, children, onClick }) {
  return (
    <div
      className="ml-path-card"
      data-selected={selected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick && onClick();
        }
      }}
      role="radio"
      aria-checked={selected}
      tabIndex={0}
    >
      <span className="ml-path-card__check">{selected ? '✓' : ''}</span>
      <span className="ml-path-card__badge">{badge}</span>
      <strong>{title}</strong>
      <span>{description}</span>
      {children && <div className="ml-path-card__control">{children}</div>}
    </div>
  );
}

/* ============================================================
 * Home / world map
 * ============================================================ */
function HomeScreen({ progress, setView, totalXp, debugUnlockAll = false, industryId, setIndustryId, profile, onChangeAssignment, onShowSkillBadges, onLeaveEvent }) {
  const industries = window.DBLINGO_INDUSTRIES || {};
  const currentPack = industries[industryId] || industries.general || {};
  return (
    <div className="ml-home">
      <div className="ml-hero">
        <h1>
          From documents to vector search.<br/>
          <span className="accent">One micro-challenge at a time.</span>
        </h1>
        <p>
          Welcome back, {profile?.learnerName || 'Ada'}. Pick up where you left off — or jump ahead if
          you're feeling brave. Each level is a 2-minute drag, drop, or fill-the-blank.
        </p>
        {profile?.onboardingComplete && (
          <div className="ml-assignment-chip">
            <div>
              <span>Assignment</span>
              <strong>{currentPack.name}</strong>
              <small>{profile.learnerName} · {profile.company}</small>
            </div>
            {onChangeAssignment && <button className="ml-btn ml-btn--ghost ml-btn--sm" onClick={onChangeAssignment}>Change path</button>}
          </div>
        )}
        {profile?.onboardingComplete && profile.eventId && (
          <div className="ml-assignment-chip ml-assignment-chip--event">
            <div>
              <span>Event</span>
              <strong>{profile.eventName || profile.eventId}</strong>
              <small>XP you earn counts on the event leaderboard</small>
            </div>
            <button className="ml-btn ml-btn--primary ml-btn--sm" onClick={() => setView({ name: 'leaderboard' })}>Standings</button>
            {onLeaveEvent && <button className="ml-btn ml-btn--ghost ml-btn--sm" onClick={onLeaveEvent}>Leave</button>}
          </div>
        )}
      </div>

      <div className="ml-trail">
        {/* SVG snaking background line — single path under all nodes. */}
        <TrailBackline />

        {window.WORLDS.map((w, wi) => {
          const prevDone = wi === 0 || isWorldDone(window.WORLDS[wi - 1], progress);
          const worldLocked = !debugUnlockAll && !prevDone;
          const cleared = w.levels.filter(l => progress[`${w.id}:${l.id}`]?.done).length;
          const challengeUnlocked = debugUnlockAll || (!worldLocked && cleared === w.levels.length);
          const leaves = w.levels.reduce((a, l) => a + (progress[`${w.id}:${l.id}`]?.leaf ? 1 : 0), 0);
          const hasSkillBadges = !!(window.WORLD_SKILL_BADGES && window.WORLD_SKILL_BADGES[w.id]?.length);
          const showBadgesLink = onShowSkillBadges && hasSkillBadges && cleared === w.levels.length;

          return (
            <React.Fragment key={w.id}>
              <div className="ml-trail-banner" data-locked={worldLocked}
                   style={{ '--world-tint': w.tint, '--world-tint-solid': w.tintSolid }}>
                <div className="ml-trail-banner__badge">World {wi + 1}{worldLocked && ' · locked'}</div>
                <h2 className="ml-trail-banner__title">{w.name}</h2>
                <p className="ml-trail-banner__desc">{w.blurb}</p>
                <div className="ml-trail-banner__progress">
                  <div className="ml-trail-banner__bar">
                    <div style={{ width: `${(cleared/w.levels.length)*100}%` }} />
                  </div>
                  <span>{cleared}/{w.levels.length} levels · {leaves} 🌿</span>
                </div>
                {showBadgesLink && (
                  <button className="ml-trail-banner__badges" onClick={() => onShowSkillBadges(w.id)}>
                    ✦ Skill Badges for this world
                  </button>
                )}
              </div>

              {w.levels.map((l, li) => {
                const key = `${w.id}:${l.id}`;
                const status = progress[key]?.done ? 'done'
                             : (debugUnlockAll || (!worldLocked && isLevelUnlocked(w, li, progress))) ? 'current'
                             : 'locked';
                return (
                  <TrailNode
                    key={l.id}
                    side={trailSide(wi, li)}
                    status={status}
                    sub={`L${li + 1} · ${l.kind}`}
                    title={l.title}
                    leaf={progress[key]?.leaf}
                    onClick={() => status !== 'locked' && setView({ name: 'level', worldId: w.id, levelId: l.id })}
                  />
                );
              })}

              <TrailNode
                special
                side={trailSide(wi, w.levels.length)}
                status={progress[`challenge:${w.id}`]?.done ? 'done'
                       : challengeUnlocked ? 'current' : 'locked'}
                sub="CHALLENGE · TIMED"
                title={w.tagline}
                meta={progress[`challenge:${w.id}`]?.done
                  ? `score ${progress[`challenge:${w.id}`].score}`
                  : '+200 XP · 90s'}
                onClick={() => challengeUnlocked && setView({ name: 'challenge', worldId: w.id })}
              />
            </React.Fragment>
          );
        })}

        <div className="ml-trail-end">
          <LeafIcon size={28} color="var(--lg-spring)" />
          <span>You did it. From here, the real Atlas console awaits.</span>
        </div>
      </div>
    </div>
  );
}

/* Position the snake — alternates with smoother sine-ish swing.
   Side is "left", "center", or "right". */
function trailSide(worldIdx, levelIdx) {
  // pattern repeats every 4 nodes per world, reset per world so each
  // world starts on the same side
  const pattern = ['center', 'right', 'far-right', 'right', 'center', 'left', 'far-left', 'left'];
  return pattern[levelIdx % pattern.length];
}

function TrailNode({ side, status, sub, title, leaf, meta, special, onClick }) {
  return (
    <div className={`ml-trail-row ml-trail-row--${side}`}>
      <button
        className={`ml-trail-node${special ? ' is-special' : ''}`}
        data-status={status}
        data-perfect={status === 'done' && !!leaf}
        disabled={status === 'locked'}
        onClick={onClick}
        aria-label={`${sub}: ${title}${status === 'locked' ? ' (locked)' : ''}`}
      >
        {status === 'done' && (
          <>
            <Icon name="Checkmark" size={32} color="var(--lg-black)" />
            {leaf && (
              <span className="ml-trail-node__leaf-badge" title="Perfect run">
                <LeafIcon size={13} color="var(--lg-black)" />
              </span>
            )}
          </>
        )}
        {status === 'current' && (
          special
            ? <Icon name="Sparkle" size={28} color="var(--lg-black)" />
            : <span className="ml-trail-node__play">▶</span>
        )}
        {status === 'locked' && <Icon name="Lock" size={24} color="currentColor" />}
        {status === 'current' && <span className="ml-trail-node__pulse" />}
      </button>
      <div className="ml-trail-label">
        <div className="ml-trail-label__sub">{sub}</div>
        <div className="ml-trail-label__title">{title}</div>
        {meta && <div className="ml-trail-label__meta">{meta}</div>}
      </div>
    </div>
  );
}

/* A single snaking SVG path drawn under the column. Decorative only. */
function TrailBackline() {
  // Positions match the .ml-trail-row--<side> offsets; this is a vertical
  // dashed wave that lives behind the nodes.
  return (
    <svg className="ml-trail-back" aria-hidden="true" preserveAspectRatio="none" viewBox="0 0 200 1000">
      <path
        d="M 100 0
           C 160 80, 180 120, 100 200
           S 20 320, 100 400
           S 180 520, 100 600
           S 20 720, 100 800
           S 180 920, 100 1000"
        fill="none"
        stroke="rgba(0,237,100,0.18)"
        strokeWidth="2"
        strokeDasharray="6 8"
      />
    </svg>
  );
}

function isLevelUnlocked(world, levelIdx, progress) {
  if (levelIdx === 0) return true;
  const prev = world.levels[levelIdx - 1];
  return progress[`${world.id}:${prev.id}`]?.done;
}
function isWorldDone(world, progress) {
  return world.levels.every(l => progress[`${world.id}:${l.id}`]?.done);
}

/* ============================================================
 * Level screen — split pane.
 * ============================================================ */
function LevelScreen({ worldId, levelId, setView, onComplete, onMistake, progress }) {
  const world = window.WORLDS.find(w => w.id === worldId);
  const levelIdx = world.levels.findIndex(l => l.id === levelId);
  const level = world.levels[levelIdx];

  const [exState, setExState] = u_s({});       // ready/check/reset/userState from the active exercise
  const [hintsUsed, setHintsUsed] = u_s(0);
  const [mistakes, setMistakes] = u_s(0);
  const [resultBanner, setResultBanner] = u_s(null);
  const previewState = resultBanner?.correct && exState.levelId === level.id ? exState.userState : null;
  const handleExerciseState = u_c((state) => {
    setExState({ ...state, levelId: level.id });
  }, [level.id]);

  function handleResult({ correct, perfect }) {
    setResultBanner({ correct, perfect });
    if (!correct) {
      setMistakes(m => m + 1);
      onMistake && onMistake();
    }
  }

  function handleNext() {
    if (resultBanner?.correct) {
      onComplete({
        worldId, levelId,
        xp: level.kind === 'reorder' ? 30 : 25,
        leaf: !!resultBanner.perfect && hintsUsed === 0,
        clean: mistakes === 0
      });
      const nextIdx = levelIdx + 1;
      if (nextIdx < world.levels.length) {
        setView({ name: 'level', worldId, levelId: world.levels[nextIdx].id });
      } else {
        setView({ name: 'home' });
      }
    }
  }

  // Reset per-level state when level changes
  u_e(() => { setExState({}); setHintsUsed(0); setMistakes(0); setResultBanner(null); }, [worldId, levelId]);

  // On a correct answer, bring the Continue button and the result pane into view
  // (on phones the preview stacks below the actions) and move focus to Continue.
  const actionsRef = u_r(null);
  const continueRef = u_r(null);
  const previewRef = u_r(null);
  const isCorrect = !!resultBanner?.correct;
  u_e(() => {
    if (!isCorrect) return;
    const raf = requestAnimationFrame(() => revealResult({
      actions: actionsRef.current,
      button: continueRef.current,
      preview: previewRef.current
    }));
    return () => cancelAnimationFrame(raf);
  }, [isCorrect, levelId]);

  // Progress: levels in world cleared
  const cleared = world.levels.filter(l => progress[`${world.id}:${l.id}`]?.done).length;
  const progressPct = ((levelIdx + (resultBanner?.correct ? 1 : 0)) / world.levels.length) * 100;
  const levelHints = getLevelHints(level);
  const levelDocs = level.docs || (window.LEVEL_DOCS && window.LEVEL_DOCS[level.id]) || [];
  const revealedHints = levelHints.slice(0, hintsUsed);
  const hasMoreHints = hintsUsed < levelHints.length;

  let ExerciseComp;
  switch (level.kind) {
    case 'shape':   ExerciseComp = ShapeExercise;   break;
    case 'blocks':  ExerciseComp = BlocksExercise;  break;
    case 'fill':    ExerciseComp = FillExercise;    break;
    case 'reorder': ExerciseComp = ReorderExercise; break;
    case 'index':   ExerciseComp = IndexExercise;   break;
    default: ExerciseComp = () => <div>Unsupported.</div>;
  }

  return (
    <div className="ml-level-screen">
      <div className="ml-level__head">
        <div className="ml-level__crumb">
          <span style={{ color: world.tintSolid }}>●</span>
          <b>{world.name}</b>
          <span style={{ color: 'var(--ml-text-faint)', margin: '0 4px' }}>·</span>
          <span>Level {levelIdx + 1} / {world.levels.length}</span>
        </div>
        <div className="ml-level__progress" aria-label="world progress">
          <div style={{ width: progressPct + '%' }} />
        </div>
        <button
          className="ml-level__close"
          aria-label="Close level"
          onClick={() => setView({ name: 'home' })}
        ><Icon name="X" size={14} color="currentColor" /></button>
      </div>

      <div className="ml-level">
        <div className="ml-pane">
          <div className="ml-pane__label">L{levelIdx + 1} · {level.kind}</div>
          <h2 className="ml-prompt">{level.title}</h2>
          <p className="ml-prompt-sub"><ConceptBody text={level.prompt} /></p>
          {level.sub && (
            <p style={{ color: 'var(--ml-text-faint)', fontSize: 12.5, marginTop: -10, marginBottom: 18 }}>
              {level.sub}
            </p>
          )}

          <ExerciseComp
            key={level.id}
            level={level}
            onResult={handleResult}
            onState={handleExerciseState}
          />

          <ConceptCard>
            <ConceptBody text={level.why} />
            {levelDocs.length > 0 && (
              <div className="ml-concept__docs">
                <span>Learn more:</span>
                {levelDocs.map(d => (
                  <a key={d.url + d.label} href={d.url} target="_blank" rel="noopener noreferrer">{d.label} ↗</a>
                ))}
              </div>
            )}
          </ConceptCard>

          {/* AHA moment — revealed after correct answer */}
          {resultBanner?.correct && level.aha && (
            <div className="ml-aha-moment">
              <div className="ml-aha-moment__icon">💡</div>
              <div className="ml-aha-moment__content">
                <div className="ml-aha-moment__title">{level.aha.title}</div>
                <div className="ml-aha-moment__message">{level.aha.message}</div>
              </div>
            </div>
          )}

          {revealedHints.length > 0 && (
            <div className="ml-hint-card" aria-live="polite">
              <div className="ml-hint-card__icon">
                <Icon name="Bulb" size={15} color="var(--lg-spring)" />
              </div>
              <div className="ml-hint-card__body">
                <div className="ml-hint-card__title">Hint {revealedHints.length} of {levelHints.length}</div>
                <ol>
                  {revealedHints.map((hint, idx) => <li key={idx}>{hint}</li>)}
                </ol>
              </div>
            </div>
          )}

          <div className="ml-actions" ref={actionsRef}>
            <div className="ml-actions__left">
              <button
                className="ml-btn ml-btn--ghost"
                onClick={() => exState.reset && exState.reset()}
              >
                <Icon name="Refresh" size={13} color="currentColor" /> Reset
              </button>
              <button
                className="ml-btn ml-btn--ghost"
                onClick={() => hasMoreHints && setHintsUsed(h => Math.min(h + 1, levelHints.length))}
                disabled={!hasMoreHints}
                title={hasMoreHints ? 'Reveal the next hint' : 'All hints shown'}
              >
                <Icon name="Bulb" size={13} color="currentColor" /> {hasMoreHints ? `Hint (${hintsUsed}/${levelHints.length})` : 'All hints shown'}
              </button>
            </div>
            <div className="ml-actions__right">
              {resultBanner?.correct ? (
                <button ref={continueRef} className="ml-btn ml-btn--primary ml-btn--lg ml-btn--continue" onClick={handleNext}>
                  Continue <Icon name="ChevronRight" size={13} color="currentColor" />
                </button>
              ) : (
                <button
                  className="ml-btn ml-btn--primary ml-btn--lg"
                  disabled={!exState.ready}
                  onClick={() => exState.check && exState.check()}
                >
                  Check answer
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="ml-pane ml-pane--preview" ref={previewRef} data-revealed={isCorrect}>
          <div className="ml-pane__label">Live preview</div>
          <div className="ml-preview">
            <div className="ml-preview__title">db.{guessCollection(level)} · result</div>
            <div className="ml-preview__body">
              <LevelPreview level={level} userState={previewState} resultState={resultBanner} />
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: 'var(--ml-text-faint)' }}>
              <span style={{
                display: 'inline-block', width: 6, height: 6, borderRadius: 50,
                background: 'var(--lg-spring)', boxShadow: '0 0 6px var(--lg-spring)'
              }}/>
              Connected to DBLingo sandbox · cluster atlas-free-tier
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Scroll the result area + Continue into view after a correct answer, then
 * focus Continue. On a stacked (mobile) layout the actions row is aligned to
 * the top under the sticky topbar so the preview below is visible too; on the
 * side-by-side layout we only scroll if the button is off-screen. */
function revealResult({ actions, button, preview }) {
  if (!actions) return;
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reduceMotion ? 'auto' : 'smooth';
  const topbar = document.querySelector('.ml-topbar');
  const topOffset = (topbar ? topbar.getBoundingClientRect().height : 0) + 12;
  const rect = actions.getBoundingClientRect();
  const stacked = !!(preview && preview.getBoundingClientRect().top >= rect.bottom - 1);
  const offscreen = rect.top < topOffset || rect.bottom > window.innerHeight - 12;

  if (stacked || offscreen) {
    const target = stacked
      ? rect.top + window.scrollY - topOffset
      : rect.bottom + window.scrollY - window.innerHeight + 24;
    window.scrollTo({ top: Math.max(0, target), behavior });
  }
  if (button) {
    try { button.focus({ preventScroll: true }); } catch (e) { button.focus(); }
  }
}

function getLevelHints(level) {
  const sharedHints = (window.LEVEL_HINTS && window.LEVEL_HINTS[level.id]) || [];
  const levelHints = Array.isArray(level.hints) ? level.hints : [];
  const hints = levelHints.length ? levelHints : sharedHints;
  if (hints.length) return hints.slice(0, 2);
  return fallbackLevelHints(level).slice(0, 2);
}

function fallbackLevelHints(level) {
  switch (level.kind) {
    case 'shape':
      return ['Match the field values to the expected JSON/BSON types.', 'Quoted values are strings; unquoted true/false and numbers keep their native types.'];
    case 'blocks':
      return ['Fill the collection and operation first, then the values.', 'MongoDB operators and stages usually start with $.'];
    case 'fill':
      return ['Choose the operator before filling values.', 'Look at the prompt wording: it usually names the field or operation you need.'];
    case 'reorder':
      return ['Read each stage description and order the data flow from filter to final shape.', 'Filtering early usually makes later stages cheaper.'];
    case 'index':
      return ['Match index type to access pattern, not just field name.', 'Compound indexes support multi-field filter/sort patterns.'];
    default:
      return ['Use the prompt and snippet structure to narrow the choices.', 'Eliminate distractors that are not valid MongoDB syntax.'];
  }
}

function guessCollection(level) {
  if (level.collection) return level.collection;
  const text = [
    ...(level.snippet || []).filter(p => typeof p === 'string'),
    ...(level.stages || []).map(s => s.code || ''),
    level.title || '',
    level.prompt || ''
  ].join('\n');
  const direct = text.match(/db\.(\w+)/);
  if (direct) return direct[1];
  const lookup = text.match(/from:\s*["'](\w+)["']/);
  if (lookup) return lookup[1];
  if (/customer|shopper|patient|member|subscriber|player|profile/i.test(text)) return 'customers';
  if (/product|catalog|sku|item|inventory|cart/i.test(text)) return 'products';
  if (/order|claim|transaction|payment/i.test(text)) return 'orders';
  if (/session/i.test(text)) return 'sessions';
  if (/event|alert|log|experiment/i.test(text)) return 'events';
  if (/doc|post|note|article|content|chunk|rag/i.test(text)) return 'docs';
  return 'sandbox';
}

/* ============================================================
 * Timed challenge — uses the world's levels as questions,
 * with a clock, no hints, and a time penalty per mistake.
 * ============================================================ */
function ChallengeScreen({ worldId, setView, onChallengeWin }) {
  const world = window.WORLDS.find(w => w.id === worldId);
  const [phase, setPhase]   = u_s('intro');   // intro · running · won · lost
  const [qIdx, setQIdx]     = u_s(0);
  const [secs, setSecs]     = u_s(90);
  const [score, setScore]   = u_s(0);
  const [exState, setExState] = u_s({});
  const [shake, setShake]   = u_s(false);

  // Cap at 4 questions, randomized order each session
  const order = u_m(() => {
    const arr = [...world.levels];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr.slice(0, Math.min(4, arr.length));
  }, [worldId, phase === 'intro']);
  const current = order[qIdx];
  const handleExerciseState = u_c((state) => {
    setExState({ ...state, levelId: current?.id });
  }, [current?.id]);

  // Timer
  u_e(() => {
    if (phase !== 'running') return;
    if (secs <= 0) { setPhase('lost'); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, phase]);

  // Auto-advance when current exercise resolves
  function handleResult({ correct }) {
    if (correct) {
      setScore(s => s + 60);
      setTimeout(() => {
        if (qIdx + 1 < order.length) {
          setQIdx(i => i + 1);
          setExState({});
        } else {
          setPhase('won');
          onChallengeWin && onChallengeWin({ worldId, score: score + 60 + secs * 4 });
        }
      }, 550);
    } else {
      setSecs(s => Math.max(0, s - 10));
      setShake(true);
      setTimeout(() => setShake(false), 280);
    }
  }

  let ExerciseComp = null;
  if (current) {
    switch (current.kind) {
      case 'shape':   ExerciseComp = ShapeExercise;   break;
      case 'blocks':  ExerciseComp = BlocksExercise;  break;
      case 'fill':    ExerciseComp = FillExercise;    break;
      case 'reorder': ExerciseComp = ReorderExercise; break;
      case 'index':   ExerciseComp = IndexExercise;   break;
    }
  }

  /* ---------- intro ---------- */
  if (phase === 'intro') {
    return (
      <div className="ml-challenge-card">
        <div className="ml-challenge-card__icon">
          <Icon name="Sparkle" size={36} color="var(--lg-yellow-base)" />
        </div>
        <div className="ml-challenge-card__badge">CHALLENGE · TIMED</div>
        <h2>{world.name}</h2>
        <p>Four random questions from this world. <b>90 seconds.</b> No hints, no resets.<br/>
        Mistakes cost <b>10 seconds</b>. Each correct answer: +60 points + time bonus.</p>
        <div className="ml-challenge-card__rules">
          <span>⏱ 90s</span>
          <span>· 4 questions</span>
          <span>· -10s per miss</span>
        </div>
        <div className="ml-row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="ml-btn ml-btn--ghost" onClick={() => setView({ name: 'home' })}>Back</button>
          <button className="ml-btn ml-btn--primary ml-btn--lg" onClick={() => setPhase('running')}>
            Start <Icon name="ChevronRight" size={13} color="currentColor" />
          </button>
        </div>
      </div>
    );
  }

  /* ---------- end states ---------- */
  if (phase === 'won' || phase === 'lost') {
    const finalScore = score + (phase === 'won' ? secs * 4 : 0);
    return (
      <div className="ml-challenge-card">
        <div className="ml-challenge-card__icon">
          {phase === 'won'
            ? <LeafIcon size={48} color="var(--lg-spring)" />
            : <Icon name="X" size={36} color="var(--lg-red-light2)" />}
        </div>
        <h2>{phase === 'won' ? 'Challenge complete!' : "Time's up"}</h2>
        <p>
          {phase === 'won'
            ? `${qIdx + 1} of ${order.length} correct · ${secs} seconds left on the clock.`
            : `You got ${qIdx} of ${order.length} before the clock ran out.`}
        </p>
        <div className="ml-challenge-card__score">
          <span className="num">{finalScore}</span> points
        </div>
        <div className="ml-row" style={{ justifyContent: 'center', marginTop: 14 }}>
          <button className="ml-btn ml-btn--ghost" onClick={() => setView({ name: 'home' })}>Back to map</button>
          <button className="ml-btn ml-btn--primary"
                  onClick={() => { setPhase('intro'); setQIdx(0); setSecs(90); setScore(0); setExState({}); }}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  /* ---------- running ---------- */
  if (!current || !ExerciseComp) return null;
  const timerLow = secs <= 15;

  return (
    <div className={'ml-challenge' + (shake ? ' is-shake' : '')}>
      <div className="ml-challenge__hud">
        <div className="ml-challenge__crumb">
          <span style={{ color: world.tintSolid }}>●</span>
          <b>{world.name}</b>
          <span style={{ color: 'var(--ml-text-faint)' }}>· timed</span>
        </div>
        <div className="ml-challenge__progress">
          {order.map((_, i) => (
            <span key={i} data-state={i < qIdx ? 'done' : i === qIdx ? 'active' : 'pending'} />
          ))}
        </div>
        <div className={'ml-challenge__timer' + (timerLow ? ' is-low' : '')}>
          <span className="num">{String(Math.floor(secs / 60)).padStart(2, '0')}:{String(secs % 60).padStart(2, '0')}</span>
        </div>
        <div className="ml-challenge__score">
          <span className="num">{score}</span><small>pts</small>
        </div>
        <button className="ml-level__close" aria-label="Abandon" onClick={() => setView({ name: 'home' })}>
          <Icon name="X" size={14} color="currentColor" />
        </button>
      </div>

      <div className="ml-pane">
        <div className="ml-pane__label">Q{qIdx + 1} · {current.kind}</div>
        <h2 className="ml-prompt">{current.title}</h2>
        <p className="ml-prompt-sub">{current.prompt}</p>

        <ExerciseComp
          key={current.id}
          level={current}
          onResult={handleResult}
          onState={handleExerciseState}
        />

        <div className="ml-actions">
          <div className="ml-actions__left">
            <span style={{ fontSize: 12, color: 'var(--ml-text-dim)' }}>
              No hints in challenge mode. Skip wastes seconds.
            </span>
          </div>
          <div className="ml-actions__right">
            <button className="ml-btn ml-btn--ghost"
                    onClick={() => {
                      setSecs(s => Math.max(0, s - 20));
                      if (qIdx + 1 < order.length) { setQIdx(i => i + 1); setExState({}); }
                      else setPhase('lost');
                    }}>
              Skip −20s
            </button>
            <button
              className="ml-btn ml-btn--primary"
              disabled={!exState.ready}
              onClick={() => exState.check && exState.check()}
            >
              Submit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
 * Leaderboard
 * ============================================================ */
const STUB_LEADERS = [
  { name: 'Grace H.',   xp: 4820, leaves: 18 },
  { name: 'Linus T.',   xp: 3702, leaves: 14 },
  { name: 'Edsger D.',  xp: 2901, leaves: 11 },
  { name: 'Donald K.',  xp: 2018, leaves: 9  }
];

/** Copy text with the async Clipboard API, falling back to execCommand. */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {}
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

/* The one shareable URL for an event, with copy / native-share buttons. */
function InviteLinkField({ eventId, eventName }) {
  const link = window.DBLingoAPI ? window.DBLingoAPI.getInviteLink(eventId) : '';
  const [copied, setCopied] = u_s(false);
  const inputRef = u_r(null);
  const canShare = typeof navigator !== 'undefined' && !!navigator.share;

  async function onCopy() {
    const ok = await copyText(link);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else if (inputRef.current) {
      inputRef.current.select();
    }
  }

  return (
    <div className="ml-invite-link">
      <input
        ref={inputRef}
        readOnly
        value={link}
        aria-label={`Invite link for ${eventName || eventId}`}
        onFocus={(e) => e.target.select()}
      />
      <button className="ml-btn ml-btn--primary" onClick={onCopy}>
        {copied ? 'Link copied ✓' : 'Copy link'}
      </button>
      {canShare && (
        <button
          className="ml-btn ml-btn--ghost"
          onClick={() => navigator.share({ title: `DBLingo · ${eventName || 'Event'}`, text: `Join me on the ${eventName || 'DBLingo'} leaderboard!`, url: link }).catch(() => {})}
        >Share…</button>
      )}
    </div>
  );
}

/* Shown instead of the leaderboard until the learner has entered their name
 * and company. No standings (real or demo) are rendered here — the learner is
 * prompted to identify themselves first, then lands on the live board. */
function LeaderboardGate({ profile, packs = {}, event, onSubmit, onChoosePath }) {
  const [open, setOpen] = u_s(true);
  const [draft, setDraft] = u_s({
    learnerName: profile?.learnerName || '',
    company: profile?.company || ''
  });
  const nameRef = u_r(null);

  u_e(() => {
    if (!open) return;
    nameRef.current && nameRef.current.focus();
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const canSubmit = !!(draft.learnerName.trim() && draft.company.trim());

  function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    // An event invite pins the assignment; otherwise keep the saved path.
    const packId = (event && event.pack && packs[event.pack])
      ? event.pack
      : (packs[profile?.selectedPackId] ? profile.selectedPackId : 'general');
    const pathType = packId === 'general'
      ? 'general'
      : (COMPARISON_PACK_IDS.includes(packId) ? 'comparison' : 'industry');
    onSubmit({
      learnerName: draft.learnerName.trim(),
      company: draft.company.trim(),
      selectedPackId: packId,
      pathType
    });
  }

  return (
    <div className="ml-leaderboard ml-lb-gate">
      <h2>Leaderboard</h2>
      <p>Standings are visible to registered learners.</p>
      <div className="ml-invite">
        <Icon name="Lock" size={20} color="var(--lg-spring)" style={{ display: 'block', margin: '0 auto 10px' }} />
        <h3>Add your name &amp; company to see the standings.</h3>
        <p>
          {event
            ? <>Join <b>{event.name}</b> and see how you rank against everyone else.</>
            : 'Your XP will be ranked alongside other DBLingo learners.'}
        </p>
        <button className="ml-btn ml-btn--primary" onClick={() => setOpen(true)}>
          <Icon name="Person" size={13} color="currentColor" /> Add my details
        </button>
      </div>

      {open && (
        <div className="ml-skill-badges" onClick={() => setOpen(false)} role="dialog" aria-modal="true" aria-labelledby="ml-lb-gate-title">
          <form className="ml-skill-badges__panel ml-lb-gate__panel" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <div className="ml-skill-badges__icon" aria-hidden="true">
              <Icon name="Person" size={24} color="var(--lg-spring)" />
            </div>
            <div className="ml-skill-badges__eyebrow">{event ? "YOU'RE INVITED" : 'JOIN THE LEADERBOARD'}</div>
            <h2 id="ml-lb-gate-title">Place your name on the board</h2>
            <p>
              {event
                ? <>Enter your details to compete on <b>{event.name}</b>.</>
                : 'Enter your name and company to see the standings and start ranking.'}
            </p>
            <div className="ml-form-grid">
              <label className="ml-field">
                <span>Your name</span>
                <input
                  ref={nameRef}
                  value={draft.learnerName}
                  placeholder="Ada Lovelace"
                  onChange={(e) => setDraft(prev => ({ ...prev, learnerName: e.target.value }))}
                />
              </label>
              <label className="ml-field">
                <span>Company</span>
                <input
                  value={draft.company}
                  placeholder="Example Corp"
                  onChange={(e) => setDraft(prev => ({ ...prev, company: e.target.value }))}
                />
              </label>
            </div>
            <div className="ml-event-actions">
              <button type="button" className="ml-btn ml-btn--ghost" onClick={() => setOpen(false)}>Not now</button>
              <button type="submit" className="ml-btn ml-btn--primary" disabled={!canSubmit}>See standings</button>
            </div>
            {onChoosePath && (
              <button type="button" className="ml-lb-gate__link" onClick={onChoosePath}>
                Choose a learning path instead
              </button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

function LeaderboardScreen({ totalXp, leaves, name = 'You', pack, eventId, eventName }) {
  const me = { name: 'You (' + name + ')', xp: totalXp, leaves, me: true };
  const stubBoard = [...STUB_LEADERS, me]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 5);

  // Live board from the backend (when configured); falls back to the stub
  // ONLY when no backend is configured. When the API is enabled we show a
  // loading state, then real data (or an empty/error state) — never the stub.
  const apiEnabled = !!(window.DBLingoAPI && window.DBLingoAPI.apiEnabled());
  const hasEvent = apiEnabled && !!eventId;
  const [scope, setScope] = u_s(hasEvent ? 'event' : 'global'); // event | global
  const showingEvent = hasEvent && scope === 'event';
  const [liveBoard, setLiveBoard] = u_s(null);
  const [status, setStatus] = u_s(apiEnabled ? 'loading' : 'stub'); // loading | ready | error | stub

  u_e(() => { if (!hasEvent) setScope('global'); }, [hasEvent]);

  u_e(() => {
    if (!apiEnabled) return;
    let cancelled = false;
    setStatus('loading');
    // Small delay lets the debounced score sync land before we read.
    const t = setTimeout(() => {
      window.DBLingoAPI
        .fetchLeaderboard(showingEvent ? { eventId, limit: 10 } : { pack, limit: 5 })
        .then((leaders) => {
          if (cancelled) return;
          if (!leaders) { setStatus('error'); return; }
          const myId = window.DBLingoAPI.getUserId();
          setLiveBoard(leaders.map((row) => ({
            name: row.name || 'Anonymous',
            xp: row.xp || 0,
            leaves: row.leaves || 0,
            me: row.userId === myId
          })));
          setStatus('ready');
        });
    }, 900);
    return () => { cancelled = true; clearTimeout(t); };
  }, [apiEnabled, pack, showingEvent, eventId, totalXp, leaves]);

  const board = status === 'stub' ? stubBoard : (liveBoard || []);
  const live = apiEnabled;

  return (
    <div className="ml-leaderboard">
      {hasEvent && (
        <div className="ml-lb-tabs" role="tablist" aria-label="Leaderboard scope">
          <button role="tab" aria-selected={scope === 'event'} onClick={() => setScope('event')}>
            {eventName || 'Event'}
          </button>
          <button role="tab" aria-selected={scope === 'global'} onClick={() => setScope('global')}>
            Global
          </button>
        </div>
      )}
      <h2>{showingEvent ? (eventName || 'Event leaderboard') : 'Weekly leaderboard'}</h2>
      <p>{showingEvent
        ? 'Event standings — ranked by XP earned since each player joined.'
        : live
          ? 'Top DBLingo learners — live from the leaderboard service.'
          : 'Top five DBLingo learners this week. Resets every Monday.'}</p>
      <div className="ml-lb-list">
        {status === 'loading' && (
          <div className="ml-lb-row ml-lb-row--status"><div className="ml-lb-name">Loading leaderboard…</div></div>
        )}
        {status === 'error' && (
          <div className="ml-lb-row ml-lb-row--status"><div className="ml-lb-name">Leaderboard unavailable. Try again later.</div></div>
        )}
        {(status === 'ready' || status === 'stub') && board.length === 0 && (
          <div className="ml-lb-row ml-lb-row--status"><div className="ml-lb-name">No scores yet — be the first!</div></div>
        )}
        {(status === 'ready' || status === 'stub') && board.map((row, i) => (
          <div key={(row.name || 'row') + i} className="ml-lb-row" data-rank={i + 1} data-me={!!row.me}>
            <div className="ml-lb-rank">#{i + 1}</div>
            <div className="ml-lb-name">{row.name}</div>
            <div className="ml-lb-leaves"><LeafIcon size={12} color="var(--lg-spring)" /> {row.leaves}</div>
            <div className="ml-lb-xp">{(row.xp || 0).toLocaleString()} XP</div>
          </div>
        ))}
      </div>
      {showingEvent ? (
        <div className="ml-invite">
          <h3>Invite people to {eventName || 'this event'}.</h3>
          <p>Everyone who opens this link plays on the same event leaderboard.</p>
          <InviteLinkField eventId={eventId} eventName={eventName} />
        </div>
      ) : (
        <div className="ml-invite">
          <h3>Climb faster with friends.</h3>
          <p>
            {hasEvent
              ? 'Switch to the event tab to grab your event\'s invite link.'
              : 'Running a workshop or meetup? Ask an organiser for an event invite link — everyone who opens it competes on a private leaderboard.'}
          </p>
          {hasEvent && (
            <button className="ml-btn ml-btn--primary" onClick={() => setScope('event')}>
              <Icon name="Person" size={13} color="currentColor" /> Invite to {eventName || 'event'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
 * Admin: create event leaderboards (open with ?admin)
 * Requires the backend ADMIN_KEY. The key is kept only in
 * sessionStorage for this tab and sent as a Bearer token.
 * ============================================================ */
const ADMIN_KEY_STORAGE = 'mongolingo.adminKey';
const EMPTY_EVENT_FORM = { name: '', eventId: '', pack: '', startsAt: '', endsAt: '' };

function AdminEventsScreen({ packs }) {
  const api = window.DBLingoAPI;
  const [adminKey, setAdminKey] = u_s(() => {
    try { return sessionStorage.getItem(ADMIN_KEY_STORAGE) || ''; } catch (e) { return ''; }
  });
  const [form, setForm] = u_s(EMPTY_EVENT_FORM);
  const [busy, setBusy] = u_s(false);
  const [error, setError] = u_s('');
  const [created, setCreated] = u_s(null);
  const [events, setEvents] = u_s(null);

  function rememberKey(value) {
    setAdminKey(value);
    try { sessionStorage.setItem(ADMIN_KEY_STORAGE, value); } catch (e) {}
  }

  async function refreshEvents() {
    if (!adminKey) return;
    const res = await api.listEvents(adminKey);
    if (res && !res.error) setEvents(res.events || []);
    else setError(res?.error || 'Could not load events');
  }

  // datetime-local gives local time without a zone; convert to ISO (UTC).
  const toIso = (v) => (v ? new Date(v).toISOString() : undefined);
  const setField = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  async function onCreate(e) {
    e.preventDefault();
    setBusy(true); setError(''); setCreated(null);
    const res = await api.createEvent(adminKey, {
      name: form.name.trim(),
      eventId: form.eventId.trim().toLowerCase(),
      pack: form.pack,
      startsAt: toIso(form.startsAt),
      endsAt: toIso(form.endsAt)
    });
    setBusy(false);
    if (!res || res.error) { setError(res?.error || 'Could not create event'); return; }
    setCreated(res.event);
    setForm(EMPTY_EVENT_FORM);
    if (events) refreshEvents();
  }

  if (!api || !api.apiEnabled()) {
    return (
      <div className="ml-leaderboard">
        <h2>Event admin</h2>
        <p>The backend isn't configured (window.DBLINGO_API_BASE), so events can't be created.</p>
      </div>
    );
  }

  return (
    <div className="ml-leaderboard ml-admin">
      <h2>Event leaderboards</h2>
      <p>Create an event, then share its invite link. Each event has exactly one link.</p>

      <form className="ml-landing__panel ml-admin__form" onSubmit={onCreate}>
        <label className="ml-field">
          <span>Admin key</span>
          <input type="password" autoComplete="off" value={adminKey}
                 placeholder="ADMIN_KEY from the backend"
                 onChange={(e) => rememberKey(e.target.value)} />
        </label>
        <div className="ml-form-grid">
          <label className="ml-field">
            <span>Event name *</span>
            <input required maxLength={80} value={form.name} placeholder="MongoDB.local NYC" onChange={setField('name')} />
          </label>
          <label className="ml-field">
            <span>Link slug (optional)</span>
            <input value={form.eventId} placeholder="auto, e.g. mdb-local-nyc"
                   pattern="[a-z0-9][a-z0-9\-]{2,47}"
                   title="3-48 chars: lowercase letters, digits and dashes"
                   onChange={setField('eventId')} />
          </label>
          <label className="ml-field">
            <span>Assignment (optional — locks everyone to one path)</span>
            <select value={form.pack} onChange={setField('pack')}>
              <option value="">Any — players choose</option>
              {Object.values(packs || {}).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <div />
          <label className="ml-field">
            <span>Starts (optional)</span>
            <input type="datetime-local" value={form.startsAt} onChange={setField('startsAt')} />
          </label>
          <label className="ml-field">
            <span>Ends (optional)</span>
            <input type="datetime-local" value={form.endsAt} onChange={setField('endsAt')} />
          </label>
        </div>
        {error && <div className="ml-admin__error" role="alert">{error}</div>}
        <div className="ml-event-actions">
          <button type="button" className="ml-btn ml-btn--ghost" disabled={!adminKey} onClick={() => { setError(''); refreshEvents(); }}>
            Show existing events
          </button>
          <button type="submit" className="ml-btn ml-btn--primary" disabled={busy || !adminKey || !form.name.trim()}>
            {busy ? 'Creating…' : 'Create event'}
          </button>
        </div>
      </form>

      {created && (
        <div className="ml-invite">
          <h3>"{created.name}" is ready.</h3>
          <p>Share this link — it's the single invite URL for this event.</p>
          <InviteLinkField eventId={created.eventId} eventName={created.name} />
        </div>
      )}

      {events && (
        <div className="ml-lb-list ml-admin__events">
          {events.length === 0 && (
            <div className="ml-lb-row ml-lb-row--status"><div className="ml-lb-name">No events yet.</div></div>
          )}
          {events.map(ev => (
            <div key={ev.eventId} className="ml-admin__event">
              <div>
                <strong>{ev.name}</strong>
                <small>{ev.status}{ev.pack ? ` · ${packs[ev.pack]?.name || ev.pack}` : ''}{ev.endsAt ? ` · ends ${new Date(ev.endsAt).toLocaleString()}` : ''}</small>
              </div>
              <InviteLinkField eventId={ev.eventId} eventName={ev.name} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

Object.assign(window, { LandingScreen, HomeScreen, LevelScreen, ChallengeScreen, LeaderboardScreen, LeaderboardGate, AdminEventsScreen, COMPARISON_PACK_IDS });
