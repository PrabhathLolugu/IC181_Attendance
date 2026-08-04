export type StaffRole = 'admin' | 'ta';
export type StaffStatus = 'active' | 'disabled';

export interface Staff {
  id: string;
  email: string;
  name: string;
  role: StaffRole;
  status: StaffStatus;
  created_at: string;
  created_by?: string | null;
}

export type StudentStatus = 'active' | 'inactive' | 'graduated' | 'deleted';

export interface Student {
  id: string;
  roll_number: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  department?: string | null;
  program?: string | null;
  semester?: string | null;
  group_label?: string | null;
  batch?: string | null;
  photo_url?: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface CourseSettings {
  course_name: string;
  gps_radius_meters: number;
  late_window_minutes: number;
  override_code_ttl_seconds: number;
  qr_rotation_seconds: number;
  qr_token_validity_seconds: number;
}

export const SESSION_TYPE_PRESETS = ['Theory', 'Practical', 'Yoga', 'Extracurricular'] as const;
export type SessionStatus = 'active' | 'ended';

export interface Session {
  id: string;
  session_date: string;
  session_type: string;
  course_name: string;
  status: SessionStatus;
  started_by: string;
  anchor_lat: number;
  anchor_lng: number;
  radius_meters: number;
  group_filter?: string | null;
  round_id?: string | null;
  rotation_id: string;
  rotation_expires_at: string;
  allow_gps_override: boolean;
  override_code?: string | null;
  override_code_expires_at?: string | null;
  notes?: string | null;
  created_at: string;
  ended_at?: string | null;
}

export type AttendanceStatus = 'present' | 'late' | 'manual' | 'override' | 'excused';
export type AttendanceMethod = 'gps' | 'override_code' | 'manual' | 'instructor_approved';

export interface AttendanceRecord {
  id: string;
  session_id: string;
  student_id: string;
  roll_number: string;
  status: AttendanceStatus;
  method: AttendanceMethod;
  distance_meters?: number | null;
  gps_lat?: number | null;
  gps_lng?: number | null;
  gps_accuracy?: number | null;
  marked_at: string;
  recorded_by?: string | null;
  notes?: string | null;
}

export type OverrideReason = 'gps_denied' | 'outside_radius' | 'gps_unavailable';
export type OverrideStatus = 'pending' | 'approved' | 'rejected';

export interface GpsOverrideRequest {
  id: string;
  session_id: string;
  student_id: string;
  roll_number: string;
  distance_meters?: number | null;
  reason: OverrideReason;
  status: OverrideStatus;
  requested_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
}

export interface AuditLogEntry {
  id: string;
  actor_id?: string | null;
  actor_label: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  before?: unknown;
  after?: unknown;
  created_at: string;
}

export interface StudentAttendanceSummary {
  student_id: string;
  roll_number: string;
  name: string;
  group_label?: string | null;
  present_count: number;
  late_count: number;
  excused_count: number;
  manual_count: number;
  override_count: number;
  total_sessions: number;
  attendance_percentage: number;
}

export interface GradeCategory {
  id: string;
  name: string;
  weight_percent: number;
  max_score: number;
  attendance_linked: boolean;
  position: number;
  created_at: string;
}

export interface GradeEntry {
  id: string;
  category_id: string;
  student_id: string;
  score: number;
  notes?: string | null;
  updated_by?: string | null;
  updated_at: string;
}

export interface GradeScaleBand {
  id: string;
  label: string;
  min_percent: number;
  max_percent: number;
  color?: string | null;
  position: number;
}

export interface ActivityRound {
  id: string;
  name: string;
  created_at: string;
}
