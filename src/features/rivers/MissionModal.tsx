import { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '@/lib/session';
import { celebrate } from './celebrate';
import { MissionStep } from './missions';
import { isCompleteWith } from './missions/logic';
import { QuizSection } from './QuizSection';
import { useAnswerQuiz, useClaimBadge, useCompleteMission } from './queries';
import { playSound } from './sound';
import { SoundToggle } from './SoundToggle';
import { themeOf } from './theme';
import { isRiverComplete, type QuizView, type RiverView } from './types';

/**
 * 하천 하나의 STEP 1 체험 미션 + STEP 2 퀴즈를 담는 모달.
 *
 * 화면이 보여 주는 진행 상황 = **서버 기록 ∪ 이번 세션에서 방금 한 것**.
 * 서버 응답을 기다렸다가 그리면 버튼을 눌러도 반응이 없는 구간이 생기고,
 * 미로그인 사용자는 아예 아무 반응도 못 받게 됩니다.
 * 대신 "저장되지 않는다"는 사실은 화면에 정직하게 적습니다(아래 안내 배너).
 */

export interface MissionModalProps {
  river: RiverView;
  onClose: () => void;
}

/** 배지 수령이 거절된 이유를 아이들이 읽을 말로 바꿉니다. */
function badgeReasonMessage(reason: string | undefined): string {
  switch (reason) {
    case 'mission_incomplete':
      return 'STEP 1 체험 미션이 아직 저장되지 않았어요.';
    case 'quiz_incomplete':
      return '아직 못 푼 퀴즈가 남아 있어요.';
    case 'not_authenticated':
      return '로그인해야 배지를 받을 수 있어요.';
    default:
      return '배지를 아직 받을 수 없어요. 잠시 후 다시 열어 보세요.';
  }
}

export function MissionModal({ river, onClose }: MissionModalProps): JSX.Element {
  const theme = themeOf(river.theme);
  const { isLoggedIn } = useSession();

  const completeMission = useCompleteMission();
  const answerQuiz = useAnswerQuiz();
  const claimBadge = useClaimBadge();

  // 이번 세션의 낙관적 진행 상황 (미로그인이면 이것만 남습니다)
  const [localMissionDone, setLocalMissionDone] = useState(false);
  const [localSolved, setLocalSolved] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [saveFailed, setSaveFailed] = useState(false);
  const [badgeNote, setBadgeNote] = useState<string | null>(null);
  const [shown, setShown] = useState(false);

  const missionDone = river.missionDone || localMissionDone;
  const solved = useMemo(() => {
    const next = new Set(river.quizSolvedIds);
    localSolved.forEach((id) => next.add(id));
    return next;
  }, [river.quizSolvedIds, localSolved]);

  // 하천마다 구성이 다릅니다 — 없는 단계는 자리(빈 패널·"미션 없음" 안내)조차 만들지 않습니다.
  // 빈 껍데기를 그리면 "여기서 뭘 해야 하나" 하고 아이가 멈춥니다.
  const showMission = river.hasMission;
  const showQuizzes = river.quizzes.length > 0;

  const solvedHere = river.quizzes.filter((q) => solved.has(q.id)).length;
  const complete = isCompleteWith(river, missionDone, solved);

  // 이미 완수한 하천을 다시 열었을 때 축하가 또 터지지 않도록 첫 렌더에서 고정합니다.
  const celebratedRef = useRef(isRiverComplete(river));
  const claimedRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backdropPressRef = useRef(false);

  /* ── 열림 연출 ─────────────────────────────────────────────── */
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  /* ── Escape로 닫기 ─────────────────────────────────────────── */
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  /* ── 뒤 페이지 스크롤 잠금 ─────────────────────────────────── */
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  /* ── 열리면 모달로 포커스를 옮깁니다 ───────────────────────── */
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  /* ── 완수 축하: 서버 응답을 기다리지 않고 즉시 ─────────────── */
  useEffect(() => {
    if (!complete || celebratedRef.current) return;
    celebratedRef.current = true;
    celebrate();
  }, [complete]);

  /**
   * 기록 → (완수라면) 배지 수령.
   *
   * 배지를 **기록 이후에** 요청하는 이유: 서버가 claim_river_badge 안에서
   * 미션·퀴즈 완수를 다시 확인합니다. 기록이 아직 도착하기 전에 요청하면
   * 정당하게 완수했는데도 ok:false가 돌아옵니다.
   */
  async function record(
    work: () => Promise<unknown>,
    nextMissionDone: boolean,
    nextSolved: Set<string>,
  ) {
    try {
      await work();
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
      return;
    }

    if (!isLoggedIn || claimedRef.current) return;
    if (!isCompleteWith(river, nextMissionDone, nextSolved)) return;

    claimedRef.current = true;
    try {
      const result = await claimBadge.mutateAsync(river.id);
      if (result.ok) {
        setBadgeNote(result.is_new ? '🏅 탐험 배지를 받았어요!' : '🏅 이미 받은 배지예요.');
      } else {
        // 정상적인 결과입니다 — 다음 동작에서 다시 시도할 수 있게 잠금을 풉니다.
        claimedRef.current = false;
        setBadgeNote(badgeReasonMessage(result.reason));
      }
    } catch {
      claimedRef.current = false;
      setBadgeNote('배지 수령에 실패했어요. 잠시 후 다시 열어 보세요.');
    }
  }

  function handleMissionComplete() {
    if (missionDone) return;
    setLocalMissionDone(true);
    void record(() => completeMission.mutateAsync(river.id), true, solved);
  }

  function handleQuizAnswer(quiz: QuizView, selectedIdx: number, isCorrect: boolean) {
    const nextSolved = new Set(solved);
    if (isCorrect) {
      nextSolved.add(quiz.id);
      setLocalSolved((prev) => {
        const next = new Set(prev);
        next.add(quiz.id);
        return next;
      });
    }
    void record(
      () => answerQuiz.mutateAsync({ quizId: quiz.id, selectedIdx, isCorrect }),
      missionDone,
      nextSolved,
    );
  }

  function handleClose() {
    playSound('click');
    onClose();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm transition-opacity duration-300 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      onMouseDown={(e) => {
        backdropPressRef.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        // 본문에서 드래그를 시작해 바깥에서 손을 뗀 경우까지 닫히지 않도록
        // "누르기"와 "떼기"가 모두 배경일 때만 닫습니다.
        if (e.target === e.currentTarget && backdropPressRef.current) handleClose();
        backdropPressRef.current = false;
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mission-modal-title"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        className={`bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] outline-none transform transition-transform duration-300 ${
          shown ? 'scale-100' : 'scale-95'
        }`}
      >
        {/* ── 헤더 ───────────────────────────────────────────── */}
        <header
          className={`p-5 text-white flex justify-between items-center gap-3 relative bg-gradient-to-r ${theme.gradient}`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 shrink-0 rounded-xl bg-white/20 backdrop-blur-md flex items-center justify-center text-xl">
              <span aria-hidden="true">{river.icon}</span>
            </div>
            <div className="min-w-0">
              <span className="text-[10px] uppercase font-black tracking-widest px-2 py-0.5 bg-black/20 rounded-full inline-block">
                하천 탐험
              </span>
              <h3 id="mission-modal-title" className="text-xl font-bold leading-tight truncate">
                {river.name}
              </h3>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <SoundToggle className="bg-black/20 hover:bg-black/40 text-white" />
            <button
              type="button"
              onClick={handleClose}
              aria-label="닫기"
              className="w-11 h-11 rounded-full bg-black/20 hover:bg-black/40 text-white flex items-center justify-center transition-all text-lg"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </header>

        {/* ── 본문 (작은 화면에서 여기만 스크롤) ────────────────── */}
        <div className="p-5 sm:p-6 overflow-y-auto overscroll-contain flex-grow space-y-5">
          {/* STEP 진행 배너 — 이 하천에 있는 단계만 보여 줍니다 */}
          <div className="bg-slate-100 rounded-2xl p-3 border border-slate-200 flex flex-wrap justify-around gap-x-3 gap-y-1 text-xs font-bold text-slate-700">
            {showMission ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">{missionDone ? '✅' : '⬜'}</span>
                <span>STEP 1 체험 미션: {missionDone ? '완료' : '진행 필요'}</span>
              </span>
            ) : null}
            {showMission && showQuizzes ? (
              <span className="text-slate-300 hidden sm:inline">|</span>
            ) : null}
            {showQuizzes ? (
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true">
                  {solvedHere === river.quizzes.length ? '✅' : '⬜'}
                </span>
                <span>
                  {showMission ? 'STEP 2 ' : ''}생태·역사 퀴즈: {solvedHere}/{river.quizzes.length}{' '}
                  풀음
                </span>
              </span>
            ) : null}
          </div>

          {!isLoggedIn ? (
            <p className="text-[11px] leading-relaxed bg-amber-50 border border-amber-200 text-amber-900 rounded-xl p-3">
              🔒 지금은 <strong>둘러보기</strong> 중이에요. 로그인하면 진행 상황이 저장돼요 — 지금
              푼 내용은 이 창을 닫으면 사라집니다.
            </p>
          ) : null}

          {saveFailed ? (
            <p
              role="alert"
              className="text-[11px] leading-relaxed bg-red-50 border border-red-200 text-red-900 rounded-xl p-3"
            >
              ⚠️ 저장에 실패했어요. 인터넷 연결을 확인하고 한 번 더 눌러 주세요.
            </p>
          ) : null}

          {/* STEP 1 — mission_kind가 컴포넌트를 고릅니다 */}
          {showMission ? (
            <MissionStep
              river={river}
              theme={theme}
              done={missionDone}
              onComplete={handleMissionComplete}
            />
          ) : null}

          {/* STEP 2 */}
          {showQuizzes ? (
            <QuizSection river={river} solved={solved} onAnswer={handleQuizAnswer} />
          ) : null}

          {complete ? (
            <p
              role="status"
              className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-sm font-bold text-center"
            >
              🎉 {river.name} 탐험 완수! {badgeNote ?? (isLoggedIn ? '' : '로그인하면 배지를 받을 수 있어요.')}
            </p>
          ) : null}
        </div>

        {/* ── 푸터 ───────────────────────────────────────────── */}
        <footer className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center gap-3">
          <p className="text-xs text-slate-500 font-medium flex items-center gap-2 min-w-0">
            <span aria-hidden="true">ℹ️</span>
            <span className="truncate">미션과 퀴즈를 모두 풀어야 탐험 달성!</span>
          </p>
          <button
            type="button"
            onClick={handleClose}
            className="shrink-0 min-h-[44px] px-5 py-2.5 rounded-xl bg-slate-800 text-white font-bold text-sm hover:bg-slate-900 transition-all shadow-sm"
          >
            닫기
          </button>
        </footer>
      </div>
    </div>
  );
}
