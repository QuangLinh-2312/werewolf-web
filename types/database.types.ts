export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          nickname: string
          avatar_url: string | null
          is_guest: boolean
          wins: number
          losses: number
          created_at: string
        }
        Insert: {
          id: string
          nickname?: string
          avatar_url?: string | null
          is_guest?: boolean
          wins?: number
          losses?: number
          created_at?: string
        }
        Update: {
          nickname?: string
          avatar_url?: string | null
          is_guest?: boolean
          wins?: number
          losses?: number
        }
      }
      rooms: {
        Row: {
          id: string
          code: string
          host_id: string
          status: 'lobby' | 'playing' | 'finished'
          settings: RoomSettings
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          host_id: string
          status?: 'lobby' | 'playing' | 'finished'
          settings?: RoomSettings
          created_at?: string
        }
        Update: {
          host_id?: string
          status?: 'lobby' | 'playing' | 'finished'
          settings?: RoomSettings
        }
      }
      room_players: {
        Row: {
          id: string
          room_id: string
          profile_id: string
          is_ready: boolean
          is_connected: boolean
          joined_at: string
        }
        Insert: {
          id?: string
          room_id: string
          profile_id: string
          is_ready?: boolean
          is_connected?: boolean
          joined_at?: string
        }
        Update: {
          is_ready?: boolean
          is_connected?: boolean
        }
      }
      game_sessions: {
        Row: {
          id: string
          room_id: string
          phase: GamePhase
          day_number: number
          phase_ends_at: string | null
          winner: 'wolves' | 'villagers' | null
          started_at: string
          ended_at: string | null
          paused_phase: string | null
        }
        Insert: {
          id?: string
          room_id: string
          phase?: GamePhase
          day_number?: number
          phase_ends_at?: string | null
          winner?: 'wolves' | 'villagers' | null
          started_at?: string
          ended_at?: string | null
          paused_phase?: string | null
        }
        Update: {
          phase?: GamePhase
          day_number?: number
          phase_ends_at?: string | null
          winner?: 'wolves' | 'villagers' | null
          ended_at?: string | null
          paused_phase?: string | null
        }
      }
      game_players: {
        Row: {
          id: string
          session_id: string
          profile_id: string
          role: RoleKey
          is_alive: boolean
          died_at_phase: string | null
          died_at_day: number | null
          lover_id: string | null
          elder_lives: number
          seer_cursed: boolean
          is_silenced: boolean
          doppelganger_target_id: string | null
        }
        Insert: {
          id?: string
          session_id: string
          profile_id: string
          role: RoleKey
          is_alive?: boolean
          died_at_phase?: string | null
          died_at_day?: number | null
          lover_id?: string | null
          elder_lives?: number
          seer_cursed?: boolean
          is_silenced?: boolean
          doppelganger_target_id?: string | null
        }
        Update: {
          is_alive?: boolean
          died_at_phase?: string | null
          died_at_day?: number | null
          lover_id?: string | null
          elder_lives?: number
          seer_cursed?: boolean
          is_silenced?: boolean
          doppelganger_target_id?: string | null
        }
      }
      night_actions: {
        Row: {
          id: string
          session_id: string
          day_number: number
          actor_id: string
          action_type: NightActionType
          target_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          day_number: number
          actor_id: string
          action_type: NightActionType
          target_id?: string | null
          created_at?: string
        }
        Update: {
          target_id?: string | null
        }
      }
      votes: {
        Row: {
          id: string
          session_id: string
          day_number: number
          voter_id: string
          target_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          day_number: number
          voter_id: string
          target_id?: string | null
          created_at?: string
        }
        Update: {
          target_id?: string | null
        }
      }
      chat_messages: {
        Row: {
          id: string
          session_id: string
          channel: ChatChannel
          sender_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          session_id: string
          channel: ChatChannel
          sender_id: string
          content: string
          created_at?: string
        }
        Update: never
      }
    }
    Functions: {
      create_room: {
        Args: Record<PropertyKey, never>
        Returns: Database['public']['Tables']['rooms']['Row']
      }
      assign_roles: {
        Args: { p_room_id: string }
        Returns: string
      }
      submit_night_action: {
        Args: {
          p_session_id: string
          p_action_type: NightActionType
          p_target_profile_id: string
        }
        Returns: void
      }
      resolve_night: {
        Args: { p_session_id: string }
        Returns: void
      }
      resolve_vote: {
        Args: { p_session_id: string }
        Returns: void
      }
      advance_phase: {
        Args: { p_session_id: string }
        Returns: void
      }
      check_win_condition: {
        Args: { p_session_id: string }
        Returns: void
      }
      match_lovers: {
        Args: {
          p_session_id: string
          p_lover1_profile_id: string
          p_lover2_profile_id: string
        }
        Returns: void
      }
      hunter_shoot: {
        Args: {
          p_session_id: string
          p_target_profile_id: string
        }
        Returns: void
      }
      pause_game: {
        Args: { p_session_id: string }
        Returns: void
      }
      resume_game: {
        Args: { p_session_id: string }
        Returns: void
      }
      end_game: {
        Args: { p_session_id: string }
        Returns: void
      }
    }
  }
}

// ─── Domain types ─────────────────────────────────────────────────────────────

export type GamePhase =
  | 'setup'
  | 'night_intro'
  | 'night_actions'
  | 'night_resolve'
  | 'day_result'
  | 'day_discussion'
  | 'day_vote'
  | 'day_vote_result'
  | 'game_over'
  | 'paused'

export type RoleKey =
  | 'wolf'
  | 'villager'
  | 'seer'
  | 'guard'
  | 'witch'
  | 'hunter'
  | 'cupid'
  // Extended mode
  | 'elder'
  | 'jester'
  | 'alpha_wolf'
  | 'silencer'
  | 'detective'
  | 'avenger_wolf'
  | 'doppelganger'

export type NightActionType =
  | 'kill'
  | 'save'
  | 'check'
  | 'protect'
  | 'link'
  | 'toxic'
  | 'shoot'
  | 'elder_shield'
  | 'alpha_check'
  | 'silence'
  | 'detective_check'
  | 'doppelganger_mark'

export type ChatChannel = 'public' | 'wolves' | 'ghost'

export type GameMode = 'classic' | 'extended'

export interface RoomSettings {
  mode?: GameMode
  roles: Record<RoleKey, number>
  timers: {
    discussion: number
    vote: number
    night: number
  }
  allowGhostChat: boolean
  allowWolfChat: boolean
}

// ─── Convenience row aliases ──────────────────────────────────────────────────

export type Profile = Database['public']['Tables']['profiles']['Row']
export type Room = Database['public']['Tables']['rooms']['Row']
export type RoomPlayer = Database['public']['Tables']['room_players']['Row']
export type GameSession = Database['public']['Tables']['game_sessions']['Row']
export type GamePlayer = Database['public']['Tables']['game_players']['Row']
export type NightAction = Database['public']['Tables']['night_actions']['Row']
export type Vote = Database['public']['Tables']['votes']['Row']
export type ChatMessage = Database['public']['Tables']['chat_messages']['Row']

// ─── Extended types (joined queries) ─────────────────────────────────────────

export type RoomPlayerWithProfile = RoomPlayer & {
  profiles: Profile
}
