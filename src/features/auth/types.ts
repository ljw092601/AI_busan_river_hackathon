/**
 * 보호자 인증 트랙의 공용 타입.
 *
 * ⚠️ 이 앱의 계정 주체는 **보호자(성인)**입니다 (PLAN.md §5.1).
 *    동반 아동에 대한 어떤 필드도 여기에 추가하지 마세요 — 이름·나이·학교·사진 전부.
 *    `grade_band`만 예외이며, 그것도 "어휘 난이도 선택"용 선택값입니다(§5.2-2).
 */

import type { supabase } from '@/lib/supabase';
import type { Enum, Row } from '@/types/database';

/**
 * 싱글턴 클라이언트의 타입을 그대로 빌려 씁니다.
 * `import type`이라 런타임 import가 남지 않습니다 — 테스트에서 이 모듈을 불러도
 * `src/lib/supabase.ts`의 env 검사(throw)가 실행되지 않습니다.
 */
export type AuthClient = typeof supabase;

/** public.users 한 행 = 보호자 계정 1개 = 가족 1팀 = 도감 1벌 (PLAN.md §6.3) */
export type GuardianProfile = Row<'users'>;

export type GradeBand = Enum<'grade_band'>;
export type ConsentMethod = Enum<'consent_method'>;

/**
 * consents.scope 에 저장하는 동의 항목.
 *
 * `type`(인터페이스가 아님)으로 선언한 이유: 인터페이스는 암묵적 인덱스 시그니처를 받지 못해
 * `Json` 타입에 대입되지 않습니다. 타입 별칭이어야 `.insert({ scope })`가 통과합니다.
 */
export type ConsentScope = {
  /** 필수 — 서비스 이용과 최소 정보 처리 */
  service: boolean;
  /** 선택 — 사진 미션·관찰 사진 업로드 (기본 비공개 저장) */
  photo_upload: boolean;
  /** 선택 — 검수 통과분에 한한 공개 갤러리 게시 */
  public_gallery: boolean;
};

export type ConsentScopeKey = keyof ConsentScope;

/** 온보딩 화면이 모아서 넘기는 값 */
export interface GuardianProfileInput {
  /** 가족 표시용 별명. 실명이 아닙니다. 1~20자 (DB CHECK 제약과 동일) */
  nickname: string;
  /** 동반 아동 학년대역 — **선택값**. 건너뛰면 null이고 3~4학년 어휘로 표시합니다. */
  gradeBand: GradeBand | null;
  /** 절차적 아바타 생성용 시드. 얼굴 사진을 쓰지 않기 위한 값입니다(§5.2-3). */
  avatarSeed?: string;
  scope: ConsentScope;
  /** 앱에서 보호자 본인이 동의하면 언제나 'in_app' 입니다. */
  method?: ConsentMethod;
}
