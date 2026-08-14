/**
 * ⚠️ 자동 생성 파일 — 손으로 고치지 마세요.
 *
 * 생성: Supabase MCP `generate_typescript_types`
 * 대상: 프로젝트 smiqjmbjsvcazlclwgdq, 마이그레이션 0001~0009 적용 상태
 *
 * 스키마를 바꾸면 반드시 다시 생성하세요. 이 파일은 DB 스키마의 투영일 뿐이고,
 * 앱의 의미 계층(포인트 값, 등급 규칙 등)은 `src/types/domain.ts`에 있습니다.
 * 두 파일의 관계:
 *   database.ts  "DB에 무엇이 있는가"      — 생성됨, 진실의 원천은 마이그레이션
 *   domain.ts    "그것이 무엇을 뜻하는가"  — 손으로 작성, 화면·계산 로직이 씀
 *
 * ⚠️ spots.lat / spots.lng 는 geom에서 파생되는 GENERATED 컬럼입니다.
 *    타입상 Insert에 나타나지만 **절대 넣지 마세요** — Postgres가 거부합니다.
 *    좌표를 쓸 때는 geom(=ST_SetSRID(ST_MakePoint(lng, lat), 4326))만 다룹니다.
 *
 * ⚠️ visits에는 좌표 컬럼이 없습니다. 누락이 아니라 설계입니다(PLAN.md §5.2-1).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      badges: {
        Row: {
          code: string
          created_at: string
          criteria: Json
          description: string
          icon_url: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          criteria?: Json
          description?: string
          icon_url?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          criteria?: Json
          description?: string
          icon_url?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          consented_at: string
          created_at: string
          expires_at: string | null
          id: string
          method: Database['public']['Enums']['consent_method']
          revoked_at: string | null
          scope: Json
        }
        Insert: {
          consented_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          method: Database['public']['Enums']['consent_method']
          revoked_at?: string | null
          scope?: Json
        }
        Update: {
          consented_at?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          method?: Database['public']['Enums']['consent_method']
          revoked_at?: string | null
          scope?: Json
        }
        Relationships: []
      }
      dex_entries: {
        Row: {
          best_photo_id: string | null
          count: number
          first_observed_at: string
          species_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          best_photo_id?: string | null
          count?: number
          first_observed_at?: string
          species_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          best_photo_id?: string | null
          count?: number
          first_observed_at?: string
          species_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'dex_entries_best_photo_id_fkey'
            columns: ['best_photo_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dex_entries_species_id_fkey'
            columns: ['species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'dex_entries_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      observation_logs: {
        Row: {
          created_at: string
          id: string
          note: string
          spot_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note: string
          spot_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          spot_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'observation_logs_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observation_logs_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      observations: {
        Row: {
          created_at: string
          declared_species_id: string
          final_species_id: string | null
          id: string
          model_confidence: number | null
          model_off_topic: boolean | null
          model_species_id: string | null
          model_version: string | null
          observed_at: string
          photo_id: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          spot_id: string
          status: Database['public']['Enums']['observation_status']
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          declared_species_id: string
          final_species_id?: string | null
          id?: string
          model_confidence?: number | null
          model_off_topic?: boolean | null
          model_species_id?: string | null
          model_version?: string | null
          observed_at?: string
          photo_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spot_id: string
          status?: Database['public']['Enums']['observation_status']
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          declared_species_id?: string
          final_species_id?: string | null
          id?: string
          model_confidence?: number | null
          model_off_topic?: boolean | null
          model_species_id?: string | null
          model_version?: string | null
          observed_at?: string
          photo_id?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          spot_id?: string
          status?: Database['public']['Enums']['observation_status']
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'observations_declared_species_id_fkey'
            columns: ['declared_species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observations_final_species_id_fkey'
            columns: ['final_species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observations_model_species_id_fkey'
            columns: ['model_species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observations_photo_id_fkey'
            columns: ['photo_id']
            isOneToOne: false
            referencedRelation: 'photos'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observations_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'observations_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      photos: {
        Row: {
          created_at: string
          exif_stripped: boolean
          id: string
          is_public: boolean
          mission_tag: string | null
          review_status: Database['public']['Enums']['photo_review_status']
          reviewed_at: string | null
          reviewed_by: string | null
          spot_id: string | null
          storage_path: string
          updated_at: string
          user_id: string
          visit_id: string | null
        }
        Insert: {
          created_at?: string
          exif_stripped?: boolean
          id?: string
          is_public?: boolean
          mission_tag?: string | null
          review_status?: Database['public']['Enums']['photo_review_status']
          reviewed_at?: string | null
          reviewed_by?: string | null
          spot_id?: string | null
          storage_path: string
          updated_at?: string
          user_id: string
          visit_id?: string | null
        }
        Update: {
          created_at?: string
          exif_stripped?: boolean
          id?: string
          is_public?: boolean
          mission_tag?: string | null
          review_status?: Database['public']['Enums']['photo_review_status']
          reviewed_at?: string | null
          reviewed_by?: string | null
          spot_id?: string | null
          storage_path?: string
          updated_at?: string
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'photos_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'photos_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'photos_visit_id_fkey'
            columns: ['visit_id']
            isOneToOne: false
            referencedRelation: 'visits'
            referencedColumns: ['id']
          },
        ]
      }
      points_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          note: string | null
          reason: Database['public']['Enums']['point_reason']
          ref_id: string | null
          ref_type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          note?: string | null
          reason: Database['public']['Enums']['point_reason']
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          note?: string | null
          reason?: Database['public']['Enums']['point_reason']
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'points_ledger_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      quiz_attempts: {
        Row: {
          attempted_at: string
          id: string
          is_correct: boolean
          quiz_id: string
          selected_idx: number | null
          user_id: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          is_correct: boolean
          quiz_id: string
          selected_idx?: number | null
          user_id: string
        }
        Update: {
          attempted_at?: string
          id?: string
          is_correct?: boolean
          quiz_id?: string
          selected_idx?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quiz_attempts_quiz_id_fkey'
            columns: ['quiz_id']
            isOneToOne: false
            referencedRelation: 'quizzes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'quiz_attempts_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      quizzes: {
        Row: {
          answer_idx: number
          created_at: string
          difficulty: number
          explanation: string
          id: string
          options: string[]
          question: string
          seq: number
          spot_id: string
          updated_at: string
        }
        Insert: {
          answer_idx: number
          created_at?: string
          difficulty?: number
          explanation?: string
          id?: string
          options: string[]
          question: string
          seq?: number
          spot_id: string
          updated_at?: string
        }
        Update: {
          answer_idx?: number
          created_at?: string
          difficulty?: number
          explanation?: string
          id?: string
          options?: string[]
          question?: string
          seq?: number
          spot_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'quizzes_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
        ]
      }
      river_species: {
        Row: {
          created_at: string
          likelihood: number
          river_id: string
          species_id: string
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          likelihood?: number
          river_id: string
          species_id: string
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          likelihood?: number
          river_id?: string
          species_id?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'river_species_river_id_fkey'
            columns: ['river_id']
            isOneToOne: false
            referencedRelation: 'rivers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'river_species_species_id_fkey'
            columns: ['species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
        ]
      }
      river_missions: {
        Row: {
          completed_at: string
          /** 미션 인증 사진. 촬영 실패해도 미션은 완료될 수 있어 nullable 입니다. */
          photo_id: string | null
          river_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          photo_id?: string | null
          river_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          photo_id?: string | null
          river_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'river_missions_river_id_fkey'
            columns: ['river_id']
            isOneToOne: false
            referencedRelation: 'rivers'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'river_missions_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      rivers: {
        Row: {
          badge_code: string | null
          created_at: string
          detailed_ecology: string
          detailed_history: string
          icon: string
          id: string
          is_active: boolean
          mission_body: string
          mission_config: Json
          mission_kind: Database['public']['Enums']['mission_kind'] | null
          mission_title: string
          mouth_desc: string | null
          name: string
          region: string
          seq: number
          slug: string
          source_desc: string | null
          subtitle: string
          summary: string
          theme: string
          updated_at: string
        }
        Insert: {
          badge_code?: string | null
          created_at?: string
          detailed_ecology?: string
          detailed_history?: string
          icon?: string
          id?: string
          is_active?: boolean
          mission_body?: string
          mission_config?: Json
          mission_kind?: Database['public']['Enums']['mission_kind'] | null
          mission_title?: string
          mouth_desc?: string | null
          name: string
          region: string
          seq?: number
          slug: string
          source_desc?: string | null
          subtitle?: string
          summary?: string
          theme?: string
          updated_at?: string
        }
        Update: {
          badge_code?: string | null
          created_at?: string
          detailed_ecology?: string
          detailed_history?: string
          icon?: string
          id?: string
          is_active?: boolean
          mission_body?: string
          mission_config?: Json
          mission_kind?: Database['public']['Enums']['mission_kind'] | null
          mission_title?: string
          mouth_desc?: string | null
          name?: string
          region?: string
          seq?: number
          slug?: string
          source_desc?: string | null
          subtitle?: string
          summary?: string
          theme?: string
          updated_at?: string
        }
        Relationships: []
      }
      species: {
        Row: {
          category: Database['public']['Enums']['species_category']
          code: string
          common_name: string
          created_at: string
          ethics_flag: Database['public']['Enums']['ethics_flag']
          fact: string
          id: string
          id_hint: string
          illustration_url: string | null
          is_active: boolean
          months: number[]
          scientific_name: string | null
          tier: number
          track: Database['public']['Enums']['track']
          updated_at: string
          water_grade: number | null
        }
        Insert: {
          category: Database['public']['Enums']['species_category']
          code: string
          common_name: string
          created_at?: string
          ethics_flag?: Database['public']['Enums']['ethics_flag']
          fact?: string
          id?: string
          id_hint?: string
          illustration_url?: string | null
          is_active?: boolean
          months?: number[]
          scientific_name?: string | null
          tier: number
          track: Database['public']['Enums']['track']
          updated_at?: string
          water_grade?: number | null
        }
        Update: {
          category?: Database['public']['Enums']['species_category']
          code?: string
          common_name?: string
          created_at?: string
          ethics_flag?: Database['public']['Enums']['ethics_flag']
          fact?: string
          id?: string
          id_hint?: string
          illustration_url?: string | null
          is_active?: boolean
          months?: number[]
          scientific_name?: string | null
          tier?: number
          track?: Database['public']['Enums']['track']
          updated_at?: string
          water_grade?: number | null
        }
        Relationships: []
      }
      spot_contents: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: Database['public']['Enums']['spot_content_kind']
          media_url: string | null
          seq: number
          spot_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: Database['public']['Enums']['spot_content_kind']
          media_url?: string | null
          seq?: number
          spot_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: Database['public']['Enums']['spot_content_kind']
          media_url?: string | null
          seq?: number
          spot_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'spot_contents_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
        ]
      }
      spot_species: {
        Row: {
          auto_grant: boolean
          created_at: string
          note: string | null
          seq: number
          species_id: string
          spot_id: string
        }
        Insert: {
          auto_grant?: boolean
          created_at?: string
          note?: string | null
          seq?: number
          species_id: string
          spot_id: string
        }
        Update: {
          auto_grant?: boolean
          created_at?: string
          note?: string | null
          seq?: number
          species_id?: string
          spot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'spot_species_species_id_fkey'
            columns: ['species_id']
            isOneToOne: false
            referencedRelation: 'species'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'spot_species_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
        ]
      }
      spots: {
        Row: {
          accessibility_note: string | null
          arrival_story: string
          created_at: string
          geom: unknown
          id: string
          is_active: boolean
          /** ⚠️ geom에서 파생되는 GENERATED 컬럼 — 읽기 전용입니다. */
          lat: number | null
          /** ⚠️ geom에서 파생되는 GENERATED 컬럼 — 읽기 전용입니다. */
          lng: number | null
          name: string
          photo_mission: string | null
          radius_m: number
          river_id: string
          safety_note: string
          seq: number
          theme: string
          updated_at: string
        }
        Insert: {
          accessibility_note?: string | null
          arrival_story?: string
          created_at?: string
          geom: unknown
          id?: string
          is_active?: boolean
          /** ⚠️ GENERATED 컬럼 — 값을 넣으면 Postgres가 거부합니다. */
          lat?: never
          /** ⚠️ GENERATED 컬럼 — 값을 넣으면 Postgres가 거부합니다. */
          lng?: never
          name: string
          photo_mission?: string | null
          radius_m?: number
          river_id: string
          safety_note?: string
          seq: number
          theme?: string
          updated_at?: string
        }
        Update: {
          accessibility_note?: string | null
          arrival_story?: string
          created_at?: string
          geom?: unknown
          id?: string
          is_active?: boolean
          /** ⚠️ GENERATED 컬럼 — 값을 넣으면 Postgres가 거부합니다. */
          lat?: never
          /** ⚠️ GENERATED 컬럼 — 값을 넣으면 Postgres가 거부합니다. */
          lng?: never
          name?: string
          photo_mission?: string | null
          radius_m?: number
          river_id?: string
          safety_note?: string
          seq?: number
          theme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'spots_river_id_fkey'
            columns: ['river_id']
            isOneToOne: false
            referencedRelation: 'rivers'
            referencedColumns: ['id']
          },
        ]
      }
      user_badges: {
        Row: {
          badge_id: string
          earned_at: string
          user_id: string
        }
        Insert: {
          badge_id: string
          earned_at?: string
          user_id: string
        }
        Update: {
          badge_id?: string
          earned_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'user_badges_badge_id_fkey'
            columns: ['badge_id']
            isOneToOne: false
            referencedRelation: 'badges'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'user_badges_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: {
          avatar_seed: string
          consent_id: string | null
          created_at: string
          expert_program: boolean
          grade_band: Database['public']['Enums']['grade_band'] | null
          id: string
          nickname: string
          updated_at: string
        }
        Insert: {
          avatar_seed?: string
          consent_id?: string | null
          created_at?: string
          expert_program?: boolean
          grade_band?: Database['public']['Enums']['grade_band'] | null
          id: string
          nickname: string
          updated_at?: string
        }
        Update: {
          avatar_seed?: string
          consent_id?: string | null
          created_at?: string
          expert_program?: boolean
          grade_band?: Database['public']['Enums']['grade_band'] | null
          id?: string
          nickname?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'users_consent_id_fkey'
            columns: ['consent_id']
            isOneToOne: false
            referencedRelation: 'consents'
            referencedColumns: ['id']
          },
        ]
      }
      visits: {
        Row: {
          accuracy_m: number | null
          anomaly_flag: string | null
          created_at: string
          id: string
          method: Database['public']['Enums']['checkin_method']
          spot_id: string
          user_id: string
          verified_at: string
        }
        Insert: {
          accuracy_m?: number | null
          anomaly_flag?: string | null
          created_at?: string
          id?: string
          method?: Database['public']['Enums']['checkin_method']
          spot_id: string
          user_id: string
          verified_at?: string
        }
        Update: {
          accuracy_m?: number | null
          anomaly_flag?: string | null
          created_at?: string
          id?: string
          method?: Database['public']['Enums']['checkin_method']
          spot_id?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'visits_spot_id_fkey'
            columns: ['spot_id']
            isOneToOne: false
            referencedRelation: 'spots'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'visits_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      v_point_balances: {
        Row: {
          balance: number | null
          entry_count: number | null
          last_entry_at: string | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'points_ledger_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      award_points: {
        Args: {
          p_delta: number
          p_note?: string
          p_reason: Database['public']['Enums']['point_reason']
          p_ref_id?: string
          p_ref_type?: string
          p_user_id: string
        }
        Returns: string
      }
      can_unlock_expert: { Args: { p_user_id: string }; Returns: boolean }
      current_user_is_expert: { Args: Record<string, never>; Returns: boolean }
      claim_river_badge: { Args: { p_river_id: string }; Returns: Json }
      claim_species_photo: {
        /** p_photo_id 는 보호종(report_only)에 한해 생략 가능합니다 — 0020 참조. */
        Args: { p_species_id: string; p_photo_id?: string }
        Returns: Json
      }
      river_progress: {
        Args: Record<string, never>
        Returns: {
          river_id: string
          has_mission: boolean
          mission_done: boolean
          quiz_total: number
          quiz_solved: number
          badge_earned: boolean
        }[]
      }
      dex_summary_by_tier: {
        Args: { p_river_id?: string; p_user_id: string }
        Returns: {
          best_water_grade: number
          owned: number
          tier: number
        }[]
      }
      grant_dex_entry: {
        Args: {
          p_observed_at?: string
          p_photo_id?: string
          p_species_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      point_balance: { Args: { p_user_id: string }; Returns: number }
      record_checkin: {
        Args: {
          p_accuracy_m?: number
          p_lat: number
          p_lng: number
          p_method?: Database['public']['Enums']['checkin_method']
          p_spot_id: string
          p_user_id?: string
        }
        Returns: Json
      }
      spot_candidate_species: {
        Args: { p_month?: number; p_spot_id: string }
        Returns: Database['public']['Tables']['species']['Row'][]
      }
      tier_points: { Args: { p_tier: number }; Returns: number }
      verify_checkin: {
        Args: {
          p_accuracy_m?: number
          p_lat: number
          p_lng: number
          p_spot_id: string
        }
        Returns: {
          ok: boolean
          radius_m: number
          reason: string
          remaining_m: number
        }[]
      }
    }
    Enums: {
      checkin_method: 'gps' | 'qr' | 'operator_override'
      consent_method: 'in_app' | 'guardian_link' | 'guardian_onsite'
      ethics_flag: 'none' | 'no_approach' | 'report_only' | 'expert_only'
      grade_band: 'g3_4' | 'g5_6'
      mission_kind:
        | 'acknowledge'
        | 'text_answer'
        | 'tap_target'
        | 'collect'
        | 'observe_log'
      observation_status:
        | 'auto_confirmed'
        | 'pending'
        | 'confirmed'
        | 'corrected'
        | 'rejected'
      photo_review_status: 'pending' | 'approved' | 'rejected'
      point_reason:
        | 'checkin'
        | 'species_found'
        | 'observation_log'
        | 'quiz_correct'
        | 'quiz_wrong'
        | 'course_complete'
        | 'dex_set_complete'
        | 'river_milestone'
      species_category:
        | 'waterbird'
        | 'smallbird'
        | 'fish'
        | 'mammal'
        | 'insect'
        | 'benthos'
        | 'plant'
        | 'invasive'
        | 'trace'
        | 'facility'
      spot_content_kind: 'story' | 'history' | 'safety' | 'media' | 'extra'
      track: 'guaranteed' | 'challenge'
    }
    CompositeTypes: Record<never, never>
  }
}

/** 편의 별칭 — 화면 코드에서 `Row<'species'>` 처럼 씁니다. */
export type Row<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row']
export type Insert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert']
export type Update<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update']
export type Enum<T extends keyof Database['public']['Enums']> =
  Database['public']['Enums'][T]
