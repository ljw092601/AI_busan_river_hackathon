import { useSoundMuted } from './sound';

/**
 * 효과음 켜기/끄기 토글. 상태는 localStorage에 남아 새로고침해도 유지됩니다.
 * 모달 헤더뿐 아니라 전역 헤더에서도 그대로 쓸 수 있게 별도 파일로 뺐습니다.
 */
export function SoundToggle({ className = '' }: { className?: string }) {
  const { muted, toggle } = useSoundMuted();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
      title={muted ? '효과음 켜기' : '효과음 끄기'}
      className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${className}`}
    >
      <span aria-hidden="true" className={muted ? 'opacity-60' : ''}>
        {muted ? '🔇' : '🔊'}
      </span>
    </button>
  );
}
