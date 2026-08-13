import type { FriendlyError } from './errors';
import s from './auth.module.css';

/**
 * 오류 안내 배너.
 *
 * `role="alert"`을 붙여 스크린리더가 즉시 읽게 합니다 — 로그인 실패는 화면 아래쪽에
 * 조용히 나타나면 아무도 못 봅니다.
 *
 * 원문(detail)은 번역에 실패했을 때만 접힌 채로 붙습니다. 번역에 성공한 오류에
 * 영어 원문을 함께 띄우면 애써 번역한 의미가 사라집니다.
 */
export interface ErrorNoticeProps {
  error: FriendlyError | null;
}

export function ErrorNotice({ error }: ErrorNoticeProps) {
  if (!error) return null;

  return (
    <div className={`${s.alert} ${s.alertError}`} role="alert">
      <span className={s.alertIcon} aria-hidden="true">
        ⚠️
      </span>
      <div className={s.alertBody}>
        <p className={s.alertTitle}>{error.message}</p>
        {error.hint ? <p className={s.alertHint}>{error.hint}</p> : null}
        {error.detail ? (
          <details>
            <summary className={s.alertHint}>운영자에게 알려줄 내용</summary>
            <p className={s.alertDetail}>{error.detail}</p>
          </details>
        ) : null}
      </div>
    </div>
  );
}
