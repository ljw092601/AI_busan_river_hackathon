import { useState } from 'react';
import { playSound } from '../sound';
import { MissionDoneNote, MissionPanel, type MissionProps } from './MissionPanel';
import {
  MissionPhotoFailure,
  MissionPhotoNeedsLogin,
  MissionPhotoPending,
  MissionPhotoThumb,
  OTTER_PHOTO_TAG,
  useMissionPhoto,
} from './MissionPhoto';

/**
 * `tap_target` — 떠다니는 대상을 탭해 **실제로 사진을 찍는** 미션 (온천천 수달).
 *
 * ★ 탭은 카메라를 엽니다
 *   예전에는 수달을 누르면 그 자리에서 완료 처리만 됐습니다. "찰칵"이라고 말해 놓고
 *   아무것도 찍지 않는 화면이었습니다. 이제 탭이 곧 촬영이고, 업로드가 끝나면
 *   그 사진 id 와 함께 미션을 완료합니다.
 *
 * ★ 움직임에 기대지 않습니다
 *   `prefers-reduced-motion`이면 global.css가 `.animate-otter`를 멈춥니다.
 *   그때도 대상은 화면에 그대로 있고 그냥 탭하면 촬영이 시작됩니다 —
 *   "움직이는 걸 맞혀야만" 통과하는 구조였다면 그 설정에서 미션이 불가능해집니다.
 *   촬영 중에도 애니메이션을 멈춥니다(움직이는 버튼을 다시 노리게 만들지 않기 위해).
 */
export function TapTargetMission({ river, theme, done, onComplete }: MissionProps) {
  const emoji = river.missionConfig.emoji ?? '🦦';
  const label = river.missionConfig.label ?? '눌러서 찰칵!';
  const doneLabel = river.missionConfig.done ?? '📸 촬영 완료!';

  // spotId: RiverView 가 스팟 id 를 들고 오지 않아 null 입니다(types.ts 는 이 트랙 범위 밖).
  const photo = useMissionPhoto({ missionTag: OTTER_PHOTO_TAG });
  const [needsLogin, setNeedsLogin] = useState(false);

  function handleTap() {
    if (done || photo.pending) return;

    if (!photo.canCapture) {
      // 미로그인: 카메라를 열어 봐야 not_signed_in 으로 끝납니다.
      // ⚠️ 예전에는 여기서 곧바로 onComplete() 했습니다. 그러면 "찰칵"이라고 해놓고
      //   아무 일도 없이 완료 화면으로 넘어가, 카메라 기능이 아예 없는 것처럼 보입니다.
      //   대신 이유를 말하고 계속할지 사용자가 고르게 합니다.
      setNeedsLogin(true);
      return;
    }

    // ⚠️ 제스처를 소모하지 않도록 촬영을 **먼저** 시작합니다. 소리는 그 다음.
    photo.capture((uploaded) => onComplete(uploaded.photoId));
    playSound('camera');
  }

  function completeWithoutPhoto() {
    photo.reset();
    setNeedsLogin(false);
    playSound('camera');
    onComplete();
  }

  const frozen = done || photo.pending;
  const buttonLabel = done ? '촬영 완료' : photo.pending ? '사진 준비 중…' : label;

  return (
    <MissionPanel theme={theme} title={river.missionTitle} body={river.missionBody}>
      <div className="bg-slate-900 rounded-2xl p-3 text-center relative overflow-hidden shadow-inner">
        <div className="relative h-36 bg-gradient-to-b from-teal-800 to-cyan-900 rounded-xl overflow-hidden border border-slate-700 flex items-center justify-center">
          <button
            type="button"
            onClick={handleTap}
            aria-disabled={frozen}
            aria-label={`${emoji} ${buttonLabel}`}
            className={`absolute select-none min-h-[44px] ${frozen ? '' : 'animate-otter'}`}
          >
            <span className="bg-amber-800/90 hover:bg-amber-700 text-white p-2 rounded-2xl shadow-lg border border-amber-400 flex items-center gap-2 transform hover:scale-110 transition-transform">
              <span className="text-2xl" aria-hidden="true">
                {emoji}
              </span>
              <span className="text-[10px] font-extrabold bg-amber-300 text-amber-950 px-2 py-0.5 rounded whitespace-nowrap">
                {buttonLabel}
              </span>
            </span>
          </button>
        </div>
      </div>

      {photo.pending ? <MissionPhotoPending label="사진을 준비하고 있어요…" /> : null}

      {!done && photo.status === 'error' ? (
        <MissionPhotoFailure
          message={photo.errorMessage ?? '사진 처리 중 문제가 생겼어요.'}
          onRetry={handleTap}
          onSkip={completeWithoutPhoto}
        />
      ) : null}

      {!done && needsLogin ? <MissionPhotoNeedsLogin onSkip={completeWithoutPhoto} /> : null}

      {photo.photo ? <MissionPhotoThumb photo={photo.photo} /> : null}

      {done ? <MissionDoneNote>{doneLabel}</MissionDoneNote> : null}
    </MissionPanel>
  );
}
