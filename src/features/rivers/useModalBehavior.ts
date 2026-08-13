import { useEffect, useRef, type MouseEvent } from 'react';

/**
 * 모달 공통 동작: Escape 닫기 + 뒤 페이지 스크롤 잠금.
 *
 * onClose를 ref에 담아두기 때문에 호출부에서 useCallback으로 감싸지 않아도
 * 매 렌더마다 리스너가 재등록되지 않습니다.
 */
export function useModalBehavior(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', onKeyDown);

    const body = document.body;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
    };
  }, []);
}

/**
 * 백드롭(오버레이 자기 자신)을 눌렀을 때만 닫습니다.
 * 모달 내용 안에서 누르기 시작해 밖에서 손을 뗀 드래그는 닫지 않도록
 * mousedown 지점을 ref에 기억해 둡니다.
 */
export function useBackdropClose(onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const downOnBackdrop = useRef(false);

  return {
    onMouseDown: (e: MouseEvent) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: MouseEvent) => {
      const shouldClose = downOnBackdrop.current && e.target === e.currentTarget;
      downOnBackdrop.current = false;
      if (shouldClose) onCloseRef.current();
    },
  };
}
