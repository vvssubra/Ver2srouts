export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          branch_id: string
          created_at: string | null
          created_by: string
          end_date: string
          id: string
          is_active: boolean
          start_date: string
          updated_at: string | null
          year_name: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          created_by: string
          end_date: string
          id?: string
          is_active?: boolean
          start_date: string
          updated_at?: string | null
          year_name: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          created_by?: string
          end_date?: string
          id?: string
          is_active?: boolean
          start_date?: string
          updated_at?: string | null
          year_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      access_group_members: {
        Row: {
          created_at: string
          group_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "access_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      access_groups: {
        Row: {
          allowed_routes: string[]
          branch_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          managed_routes: string[] | null
          name: string
          updated_at: string
        }
        Insert: {
          allowed_routes?: string[]
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          managed_routes?: string[] | null
          name: string
          updated_at?: string
        }
        Update: {
          allowed_routes?: string[]
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          managed_routes?: string[] | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          branch_id: string
          category: string | null
          code: string
          created_at: string
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          category?: string | null
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          category?: string | null
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      age_groups: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          max_age_months: number
          min_age_months: number
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          max_age_months: number
          min_age_months: number
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          max_age_months?: number
          min_age_months?: number
          sort_order?: number
        }
        Relationships: []
      }
      age_profiles: {
        Row: {
          age_group: number
          created_at: string
          description: string | null
          id: string
          school_readiness_band: string | null
          stage_name: string
        }
        Insert: {
          age_group: number
          created_at?: string
          description?: string | null
          id?: string
          school_readiness_band?: string | null
          stage_name: string
        }
        Update: {
          age_group?: number
          created_at?: string
          description?: string | null
          id?: string
          school_readiness_band?: string | null
          stage_name?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          branch_id: string | null
          created_at: string
          display_mode: string | null
          event_name: string
          id: string
          path: string | null
          platform: string | null
          properties: Json
          referrer: string | null
          role: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          display_mode?: string | null
          event_name: string
          id?: string
          path?: string | null
          platform?: string | null
          properties?: Json
          referrer?: string | null
          role?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          display_mode?: string | null
          event_name?: string
          id?: string
          path?: string | null
          platform?: string | null
          properties?: Json
          referrer?: string | null
          role?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          parent_user_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          parent_user_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          parent_user_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          body: string
          branch_id: string
          created_at: string
          created_by: string
          id: string
          target_class: string | null
          target_parent_ids: string[] | null
          target_type: string
          title: string
        }
        Insert: {
          audience?: string
          body: string
          branch_id: string
          created_at?: string
          created_by: string
          id?: string
          target_class?: string | null
          target_parent_ids?: string[] | null
          target_type?: string
          title: string
        }
        Update: {
          audience?: string
          body?: string
          branch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          target_class?: string | null
          target_parent_ids?: string[] | null
          target_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_decisions: {
        Row: {
          conditions: string | null
          decided_at: string
          decided_by: string
          decision: string
          id: string
          reason: string | null
          request_id: string
          step_number: number
        }
        Insert: {
          conditions?: string | null
          decided_at?: string
          decided_by: string
          decision: string
          id?: string
          reason?: string | null
          request_id: string
          step_number?: number
        }
        Update: {
          conditions?: string | null
          decided_at?: string
          decided_by?: string
          decision?: string
          id?: string
          reason?: string | null
          request_id?: string
          step_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "approval_decisions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "approval_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          action_type: Database["public"]["Enums"]["approval_action_type"]
          amount: number
          branch_id: string
          created_at: string
          current_step: number
          entity_id: string
          entity_type: string
          expires_at: string | null
          financial_impact_preview: Json | null
          id: string
          matched_rule_id: string | null
          max_steps: number
          priority: string
          request_details: Json | null
          request_summary: string
          requester_id: string
          status: Database["public"]["Enums"]["approval_request_status"]
          supporting_notes: string | null
          updated_at: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["approval_action_type"]
          amount?: number
          branch_id: string
          created_at?: string
          current_step?: number
          entity_id: string
          entity_type: string
          expires_at?: string | null
          financial_impact_preview?: Json | null
          id?: string
          matched_rule_id?: string | null
          max_steps?: number
          priority?: string
          request_details?: Json | null
          request_summary: string
          requester_id: string
          status?: Database["public"]["Enums"]["approval_request_status"]
          supporting_notes?: string | null
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["approval_action_type"]
          amount?: number
          branch_id?: string
          created_at?: string
          current_step?: number
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          financial_impact_preview?: Json | null
          id?: string
          matched_rule_id?: string | null
          max_steps?: number
          priority?: string
          request_details?: Json | null
          request_summary?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["approval_request_status"]
          supporting_notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_matched_rule_id_fkey"
            columns: ["matched_rule_id"]
            isOneToOne: false
            referencedRelation: "approval_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_routing: {
        Row: {
          created_at: string
          id: string
          l1_approver_id: string | null
          l2_approver_id: string | null
          l2_disabled: boolean
          notify_on_decision: string[]
          notify_on_submit: string[]
          updated_at: string
          user_id: string
          workflow: string
        }
        Insert: {
          created_at?: string
          id?: string
          l1_approver_id?: string | null
          l2_approver_id?: string | null
          l2_disabled?: boolean
          notify_on_decision?: string[]
          notify_on_submit?: string[]
          updated_at?: string
          user_id: string
          workflow: string
        }
        Update: {
          created_at?: string
          id?: string
          l1_approver_id?: string | null
          l2_approver_id?: string | null
          l2_disabled?: boolean
          notify_on_decision?: string[]
          notify_on_submit?: string[]
          updated_at?: string
          user_id?: string
          workflow?: string
        }
        Relationships: []
      }
      approval_rules: {
        Row: {
          action_type: Database["public"]["Enums"]["approval_action_type"]
          amount_threshold: number
          branch_id: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          required_approver_role: Database["public"]["Enums"]["app_role"]
          requires_second_approval: boolean
          second_approver_role: Database["public"]["Enums"]["app_role"] | null
          updated_at: string
        }
        Insert: {
          action_type: Database["public"]["Enums"]["approval_action_type"]
          amount_threshold?: number
          branch_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          required_approver_role?: Database["public"]["Enums"]["app_role"]
          requires_second_approval?: boolean
          second_approver_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Update: {
          action_type?: Database["public"]["Enums"]["approval_action_type"]
          amount_threshold?: number
          branch_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          required_approver_role?: Database["public"]["Enums"]["app_role"]
          requires_second_approval?: boolean
          second_approver_role?: Database["public"]["Enums"]["app_role"] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_rules_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_settings: {
        Row: {
          auto_cc_depth: number
          auto_cc_reporting_chain: boolean
          branch_id: string | null
          claims_l2_enabled: boolean
          claims_l2_threshold: number
          created_at: string
          delegate_on_leave: boolean
          id: string
          leave_l2_enabled: boolean
          ot_l2_enabled: boolean
          payroll_l2_enabled: boolean
          sla_claim_hours: number
          sla_leave_hours: number
          sla_ot_hours: number
          sla_payroll_hours: number
          updated_at: string
          use_reports_to: boolean
        }
        Insert: {
          auto_cc_depth?: number
          auto_cc_reporting_chain?: boolean
          branch_id?: string | null
          claims_l2_enabled?: boolean
          claims_l2_threshold?: number
          created_at?: string
          delegate_on_leave?: boolean
          id?: string
          leave_l2_enabled?: boolean
          ot_l2_enabled?: boolean
          payroll_l2_enabled?: boolean
          sla_claim_hours?: number
          sla_leave_hours?: number
          sla_ot_hours?: number
          sla_payroll_hours?: number
          updated_at?: string
          use_reports_to?: boolean
        }
        Update: {
          auto_cc_depth?: number
          auto_cc_reporting_chain?: boolean
          branch_id?: string | null
          claims_l2_enabled?: boolean
          claims_l2_threshold?: number
          created_at?: string
          delegate_on_leave?: boolean
          id?: string
          leave_l2_enabled?: boolean
          ot_l2_enabled?: boolean
          payroll_l2_enabled?: boolean
          sla_claim_hours?: number
          sla_leave_hours?: number
          sla_ot_hours?: number
          sla_payroll_hours?: number
          updated_at?: string
          use_reports_to?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "approval_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          arrival_photo_url: string | null
          body_marks: string | null
          branch_id: string
          check_out_time: string | null
          checked_by: string | null
          checked_out_by: string | null
          created_at: string
          date: string
          departure_body_marks: string | null
          departure_health_notes: string | null
          departure_health_status: string | null
          departure_mood: string | null
          departure_notes: string | null
          departure_photo_url: string | null
          departure_temperature: number | null
          has_medication: boolean | null
          health_notes: string | null
          health_status: string | null
          id: string
          marked_by: string
          medication_handover: boolean | null
          medication_handover_notes: string | null
          medication_notes: string | null
          mood: string | null
          notes: string | null
          picked_up_by: string | null
          picked_up_by_relation: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          temperature: number | null
          updated_at: string
        }
        Insert: {
          arrival_photo_url?: string | null
          body_marks?: string | null
          branch_id: string
          check_out_time?: string | null
          checked_by?: string | null
          checked_out_by?: string | null
          created_at?: string
          date?: string
          departure_body_marks?: string | null
          departure_health_notes?: string | null
          departure_health_status?: string | null
          departure_mood?: string | null
          departure_notes?: string | null
          departure_photo_url?: string | null
          departure_temperature?: number | null
          has_medication?: boolean | null
          health_notes?: string | null
          health_status?: string | null
          id?: string
          marked_by: string
          medication_handover?: boolean | null
          medication_handover_notes?: string | null
          medication_notes?: string | null
          mood?: string | null
          notes?: string | null
          picked_up_by?: string | null
          picked_up_by_relation?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          temperature?: number | null
          updated_at?: string
        }
        Update: {
          arrival_photo_url?: string | null
          body_marks?: string | null
          branch_id?: string
          check_out_time?: string | null
          checked_by?: string | null
          checked_out_by?: string | null
          created_at?: string
          date?: string
          departure_body_marks?: string | null
          departure_health_notes?: string | null
          departure_health_status?: string | null
          departure_mood?: string | null
          departure_notes?: string | null
          departure_photo_url?: string | null
          departure_temperature?: number | null
          has_medication?: boolean | null
          health_notes?: string | null
          health_status?: string | null
          id?: string
          marked_by?: string
          medication_handover?: boolean | null
          medication_handover_notes?: string | null
          medication_notes?: string | null
          mood?: string | null
          notes?: string | null
          picked_up_by?: string | null
          picked_up_by_relation?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          temperature?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string
          target_label: string | null
          target_type: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id: string
          target_label?: string | null
          target_type: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string
          target_label?: string | null
          target_type?: string
        }
        Relationships: []
      }
      audit_questions: {
        Row: {
          category: Database["public"]["Enums"]["audit_question_category"]
          created_at: string
          id: string
          is_critical: boolean
          question_text: string
          sort_order: number
          template_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["audit_question_category"]
          created_at?: string
          id?: string
          is_critical?: boolean
          question_text: string
          sort_order?: number
          template_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["audit_question_category"]
          created_at?: string
          id?: string
          is_critical?: boolean
          question_text?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_questions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_responses: {
        Row: {
          audit_id: string
          auditor_notes: string | null
          corrective_action: string | null
          corrective_proof_url: string | null
          corrective_status: string
          created_at: string
          id: string
          photo_evidence_url: string | null
          question_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          audit_id: string
          auditor_notes?: string | null
          corrective_action?: string | null
          corrective_proof_url?: string | null
          corrective_status?: string
          created_at?: string
          id?: string
          photo_evidence_url?: string | null
          question_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          audit_id?: string
          auditor_notes?: string | null
          corrective_action?: string | null
          corrective_proof_url?: string | null
          corrective_status?: string
          created_at?: string
          id?: string
          photo_evidence_url?: string | null
          question_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_responses_audit_id_fkey"
            columns: ["audit_id"]
            isOneToOne: false
            referencedRelation: "branch_audits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_responses_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "audit_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_templates: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      baseline_assessments: {
        Row: {
          ai_detected_learning_style: string | null
          assessed_by: string
          assessment_type: string
          branch_id: string
          checklist_responses: Json | null
          cognitive_score: number
          created_at: string
          date_evaluated: string
          domain_scores: Json | null
          id: string
          language_score: number
          lead_id: string | null
          motor_skills_score: number
          socio_emotional_score: number
          source: string
          student_id: string
          teacher_notes: string | null
        }
        Insert: {
          ai_detected_learning_style?: string | null
          assessed_by: string
          assessment_type?: string
          branch_id: string
          checklist_responses?: Json | null
          cognitive_score?: number
          created_at?: string
          date_evaluated?: string
          domain_scores?: Json | null
          id?: string
          language_score?: number
          lead_id?: string | null
          motor_skills_score?: number
          socio_emotional_score?: number
          source?: string
          student_id: string
          teacher_notes?: string | null
        }
        Update: {
          ai_detected_learning_style?: string | null
          assessed_by?: string
          assessment_type?: string
          branch_id?: string
          checklist_responses?: Json | null
          cognitive_score?: number
          created_at?: string
          date_evaluated?: string
          domain_scores?: Json | null
          id?: string
          language_score?: number
          lead_id?: string | null
          motor_skills_score?: number
          socio_emotional_score?: number
          source?: string
          student_id?: string
          teacher_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "baseline_assessments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_assessments_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "baseline_assessments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          branch_id: string | null
          created_at: string | null
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          branch_id?: string | null
          created_at?: string | null
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          branch_id?: string | null
          created_at?: string | null
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_audit_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_config: {
        Row: {
          auto_generate_monthly_invoices: boolean
          billplz_enabled: boolean
          branch_id: string
          created_at: string
          credit_note_template: Json | null
          due_date_days: number
          grace_period_days: number
          id: string
          invoice_numbering: string
          invoice_prefix: string
          invoice_template: Json | null
          late_fee_amount: number
          late_fee_enabled: boolean
          late_fee_max: number | null
          late_fee_type: string
          payment_methods_enabled: string[]
          receipt_template: Json | null
          reminder_channel: string
          reminder_days_after_due: number[]
          reminder_days_before_due: number[]
          reminder_enabled: boolean
          reminder_template: Json | null
          statement_template: Json | null
          tax_enabled: boolean
          tax_label: string
          tax_rate: number
          tax_registration_no: string | null
          updated_at: string
        }
        Insert: {
          auto_generate_monthly_invoices?: boolean
          billplz_enabled?: boolean
          branch_id: string
          created_at?: string
          credit_note_template?: Json | null
          due_date_days?: number
          grace_period_days?: number
          id?: string
          invoice_numbering?: string
          invoice_prefix?: string
          invoice_template?: Json | null
          late_fee_amount?: number
          late_fee_enabled?: boolean
          late_fee_max?: number | null
          late_fee_type?: string
          payment_methods_enabled?: string[]
          receipt_template?: Json | null
          reminder_channel?: string
          reminder_days_after_due?: number[]
          reminder_days_before_due?: number[]
          reminder_enabled?: boolean
          reminder_template?: Json | null
          statement_template?: Json | null
          tax_enabled?: boolean
          tax_label?: string
          tax_rate?: number
          tax_registration_no?: string | null
          updated_at?: string
        }
        Update: {
          auto_generate_monthly_invoices?: boolean
          billplz_enabled?: boolean
          branch_id?: string
          created_at?: string
          credit_note_template?: Json | null
          due_date_days?: number
          grace_period_days?: number
          id?: string
          invoice_numbering?: string
          invoice_prefix?: string
          invoice_template?: Json | null
          late_fee_amount?: number
          late_fee_enabled?: boolean
          late_fee_max?: number | null
          late_fee_type?: string
          payment_methods_enabled?: string[]
          receipt_template?: Json | null
          reminder_channel?: string
          reminder_days_after_due?: number[]
          reminder_days_before_due?: number[]
          reminder_enabled?: boolean
          reminder_template?: Json | null
          statement_template?: Json | null
          tax_enabled?: boolean
          tax_label?: string
          tax_rate?: number
          tax_registration_no?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_config_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_ledger: {
        Row: {
          branch_id: string
          created_at: string | null
          created_by: string | null
          credit: number
          debit: number
          description: string | null
          entry_type: string
          id: string
          invoice_id: string | null
          metadata: Json | null
          payer_account_id: string | null
          payment_id: string | null
          reference_number: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_type: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payer_account_id?: string | null
          payment_id?: string | null
          reference_number?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          created_by?: string | null
          credit?: number
          debit?: number
          description?: string | null
          entry_type?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payer_account_id?: string | null
          payment_id?: string | null
          reference_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_ledger_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_ledger_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_ledger_payer_account_id_fkey"
            columns: ["payer_account_id"]
            isOneToOne: false
            referencedRelation: "payer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_ledger_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_profile_items: {
        Row: {
          created_at: string
          discount_amount: number | null
          discount_reason: string | null
          discount_type: string
          effective_from: string
          effective_until: string | null
          fee_package_id: string
          fee_version_id: string | null
          id: string
          is_active: boolean
          profile_id: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          discount_reason?: string | null
          discount_type?: string
          effective_from?: string
          effective_until?: string | null
          fee_package_id: string
          fee_version_id?: string | null
          id?: string
          is_active?: boolean
          profile_id: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          discount_reason?: string | null
          discount_type?: string
          effective_from?: string
          effective_until?: string | null
          fee_package_id?: string
          fee_version_id?: string | null
          id?: string
          is_active?: boolean
          profile_id?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_profile_items_fee_package_id_fkey"
            columns: ["fee_package_id"]
            isOneToOne: false
            referencedRelation: "fee_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_profile_items_fee_version_id_fkey"
            columns: ["fee_version_id"]
            isOneToOne: false
            referencedRelation: "fee_package_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "billing_profile_items_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "student_billing_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_audits: {
        Row: {
          auditor_id: string
          branch_id: string
          completed_at: string | null
          created_at: string
          id: string
          max_score: number
          status: string
          template_id: string
          total_score: number
        }
        Insert: {
          auditor_id: string
          branch_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          max_score?: number
          status?: string
          template_id: string
          total_score?: number
        }
        Update: {
          auditor_id?: string
          branch_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          max_score?: number
          status?: string
          template_id?: string
          total_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_audits_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_audits_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "audit_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_events: {
        Row: {
          affects_attendance: boolean
          branch_id: string
          created_at: string | null
          created_by: string
          end_date: string | null
          event_date: string
          event_kind: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name: string
          event_type: string
          id: string
          is_paid: boolean
        }
        Insert: {
          affects_attendance?: boolean
          branch_id: string
          created_at?: string | null
          created_by: string
          end_date?: string | null
          event_date: string
          event_kind?: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name: string
          event_type?: string
          id?: string
          is_paid?: boolean
        }
        Update: {
          affects_attendance?: boolean
          branch_id?: string
          created_at?: string | null
          created_by?: string
          end_date?: string | null
          event_date?: string
          event_kind?: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name?: string
          event_type?: string
          id?: string
          is_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "branch_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_financials: {
        Row: {
          branch_id: string
          cost_per_student: number | null
          created_at: string | null
          id: string
          month_year: string
          royalty_fee_due: number | null
          total_expenses: number | null
          total_revenue: number | null
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          cost_per_student?: number | null
          created_at?: string | null
          id?: string
          month_year: string
          royalty_fee_due?: number | null
          total_expenses?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          cost_per_student?: number | null
          created_at?: string | null
          id?: string
          month_year?: string
          royalty_fee_due?: number | null
          total_expenses?: number | null
          total_revenue?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_financials_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_memberships: {
        Row: {
          assigned_class_ids: string[] | null
          branch_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          assigned_class_ids?: string[] | null
          branch_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          assigned_class_ids?: string[] | null
          branch_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_memberships_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_methodologies: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          is_primary: boolean | null
          methodology_framework_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          methodology_framework_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          is_primary?: boolean | null
          methodology_framework_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_methodologies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_methodologies_methodology_framework_id_fkey"
            columns: ["methodology_framework_id"]
            isOneToOne: false
            referencedRelation: "methodology_frameworks"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_settings: {
        Row: {
          address_line: string | null
          branch_id: string
          business_registration_no: string | null
          class_names: string[] | null
          created_at: string
          email: string | null
          email_brand_color: string | null
          email_footer_text: string | null
          email_from_address: string | null
          email_reply_to: string | null
          email_sender_name: string | null
          id: string
          invoice_notes: string | null
          invoice_terms: string | null
          logo_url: string | null
          phone: string | null
          programs_offered: Json | null
          receipt_footer: string | null
          school_display_name: string | null
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          branch_id: string
          business_registration_no?: string | null
          class_names?: string[] | null
          created_at?: string
          email?: string | null
          email_brand_color?: string | null
          email_footer_text?: string | null
          email_from_address?: string | null
          email_reply_to?: string | null
          email_sender_name?: string | null
          id?: string
          invoice_notes?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          phone?: string | null
          programs_offered?: Json | null
          receipt_footer?: string | null
          school_display_name?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          branch_id?: string
          business_registration_no?: string | null
          class_names?: string[] | null
          created_at?: string
          email?: string | null
          email_brand_color?: string | null
          email_footer_text?: string | null
          email_from_address?: string | null
          email_reply_to?: string | null
          email_sender_name?: string | null
          id?: string
          invoice_notes?: string | null
          invoice_terms?: string | null
          logo_url?: string | null
          phone?: string | null
          programs_offered?: Json | null
          receipt_footer?: string | null
          school_display_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          max_capacity: number | null
          name: string
          organization_id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          max_capacity?: number | null
          name: string
          organization_id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          max_capacity?: number | null
          name?: string
          organization_id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string
          amount: number
          branch_id: string
          created_at: string
          id: string
          month: number
          notes: string | null
          updated_at: string
          year: number
        }
        Insert: {
          account_id: string
          amount?: number
          branch_id: string
          created_at?: string
          id?: string
          month: number
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string
          created_at?: string
          id?: string
          month?: number
          notes?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      carry_forward_log: {
        Row: {
          branch_id: string
          carried_by: string
          created_at: string
          days_carried: number
          from_year: number
          id: string
          leave_type: string
          to_year: number
          user_id: string
        }
        Insert: {
          branch_id: string
          carried_by: string
          created_at?: string
          days_carried?: number
          from_year: number
          id?: string
          leave_type: string
          to_year: number
          user_id: string
        }
        Update: {
          branch_id?: string
          carried_by?: string
          created_at?: string
          days_carried?: number
          from_year?: number
          id?: string
          leave_type?: string
          to_year?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "carry_forward_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          is_read: boolean
          read_at: string | null
          sender_id: string
          text_body: string
          translated_text: Json | null
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          sender_id: string
          text_body: string
          translated_text?: Json | null
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          read_at?: string | null
          sender_id?: string
          text_body?: string
          translated_text?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      child_goal_progress: {
        Row: {
          assessment_id: string | null
          goal_id: string
          id: string
          note: string | null
          observation_id: string | null
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          assessment_id?: string | null
          goal_id: string
          id?: string
          note?: string | null
          observation_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          assessment_id?: string | null
          goal_id?: string
          id?: string
          note?: string | null
          observation_id?: string | null
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_goal_progress_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "baseline_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_goal_progress_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "child_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_goal_progress_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "student_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      child_goals: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          scope: string
          status: string
          student_id: string
          target_date: string | null
          target_domain_id: string | null
          target_proficiency: number | null
          title: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          scope: string
          status?: string
          student_id: string
          target_date?: string | null
          target_domain_id?: string | null
          target_proficiency?: number | null
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          scope?: string
          status?: string
          student_id?: string
          target_date?: string | null
          target_domain_id?: string | null
          target_proficiency?: number | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_goals_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_goals_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_goals_target_domain_id_fkey"
            columns: ["target_domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_goals_target_domain_id_fkey"
            columns: ["target_domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      child_next_focus: {
        Row: {
          branch_id: string
          class_id: string | null
          created_at: string
          created_by: string | null
          domain_ids_json: Json
          focus_description: string | null
          focus_title: string
          home_support_json: Json
          id: string
          lesson_plan_id: string | null
          observation_cues_json: Json
          reviewed_at: string | null
          reviewed_by: string | null
          skill_labels_json: Json
          source: Database["public"]["Enums"]["next_focus_source"]
          status: Database["public"]["Enums"]["next_focus_status"]
          student_id: string
          updated_at: string
          visible_to_parent: boolean
          vocabulary_json: Json
          week_starting: string
          weekly_plan_id: string | null
        }
        Insert: {
          branch_id: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          domain_ids_json?: Json
          focus_description?: string | null
          focus_title: string
          home_support_json?: Json
          id?: string
          lesson_plan_id?: string | null
          observation_cues_json?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          skill_labels_json?: Json
          source?: Database["public"]["Enums"]["next_focus_source"]
          status?: Database["public"]["Enums"]["next_focus_status"]
          student_id: string
          updated_at?: string
          visible_to_parent?: boolean
          vocabulary_json?: Json
          week_starting: string
          weekly_plan_id?: string | null
        }
        Update: {
          branch_id?: string
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          domain_ids_json?: Json
          focus_description?: string | null
          focus_title?: string
          home_support_json?: Json
          id?: string
          lesson_plan_id?: string | null
          observation_cues_json?: Json
          reviewed_at?: string | null
          reviewed_by?: string | null
          skill_labels_json?: Json
          source?: Database["public"]["Enums"]["next_focus_source"]
          status?: Database["public"]["Enums"]["next_focus_status"]
          student_id?: string
          updated_at?: string
          visible_to_parent?: boolean
          vocabulary_json?: Json
          week_starting?: string
          weekly_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_next_focus_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_next_focus_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_next_focus_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      child_next_focus_evidence: {
        Row: {
          child_update_id: string
          child_update_skill_id: string | null
          created_at: string
          focus_id: string
          id: string
          student_id: string
        }
        Insert: {
          child_update_id: string
          child_update_skill_id?: string | null
          created_at?: string
          focus_id: string
          id?: string
          student_id: string
        }
        Update: {
          child_update_id?: string
          child_update_skill_id?: string | null
          created_at?: string
          focus_id?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_next_focus_evidence_child_update_id_fkey"
            columns: ["child_update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_next_focus_evidence_child_update_skill_id_fkey"
            columns: ["child_update_skill_id"]
            isOneToOne: false
            referencedRelation: "child_update_skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_next_focus_evidence_focus_id_fkey"
            columns: ["focus_id"]
            isOneToOne: false
            referencedRelation: "child_next_focus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_next_focus_evidence_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      child_skill_progress: {
        Row: {
          confidence_score: number | null
          created_at: string
          current_status: string
          curriculum_indicator_id: string | null
          curriculum_objective_id: string | null
          domain_id: string | null
          evidence_count: number
          first_observed_at: string
          id: string
          indicator_id: string | null
          indicator_label: string
          last_observed_at: string
          last_skill_id: string | null
          last_update_id: string | null
          normalized_indicator_label: string
          student_id: string
          updated_at: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          current_status?: string
          curriculum_indicator_id?: string | null
          curriculum_objective_id?: string | null
          domain_id?: string | null
          evidence_count?: number
          first_observed_at?: string
          id?: string
          indicator_id?: string | null
          indicator_label: string
          last_observed_at?: string
          last_skill_id?: string | null
          last_update_id?: string | null
          normalized_indicator_label: string
          student_id: string
          updated_at?: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          current_status?: string
          curriculum_indicator_id?: string | null
          curriculum_objective_id?: string | null
          domain_id?: string | null
          evidence_count?: number
          first_observed_at?: string
          id?: string
          indicator_id?: string | null
          indicator_label?: string
          last_observed_at?: string
          last_skill_id?: string | null
          last_update_id?: string | null
          normalized_indicator_label?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_skill_progress_curriculum_indicator_id_fkey"
            columns: ["curriculum_indicator_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objective_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_skill_progress_curriculum_objective_id_fkey"
            columns: ["curriculum_objective_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_skill_progress_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_skill_progress_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "child_skill_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      child_update_media: {
        Row: {
          created_at: string
          duration_s: number | null
          height: number | null
          id: string
          kind: string
          sort_order: number
          thumbnail_url: string | null
          update_id: string
          update_skill_id: string | null
          url: string
          width: number | null
        }
        Insert: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          kind?: string
          sort_order?: number
          thumbnail_url?: string | null
          update_id: string
          update_skill_id?: string | null
          url: string
          width?: number | null
        }
        Update: {
          created_at?: string
          duration_s?: number | null
          height?: number | null
          id?: string
          kind?: string
          sort_order?: number
          thumbnail_url?: string | null
          update_id?: string
          update_skill_id?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "child_update_media_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_update_media_update_skill_id_fkey"
            columns: ["update_skill_id"]
            isOneToOne: false
            referencedRelation: "child_update_skills"
            referencedColumns: ["id"]
          },
        ]
      }
      child_update_skills: {
        Row: {
          created_at: string
          curriculum_indicator_id: string | null
          curriculum_objective_id: string | null
          domain_id: string | null
          id: string
          indicator_id: string | null
          indicator_label: string | null
          proficiency_level: string | null
          update_id: string
        }
        Insert: {
          created_at?: string
          curriculum_indicator_id?: string | null
          curriculum_objective_id?: string | null
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          indicator_label?: string | null
          proficiency_level?: string | null
          update_id: string
        }
        Update: {
          created_at?: string
          curriculum_indicator_id?: string | null
          curriculum_objective_id?: string | null
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          indicator_label?: string | null
          proficiency_level?: string | null
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_update_skills_curriculum_indicator_id_fkey"
            columns: ["curriculum_indicator_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objective_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_update_skills_curriculum_objective_id_fkey"
            columns: ["curriculum_objective_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_update_skills_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_update_skills_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "child_update_skills_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      child_update_students: {
        Row: {
          student_id: string
          update_id: string
        }
        Insert: {
          student_id: string
          update_id: string
        }
        Update: {
          student_id?: string
          update_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_update_students_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      child_updates: {
        Row: {
          activity_date: string
          ai_learning_story: string | null
          album_id: string | null
          branch_id: string
          caption: string | null
          class_id: string | null
          created_at: string
          created_by: string
          domain_id: string | null
          id: string
          indicator_id: string | null
          milestone_flag: boolean
          parent_summary: string | null
          portfolio_candidate: boolean
          proficiency_level: string | null
          source_lesson_plan_id: string | null
          source_timetable_slot_id: string | null
          status: string
          student_id: string | null
          subject_name: string | null
          teacher_note: string | null
          updated_at: string
          visible_to_parent: boolean
        }
        Insert: {
          activity_date?: string
          ai_learning_story?: string | null
          album_id?: string | null
          branch_id: string
          caption?: string | null
          class_id?: string | null
          created_at?: string
          created_by: string
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          milestone_flag?: boolean
          parent_summary?: string | null
          portfolio_candidate?: boolean
          proficiency_level?: string | null
          source_lesson_plan_id?: string | null
          source_timetable_slot_id?: string | null
          status?: string
          student_id?: string | null
          subject_name?: string | null
          teacher_note?: string | null
          updated_at?: string
          visible_to_parent?: boolean
        }
        Update: {
          activity_date?: string
          ai_learning_story?: string | null
          album_id?: string | null
          branch_id?: string
          caption?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          milestone_flag?: boolean
          parent_summary?: string | null
          portfolio_candidate?: boolean
          proficiency_level?: string | null
          source_lesson_plan_id?: string | null
          source_timetable_slot_id?: string | null
          status?: string
          student_id?: string | null
          subject_name?: string | null
          teacher_note?: string | null
          updated_at?: string
          visible_to_parent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "child_updates_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "learning_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_updates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_updates_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_updates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_updates_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_updates_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "child_updates_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_coverage_logs: {
        Row: {
          branch_id: string
          class_id: string
          coverage_type: string | null
          created_at: string
          domain_id: string | null
          id: string
          indicator_id: string | null
          lesson_plan_id: string | null
          month_number: number | null
          observation_linked_count: number | null
          outcome_id: string | null
          standard_code: string
          subject_name: string
          theme_bank_id: string | null
          week_starting: string
          weekly_focus: string | null
        }
        Insert: {
          branch_id: string
          class_id: string
          coverage_type?: string | null
          created_at?: string
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          lesson_plan_id?: string | null
          month_number?: number | null
          observation_linked_count?: number | null
          outcome_id?: string | null
          standard_code: string
          subject_name: string
          theme_bank_id?: string | null
          week_starting: string
          weekly_focus?: string | null
        }
        Update: {
          branch_id?: string
          class_id?: string
          coverage_type?: string | null
          created_at?: string
          domain_id?: string | null
          id?: string
          indicator_id?: string | null
          lesson_plan_id?: string | null
          month_number?: number | null
          observation_linked_count?: number | null
          outcome_id?: string | null
          standard_code?: string
          subject_name?: string
          theme_bank_id?: string | null
          week_starting?: string
          weekly_focus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_coverage_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_coverage_logs_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_coverage_logs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_coverage_logs_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "class_coverage_logs_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "development_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_coverage_logs_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "development_outcomes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_coverage_logs_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      class_readiness_snapshots: {
        Row: {
          class_id: string
          created_at: string
          id: string
          language_summary_json: Json | null
          literacy_summary_json: Json | null
          motor_summary_json: Json | null
          next_focus_json: Json | null
          numeracy_summary_json: Json | null
          self_help_summary_json: Json | null
          social_summary_json: Json | null
          term: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          id?: string
          language_summary_json?: Json | null
          literacy_summary_json?: Json | null
          motor_summary_json?: Json | null
          next_focus_json?: Json | null
          numeracy_summary_json?: Json | null
          self_help_summary_json?: Json | null
          social_summary_json?: Json | null
          term: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          id?: string
          language_summary_json?: Json | null
          literacy_summary_json?: Json | null
          motor_summary_json?: Json | null
          next_focus_json?: Json | null
          numeracy_summary_json?: Json | null
          self_help_summary_json?: Json | null
          social_summary_json?: Json | null
          term?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_readiness_snapshots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          age_group: string
          branch_id: string
          class_name: string
          created_at: string
          id: string
          is_active: boolean
          program_type: string
        }
        Insert: {
          age_group?: string
          branch_id: string
          class_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          program_type?: string
        }
        Update: {
          age_group?: string
          branch_id?: string
          class_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          program_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      collection_notes: {
        Row: {
          branch_id: string
          contact_method: string | null
          content: string
          created_at: string | null
          created_by: string
          id: string
          invoice_id: string
          note_type: string
          promise_amount: number | null
          promise_date: string | null
        }
        Insert: {
          branch_id: string
          contact_method?: string | null
          content: string
          created_at?: string | null
          created_by: string
          id?: string
          invoice_id: string
          note_type?: string
          promise_amount?: number | null
          promise_date?: string | null
        }
        Update: {
          branch_id?: string
          contact_method?: string | null
          content?: string
          created_at?: string | null
          created_by?: string
          id?: string
          invoice_id?: string
          note_type?: string
          promise_amount?: number | null
          promise_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collection_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      commercial_book_page_mappings: {
        Row: {
          age_group: string | null
          approved_by_principal: boolean
          book_title: string
          branch_id: string
          created_at: string
          created_by: string | null
          difficulty_level: string | null
          id: string
          key_words: Json
          learning_goal_text: string | null
          page_from: string
          page_to: string | null
          skill_focus: string
          subject: string
          teacher_notes: string | null
          theme_tags: Json | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_group?: string | null
          approved_by_principal?: boolean
          book_title: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          difficulty_level?: string | null
          id?: string
          key_words?: Json
          learning_goal_text?: string | null
          page_from: string
          page_to?: string | null
          skill_focus: string
          subject: string
          teacher_notes?: string | null
          theme_tags?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_group?: string | null
          approved_by_principal?: boolean
          book_title?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          difficulty_level?: string | null
          id?: string
          key_words?: Json
          learning_goal_text?: string | null
          page_from?: string
          page_to?: string | null
          skill_focus?: string
          subject?: string
          teacher_notes?: string | null
          theme_tags?: Json | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "commercial_book_page_mappings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      competencies: {
        Row: {
          created_at: string
          description_ms: string | null
          id: string
          name_en: string | null
          name_ms: string
          sort_order: number
          sub_competencies: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_ms?: string | null
          id?: string
          name_en?: string | null
          name_ms: string
          sort_order?: number
          sub_competencies?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_ms?: string | null
          id?: string
          name_en?: string | null
          name_ms?: string
          sort_order?: number
          sub_competencies?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          ai_intent_tag: string | null
          ai_sentiment: string | null
          branch_id: string
          created_at: string
          id: string
          parent_id: string
          status: string
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          ai_intent_tag?: string | null
          ai_sentiment?: string | null
          branch_id: string
          created_at?: string
          id?: string
          parent_id: string
          status?: string
          student_id: string
          subject?: string
          updated_at?: string
        }
        Update: {
          ai_intent_tag?: string | null
          ai_sentiment?: string | null
          branch_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          status?: string
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          approved_by: string | null
          branch_id: string
          created_at: string
          created_by: string
          credit_note_number: string
          id: string
          invoice_id: string | null
          processed_at: string | null
          reason: string | null
          status: string
          student_id: string
          type: string
        }
        Insert: {
          amount?: number
          approved_by?: string | null
          branch_id: string
          created_at?: string
          created_by: string
          credit_note_number: string
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          reason?: string | null
          status?: string
          student_id: string
          type?: string
        }
        Update: {
          amount?: number
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string
          credit_note_number?: string
          id?: string
          invoice_id?: string | null
          processed_at?: string | null
          reason?: string | null
          status?: string
          student_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_month_plans: {
        Row: {
          big_idea: string | null
          branch_id: string
          concepts: Json | null
          created_at: string
          focus_outcomes: Json | null
          id: string
          month_number: number
          notes: string | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          theme: string | null
          theme_bank_id: string | null
          updated_at: string
          vocabulary: Json | null
          year_plan_id: string
        }
        Insert: {
          big_idea?: string | null
          branch_id: string
          concepts?: Json | null
          created_at?: string
          focus_outcomes?: Json | null
          id?: string
          month_number: number
          notes?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          theme?: string | null
          theme_bank_id?: string | null
          updated_at?: string
          vocabulary?: Json | null
          year_plan_id: string
        }
        Update: {
          big_idea?: string | null
          branch_id?: string
          concepts?: Json | null
          created_at?: string
          focus_outcomes?: Json | null
          id?: string
          month_number?: number
          notes?: string | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          theme?: string | null
          theme_bank_id?: string | null
          updated_at?: string
          vocabulary?: Json | null
          year_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_month_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_month_plans_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_month_plans_year_plan_id_fkey"
            columns: ["year_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_year_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_objective_indicators: {
        Row: {
          created_at: string
          evidence_example: string | null
          id: string
          indicator_label: string
          is_active: boolean
          objective_id: string
          observation_prompt: string | null
          proficiency_levels: string[]
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence_example?: string | null
          id?: string
          indicator_label: string
          is_active?: boolean
          objective_id: string
          observation_prompt?: string | null
          proficiency_levels?: string[]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence_example?: string | null
          id?: string
          indicator_label?: string
          is_active?: boolean
          objective_id?: string
          observation_prompt?: string | null
          proficiency_levels?: string[]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_objective_indicators_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_objectives: {
        Row: {
          age_profile_id: string
          created_at: string
          created_by: string | null
          domain_id: string
          id: string
          is_active: boolean
          level: string | null
          objective_code: string
          objective_type: string
          observable_evidence: Json
          parent_description: string | null
          parent_title: string
          parent_visible: boolean
          recommended_term: string | null
          sort_order: number
          source: string
          teacher_description: string | null
          teacher_title: string
          updated_at: string
        }
        Insert: {
          age_profile_id: string
          created_at?: string
          created_by?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          level?: string | null
          objective_code: string
          objective_type?: string
          observable_evidence?: Json
          parent_description?: string | null
          parent_title: string
          parent_visible?: boolean
          recommended_term?: string | null
          sort_order?: number
          source?: string
          teacher_description?: string | null
          teacher_title: string
          updated_at?: string
        }
        Update: {
          age_profile_id?: string
          created_at?: string
          created_by?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          level?: string | null
          objective_code?: string
          objective_type?: string
          observable_evidence?: Json
          parent_description?: string | null
          parent_title?: string
          parent_visible?: boolean
          recommended_term?: string | null
          sort_order?: number
          source?: string
          teacher_description?: string | null
          teacher_title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_objectives_age_profile_id_fkey"
            columns: ["age_profile_id"]
            isOneToOne: false
            referencedRelation: "age_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_objectives_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_objectives_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      curriculum_standards: {
        Row: {
          code: string
          created_at: string
          description_ms: string | null
          id: string
          learning_area_id: string
          level: Database["public"]["Enums"]["curriculum_level"]
          notes: string | null
          parent_id: string | null
          sort_order: number
          title_en: string | null
          title_ms: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description_ms?: string | null
          id?: string
          learning_area_id: string
          level: Database["public"]["Enums"]["curriculum_level"]
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          title_en?: string | null
          title_ms: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description_ms?: string | null
          id?: string
          learning_area_id?: string
          level?: Database["public"]["Enums"]["curriculum_level"]
          notes?: string | null
          parent_id?: string | null
          sort_order?: number
          title_en?: string | null
          title_ms?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_standards_learning_area_id_fkey"
            columns: ["learning_area_id"]
            isOneToOne: false
            referencedRelation: "learning_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_standards_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_vocabulary: {
        Row: {
          active_status: boolean
          activity_context: string | null
          age_profile_id: string
          bm_word: string | null
          created_at: string
          domain_id: string | null
          english_word: string | null
          id: string
          objective_id: string | null
          parent_example_sentence_bm: string | null
          parent_example_sentence_en: string | null
          sort_order: number
          teacher_prompt_bm: string | null
          teacher_prompt_en: string | null
          theme_id: string | null
          updated_at: string
          vocabulary_level: string
          word_type: string
        }
        Insert: {
          active_status?: boolean
          activity_context?: string | null
          age_profile_id: string
          bm_word?: string | null
          created_at?: string
          domain_id?: string | null
          english_word?: string | null
          id?: string
          objective_id?: string | null
          parent_example_sentence_bm?: string | null
          parent_example_sentence_en?: string | null
          sort_order?: number
          teacher_prompt_bm?: string | null
          teacher_prompt_en?: string | null
          theme_id?: string | null
          updated_at?: string
          vocabulary_level?: string
          word_type?: string
        }
        Update: {
          active_status?: boolean
          activity_context?: string | null
          age_profile_id?: string
          bm_word?: string | null
          created_at?: string
          domain_id?: string | null
          english_word?: string | null
          id?: string
          objective_id?: string | null
          parent_example_sentence_bm?: string | null
          parent_example_sentence_en?: string | null
          sort_order?: number
          teacher_prompt_bm?: string | null
          teacher_prompt_en?: string | null
          theme_id?: string | null
          updated_at?: string
          vocabulary_level?: string
          word_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_vocabulary_age_profile_id_fkey"
            columns: ["age_profile_id"]
            isOneToOne: false
            referencedRelation: "age_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_vocabulary_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_vocabulary_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "curriculum_vocabulary_objective_id_fkey"
            columns: ["objective_id"]
            isOneToOne: false
            referencedRelation: "curriculum_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_vocabulary_theme_id_fkey"
            columns: ["theme_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_week_plans: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          focus_area: string | null
          id: string
          key_questions: Json | null
          month_plan_id: string
          notes: string | null
          observation_focus: Json | null
          review_notes: string | null
          review_status: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string | null
          submitted_by: string | null
          title: string | null
          updated_at: string
          week_number: number
          week_starting: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          focus_area?: string | null
          id?: string
          key_questions?: Json | null
          month_plan_id: string
          notes?: string | null
          observation_focus?: Json | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string | null
          updated_at?: string
          week_number: number
          week_starting?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          focus_area?: string | null
          id?: string
          key_questions?: Json | null
          month_plan_id?: string
          notes?: string | null
          observation_focus?: Json | null
          review_notes?: string | null
          review_status?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string | null
          submitted_by?: string | null
          title?: string | null
          updated_at?: string
          week_number?: number
          week_starting?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_week_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_week_plans_month_plan_id_fkey"
            columns: ["month_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_month_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      curriculum_year_plans: {
        Row: {
          academic_year_id: string
          age_group_id: string
          branch_id: string
          created_at: string
          created_by: string
          id: string
          notes: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          age_group_id: string
          branch_id: string
          created_at?: string
          created_by: string
          id?: string
          notes?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          age_group_id?: string
          branch_id?: string
          created_at?: string
          created_by?: string
          id?: string
          notes?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "curriculum_year_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_year_plans_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "curriculum_year_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_leave_balances: {
        Row: {
          branch_id: string
          created_at: string
          custom_leave_type_id: string
          id: string
          total: number
          updated_at: string
          used: number
          user_id: string
          year: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          custom_leave_type_id: string
          id?: string
          total?: number
          updated_at?: string
          used?: number
          user_id: string
          year?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          custom_leave_type_id?: string
          id?: string
          total?: number
          updated_at?: string
          used?: number
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "custom_leave_balances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_leave_balances_custom_leave_type_id_fkey"
            columns: ["custom_leave_type_id"]
            isOneToOne: false
            referencedRelation: "custom_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_leave_types: {
        Row: {
          branch_id: string
          code: string
          created_at: string
          created_by: string | null
          default_days: number
          id: string
          is_active: boolean
          name: string
          paid: boolean
          requires_attachment: boolean
          updated_at: string
        }
        Insert: {
          branch_id: string
          code: string
          created_at?: string
          created_by?: string | null
          default_days?: number
          id?: string
          is_active?: boolean
          name: string
          paid?: boolean
          requires_attachment?: boolean
          updated_at?: string
        }
        Update: {
          branch_id?: string
          code?: string
          created_at?: string
          created_by?: string | null
          default_days?: number
          id?: string
          is_active?: boolean
          name?: string
          paid?: boolean
          requires_attachment?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_leave_types_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_journey_summaries: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          day: string
          id: string
          student_id: string
          summary: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          day: string
          id?: string
          student_id: string
          summary: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          day?: string
          id?: string
          student_id?: string
          summary?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_journey_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_learning_journey_entries: {
        Row: {
          approved_at: string | null
          class_id: string | null
          created_at: string
          created_by: string
          domain_id: string | null
          entry_type: string
          id: string
          lesson_objective_id: string | null
          lesson_plan_id: string | null
          linked_indicator_id: string | null
          milestone_flag: boolean | null
          next_step: string | null
          objective_indicator_id: string | null
          parent_summary: string | null
          parent_visibility_status: string | null
          portfolio_candidate: boolean | null
          student_id: string
          teacher_approved: boolean | null
          teacher_note: string | null
          theme_bank_id: string | null
          title: string
          visible_to_parent: boolean
        }
        Insert: {
          approved_at?: string | null
          class_id?: string | null
          created_at?: string
          created_by: string
          domain_id?: string | null
          entry_type?: string
          id?: string
          lesson_objective_id?: string | null
          lesson_plan_id?: string | null
          linked_indicator_id?: string | null
          milestone_flag?: boolean | null
          next_step?: string | null
          objective_indicator_id?: string | null
          parent_summary?: string | null
          parent_visibility_status?: string | null
          portfolio_candidate?: boolean | null
          student_id: string
          teacher_approved?: boolean | null
          teacher_note?: string | null
          theme_bank_id?: string | null
          title: string
          visible_to_parent?: boolean
        }
        Update: {
          approved_at?: string | null
          class_id?: string | null
          created_at?: string
          created_by?: string
          domain_id?: string | null
          entry_type?: string
          id?: string
          lesson_objective_id?: string | null
          lesson_plan_id?: string | null
          linked_indicator_id?: string | null
          milestone_flag?: boolean | null
          next_step?: string | null
          objective_indicator_id?: string | null
          parent_summary?: string | null
          parent_visibility_status?: string | null
          portfolio_candidate?: boolean | null
          student_id?: string
          teacher_approved?: boolean | null
          teacher_note?: string | null
          theme_bank_id?: string | null
          title?: string
          visible_to_parent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "daily_learning_journey_entries_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_linked_indicator_id_fkey"
            columns: ["linked_indicator_id"]
            isOneToOne: false
            referencedRelation: "observation_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_objective_indicator_id_fkey"
            columns: ["objective_indicator_id"]
            isOneToOne: false
            referencedRelation: "objective_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_learning_journey_entries_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_timetable_slots: {
        Row: {
          branch_id: string
          cancellation_reason: string | null
          class_id: string
          created_at: string | null
          end_time: string
          event_agenda: Json | null
          event_description: string | null
          event_name: string | null
          id: string
          is_cancelled: boolean
          is_modified: boolean | null
          is_parallel_group: boolean | null
          parallel_group_label: string | null
          slot_date: string
          source_slot_id: string | null
          start_time: string
          subject_name: string
        }
        Insert: {
          branch_id: string
          cancellation_reason?: string | null
          class_id: string
          created_at?: string | null
          end_time: string
          event_agenda?: Json | null
          event_description?: string | null
          event_name?: string | null
          id?: string
          is_cancelled?: boolean
          is_modified?: boolean | null
          is_parallel_group?: boolean | null
          parallel_group_label?: string | null
          slot_date: string
          source_slot_id?: string | null
          start_time: string
          subject_name: string
        }
        Update: {
          branch_id?: string
          cancellation_reason?: string | null
          class_id?: string
          created_at?: string | null
          end_time?: string
          event_agenda?: Json | null
          event_description?: string | null
          event_name?: string | null
          id?: string
          is_cancelled?: boolean
          is_modified?: boolean | null
          is_parallel_group?: boolean | null
          parallel_group_label?: string | null
          slot_date?: string
          source_slot_id?: string | null
          start_time?: string
          subject_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_timetable_slots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_timetable_slots_source_slot_id_fkey"
            columns: ["source_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      development_domains: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      development_indicators: {
        Row: {
          created_at: string
          evidence_type: string | null
          id: string
          indicator_text: string
          observable_examples: Json | null
          outcome_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          evidence_type?: string | null
          id?: string
          indicator_text: string
          observable_examples?: Json | null
          outcome_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          evidence_type?: string | null
          id?: string
          indicator_text?: string
          observable_examples?: Json | null
          outcome_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "development_indicators_outcome_id_fkey"
            columns: ["outcome_id"]
            isOneToOne: false
            referencedRelation: "development_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      development_outcomes: {
        Row: {
          age_profile_id: string
          created_at: string
          domain_id: string
          id: string
          mastery_expectation: string | null
          outcome_code: string
          outcome_description: string | null
          outcome_title: string
          term_targets: Json | null
        }
        Insert: {
          age_profile_id: string
          created_at?: string
          domain_id: string
          id?: string
          mastery_expectation?: string | null
          outcome_code: string
          outcome_description?: string | null
          outcome_title: string
          term_targets?: Json | null
        }
        Update: {
          age_profile_id?: string
          created_at?: string
          domain_id?: string
          id?: string
          mastery_expectation?: string | null
          outcome_code?: string
          outcome_description?: string | null
          outcome_title?: string
          term_targets?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "development_outcomes_age_profile_id_fkey"
            columns: ["age_profile_id"]
            isOneToOne: false
            referencedRelation: "age_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_outcomes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "development_outcomes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      eform_submissions: {
        Row: {
          branch_id: string
          child_level: string | null
          child_name: string | null
          created_at: string
          eform_id: string
          id: string
          lead_id: string | null
          recipient_email: string
          recipient_name: string
          recipient_phone: string | null
          sent_at: string | null
          status: string
          submitted_at: string | null
          submitted_data: Json | null
        }
        Insert: {
          branch_id: string
          child_level?: string | null
          child_name?: string | null
          created_at?: string
          eform_id: string
          id?: string
          lead_id?: string | null
          recipient_email?: string
          recipient_name?: string
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_data?: Json | null
        }
        Update: {
          branch_id?: string
          child_level?: string | null
          child_name?: string | null
          created_at?: string
          eform_id?: string
          id?: string
          lead_id?: string | null
          recipient_email?: string
          recipient_name?: string
          recipient_phone?: string | null
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          submitted_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "eform_submissions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eform_submissions_eform_id_fkey"
            columns: ["eform_id"]
            isOneToOne: false
            referencedRelation: "eforms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "eform_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      eforms: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string
          default_fields: Json | null
          description: string | null
          form_type: string
          id: string
          is_active: boolean
          name: string
          share_token: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by: string
          default_fields?: Json | null
          description?: string | null
          form_type?: string
          id?: string
          is_active?: boolean
          name: string
          share_token?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string
          default_fields?: Json | null
          description?: string | null
          form_type?: string
          id?: string
          is_active?: boolean
          name?: string
          share_token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "eforms_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_documents: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          file_path: string
          file_size: number | null
          file_url: string
          id: string
          mime_type: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path: string
          file_size?: number | null
          file_url: string
          id?: string
          mime_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          file_path?: string
          file_size?: number | null
          file_url?: string
          id?: string
          mime_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_global_settings: {
        Row: {
          created_at: string
          emails_enabled: boolean
          from_email: string
          from_name: string
          id: string
          reply_to_email: string | null
          singleton: boolean
          support_email: string | null
          updated_at: string
          updated_by: string | null
          welcome_kit_url: string | null
        }
        Insert: {
          created_at?: string
          emails_enabled?: boolean
          from_email?: string
          from_name?: string
          id?: string
          reply_to_email?: string | null
          singleton?: boolean
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          welcome_kit_url?: string | null
        }
        Update: {
          created_at?: string
          emails_enabled?: boolean
          from_email?: string
          from_name?: string
          id?: string
          reply_to_email?: string | null
          singleton?: boolean
          support_email?: string | null
          updated_at?: string
          updated_by?: string | null
          welcome_kit_url?: string | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          branch_id: string | null
          email_type: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient: string
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          branch_id?: string | null
          email_type: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          branch_id?: string | null
          email_type?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_template_overrides: {
        Row: {
          attached_document_ids: string[]
          content_overrides: Json
          created_at: string
          enabled: boolean
          subject: string | null
          template_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          attached_document_ids?: string[]
          content_overrides?: Json
          created_at?: string
          enabled?: boolean
          subject?: string | null
          template_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          attached_document_ids?: string[]
          content_overrides?: Json
          created_at?: string
          enabled?: boolean
          subject?: string | null
          template_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          branch_id: string
          created_at: string
          cta_text: string | null
          cta_url: string | null
          heading: string
          id: string
          is_active: boolean
          subject: string
          template_type: string
          updated_at: string
        }
        Insert: {
          body_html: string
          branch_id: string
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          heading: string
          id?: string
          is_active?: boolean
          subject: string
          template_type: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          branch_id?: string
          created_at?: string
          cta_text?: string | null
          cta_url?: string | null
          heading?: string
          id?: string
          is_active?: boolean
          subject?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          category: string
          created_at: string | null
          created_by: string
          date: string
          description: string | null
          id: string
          receipt_url: string | null
          updated_at: string | null
        }
        Insert: {
          amount?: number
          branch_id: string
          category?: string
          created_at?: string | null
          created_by: string
          date?: string
          description?: string | null
          id?: string
          receipt_url?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          category?: string
          created_at?: string | null
          created_by?: string
          date?: string
          description?: string | null
          id?: string
          receipt_url?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_breakdown_items: {
        Row: {
          amount: number | null
          created_at: string | null
          fee_package_id: string
          id: string
          item_name: string
          sort_order: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string | null
          fee_package_id: string
          id?: string
          item_name: string
          sort_order?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string | null
          fee_package_id?: string
          id?: string
          item_name?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_breakdown_items_fee_package_id_fkey"
            columns: ["fee_package_id"]
            isOneToOne: false
            referencedRelation: "fee_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_package_groups: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_package_groups_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_package_versions: {
        Row: {
          amount: number
          change_reason: string | null
          changed_by: string | null
          created_at: string
          effective_from: string
          effective_until: string | null
          fee_package_id: string
          id: string
          version_number: number
        }
        Insert: {
          amount: number
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          fee_package_id: string
          id?: string
          version_number?: number
        }
        Update: {
          amount?: number
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string
          effective_from?: string
          effective_until?: string | null
          fee_package_id?: string
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "fee_package_versions_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_package_versions_fee_package_id_fkey"
            columns: ["fee_package_id"]
            isOneToOne: false
            referencedRelation: "fee_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_packages: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          description: string | null
          fee_type: string
          group_id: string | null
          id: string
          is_active: boolean | null
          name: string
          program_type: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id: string
          created_at?: string
          description?: string | null
          fee_type?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          program_type?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          description?: string | null
          fee_type?: string
          group_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          program_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_packages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_packages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "fee_package_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_events: {
        Row: {
          bill_id: string | null
          branch_id: string
          collection_id: string | null
          created_at: string
          event_id: string
          event_type: string
          gateway: string
          id: string
          idempotency_key: string
          invoice_id: string | null
          payment_id: string | null
          processed_at: string | null
          processing_error: string | null
          processing_status: string
          raw_payload: Json
          retry_count: number
        }
        Insert: {
          bill_id?: string | null
          branch_id: string
          collection_id?: string | null
          created_at?: string
          event_id: string
          event_type: string
          gateway?: string
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_payload?: Json
          retry_count?: number
        }
        Update: {
          bill_id?: string | null
          branch_id?: string
          collection_id?: string | null
          created_at?: string
          event_id?: string
          event_type?: string
          gateway?: string
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          payment_id?: string | null
          processed_at?: string | null
          processing_error?: string | null
          processing_status?: string
          raw_payload?: Json
          retry_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "gateway_events_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_events_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_transactions: {
        Row: {
          bill_id: string
          branch_id: string
          collection_id: string | null
          created_at: string
          gateway: string
          gateway_amount: number
          gateway_paid_at: string | null
          gateway_status: string
          id: string
          invoice_id: string | null
          metadata: Json | null
          payment_id: string
          reconciled_at: string | null
          reconciled_by: string | null
          reconciliation_notes: string | null
          reconciliation_status: string
          settlement_date: string | null
          settlement_reference: string | null
          settlement_status: string | null
          transaction_reference: string | null
          updated_at: string
        }
        Insert: {
          bill_id: string
          branch_id: string
          collection_id?: string | null
          created_at?: string
          gateway?: string
          gateway_amount?: number
          gateway_paid_at?: string | null
          gateway_status?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_id: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_notes?: string | null
          reconciliation_status?: string
          settlement_date?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          transaction_reference?: string | null
          updated_at?: string
        }
        Update: {
          bill_id?: string
          branch_id?: string
          collection_id?: string | null
          created_at?: string
          gateway?: string
          gateway_amount?: number
          gateway_paid_at?: string | null
          gateway_status?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_id?: string
          reconciled_at?: string | null
          reconciled_by?: string | null
          reconciliation_notes?: string | null
          reconciliation_status?: string
          settlement_date?: string | null
          settlement_reference?: string | null
          settlement_status?: string | null
          transaction_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_transactions_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      geofence_locations: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          is_active: boolean | null
          latitude: number
          longitude: number
          name: string
          radius_meters: number
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          latitude: number
          longitude: number
          name: string
          radius_meters?: number
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          latitude?: number
          longitude?: number
          name?: string
          radius_meters?: number
        }
        Relationships: [
          {
            foreignKeyName: "geofence_locations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_policies: {
        Row: {
          branch_id: string
          created_at: string | null
          id: string
          policy_data: Json
          policy_type: string
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          id?: string
          policy_data?: Json
          policy_type: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          id?: string
          policy_data?: Json
          policy_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_policies_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_collections: {
        Row: {
          branch_id: string
          broken_promise_count: number | null
          collection_owner_id: string | null
          collection_status: string
          contact_method: string | null
          created_at: string | null
          id: string
          invoice_id: string
          last_contacted_at: string | null
          next_followup_at: string | null
          promise_to_pay_amount: number | null
          promise_to_pay_date: string | null
          recovery_amount: number | null
          updated_at: string | null
          write_off_approval_id: string | null
          write_off_reason: string | null
          written_off_amount: number | null
          written_off_at: string | null
        }
        Insert: {
          branch_id: string
          broken_promise_count?: number | null
          collection_owner_id?: string | null
          collection_status?: string
          contact_method?: string | null
          created_at?: string | null
          id?: string
          invoice_id: string
          last_contacted_at?: string | null
          next_followup_at?: string | null
          promise_to_pay_amount?: number | null
          promise_to_pay_date?: string | null
          recovery_amount?: number | null
          updated_at?: string | null
          write_off_approval_id?: string | null
          write_off_reason?: string | null
          written_off_amount?: number | null
          written_off_at?: string | null
        }
        Update: {
          branch_id?: string
          broken_promise_count?: number | null
          collection_owner_id?: string | null
          collection_status?: string
          contact_method?: string | null
          created_at?: string | null
          id?: string
          invoice_id?: string
          last_contacted_at?: string | null
          next_followup_at?: string | null
          promise_to_pay_amount?: number | null
          promise_to_pay_date?: string | null
          recovery_amount?: number | null
          updated_at?: string | null
          write_off_approval_id?: string | null
          write_off_reason?: string | null
          written_off_amount?: number | null
          written_off_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_collections_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_collections_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          created_at: string
          description: string
          discount: number
          fee_package_id: string | null
          id: string
          invoice_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          amount?: number
          created_at?: string
          description: string
          discount?: number
          fee_package_id?: string | null
          id?: string
          invoice_id: string
          quantity?: number
          unit_price?: number
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string
          discount?: number
          fee_package_id?: string | null
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_fee_package_id_fkey"
            columns: ["fee_package_id"]
            isOneToOne: false
            referencedRelation: "fee_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_paid: number
          billing_month: number
          billing_year: number
          branch_id: string
          created_at: string
          created_by: string
          discount_amount: number | null
          discount_description: string | null
          discount_total: number
          due_date: string
          id: string
          invoice_number: string
          issued_at: string | null
          issued_date: string | null
          lhdn_uin: string | null
          notes: string | null
          payer_account_id: string | null
          payment_method: string | null
          payment_terms: string | null
          status: string
          student_id: string
          subtotal: number
          tax_amount: number
          tax_rate: number | null
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          billing_month: number
          billing_year: number
          branch_id: string
          created_at?: string
          created_by: string
          discount_amount?: number | null
          discount_description?: string | null
          discount_total?: number
          due_date: string
          id?: string
          invoice_number: string
          issued_at?: string | null
          issued_date?: string | null
          lhdn_uin?: string | null
          notes?: string | null
          payer_account_id?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          status?: string
          student_id: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          billing_month?: number
          billing_year?: number
          branch_id?: string
          created_at?: string
          created_by?: string
          discount_amount?: number | null
          discount_description?: string | null
          discount_total?: number
          due_date?: string
          id?: string
          invoice_number?: string
          issued_at?: string | null
          issued_date?: string | null
          lhdn_uin?: string | null
          notes?: string | null
          payer_account_id?: string | null
          payment_method?: string | null
          payment_terms?: string | null
          status?: string
          student_id?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number | null
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_payer_account_id_fkey"
            columns: ["payer_account_id"]
            isOneToOne: false
            referencedRelation: "payer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          created_at: string
          created_by: string
          description: string
          id: string
          lead_id: string
          metadata: Json | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          created_by: string
          description: string
          id?: string
          lead_id: string
          metadata?: Json | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assessment_skipped_reason: string | null
          branch_id: string
          campaign_name: string | null
          channel: string | null
          child_age: number | null
          child_name: string
          created_at: string
          created_by: string
          eform_submission_id: string | null
          email: string | null
          enrolled_at: string | null
          enrollment_payment_date: string | null
          enrollment_payment_method: string | null
          enrollment_payment_reference: string | null
          enrollment_student_id: string | null
          first_contacted_at: string | null
          id: string
          inquiry_date: string | null
          kanban_note: string | null
          lead_received_date: string | null
          lost_at: string | null
          lost_reason: string | null
          marketing_attribution_month: string | null
          notes: string | null
          parent_name: string
          phone: string | null
          pre_enrollment_assessed_at: string | null
          pre_enrollment_assessment: Json | null
          source: string | null
          status: string
          total_fees_paid_at_enrollment: number | null
          tour_completed_at: string | null
          tour_scheduled_at: string | null
          trial_completed_at: string | null
          trial_scheduled_at: string | null
          updated_at: string
        }
        Insert: {
          assessment_skipped_reason?: string | null
          branch_id: string
          campaign_name?: string | null
          channel?: string | null
          child_age?: number | null
          child_name: string
          created_at?: string
          created_by: string
          eform_submission_id?: string | null
          email?: string | null
          enrolled_at?: string | null
          enrollment_payment_date?: string | null
          enrollment_payment_method?: string | null
          enrollment_payment_reference?: string | null
          enrollment_student_id?: string | null
          first_contacted_at?: string | null
          id?: string
          inquiry_date?: string | null
          kanban_note?: string | null
          lead_received_date?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          marketing_attribution_month?: string | null
          notes?: string | null
          parent_name: string
          phone?: string | null
          pre_enrollment_assessed_at?: string | null
          pre_enrollment_assessment?: Json | null
          source?: string | null
          status?: string
          total_fees_paid_at_enrollment?: number | null
          tour_completed_at?: string | null
          tour_scheduled_at?: string | null
          trial_completed_at?: string | null
          trial_scheduled_at?: string | null
          updated_at?: string
        }
        Update: {
          assessment_skipped_reason?: string | null
          branch_id?: string
          campaign_name?: string | null
          channel?: string | null
          child_age?: number | null
          child_name?: string
          created_at?: string
          created_by?: string
          eform_submission_id?: string | null
          email?: string | null
          enrolled_at?: string | null
          enrollment_payment_date?: string | null
          enrollment_payment_method?: string | null
          enrollment_payment_reference?: string | null
          enrollment_student_id?: string | null
          first_contacted_at?: string | null
          id?: string
          inquiry_date?: string | null
          kanban_note?: string | null
          lead_received_date?: string | null
          lost_at?: string | null
          lost_reason?: string | null
          marketing_attribution_month?: string | null
          notes?: string | null
          parent_name?: string
          phone?: string | null
          pre_enrollment_assessed_at?: string | null
          pre_enrollment_assessment?: Json | null
          source?: string | null
          status?: string
          total_fees_paid_at_enrollment?: number | null
          tour_completed_at?: string | null
          tour_scheduled_at?: string | null
          trial_completed_at?: string | null
          trial_scheduled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_eform_submission_id_fkey"
            columns: ["eform_submission_id"]
            isOneToOne: false
            referencedRelation: "eform_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_activities: {
        Row: {
          activity_date: string
          album_id: string | null
          branch_id: string
          class_id: string | null
          created_at: string
          created_by: string
          description: string | null
          domain_id: string | null
          id: string
          lesson_plan_id: string | null
          title: string
          updated_at: string
          visible_to_parents: boolean
        }
        Insert: {
          activity_date?: string
          album_id?: string | null
          branch_id: string
          class_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          domain_id?: string | null
          id?: string
          lesson_plan_id?: string | null
          title: string
          updated_at?: string
          visible_to_parents?: boolean
        }
        Update: {
          activity_date?: string
          album_id?: string | null
          branch_id?: string
          class_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          domain_id?: string | null
          id?: string
          lesson_plan_id?: string | null
          title?: string
          updated_at?: string
          visible_to_parents?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "learning_activities_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "learning_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_activities_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_activities_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_activities_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_activities_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      learning_activity_media: {
        Row: {
          activity_id: string
          caption: string | null
          created_at: string
          id: string
          media_type: string
          media_url: string
          sort_order: number
          thumbnail_url: string | null
        }
        Insert: {
          activity_id: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Update: {
          activity_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_activity_media_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "learning_activities"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_activity_students: {
        Row: {
          activity_id: string
          created_at: string
          id: string
          student_id: string
        }
        Insert: {
          activity_id: string
          created_at?: string
          id?: string
          student_id: string
        }
        Update: {
          activity_id?: string
          created_at?: string
          id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_activity_students_activity_id_fkey"
            columns: ["activity_id"]
            isOneToOne: false
            referencedRelation: "learning_activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_activity_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_albums: {
        Row: {
          branch_id: string
          class_id: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          is_personal: boolean
          student_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          class_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          student_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          class_id?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_personal?: boolean
          student_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_albums_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_albums_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_albums_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_areas: {
        Row: {
          category: string
          code: string
          created_at: string
          description_en: string | null
          description_ms: string | null
          id: string
          name_en: string | null
          name_ms: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category?: string
          code: string
          created_at?: string
          description_en?: string | null
          description_ms?: string | null
          id?: string
          name_en?: string | null
          name_ms: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description_en?: string | null
          description_ms?: string | null
          id?: string
          name_en?: string | null
          name_ms?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      learning_center_plans: {
        Row: {
          branch_id: string
          center_label: string
          center_type: string
          class_id: string
          created_at: string
          created_by: string
          id: string
          learning_objectives_json: Json | null
          lesson_plan_id: string | null
          linked_domains_json: Json | null
          materials_json: Json | null
          observation_prompts_json: Json | null
          setup_description: string | null
          status: string
          updated_at: string
          week_starting: string | null
          weekly_plan_id: string | null
        }
        Insert: {
          branch_id: string
          center_label: string
          center_type: string
          class_id: string
          created_at?: string
          created_by: string
          id?: string
          learning_objectives_json?: Json | null
          lesson_plan_id?: string | null
          linked_domains_json?: Json | null
          materials_json?: Json | null
          observation_prompts_json?: Json | null
          setup_description?: string | null
          status?: string
          updated_at?: string
          week_starting?: string | null
          weekly_plan_id?: string | null
        }
        Update: {
          branch_id?: string
          center_label?: string
          center_type?: string
          class_id?: string
          created_at?: string
          created_by?: string
          id?: string
          learning_objectives_json?: Json | null
          lesson_plan_id?: string | null
          linked_domains_json?: Json | null
          materials_json?: Json | null
          observation_prompts_json?: Json | null
          setup_description?: string | null
          status?: string
          updated_at?: string
          week_starting?: string | null
          weekly_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_center_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_center_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_center_plans_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_center_plans_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_curriculum_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_journey_media: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          journey_entry_id: string
          media_type: string
          media_url: string
          sort_order: number
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          journey_entry_id: string
          media_type?: string
          media_url: string
          sort_order?: number
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          journey_entry_id?: string
          media_type?: string
          media_url?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "learning_journey_media_journey_entry_id_fkey"
            columns: ["journey_entry_id"]
            isOneToOne: false
            referencedRelation: "daily_learning_journey_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_balances: {
        Row: {
          annual_total: number
          annual_used: number
          birthday_total: number
          birthday_used: number
          branch_id: string
          compassionate_total: number
          compassionate_used: number
          created_at: string
          emergency_total: number
          emergency_used: number
          hospitalisation_total: number
          hospitalisation_used: number
          id: string
          maternity_total: number
          maternity_used: number
          medical_total: number
          medical_used: number
          paternity_total: number
          paternity_used: number
          replacement_total: number
          replacement_used: number
          unpaid_total: number | null
          unpaid_used: number
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          annual_total?: number
          annual_used?: number
          birthday_total?: number
          birthday_used?: number
          branch_id: string
          compassionate_total?: number
          compassionate_used?: number
          created_at?: string
          emergency_total?: number
          emergency_used?: number
          hospitalisation_total?: number
          hospitalisation_used?: number
          id?: string
          maternity_total?: number
          maternity_used?: number
          medical_total?: number
          medical_used?: number
          paternity_total?: number
          paternity_used?: number
          replacement_total?: number
          replacement_used?: number
          unpaid_total?: number | null
          unpaid_used?: number
          updated_at?: string
          user_id: string
          year?: number
        }
        Update: {
          annual_total?: number
          annual_used?: number
          birthday_total?: number
          birthday_used?: number
          branch_id?: string
          compassionate_total?: number
          compassionate_used?: number
          created_at?: string
          emergency_total?: number
          emergency_used?: number
          hospitalisation_total?: number
          hospitalisation_used?: number
          id?: string
          maternity_total?: number
          maternity_used?: number
          medical_total?: number
          medical_used?: number
          paternity_total?: number
          paternity_used?: number
          replacement_total?: number
          replacement_used?: number
          unpaid_total?: number | null
          unpaid_used?: number
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "leave_balances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          applied_on_behalf_by: string | null
          approval_level: number
          attachment_url: string | null
          branch_id: string
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          custom_leave_type_id: string | null
          days: number
          end_date: string
          id: string
          is_half_day: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          level1_approved_at: string | null
          level1_approved_by: string | null
          level1_notes: string | null
          level1_status: string
          level2_approved_at: string | null
          level2_approved_by: string | null
          level2_notes: string | null
          level2_status: string
          max_approval_level: number
          reason: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: Database["public"]["Enums"]["leave_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_on_behalf_by?: string | null
          approval_level?: number
          attachment_url?: string | null
          branch_id: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          custom_leave_type_id?: string | null
          days?: number
          end_date: string
          id?: string
          is_half_day?: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          level1_approved_at?: string | null
          level1_approved_by?: string | null
          level1_notes?: string | null
          level1_status?: string
          level2_approved_at?: string | null
          level2_approved_by?: string | null
          level2_notes?: string | null
          level2_status?: string
          max_approval_level?: number
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_on_behalf_by?: string | null
          approval_level?: number
          attachment_url?: string | null
          branch_id?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          custom_leave_type_id?: string | null
          days?: number
          end_date?: string
          id?: string
          is_half_day?: boolean | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          level1_approved_at?: string | null
          level1_approved_by?: string | null
          level1_notes?: string | null
          level1_status?: string
          level2_approved_at?: string | null
          level2_approved_by?: string | null
          level2_notes?: string | null
          level2_status?: string
          max_approval_level?: number
          reason?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["leave_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_custom_leave_type_id_fkey"
            columns: ["custom_leave_type_id"]
            isOneToOne: false
            referencedRelation: "custom_leave_types"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_activities: {
        Row: {
          activity_name: string
          created_at: string
          day_of_week: number
          duration: number
          id: string
          learning_area: string
          lesson_plan_id: string
          procedure: Json | null
          standards_addressed: Json | null
        }
        Insert: {
          activity_name?: string
          created_at?: string
          day_of_week: number
          duration?: number
          id?: string
          learning_area?: string
          lesson_plan_id: string
          procedure?: Json | null
          standards_addressed?: Json | null
        }
        Update: {
          activity_name?: string
          created_at?: string
          day_of_week?: number
          duration?: number
          id?: string
          learning_area?: string
          lesson_plan_id?: string
          procedure?: Json | null
          standards_addressed?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_activities_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_objectives: {
        Row: {
          age_group_id: string
          bloom_level: string | null
          code: string
          created_at: string
          description: string | null
          difficulty_level: string | null
          domain_id: string
          id: string
          is_active: boolean
          learning_area: string | null
          objective_type: string | null
          sort_order: number
          term: number | null
          title: string
          updated_at: string
          yearly_outcome_id: string | null
        }
        Insert: {
          age_group_id: string
          bloom_level?: string | null
          code: string
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          domain_id: string
          id?: string
          is_active?: boolean
          learning_area?: string | null
          objective_type?: string | null
          sort_order?: number
          term?: number | null
          title: string
          updated_at?: string
          yearly_outcome_id?: string | null
        }
        Update: {
          age_group_id?: string
          bloom_level?: string | null
          code?: string
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          domain_id?: string
          id?: string
          is_active?: boolean
          learning_area?: string | null
          objective_type?: string | null
          sort_order?: number
          term?: number | null
          title?: string
          updated_at?: string
          yearly_outcome_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_objectives_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_objectives_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_objectives_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "lesson_objectives_yearly_outcome_id_fkey"
            columns: ["yearly_outcome_id"]
            isOneToOne: false
            referencedRelation: "yearly_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_objective_indicators: {
        Row: {
          created_at: string
          id: string
          lesson_plan_id: string
          objective_indicator_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_plan_id: string
          objective_indicator_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_plan_id?: string
          objective_indicator_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_objective_indicators_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plan_objective_indicators_objective_indicator_id_fkey"
            columns: ["objective_indicator_id"]
            isOneToOne: false
            referencedRelation: "objective_indicators"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_objectives: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          lesson_objective_id: string
          lesson_plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lesson_objective_id: string
          lesson_plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          lesson_objective_id?: string
          lesson_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_objectives_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plan_objectives_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plan_reviews: {
        Row: {
          action: string
          comments: string | null
          created_at: string | null
          id: string
          lesson_plan_id: string
          reviewer_id: string
        }
        Insert: {
          action: string
          comments?: string | null
          created_at?: string | null
          id?: string
          lesson_plan_id: string
          reviewer_id: string
        }
        Update: {
          action?: string
          comments?: string | null
          created_at?: string | null
          id?: string
          lesson_plan_id?: string
          reviewer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_reviews_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          age_group: string
          age_group_id: string | null
          approved_at: string | null
          approved_by: string | null
          branch_id: string | null
          center_plan_json: Json | null
          class_id: string | null
          completed_at: string | null
          completeness_score: number | null
          completion_status: string
          created_at: string
          daily_slot_id: string | null
          domain_tags_json: Json | null
          duration: string
          family_extension_json: Json | null
          generated_plan: Json
          id: string
          learning_area_ids: string[]
          methodology: string | null
          month_plan_id: string | null
          monthly_plan_id: string | null
          objective_ids_json: Json | null
          observation_targets_json: Json | null
          parent_connection_snippet: string | null
          parent_story_prompt: string | null
          per_student_interventions: Json | null
          plan_mode: string
          plan_status: string | null
          provocations_json: Json | null
          ptm_evidence_tags_json: Json | null
          resource_links: Json | null
          review_status: string | null
          routine_blocks_json: Json | null
          standard_ids: string[]
          start_date: string | null
          status: string
          teacher_notes: string | null
          theme: string
          theme_bank_id: string | null
          title: string
          updated_at: string
          user_id: string
          week_plan_id: string | null
          weekly_plan_id: string | null
          year_plan_id: string | null
          yearly_theme_id: string | null
        }
        Insert: {
          age_group: string
          age_group_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          center_plan_json?: Json | null
          class_id?: string | null
          completed_at?: string | null
          completeness_score?: number | null
          completion_status?: string
          created_at?: string
          daily_slot_id?: string | null
          domain_tags_json?: Json | null
          duration: string
          family_extension_json?: Json | null
          generated_plan?: Json
          id?: string
          learning_area_ids?: string[]
          methodology?: string | null
          month_plan_id?: string | null
          monthly_plan_id?: string | null
          objective_ids_json?: Json | null
          observation_targets_json?: Json | null
          parent_connection_snippet?: string | null
          parent_story_prompt?: string | null
          per_student_interventions?: Json | null
          plan_mode?: string
          plan_status?: string | null
          provocations_json?: Json | null
          ptm_evidence_tags_json?: Json | null
          resource_links?: Json | null
          review_status?: string | null
          routine_blocks_json?: Json | null
          standard_ids?: string[]
          start_date?: string | null
          status?: string
          teacher_notes?: string | null
          theme: string
          theme_bank_id?: string | null
          title: string
          updated_at?: string
          user_id: string
          week_plan_id?: string | null
          weekly_plan_id?: string | null
          year_plan_id?: string | null
          yearly_theme_id?: string | null
        }
        Update: {
          age_group?: string
          age_group_id?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string | null
          center_plan_json?: Json | null
          class_id?: string | null
          completed_at?: string | null
          completeness_score?: number | null
          completion_status?: string
          created_at?: string
          daily_slot_id?: string | null
          domain_tags_json?: Json | null
          duration?: string
          family_extension_json?: Json | null
          generated_plan?: Json
          id?: string
          learning_area_ids?: string[]
          methodology?: string | null
          month_plan_id?: string | null
          monthly_plan_id?: string | null
          objective_ids_json?: Json | null
          observation_targets_json?: Json | null
          parent_connection_snippet?: string | null
          parent_story_prompt?: string | null
          per_student_interventions?: Json | null
          plan_mode?: string
          plan_status?: string | null
          provocations_json?: Json | null
          ptm_evidence_tags_json?: Json | null
          resource_links?: Json | null
          review_status?: string | null
          routine_blocks_json?: Json | null
          standard_ids?: string[]
          start_date?: string | null
          status?: string
          teacher_notes?: string | null
          theme?: string
          theme_bank_id?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          week_plan_id?: string | null
          weekly_plan_id?: string | null
          year_plan_id?: string | null
          yearly_theme_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_daily_slot_id_fkey"
            columns: ["daily_slot_id"]
            isOneToOne: false
            referencedRelation: "daily_timetable_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_month_plan_id_fkey"
            columns: ["month_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_month_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_monthly_plan_id_fkey"
            columns: ["monthly_plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_curriculum_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_week_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_weekly_plan_id_fkey"
            columns: ["weekly_plan_id"]
            isOneToOne: false
            referencedRelation: "weekly_curriculum_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_year_plan_id_fkey"
            columns: ["year_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_year_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_plans_yearly_theme_id_fkey"
            columns: ["yearly_theme_id"]
            isOneToOne: false
            referencedRelation: "yearly_themes"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_spend: {
        Row: {
          amount: number
          branch_id: string
          campaign_name: string | null
          channel: string | null
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          results: number | null
          source: string | null
          sources: string[] | null
          spend_end_date: string | null
          spend_month: string
          spend_start_date: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          branch_id: string
          campaign_name?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          results?: number | null
          source?: string | null
          sources?: string[] | null
          spend_end_date?: string | null
          spend_month: string
          spend_start_date?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          campaign_name?: string | null
          channel?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          results?: number | null
          source?: string | null
          sources?: string[] | null
          spend_end_date?: string | null
          spend_month?: string
          spend_start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_spend_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      methodology_frameworks: {
        Row: {
          core_principles: string
          created_at: string | null
          id: string
          name: string
        }
        Insert: {
          core_principles: string
          created_at?: string | null
          id?: string
          name: string
        }
        Update: {
          core_principles?: string
          created_at?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      methodology_recommendations: {
        Row: {
          ai_reasoning: string | null
          baseline_assessment_id: string | null
          created_at: string
          id: string
          program_reasoning: string | null
          responded_at: string | null
          responded_by: string | null
          status: string
          student_id: string
          suggested_methodology: string
          suggested_program: string | null
        }
        Insert: {
          ai_reasoning?: string | null
          baseline_assessment_id?: string | null
          created_at?: string
          id?: string
          program_reasoning?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          student_id: string
          suggested_methodology: string
          suggested_program?: string | null
        }
        Update: {
          ai_reasoning?: string | null
          baseline_assessment_id?: string | null
          created_at?: string
          id?: string
          program_reasoning?: string | null
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          student_id?: string
          suggested_methodology?: string
          suggested_program?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "methodology_recommendations_baseline_assessment_id_fkey"
            columns: ["baseline_assessment_id"]
            isOneToOne: false
            referencedRelation: "baseline_assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "methodology_recommendations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          update_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          update_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          update_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_comments_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
        ]
      }
      moment_reactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          update_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          update_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          update_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "moment_reactions_update_id_fkey"
            columns: ["update_id"]
            isOneToOne: false
            referencedRelation: "child_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_curriculum_plans: {
        Row: {
          academic_year_id: string | null
          age_group: number
          assessment_focus: Json | null
          big_idea: string | null
          branch_id: string
          center_setup: Json | null
          class_id: string
          created_at: string
          created_by: string
          family_connection: Json | null
          id: string
          month_number: number
          monthly_objectives: Json | null
          status: string
          suggested_books: Json | null
          suggested_songs: Json | null
          theme_bank_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          age_group: number
          assessment_focus?: Json | null
          big_idea?: string | null
          branch_id: string
          center_setup?: Json | null
          class_id: string
          created_at?: string
          created_by: string
          family_connection?: Json | null
          id?: string
          month_number: number
          monthly_objectives?: Json | null
          status?: string
          suggested_books?: Json | null
          suggested_songs?: Json | null
          theme_bank_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          age_group?: number
          assessment_focus?: Json | null
          big_idea?: string | null
          branch_id?: string
          center_setup?: Json | null
          class_id?: string
          created_at?: string
          created_by?: string
          family_connection?: Json | null
          id?: string
          month_number?: number
          monthly_objectives?: Json | null
          status?: string
          suggested_books?: Json | null
          suggested_songs?: Json | null
          theme_bank_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_curriculum_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_curriculum_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_curriculum_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_curriculum_plans_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletters: {
        Row: {
          audience: string
          branch_id: string
          content_blocks: Json
          created_at: string
          id: string
          recipient_count: number | null
          sent_at: string | null
          sent_by: string | null
          status: string
          subject: string
          target_audience: string
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          branch_id: string
          content_blocks?: Json
          created_at?: string
          id?: string
          recipient_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          target_audience?: string
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          branch_id?: string
          content_blocks?: Json
          created_at?: string
          id?: string
          recipient_count?: number | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          target_audience?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletters_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          category: string
          created_at: string
          email: boolean
          id: string
          in_app: boolean
          push: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: boolean
          id?: string
          in_app?: boolean
          push?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          action_url: string | null
          archived_at: string | null
          created_at: string
          group_key: string | null
          id: string
          is_read: boolean
          message: string
          priority: string
          reference_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          archived_at?: string | null
          created_at?: string
          group_key?: string | null
          id?: string
          is_read?: boolean
          message: string
          priority?: string
          reference_id?: string | null
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          archived_at?: string | null
          created_at?: string
          group_key?: string | null
          id?: string
          is_read?: boolean
          message?: string
          priority?: string
          reference_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      objective_indicators: {
        Row: {
          created_at: string
          evidence_type: string | null
          id: string
          indicator_text: string
          lesson_objective_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          evidence_type?: string | null
          id?: string
          indicator_text: string
          lesson_objective_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          evidence_type?: string | null
          id?: string
          indicator_text?: string
          lesson_objective_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "objective_indicators_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_comments: {
        Row: {
          comment_text: string
          created_at: string | null
          id: string
          observation_id: string
          parent_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string | null
          id?: string
          observation_id: string
          parent_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string | null
          id?: string
          observation_id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_comments_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "student_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_indicators: {
        Row: {
          age_group: number
          created_at: string
          domain_id: string
          id: string
          indicator_code: string
          indicator_text: string
          linked_outcome_id: string | null
          updated_at: string
        }
        Insert: {
          age_group: number
          created_at?: string
          domain_id: string
          id?: string
          indicator_code: string
          indicator_text: string
          linked_outcome_id?: string | null
          updated_at?: string
        }
        Update: {
          age_group?: number
          created_at?: string
          domain_id?: string
          id?: string
          indicator_code?: string
          indicator_text?: string
          linked_outcome_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_indicators_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "observation_indicators_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "observation_indicators_linked_outcome_id_fkey"
            columns: ["linked_outcome_id"]
            isOneToOne: false
            referencedRelation: "development_outcomes"
            referencedColumns: ["id"]
          },
        ]
      }
      observation_reactions: {
        Row: {
          created_at: string | null
          id: string
          observation_id: string
          parent_id: string
          reaction_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          observation_id: string
          parent_id: string
          reaction_type?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          observation_id?: string
          parent_id?: string
          reaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "observation_reactions_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "student_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_form_fields: {
        Row: {
          branch_id: string
          created_at: string
          field_label: string
          field_type: string
          form_type: string
          id: string
          is_active: boolean
          is_required: boolean
          options: Json | null
          sort_order: number
          step_label: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          field_label: string
          field_type?: string
          form_type: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          options?: Json | null
          sort_order?: number
          step_label: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          field_label?: string
          field_type?: string
          form_type?: string
          id?: string
          is_active?: boolean
          is_required?: boolean
          options?: Json | null
          sort_order?: number
          step_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_form_fields_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_form_responses: {
        Row: {
          created_at: string
          field_id: string
          id: string
          user_id: string
          value: string | null
        }
        Insert: {
          created_at?: string
          field_id: string
          id?: string
          user_id: string
          value?: string | null
        }
        Update: {
          created_at?: string
          field_id?: string
          id?: string
          user_id?: string
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_form_responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "onboarding_form_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_branding: {
        Row: {
          created_at: string
          general_app_name: string | null
          general_branding_version: string | null
          general_icon_url: string | null
          id: string
          organization_id: string
          parent_app_name: string
          parent_app_short_name: string
          parent_branding_version: string
          parent_icon_url: string | null
          parent_theme_color: string
          teacher_app_name: string
          teacher_app_short_name: string
          teacher_branding_version: string
          teacher_icon_url: string | null
          teacher_theme_color: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          general_app_name?: string | null
          general_branding_version?: string | null
          general_icon_url?: string | null
          id?: string
          organization_id: string
          parent_app_name?: string
          parent_app_short_name?: string
          parent_branding_version?: string
          parent_icon_url?: string | null
          parent_theme_color?: string
          teacher_app_name?: string
          teacher_app_short_name?: string
          teacher_branding_version?: string
          teacher_icon_url?: string | null
          teacher_theme_color?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          general_app_name?: string | null
          general_branding_version?: string | null
          general_icon_url?: string | null
          id?: string
          organization_id?: string
          parent_app_name?: string
          parent_app_short_name?: string
          parent_branding_version?: string
          parent_icon_url?: string | null
          parent_theme_color?: string
          teacher_app_name?: string
          teacher_app_short_name?: string
          teacher_branding_version?: string
          teacher_icon_url?: string | null
          teacher_theme_color?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_branding_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ot_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_snapshot: Json | null
          before_snapshot: Json | null
          created_at: string
          id: string
          notes: string | null
          ot_request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          ot_request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_snapshot?: Json | null
          before_snapshot?: Json | null
          created_at?: string
          id?: string
          notes?: string | null
          ot_request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ot_audit_log_ot_request_id_fkey"
            columns: ["ot_request_id"]
            isOneToOne: false
            referencedRelation: "overtime_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      overtime_requests: {
        Row: {
          amendment_approved_at: string | null
          amendment_approved_by: string | null
          amendment_requested_at: string | null
          approved_at: string | null
          approved_by: string | null
          auto_detected: boolean | null
          branch_id: string
          cancellation_approved_at: string | null
          cancellation_approved_by: string | null
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          created_at: string
          date: string
          edited_at: string | null
          edited_by: string | null
          end_time: string
          hours: number
          id: string
          is_late_submission: boolean
          ot_month: string | null
          overtime_type: string | null
          paid_at: string | null
          paid_in_payroll_id: string | null
          parent_request_id: string | null
          payment_status: string
          payroll_adjustment_id: string | null
          payroll_month: string | null
          reason: string | null
          review_notes: string | null
          start_time: string
          status: string
          submitted_at: string | null
          user_id: string
          version: number
        }
        Insert: {
          amendment_approved_at?: string | null
          amendment_approved_by?: string | null
          amendment_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_detected?: boolean | null
          branch_id: string
          cancellation_approved_at?: string | null
          cancellation_approved_by?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          created_at?: string
          date: string
          edited_at?: string | null
          edited_by?: string | null
          end_time: string
          hours?: number
          id?: string
          is_late_submission?: boolean
          ot_month?: string | null
          overtime_type?: string | null
          paid_at?: string | null
          paid_in_payroll_id?: string | null
          parent_request_id?: string | null
          payment_status?: string
          payroll_adjustment_id?: string | null
          payroll_month?: string | null
          reason?: string | null
          review_notes?: string | null
          start_time: string
          status?: string
          submitted_at?: string | null
          user_id: string
          version?: number
        }
        Update: {
          amendment_approved_at?: string | null
          amendment_approved_by?: string | null
          amendment_requested_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          auto_detected?: boolean | null
          branch_id?: string
          cancellation_approved_at?: string | null
          cancellation_approved_by?: string | null
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          created_at?: string
          date?: string
          edited_at?: string | null
          edited_by?: string | null
          end_time?: string
          hours?: number
          id?: string
          is_late_submission?: boolean
          ot_month?: string | null
          overtime_type?: string | null
          paid_at?: string | null
          paid_in_payroll_id?: string | null
          parent_request_id?: string | null
          payment_status?: string
          payroll_adjustment_id?: string | null
          payroll_month?: string | null
          reason?: string | null
          review_notes?: string | null
          start_time?: string
          status?: string
          submitted_at?: string | null
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "overtime_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_parent_request_id_fkey"
            columns: ["parent_request_id"]
            isOneToOne: false
            referencedRelation: "overtime_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "overtime_requests_payroll_adjustment_fk"
            columns: ["payroll_adjustment_id"]
            isOneToOne: false
            referencedRelation: "payroll_adjustments"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_broadcasts: {
        Row: {
          attachment_urls: string[] | null
          body_text: string
          branch_id: string
          class_id: string | null
          created_at: string | null
          id: string
          lesson_plan_id: string | null
          send_via_app: boolean | null
          send_via_email: boolean | null
          sent_by: string
          subject: string
        }
        Insert: {
          attachment_urls?: string[] | null
          body_text: string
          branch_id: string
          class_id?: string | null
          created_at?: string | null
          id?: string
          lesson_plan_id?: string | null
          send_via_app?: boolean | null
          send_via_email?: boolean | null
          sent_by: string
          subject: string
        }
        Update: {
          attachment_urls?: string[] | null
          body_text?: string
          branch_id?: string
          class_id?: string | null
          created_at?: string | null
          id?: string
          lesson_plan_id?: string | null
          send_via_app?: boolean | null
          send_via_email?: boolean | null
          sent_by?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_broadcasts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_broadcasts_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_feed_notifications: {
        Row: {
          id: string
          journey_entry_id: string
          parent_id: string
          sent_at: string
          status: string
          viewed_at: string | null
        }
        Insert: {
          id?: string
          journey_entry_id: string
          parent_id: string
          sent_at?: string
          status?: string
          viewed_at?: string | null
        }
        Update: {
          id?: string
          journey_entry_id?: string
          parent_id?: string
          sent_at?: string
          status?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parent_feed_notifications_journey_entry_id_fkey"
            columns: ["journey_entry_id"]
            isOneToOne: false
            referencedRelation: "daily_learning_journey_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_invitations: {
        Row: {
          branch_id: string
          created_at: string
          email: string
          expires_at: string
          id: string
          status: string
          student_id: string
          token: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          status?: string
          student_id: string
          token?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          status?: string
          student_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_invitations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_invitations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_messages: {
        Row: {
          body: string
          branch_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          recipient_id: string | null
          sender_id: string
          student_id: string | null
          subject: string
        }
        Insert: {
          body: string
          branch_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_id?: string | null
          sender_id: string
          student_id?: string | null
          subject: string
        }
        Update: {
          body?: string
          branch_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          recipient_id?: string | null
          sender_id?: string
          student_id?: string | null
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_messages_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_messages_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_onboarding_state: {
        Row: {
          branch_id: string
          completed_at: string | null
          created_at: string
          handbook_accepted_at: string | null
          handbook_document_id: string | null
          handbook_version: string | null
          id: string
          parent_id: string
          password_changed_at: string | null
          profile_completed_at: string | null
          tnc_accepted_at: string | null
          tnc_version: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          completed_at?: string | null
          created_at?: string
          handbook_accepted_at?: string | null
          handbook_document_id?: string | null
          handbook_version?: string | null
          id?: string
          parent_id: string
          password_changed_at?: string | null
          profile_completed_at?: string | null
          tnc_accepted_at?: string | null
          tnc_version?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          completed_at?: string | null
          created_at?: string
          handbook_accepted_at?: string | null
          handbook_document_id?: string | null
          handbook_version?: string | null
          id?: string
          parent_id?: string
          password_changed_at?: string | null
          profile_completed_at?: string | null
          tnc_accepted_at?: string | null
          tnc_version?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_onboarding_state_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_onboarding_state_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_students: {
        Row: {
          created_at: string
          created_via: string
          id: string
          is_primary: boolean
          parent_id: string
          relation: string
          status: string
          student_id: string
        }
        Insert: {
          created_at?: string
          created_via?: string
          id?: string
          is_primary?: boolean
          parent_id: string
          relation?: string
          status?: string
          student_id: string
        }
        Update: {
          created_at?: string
          created_via?: string
          id?: string
          is_primary?: boolean
          parent_id?: string
          relation?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parent_students_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parent_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      parent_welcome_email_sent: {
        Row: {
          parent_user_id: string
          sent_at: string
        }
        Insert: {
          parent_user_id: string
          sent_at?: string
        }
        Update: {
          parent_user_id?: string
          sent_at?: string
        }
        Relationships: []
      }
      payer_account_students: {
        Row: {
          created_at: string | null
          id: string
          payer_account_id: string
          student_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          payer_account_id: string
          student_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          payer_account_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payer_account_students_payer_account_id_fkey"
            columns: ["payer_account_id"]
            isOneToOne: false
            referencedRelation: "payer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payer_account_students_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payer_accounts: {
        Row: {
          branch_id: string
          created_at: string | null
          email: string | null
          id: string
          is_active: boolean | null
          name: string
          notes: string | null
          phone: string | null
          primary_parent_id: string | null
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          notes?: string | null
          phone?: string | null
          primary_parent_id?: string | null
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          notes?: string | null
          phone?: string | null
          primary_parent_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payer_accounts_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          allocated_by: string | null
          amount: number
          batch_id: string
          branch_id: string
          created_at: string | null
          id: string
          invoice_id: string
          notes: string | null
          payment_id: string
        }
        Insert: {
          allocated_by?: string | null
          amount: number
          batch_id?: string
          branch_id: string
          created_at?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          payment_id: string
        }
        Update: {
          allocated_by?: string | null
          amount?: number
          batch_id?: string
          branch_id?: string
          created_at?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          payment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_allocations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_disputes: {
        Row: {
          branch_id: string
          created_at: string
          description: string | null
          dispute_type: string
          disputed_amount: number
          gateway_dispute_id: string | null
          gateway_status: string | null
          id: string
          invoice_id: string | null
          payer_account_id: string | null
          payment_id: string
          reason: string
          reason_code: string
          requested_by: string
          requested_by_name: string | null
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          description?: string | null
          dispute_type?: string
          disputed_amount?: number
          gateway_dispute_id?: string | null
          gateway_status?: string | null
          id?: string
          invoice_id?: string | null
          payer_account_id?: string | null
          payment_id: string
          reason: string
          reason_code?: string
          requested_by: string
          requested_by_name?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          description?: string | null
          dispute_type?: string
          disputed_amount?: number
          gateway_dispute_id?: string | null
          gateway_status?: string | null
          id?: string
          invoice_id?: string | null
          payer_account_id?: string | null
          payment_id?: string
          reason?: string
          reason_code?: string
          requested_by?: string
          requested_by_name?: string | null
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_disputes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disputes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disputes_payer_account_id_fkey"
            columns: ["payer_account_id"]
            isOneToOne: false
            referencedRelation: "payer_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_disputes_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_reversals: {
        Row: {
          branch_id: string
          id: string
          invoice_id: string
          payment_id: string
          reason: string
          requested_at: string
          requested_by: string
          reversed_amount: number | null
          reversed_method: string | null
          reversed_payer: string | null
          reversed_reference: string | null
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
        }
        Insert: {
          branch_id: string
          id?: string
          invoice_id: string
          payment_id: string
          reason: string
          requested_at?: string
          requested_by: string
          reversed_amount?: number | null
          reversed_method?: string | null
          reversed_payer?: string | null
          reversed_reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Update: {
          branch_id?: string
          id?: string
          invoice_id?: string
          payment_id?: string
          reason?: string
          requested_at?: string
          requested_by?: string
          reversed_amount?: number | null
          reversed_method?: string | null
          reversed_payer?: string | null
          reversed_reference?: string | null
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_reversals_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_reversals_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          notes: string | null
          payer_name: string | null
          payment_date: string
          payment_method: string
          payment_reference: string | null
          received_by: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          notes?: string | null
          payer_name?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          received_by: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          notes?: string | null
          payer_name?: string | null
          payment_date?: string
          payment_method?: string
          payment_reference?: string | null
          received_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_adjustments: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          branch_id: string
          created_at: string
          created_by: string
          hours: number | null
          id: string
          included_in_payroll_id: string | null
          reason: string | null
          rejected_reason: string | null
          source_ref_id: string | null
          source_type: string
          staff_id: string
          status: string
          target_payroll_month: string
          updated_at: string
        }
        Insert: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id: string
          created_at?: string
          created_by?: string
          hours?: number | null
          id?: string
          included_in_payroll_id?: string | null
          reason?: string | null
          rejected_reason?: string | null
          source_ref_id?: string | null
          source_type: string
          staff_id: string
          status?: string
          target_payroll_month: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string
          hours?: number | null
          id?: string
          included_in_payroll_id?: string | null
          reason?: string | null
          rejected_reason?: string | null
          source_ref_id?: string | null
          source_type?: string
          staff_id?: string
          status?: string
          target_payroll_month?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_custom_items: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          label: string
          payroll_record_id: string
          type: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          label: string
          payroll_record_id: string
          type?: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          label?: string
          payroll_record_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payroll_custom_items_payroll_record_id_fkey"
            columns: ["payroll_record_id"]
            isOneToOne: false
            referencedRelation: "payroll_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_records: {
        Row: {
          absent_deduction: number
          advance_deduction: number | null
          allowances: number
          approved_at: string | null
          approved_by: string | null
          basic_salary: number
          branch_id: string
          claims_amount: number
          created_at: string
          created_by: string
          days_worked: number | null
          eis_employee: number
          eis_employer: number
          epf_employee: number
          epf_employer: number
          gross_salary: number
          id: string
          late_deduction: number | null
          month: number
          net_salary: number
          notes: string | null
          other_allowance_notes: string | null
          other_allowances: number | null
          other_deduction_notes: string | null
          other_deductions: number | null
          overtime_amount: number | null
          overtime_hours: number | null
          overtime_rate: number | null
          paid_at: string | null
          pcb_amount: number
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          socso_employee: number
          socso_employer: number
          status: string | null
          submitted_at: string | null
          submitted_by: string | null
          unpaid_leave_deduction: number | null
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          absent_deduction?: number
          advance_deduction?: number | null
          allowances?: number
          approved_at?: string | null
          approved_by?: string | null
          basic_salary: number
          branch_id: string
          claims_amount?: number
          created_at?: string
          created_by: string
          days_worked?: number | null
          eis_employee?: number
          eis_employer?: number
          epf_employee?: number
          epf_employer?: number
          gross_salary: number
          id?: string
          late_deduction?: number | null
          month: number
          net_salary: number
          notes?: string | null
          other_allowance_notes?: string | null
          other_allowances?: number | null
          other_deduction_notes?: string | null
          other_deductions?: number | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          overtime_rate?: number | null
          paid_at?: string | null
          pcb_amount?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          socso_employee?: number
          socso_employer?: number
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unpaid_leave_deduction?: number | null
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          absent_deduction?: number
          advance_deduction?: number | null
          allowances?: number
          approved_at?: string | null
          approved_by?: string | null
          basic_salary?: number
          branch_id?: string
          claims_amount?: number
          created_at?: string
          created_by?: string
          days_worked?: number | null
          eis_employee?: number
          eis_employer?: number
          epf_employee?: number
          epf_employer?: number
          gross_salary?: number
          id?: string
          late_deduction?: number | null
          month?: number
          net_salary?: number
          notes?: string | null
          other_allowance_notes?: string | null
          other_allowances?: number | null
          other_deduction_notes?: string | null
          other_deductions?: number | null
          overtime_amount?: number | null
          overtime_hours?: number | null
          overtime_rate?: number | null
          paid_at?: string | null
          pcb_amount?: number
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          socso_employee?: number
          socso_employer?: number
          status?: string | null
          submitted_at?: string | null
          submitted_by?: string | null
          unpaid_leave_deduction?: number | null
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      pdpa_consents: {
        Row: {
          branch_id: string
          consent_type: string
          consented_at: string
          id: string
          ip_address: string | null
          is_granted: boolean
          parent_user_id: string
          student_id: string
        }
        Insert: {
          branch_id: string
          consent_type?: string
          consented_at?: string
          id?: string
          ip_address?: string | null
          is_granted?: boolean
          parent_user_id: string
          student_id: string
        }
        Update: {
          branch_id?: string
          consent_type?: string
          consented_at?: string
          id?: string
          ip_address?: string | null
          is_granted?: boolean
          parent_user_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdpa_consents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pdpa_consents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_kpis: {
        Row: {
          actual: string | null
          created_at: string
          id: string
          kpi_name: string
          review_id: string
          score: number | null
          target: string | null
          weight: number
        }
        Insert: {
          actual?: string | null
          created_at?: string
          id?: string
          kpi_name: string
          review_id: string
          score?: number | null
          target?: string | null
          weight?: number
        }
        Update: {
          actual?: string | null
          created_at?: string
          id?: string
          kpi_name?: string
          review_id?: string
          score?: number | null
          target?: string | null
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "performance_kpis_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "performance_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reviews: {
        Row: {
          branch_id: string
          created_at: string
          goals: string | null
          id: string
          improvements: string | null
          overall_rating: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id: string
          status: string
          strengths: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          goals?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          review_period_end: string
          review_period_start: string
          reviewer_id: string
          status?: string
          strengths?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          goals?: string | null
          id?: string
          improvements?: string | null
          overall_rating?: number | null
          review_period_end?: string
          review_period_start?: string
          reviewer_id?: string
          status?: string
          strengths?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "performance_reviews_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      pickup_changes: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          created_at: string
          ic_number: string | null
          id: string
          notes: string | null
          parent_id: string
          pickup_date: string
          pickup_person_name: string
          pickup_person_phone: string
          relationship: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          branch_id: string
          created_at?: string
          ic_number?: string | null
          id?: string
          notes?: string | null
          parent_id: string
          pickup_date: string
          pickup_person_name: string
          pickup_person_phone: string
          relationship?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          branch_id?: string
          created_at?: string
          ic_number?: string | null
          id?: string
          notes?: string | null
          parent_id?: string
          pickup_date?: string
          pickup_person_name?: string
          pickup_person_phone?: string
          relationship?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pickup_changes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          branch_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_values: Json | null
          old_values: Json | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          branch_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          branch_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_audit_log_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address: Json | null
          avatar_url: string | null
          can_manage_library: boolean
          created_at: string
          email: string
          first_name: string | null
          id: string
          is_quiet_hours_enabled: boolean
          last_name: string | null
          must_change_password: boolean
          onboarding_completed_at: string | null
          password_changed_at: string | null
          phone: string | null
          preferred_language: string
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          updated_at: string
        }
        Insert: {
          address?: Json | null
          avatar_url?: string | null
          can_manage_library?: boolean
          created_at?: string
          email: string
          first_name?: string | null
          id: string
          is_quiet_hours_enabled?: boolean
          last_name?: string | null
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          password_changed_at?: string | null
          phone?: string | null
          preferred_language?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
        }
        Update: {
          address?: Json | null
          avatar_url?: string | null
          can_manage_library?: boolean
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          is_quiet_hours_enabled?: boolean
          last_name?: string | null
          must_change_password?: boolean
          onboarding_completed_at?: string | null
          password_changed_at?: string | null
          phone?: string | null
          preferred_language?: string
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ptm_action_items: {
        Row: {
          action_owner: string
          action_text: string
          branch_id: string
          created_at: string
          due_date: string | null
          id: string
          ptm_meeting_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          action_owner: string
          action_text: string
          branch_id: string
          created_at?: string
          due_date?: string | null
          id?: string
          ptm_meeting_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          action_owner?: string
          action_text?: string
          branch_id?: string
          created_at?: string
          due_date?: string | null
          id?: string
          ptm_meeting_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ptm_action_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_action_items_ptm_meeting_id_fkey"
            columns: ["ptm_meeting_id"]
            isOneToOne: false
            referencedRelation: "ptm_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_action_items_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ptm_bookings: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          parent_id: string
          parent_notes: string | null
          previous_slot_id: string | null
          ptm_meeting_id: string | null
          rescheduled_at: string | null
          slot_id: string
          staff_notes: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          parent_id: string
          parent_notes?: string | null
          previous_slot_id?: string | null
          ptm_meeting_id?: string | null
          rescheduled_at?: string | null
          slot_id: string
          staff_notes?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          parent_id?: string
          parent_notes?: string | null
          previous_slot_id?: string | null
          ptm_meeting_id?: string | null
          rescheduled_at?: string | null
          slot_id?: string
          staff_notes?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ptm_bookings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_bookings_previous_slot_id_fkey"
            columns: ["previous_slot_id"]
            isOneToOne: false
            referencedRelation: "ptm_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_bookings_ptm_meeting_id_fkey"
            columns: ["ptm_meeting_id"]
            isOneToOne: false
            referencedRelation: "ptm_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_bookings_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "ptm_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_bookings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ptm_meetings: {
        Row: {
          agenda_json: Json | null
          agreed_actions_json: Json | null
          branch_id: string
          class_id: string | null
          created_at: string
          discussion_notes: string | null
          followup_date: string | null
          id: string
          meeting_date: string
          meeting_time: string | null
          parent_attendee_names: string | null
          ptm_report_id: string | null
          status: string
          student_id: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          agenda_json?: Json | null
          agreed_actions_json?: Json | null
          branch_id: string
          class_id?: string | null
          created_at?: string
          discussion_notes?: string | null
          followup_date?: string | null
          id?: string
          meeting_date: string
          meeting_time?: string | null
          parent_attendee_names?: string | null
          ptm_report_id?: string | null
          status?: string
          student_id: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          agenda_json?: Json | null
          agreed_actions_json?: Json | null
          branch_id?: string
          class_id?: string | null
          created_at?: string
          discussion_notes?: string | null
          followup_date?: string | null
          id?: string
          meeting_date?: string
          meeting_time?: string | null
          parent_attendee_names?: string | null
          ptm_report_id?: string | null
          status?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ptm_meetings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_meetings_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_meetings_ptm_report_id_fkey"
            columns: ["ptm_report_id"]
            isOneToOne: false
            referencedRelation: "ptm_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_meetings_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ptm_preparation: {
        Row: {
          academic_year_id: string | null
          action_plan: string | null
          approved: boolean
          approved_at: string | null
          approved_by: string | null
          areas_for_development: string | null
          branch_id: string
          created_at: string
          created_by: string
          discussion_notes: string | null
          home_activities: string | null
          id: string
          next_learning_goals: string | null
          strengths: string | null
          student_id: string
          term_label: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          action_plan?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          areas_for_development?: string | null
          branch_id: string
          created_at?: string
          created_by?: string
          discussion_notes?: string | null
          home_activities?: string | null
          id?: string
          next_learning_goals?: string | null
          strengths?: string | null
          student_id: string
          term_label: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          action_plan?: string | null
          approved?: boolean
          approved_at?: string | null
          approved_by?: string | null
          areas_for_development?: string | null
          branch_id?: string
          created_at?: string
          created_by?: string
          discussion_notes?: string | null
          home_activities?: string | null
          id?: string
          next_learning_goals?: string | null
          strengths?: string | null
          student_id?: string
          term_label?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ptm_preparation_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ptm_reports: {
        Row: {
          academic_term: string | null
          action_plan_json: Json | null
          approved_by: string | null
          branch_id: string
          class_id: string | null
          created_at: string | null
          evidence_summary_json: Json | null
          generated_by: string
          generated_content: Json
          id: string
          parent_support_json: Json | null
          report_type: string
          status: string
          strengths_json: Json | null
          student_id: string
          support_areas_json: Json | null
          teacher_comment: string | null
          term_name: string
          updated_at: string | null
        }
        Insert: {
          academic_term?: string | null
          action_plan_json?: Json | null
          approved_by?: string | null
          branch_id: string
          class_id?: string | null
          created_at?: string | null
          evidence_summary_json?: Json | null
          generated_by: string
          generated_content?: Json
          id?: string
          parent_support_json?: Json | null
          report_type?: string
          status?: string
          strengths_json?: Json | null
          student_id: string
          support_areas_json?: Json | null
          teacher_comment?: string | null
          term_name: string
          updated_at?: string | null
        }
        Update: {
          academic_term?: string | null
          action_plan_json?: Json | null
          approved_by?: string | null
          branch_id?: string
          class_id?: string | null
          created_at?: string | null
          evidence_summary_json?: Json | null
          generated_by?: string
          generated_content?: Json
          id?: string
          parent_support_json?: Json | null
          report_type?: string
          status?: string
          strengths_json?: Json | null
          student_id?: string
          support_areas_json?: Json | null
          teacher_comment?: string | null
          term_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ptm_reports_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_reports_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_reports_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      ptm_slots: {
        Row: {
          branch_id: string
          capacity: number
          class_id: string | null
          created_at: string
          created_by: string
          end_time: string
          id: string
          location: string | null
          notes: string | null
          slot_date: string
          start_time: string
          status: string
          teacher_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          capacity?: number
          class_id?: string | null
          created_at?: string
          created_by: string
          end_time: string
          id?: string
          location?: string | null
          notes?: string | null
          slot_date: string
          start_time: string
          status?: string
          teacher_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          capacity?: number
          class_id?: string | null
          created_at?: string
          created_by?: string
          end_time?: string
          id?: string
          location?: string | null
          notes?: string | null
          slot_date?: string
          start_time?: string
          status?: string
          teacher_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ptm_slots_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ptm_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_logs: {
        Row: {
          created_at: string
          endpoint: string | null
          id: string
          notification_id: string | null
          response_body: string | null
          response_code: number | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          id?: string
          notification_id?: string | null
          response_body?: string | null
          response_code?: number | null
          status: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          id?: string
          notification_id?: string | null
          response_body?: string | null
          response_code?: number | null
          status?: string
          user_id?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          platform: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          platform?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          platform?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      readiness_profile_objectives: {
        Row: {
          created_at: string
          id: string
          lesson_objective_id: string
          minimum_mastery_level: string
          readiness_profile_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_objective_id: string
          minimum_mastery_level?: string
          readiness_profile_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          id?: string
          lesson_objective_id?: string
          minimum_mastery_level?: string
          readiness_profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "readiness_profile_objectives_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_profile_objectives_readiness_profile_id_fkey"
            columns: ["readiness_profile_id"]
            isOneToOne: false
            referencedRelation: "readiness_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      readiness_profiles: {
        Row: {
          age_group_id: string
          branch_id: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          age_group_id: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          age_group_id?: string
          branch_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "readiness_profiles_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "readiness_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_settings: {
        Row: {
          created_at: string
          day_of_week: number
          enabled: boolean
          frequency_weeks: number
          id: string
          kind: string
          last_sent_at: string | null
          time_of_day: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          day_of_week?: number
          enabled?: boolean
          frequency_weeks?: number
          id?: string
          kind?: string
          last_sent_at?: string | null
          time_of_day?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number
          enabled?: boolean
          frequency_weeks?: number
          id?: string
          kind?: string
          last_sent_at?: string | null
          time_of_day?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      school_document_acknowledgements: {
        Row: {
          acknowledged_at: string
          acknowledgement_text: string
          created_at: string
          document_id: string
          document_version: string
          id: string
          parent_id: string
        }
        Insert: {
          acknowledged_at?: string
          acknowledgement_text?: string
          created_at?: string
          document_id: string
          document_version: string
          id?: string
          parent_id: string
        }
        Update: {
          acknowledged_at?: string
          acknowledgement_text?: string
          created_at?: string
          document_id?: string
          document_version?: string
          id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_document_acknowledgements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "school_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      school_documents: {
        Row: {
          branch_id: string
          category: string
          created_at: string
          description: string | null
          display_order: number
          file_name: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          is_active: boolean
          is_required_for_onboarding: boolean
          mime_type: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
          version: string
        }
        Insert: {
          branch_id: string
          category: string
          created_at?: string
          description?: string | null
          display_order?: number
          file_name?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          is_active?: boolean
          is_required_for_onboarding?: boolean
          mime_type?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
          version?: string
        }
        Update: {
          branch_id?: string
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number
          file_name?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          is_active?: boolean
          is_required_for_onboarding?: boolean
          mime_type?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_documents_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "school_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      school_holidays: {
        Row: {
          academic_year_id: string
          affects_attendance: boolean | null
          created_at: string | null
          end_date: string | null
          event_date: string
          event_kind: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name: string
          event_type: string | null
          id: string
          is_paid: boolean | null
          is_public_holiday: boolean | null
        }
        Insert: {
          academic_year_id: string
          affects_attendance?: boolean | null
          created_at?: string | null
          end_date?: string | null
          event_date: string
          event_kind?: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name: string
          event_type?: string | null
          id?: string
          is_paid?: boolean | null
          is_public_holiday?: boolean | null
        }
        Update: {
          academic_year_id?: string
          affects_attendance?: boolean | null
          created_at?: string | null
          end_date?: string | null
          event_date?: string
          event_kind?: Database["public"]["Enums"]["calendar_event_kind"] | null
          event_name?: string
          event_type?: string | null
          id?: string
          is_paid?: boolean | null
          is_public_holiday?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "school_holidays_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      school_philosophy_settings: {
        Row: {
          branch_id: string
          created_at: string
          custom_notes: string | null
          id: string
          philosophy_type: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          custom_notes?: string | null
          id?: string
          philosophy_type?: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          custom_notes?: string | null
          id?: string
          philosophy_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_philosophy_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_plans: {
        Row: {
          created_at: string
          id: string
          lesson_plan_id: string
          message: string | null
          shared_by: string
          shared_with: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_plan_id: string
          message?: string | null
          shared_by: string
          shared_with: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_plan_id?: string
          message?: string | null
          shared_by?: string
          shared_with?: string
        }
        Relationships: [
          {
            foreignKeyName: "shared_plans_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      slot_lesson_plans: {
        Row: {
          class_id: string
          created_at: string
          created_by: string
          daily_slot_id: string | null
          generated_activity: Json
          id: string
          lesson_date: string
          mapped_learning_area: string | null
          mapped_standards: string[] | null
          theme: string
          timetable_slot_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          created_by: string
          daily_slot_id?: string | null
          generated_activity?: Json
          id?: string
          lesson_date: string
          mapped_learning_area?: string | null
          mapped_standards?: string[] | null
          theme: string
          timetable_slot_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          created_by?: string
          daily_slot_id?: string | null
          generated_activity?: Json
          id?: string
          lesson_date?: string
          mapped_learning_area?: string | null
          mapped_standards?: string[] | null
          theme?: string
          timetable_slot_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "slot_lesson_plans_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_lesson_plans_daily_slot_id_fkey"
            columns: ["daily_slot_id"]
            isOneToOne: false
            referencedRelation: "daily_timetable_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "slot_lesson_plans_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      source_enquiries: {
        Row: {
          branch_id: string
          count: number
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          period_month: string
          source: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month: string
          source: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          count?: number
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          period_month?: string
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      staff_attendance: {
        Row: {
          branch_id: string
          clock_in: string | null
          clock_in_latitude: number | null
          clock_in_longitude: number | null
          clock_out: string | null
          clock_out_latitude: number | null
          clock_out_longitude: number | null
          created_at: string
          date: string
          geofence_note: string | null
          id: string
          is_outside_geofence: boolean | null
          notes: string | null
          selfie_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          clock_in?: string | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          created_at?: string
          date?: string
          geofence_note?: string | null
          id?: string
          is_outside_geofence?: boolean | null
          notes?: string | null
          selfie_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          clock_in?: string | null
          clock_in_latitude?: number | null
          clock_in_longitude?: number | null
          clock_out?: string | null
          clock_out_latitude?: number | null
          clock_out_longitude?: number | null
          created_at?: string
          date?: string
          geofence_note?: string | null
          id?: string
          is_outside_geofence?: boolean | null
          notes?: string | null
          selfie_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance_audit_log: {
        Row: {
          action: string
          attendance_id: string | null
          changed_by: string
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          reason: string
        }
        Insert: {
          action: string
          attendance_id?: string | null
          changed_by: string
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason: string
        }
        Update: {
          action?: string
          attendance_id?: string | null
          changed_by?: string
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_audit_log_attendance_id_fkey"
            columns: ["attendance_id"]
            isOneToOne: false
            referencedRelation: "staff_attendance"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_claims: {
        Row: {
          amount: number
          branch_id: string
          claim_date: string
          claim_type: string
          created_at: string
          description: string
          id: string
          level1_approved_at: string | null
          level1_approved_by: string | null
          level1_notes: string | null
          level1_status: string
          level2_approved_at: string | null
          level2_approved_by: string | null
          level2_notes: string | null
          level2_status: string
          paid_at: string | null
          paid_by: string | null
          paid_via: string | null
          payment_notes: string | null
          payroll_month: number | null
          payroll_year: number | null
          receipt_url: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          branch_id: string
          claim_date?: string
          claim_type?: string
          created_at?: string
          description?: string
          id?: string
          level1_approved_at?: string | null
          level1_approved_by?: string | null
          level1_notes?: string | null
          level1_status?: string
          level2_approved_at?: string | null
          level2_approved_by?: string | null
          level2_notes?: string | null
          level2_status?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: string | null
          payment_notes?: string | null
          payroll_month?: number | null
          payroll_year?: number | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          branch_id?: string
          claim_date?: string
          claim_type?: string
          created_at?: string
          description?: string
          id?: string
          level1_approved_at?: string | null
          level1_approved_by?: string | null
          level1_notes?: string | null
          level1_status?: string
          level2_approved_at?: string | null
          level2_approved_by?: string | null
          level2_notes?: string | null
          level2_status?: string
          paid_at?: string | null
          paid_by?: string | null
          paid_via?: string | null
          payment_notes?: string | null
          payroll_month?: number | null
          payroll_year?: number | null
          receipt_url?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_claims_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_designations: {
        Row: {
          branch_id: string
          category: string
          created_at: string
          custom_designation: string | null
          designation: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          branch_id: string
          category?: string
          created_at?: string
          custom_designation?: string | null
          designation?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          category?: string
          created_at?: string
          custom_designation?: string | null
          designation?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_designations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string | null
          file_url: string
          id: string
          notes: string | null
          uploaded_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name?: string | null
          file_url: string
          id?: string
          notes?: string | null
          uploaded_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string | null
          file_url?: string
          id?: string
          notes?: string | null
          uploaded_by?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_geofence_assignments: {
        Row: {
          branch_id: string
          created_at: string
          geofence_location_id: string
          id: string
          user_id: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          geofence_location_id: string
          id?: string
          user_id: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          geofence_location_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_geofence_assignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_geofence_assignments_geofence_location_id_fkey"
            columns: ["geofence_location_id"]
            isOneToOne: false
            referencedRelation: "geofence_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          address: string | null
          bank_account: string | null
          bank_name: string | null
          basic_salary: number | null
          created_at: string
          custom_eis_rate: number | null
          custom_epf_rate: number | null
          custom_socso_rate: number | null
          date_of_birth: string | null
          eis_enabled: boolean | null
          eis_number: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          employment_end_date: string | null
          employment_start_date: string | null
          employment_status: string
          employment_type: string | null
          epf_enabled: boolean | null
          epf_number: string | null
          exclude_from_payroll: boolean | null
          gender: string | null
          ic_number: string | null
          id: string
          is_active: boolean | null
          last_working_date: string | null
          marital_status: string | null
          nationality: string | null
          onboarding_complete: boolean
          onboarding_token: string | null
          onboarding_token_expires_at: string | null
          overtime_rate: number | null
          overtime_rate_public_holiday: number | null
          overtime_rate_rest_day: number | null
          phone: string | null
          probation_duration_months: number | null
          probation_end_date: string | null
          probation_extended_until: string | null
          probation_status: string
          reports_to: string | null
          resignation_date: string | null
          resignation_reason: string | null
          socso_enabled: boolean | null
          socso_number: string | null
          tax_number: string | null
          updated_at: string
          user_id: string
          work_days: Json | null
          work_end_time: string | null
          work_schedule: Json | null
          work_start_time: string | null
        }
        Insert: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string
          custom_eis_rate?: number | null
          custom_epf_rate?: number | null
          custom_socso_rate?: number | null
          date_of_birth?: string | null
          eis_enabled?: boolean | null
          eis_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          employment_status?: string
          employment_type?: string | null
          epf_enabled?: boolean | null
          epf_number?: string | null
          exclude_from_payroll?: boolean | null
          gender?: string | null
          ic_number?: string | null
          id?: string
          is_active?: boolean | null
          last_working_date?: string | null
          marital_status?: string | null
          nationality?: string | null
          onboarding_complete?: boolean
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          overtime_rate?: number | null
          overtime_rate_public_holiday?: number | null
          overtime_rate_rest_day?: number | null
          phone?: string | null
          probation_duration_months?: number | null
          probation_end_date?: string | null
          probation_extended_until?: string | null
          probation_status?: string
          reports_to?: string | null
          resignation_date?: string | null
          resignation_reason?: string | null
          socso_enabled?: boolean | null
          socso_number?: string | null
          tax_number?: string | null
          updated_at?: string
          user_id: string
          work_days?: Json | null
          work_end_time?: string | null
          work_schedule?: Json | null
          work_start_time?: string | null
        }
        Update: {
          address?: string | null
          bank_account?: string | null
          bank_name?: string | null
          basic_salary?: number | null
          created_at?: string
          custom_eis_rate?: number | null
          custom_epf_rate?: number | null
          custom_socso_rate?: number | null
          date_of_birth?: string | null
          eis_enabled?: boolean | null
          eis_number?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          employment_end_date?: string | null
          employment_start_date?: string | null
          employment_status?: string
          employment_type?: string | null
          epf_enabled?: boolean | null
          epf_number?: string | null
          exclude_from_payroll?: boolean | null
          gender?: string | null
          ic_number?: string | null
          id?: string
          is_active?: boolean | null
          last_working_date?: string | null
          marital_status?: string | null
          nationality?: string | null
          onboarding_complete?: boolean
          onboarding_token?: string | null
          onboarding_token_expires_at?: string | null
          overtime_rate?: number | null
          overtime_rate_public_holiday?: number | null
          overtime_rate_rest_day?: number | null
          phone?: string | null
          probation_duration_months?: number | null
          probation_end_date?: string | null
          probation_extended_until?: string | null
          probation_status?: string
          reports_to?: string | null
          resignation_date?: string | null
          resignation_reason?: string | null
          socso_enabled?: boolean | null
          socso_number?: string | null
          tax_number?: string | null
          updated_at?: string
          user_id?: string
          work_days?: Json | null
          work_end_time?: string | null
          work_schedule?: Json | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_profiles_reports_to_fkey"
            columns: ["reports_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_salary_components: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          is_active: boolean
          is_statutory: boolean
          label: string
          type: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_statutory?: boolean
          label: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          is_active?: boolean
          is_statutory?: boolean
          label?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      student_billing_profiles: {
        Row: {
          billing_cycle: string
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          billing_cycle?: string
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          billing_cycle?: string
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_billing_profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_billing_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_billing_profiles_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: true
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_fees: {
        Row: {
          created_at: string
          discount_amount: number | null
          discount_reason: string | null
          effective_from: string
          effective_until: string | null
          fee_package_id: string
          id: string
          is_active: boolean | null
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_amount?: number | null
          discount_reason?: string | null
          effective_from?: string
          effective_until?: string | null
          fee_package_id: string
          id?: string
          is_active?: boolean | null
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_amount?: number | null
          discount_reason?: string | null
          effective_from?: string
          effective_until?: string | null
          fee_package_id?: string
          id?: string
          is_active?: boolean | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_fees_fee_package_id_fkey"
            columns: ["fee_package_id"]
            isOneToOne: false
            referencedRelation: "fee_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_fees_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_gap_analysis: {
        Row: {
          class_id: string
          created_at: string
          gap_description: string | null
          gap_subject: string | null
          id: string
          identified_at: string
          missing_standard_codes: Json
          remediation_status: string
          resolved_at: string | null
          student_id: string
        }
        Insert: {
          class_id: string
          created_at?: string
          gap_description?: string | null
          gap_subject?: string | null
          id?: string
          identified_at?: string
          missing_standard_codes?: Json
          remediation_status?: string
          resolved_at?: string | null
          student_id: string
        }
        Update: {
          class_id?: string
          created_at?: string
          gap_description?: string | null
          gap_subject?: string | null
          id?: string
          identified_at?: string
          missing_standard_codes?: Json
          remediation_status?: string
          resolved_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_gap_analysis_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_gap_analysis_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_indicator_status: {
        Row: {
          created_at: string
          first_observed_at: string | null
          id: string
          last_observed_at: string | null
          notes: string | null
          objective_indicator_id: string
          observation_count: number
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          first_observed_at?: string | null
          id?: string
          last_observed_at?: string | null
          notes?: string | null
          objective_indicator_id: string
          observation_count?: number
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          first_observed_at?: string | null
          id?: string
          last_observed_at?: string | null
          notes?: string | null
          objective_indicator_id?: string
          observation_count?: number
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_indicator_status_objective_indicator_id_fkey"
            columns: ["objective_indicator_id"]
            isOneToOne: false
            referencedRelation: "objective_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_indicator_status_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_intervention_plans: {
        Row: {
          branch_id: string
          concern_description: string
          created_at: string
          created_by: string
          domain_id: string | null
          id: string
          intervention_strategy: string | null
          lesson_objective_id: string | null
          resolution_notes: string | null
          resolved_at: string | null
          status: string
          student_id: string
          target_date: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          concern_description: string
          created_at?: string
          created_by: string
          domain_id?: string | null
          id?: string
          intervention_strategy?: string | null
          lesson_objective_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          student_id: string
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          concern_description?: string
          created_at?: string
          created_by?: string
          domain_id?: string | null
          id?: string
          intervention_strategy?: string | null
          lesson_objective_id?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          status?: string
          student_id?: string
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_intervention_plans_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_intervention_plans_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_intervention_plans_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "student_intervention_plans_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_intervention_plans_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_lesson_exposure: {
        Row: {
          attendance_status: string | null
          created_at: string
          engagement_level: string | null
          exposure_date: string
          id: string
          lesson_objective_id: string | null
          lesson_plan_id: string
          student_id: string
          teacher_note: string | null
        }
        Insert: {
          attendance_status?: string | null
          created_at?: string
          engagement_level?: string | null
          exposure_date: string
          id?: string
          lesson_objective_id?: string | null
          lesson_plan_id: string
          student_id: string
          teacher_note?: string | null
        }
        Update: {
          attendance_status?: string | null
          created_at?: string
          engagement_level?: string | null
          exposure_date?: string
          id?: string
          lesson_objective_id?: string | null
          lesson_plan_id?: string
          student_id?: string
          teacher_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_lesson_exposure_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_lesson_exposure_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_lesson_exposure_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_mastery_status: {
        Row: {
          assessed_by: string | null
          created_at: string
          evidence_count: number
          id: string
          last_assessed_at: string | null
          lesson_objective_id: string
          mastery_level: string
          notes: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          assessed_by?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          last_assessed_at?: string | null
          lesson_objective_id: string
          mastery_level?: string
          notes?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          assessed_by?: string | null
          created_at?: string
          evidence_count?: number
          id?: string
          last_assessed_at?: string | null
          lesson_objective_id?: string
          mastery_level?: string
          notes?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_mastery_status_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_mastery_status_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_monthly_summaries: {
        Row: {
          branch_id: string
          created_at: string | null
          domains_explored: string[] | null
          entry_count: number | null
          generated_by: string | null
          home_extensions_json: Json | null
          id: string
          milestone_count: number | null
          month: number
          status: string | null
          strengths_json: Json | null
          student_id: string
          summary_text: string | null
          updated_at: string | null
          year: number
        }
        Insert: {
          branch_id: string
          created_at?: string | null
          domains_explored?: string[] | null
          entry_count?: number | null
          generated_by?: string | null
          home_extensions_json?: Json | null
          id?: string
          milestone_count?: number | null
          month: number
          status?: string | null
          strengths_json?: Json | null
          student_id: string
          summary_text?: string | null
          updated_at?: string | null
          year: number
        }
        Update: {
          branch_id?: string
          created_at?: string | null
          domains_explored?: string[] | null
          entry_count?: number | null
          generated_by?: string | null
          home_extensions_json?: Json | null
          id?: string
          milestone_count?: number | null
          month?: number
          status?: string | null
          strengths_json?: Json | null
          student_id?: string
          summary_text?: string | null
          updated_at?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "student_monthly_summaries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_monthly_summaries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      student_observation_evidence: {
        Row: {
          class_id: string | null
          created_at: string
          evidence_note: string | null
          evidence_photo_url: string | null
          id: string
          indicator_id: string | null
          internal_only: boolean
          lesson_objective_id: string | null
          lesson_plan_id: string | null
          next_step: string | null
          objective_indicator_id: string | null
          observed_on: string
          status: string
          student_id: string
          teacher_id: string
          updated_at: string
          week_plan_id: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          evidence_note?: string | null
          evidence_photo_url?: string | null
          id?: string
          indicator_id?: string | null
          internal_only?: boolean
          lesson_objective_id?: string | null
          lesson_plan_id?: string | null
          next_step?: string | null
          objective_indicator_id?: string | null
          observed_on?: string
          status?: string
          student_id: string
          teacher_id: string
          updated_at?: string
          week_plan_id?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          evidence_note?: string | null
          evidence_photo_url?: string | null
          id?: string
          indicator_id?: string | null
          internal_only?: boolean
          lesson_objective_id?: string | null
          lesson_plan_id?: string | null
          next_step?: string | null
          objective_indicator_id?: string | null
          observed_on?: string
          status?: string
          student_id?: string
          teacher_id?: string
          updated_at?: string
          week_plan_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_observation_evidence_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_indicator_id_fkey"
            columns: ["indicator_id"]
            isOneToOne: false
            referencedRelation: "observation_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_objective_indicator_id_fkey"
            columns: ["objective_indicator_id"]
            isOneToOne: false
            referencedRelation: "objective_indicators"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observation_evidence_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_week_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      student_observation_media: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          duration_seconds: number | null
          id: string
          media_type: string
          media_url: string
          observation_id: string
          sort_order: number
          thumbnail_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          media_type?: string
          media_url: string
          observation_id: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          duration_seconds?: number | null
          id?: string
          media_type?: string
          media_url?: string
          observation_id?: string
          sort_order?: number
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_observation_media_observation_id_fkey"
            columns: ["observation_id"]
            isOneToOne: false
            referencedRelation: "student_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      student_observations: {
        Row: {
          ai_learning_story: string | null
          album_id: string | null
          created_at: string
          evidence_url: string | null
          id: string
          is_shared_with_parent: boolean
          lesson_plan_id: string | null
          media_url: string | null
          notes: string | null
          observed_at: string
          observed_by: string
          proficiency_level: Database["public"]["Enums"]["proficiency_level"]
          standard_id: string
          student_id: string
          timetable_slot_id: string | null
          updated_at: string
        }
        Insert: {
          ai_learning_story?: string | null
          album_id?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          is_shared_with_parent?: boolean
          lesson_plan_id?: string | null
          media_url?: string | null
          notes?: string | null
          observed_at?: string
          observed_by: string
          proficiency_level: Database["public"]["Enums"]["proficiency_level"]
          standard_id: string
          student_id: string
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_learning_story?: string | null
          album_id?: string | null
          created_at?: string
          evidence_url?: string | null
          id?: string
          is_shared_with_parent?: boolean
          lesson_plan_id?: string | null
          media_url?: string | null
          notes?: string | null
          observed_at?: string
          observed_by?: string
          proficiency_level?: Database["public"]["Enums"]["proficiency_level"]
          standard_id?: string
          student_id?: string
          timetable_slot_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_observations_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "learning_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "curriculum_standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_observations_timetable_slot_id_fkey"
            columns: ["timetable_slot_id"]
            isOneToOne: false
            referencedRelation: "timetable_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      student_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status:
            | Database["public"]["Enums"]["student_enrollment_status"]
            | null
          id: string
          reason: string | null
          student_id: string
          to_status: Database["public"]["Enums"]["student_enrollment_status"]
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["student_enrollment_status"]
            | null
          id?: string
          reason?: string | null
          student_id: string
          to_status: Database["public"]["Enums"]["student_enrollment_status"]
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?:
            | Database["public"]["Enums"]["student_enrollment_status"]
            | null
          id?: string
          reason?: string | null
          student_id?: string
          to_status?: Database["public"]["Enums"]["student_enrollment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "student_status_history_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          age_group_id: string | null
          allergies: string | null
          authorized_pickups: Json | null
          birth_cert_no: string | null
          blood_type: string | null
          branch_id: string
          class_id: string | null
          class_name: string | null
          created_at: string
          current_intervention_flag: boolean | null
          current_methodology: string | null
          date_of_birth: string | null
          dietary_notes: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          emergency_contacts: Json | null
          enrollment_date: string | null
          enrollment_status: Database["public"]["Enums"]["student_enrollment_status"]
          extra_emergency_contacts: Json
          father_email: string | null
          father_ic: string | null
          father_name: string | null
          father_occupation: string | null
          father_phone: string | null
          first_name: string
          gender: string | null
          home_address: string | null
          id: string
          is_active: boolean
          last_name: string
          medical_conditions: string | null
          mother_email: string | null
          mother_ic: string | null
          mother_name: string | null
          mother_occupation: string | null
          mother_phone: string | null
          mykid_no: string | null
          nationality: string | null
          notes: string | null
          photo_url: string | null
          program_type: string
          race: string | null
          readiness_status: string | null
          religion: string | null
          status_changed_at: string | null
          status_changed_by: string | null
          status_reason: string | null
          student_access_code: string | null
          updated_at: string
        }
        Insert: {
          age_group_id?: string | null
          allergies?: string | null
          authorized_pickups?: Json | null
          birth_cert_no?: string | null
          blood_type?: string | null
          branch_id: string
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          current_intervention_flag?: boolean | null
          current_methodology?: string | null
          date_of_birth?: string | null
          dietary_notes?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          emergency_contacts?: Json | null
          enrollment_date?: string | null
          enrollment_status?: Database["public"]["Enums"]["student_enrollment_status"]
          extra_emergency_contacts?: Json
          father_email?: string | null
          father_ic?: string | null
          father_name?: string | null
          father_occupation?: string | null
          father_phone?: string | null
          first_name: string
          gender?: string | null
          home_address?: string | null
          id?: string
          is_active?: boolean
          last_name: string
          medical_conditions?: string | null
          mother_email?: string | null
          mother_ic?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          mother_phone?: string | null
          mykid_no?: string | null
          nationality?: string | null
          notes?: string | null
          photo_url?: string | null
          program_type?: string
          race?: string | null
          readiness_status?: string | null
          religion?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          student_access_code?: string | null
          updated_at?: string
        }
        Update: {
          age_group_id?: string | null
          allergies?: string | null
          authorized_pickups?: Json | null
          birth_cert_no?: string | null
          blood_type?: string | null
          branch_id?: string
          class_id?: string | null
          class_name?: string | null
          created_at?: string
          current_intervention_flag?: boolean | null
          current_methodology?: string | null
          date_of_birth?: string | null
          dietary_notes?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          emergency_contacts?: Json | null
          enrollment_date?: string | null
          enrollment_status?: Database["public"]["Enums"]["student_enrollment_status"]
          extra_emergency_contacts?: Json
          father_email?: string | null
          father_ic?: string | null
          father_name?: string | null
          father_occupation?: string | null
          father_phone?: string | null
          first_name?: string
          gender?: string | null
          home_address?: string | null
          id?: string
          is_active?: boolean
          last_name?: string
          medical_conditions?: string | null
          mother_email?: string | null
          mother_ic?: string | null
          mother_name?: string | null
          mother_occupation?: string | null
          mother_phone?: string | null
          mykid_no?: string | null
          nationality?: string | null
          notes?: string | null
          photo_url?: string | null
          program_type?: string
          race?: string | null
          readiness_status?: string | null
          religion?: string | null
          status_changed_at?: string | null
          status_changed_by?: string | null
          status_reason?: string | null
          student_access_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_standard_map: {
        Row: {
          description: string | null
          id: string
          kp2026_learning_area: string
          parent_subject: string | null
          subject_name: string
        }
        Insert: {
          description?: string | null
          id?: string
          kp2026_learning_area: string
          parent_subject?: string | null
          subject_name: string
        }
        Update: {
          description?: string | null
          id?: string
          kp2026_learning_area?: string
          parent_subject?: string | null
          subject_name?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      theme_bank: {
        Row: {
          age_group: number | null
          big_idea: string | null
          center_suggestions: Json | null
          created_at: string
          id: string
          key_concepts: Json | null
          key_vocabulary: Json | null
          month_number: number
          parent_connection: Json | null
          suggested_books: Json | null
          suggested_songs: Json | null
          theme_name: string
        }
        Insert: {
          age_group?: number | null
          big_idea?: string | null
          center_suggestions?: Json | null
          created_at?: string
          id?: string
          key_concepts?: Json | null
          key_vocabulary?: Json | null
          month_number: number
          parent_connection?: Json | null
          suggested_books?: Json | null
          suggested_songs?: Json | null
          theme_name: string
        }
        Update: {
          age_group?: number | null
          big_idea?: string | null
          center_suggestions?: Json | null
          created_at?: string
          id?: string
          key_concepts?: Json | null
          key_vocabulary?: Json | null
          month_number?: number
          parent_connection?: Json | null
          suggested_books?: Json | null
          suggested_songs?: Json | null
          theme_name?: string
        }
        Relationships: []
      }
      theme_weekly_focuses: {
        Row: {
          created_at: string
          focus_description: string | null
          focus_title: string
          id: string
          key_questions: Json | null
          suggested_domains: Json | null
          theme_bank_id: string
          week_number: number
        }
        Insert: {
          created_at?: string
          focus_description?: string | null
          focus_title: string
          id?: string
          key_questions?: Json | null
          suggested_domains?: Json | null
          theme_bank_id: string
          week_number: number
        }
        Update: {
          created_at?: string
          focus_description?: string | null
          focus_title?: string
          id?: string
          key_questions?: Json | null
          suggested_domains?: Json | null
          theme_bank_id?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "theme_weekly_focuses_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_slots: {
        Row: {
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          event_agenda: Json | null
          event_description: string | null
          event_name: string | null
          id: string
          is_parallel_group: boolean | null
          parallel_group_label: string | null
          start_time: string
          subject_name: string
        }
        Insert: {
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          event_agenda?: Json | null
          event_description?: string | null
          event_name?: string | null
          id?: string
          is_parallel_group?: boolean | null
          parallel_group_label?: string | null
          start_time: string
          subject_name: string
        }
        Update: {
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          event_agenda?: Json | null
          event_description?: string | null
          event_name?: string | null
          id?: string
          is_parallel_group?: boolean | null
          parallel_group_label?: string | null
          start_time?: string
          subject_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_slots_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      tnc_versions: {
        Row: {
          branch_id: string | null
          content_md: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          is_active: boolean
          title: string
          updated_at: string
          version: string
        }
        Insert: {
          branch_id?: string | null
          content_md: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          version: string
        }
        Update: {
          branch_id?: string | null
          content_md?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "tnc_versions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tnc_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tours: {
        Row: {
          branch_id: string
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          lead_id: string
          notes: string | null
          outcome: string | null
          scheduled_date: string
          status: string
          type: string
        }
        Insert: {
          branch_id: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          lead_id: string
          notes?: string | null
          outcome?: string | null
          scheduled_date: string
          status?: string
          type?: string
        }
        Update: {
          branch_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lead_id?: string
          notes?: string | null
          outcome?: string | null
          scheduled_date?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "tours_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tours_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          branch_id: string
          created_at: string
          created_by: string
          description: string
          id: string
          notes: string | null
          pending_data: Json | null
          receipt_url: string | null
          reference_id: string | null
          reference_type: string | null
          requested_by: string | null
          status: string
          transaction_date: string
          type: string
          updated_at: string
        }
        Insert: {
          account_id: string
          amount?: number
          branch_id: string
          created_at?: string
          created_by: string
          description?: string
          id?: string
          notes?: string | null
          pending_data?: Json | null
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          status?: string
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Update: {
          account_id?: string
          amount?: number
          branch_id?: string
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          notes?: string | null
          pending_data?: Json | null
          receipt_url?: string | null
          reference_id?: string | null
          reference_type?: string | null
          requested_by?: string | null
          status?: string
          transaction_date?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      weekly_curriculum_plans: {
        Row: {
          center_setup: Json | null
          created_at: string
          created_by: string | null
          focus_questions: Json | null
          focus_title: string | null
          id: string
          materials: Json | null
          monthly_plan_id: string
          observation_focus: Json | null
          provocations: Json | null
          status: string
          suggested_books: Json | null
          suggested_songs: Json | null
          updated_at: string
          week_number: number
          weekly_objectives: Json | null
        }
        Insert: {
          center_setup?: Json | null
          created_at?: string
          created_by?: string | null
          focus_questions?: Json | null
          focus_title?: string | null
          id?: string
          materials?: Json | null
          monthly_plan_id: string
          observation_focus?: Json | null
          provocations?: Json | null
          status?: string
          suggested_books?: Json | null
          suggested_songs?: Json | null
          updated_at?: string
          week_number: number
          weekly_objectives?: Json | null
        }
        Update: {
          center_setup?: Json | null
          created_at?: string
          created_by?: string | null
          focus_questions?: Json | null
          focus_title?: string | null
          id?: string
          materials?: Json | null
          monthly_plan_id?: string
          observation_focus?: Json | null
          provocations?: Json | null
          status?: string
          suggested_books?: Json | null
          suggested_songs?: Json | null
          updated_at?: string
          week_number?: number
          weekly_objectives?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_curriculum_plans_monthly_plan_id_fkey"
            columns: ["monthly_plan_id"]
            isOneToOne: false
            referencedRelation: "monthly_curriculum_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_focus_objectives: {
        Row: {
          created_at: string
          id: string
          lesson_objective_id: string
          priority: string | null
          week_plan_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          lesson_objective_id: string
          priority?: string | null
          week_plan_id: string
        }
        Update: {
          created_at?: string
          id?: string
          lesson_objective_id?: string
          priority?: string | null
          week_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "weekly_focus_objectives_lesson_objective_id_fkey"
            columns: ["lesson_objective_id"]
            isOneToOne: false
            referencedRelation: "lesson_objectives"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_focus_objectives_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_week_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_teaching_sessions: {
        Row: {
          ai_activity_note: string | null
          ai_differentiation: string | null
          ai_generated_at: string | null
          ai_lesson_steps: Json | null
          ai_materials_needed: Json | null
          ai_observation_focus: string | null
          ai_parent_home_practice: string | null
          ai_teacher_reflection_prompt: string | null
          book_title: string | null
          class_id: string
          created_at: string
          created_by: string | null
          day_of_week: string
          end_time: string | null
          id: string
          internal_resource_id: string | null
          key_words: Json
          page_from: string | null
          page_to: string | null
          resource_source_type: string
          session_date: string
          skill_focus: string
          start_time: string | null
          subject: string
          teacher_note: string | null
          teacher_review_status: string
          timetable_slot_id: string | null
          updated_at: string
          updated_by: string | null
          week_plan_id: string
          weekly_teaching_subject_id: string | null
          worksheet_id: string | null
        }
        Insert: {
          ai_activity_note?: string | null
          ai_differentiation?: string | null
          ai_generated_at?: string | null
          ai_lesson_steps?: Json | null
          ai_materials_needed?: Json | null
          ai_observation_focus?: string | null
          ai_parent_home_practice?: string | null
          ai_teacher_reflection_prompt?: string | null
          book_title?: string | null
          class_id: string
          created_at?: string
          created_by?: string | null
          day_of_week: string
          end_time?: string | null
          id?: string
          internal_resource_id?: string | null
          key_words?: Json
          page_from?: string | null
          page_to?: string | null
          resource_source_type?: string
          session_date: string
          skill_focus?: string
          start_time?: string | null
          subject: string
          teacher_note?: string | null
          teacher_review_status?: string
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
          week_plan_id: string
          weekly_teaching_subject_id?: string | null
          worksheet_id?: string | null
        }
        Update: {
          ai_activity_note?: string | null
          ai_differentiation?: string | null
          ai_generated_at?: string | null
          ai_lesson_steps?: Json | null
          ai_materials_needed?: Json | null
          ai_observation_focus?: string | null
          ai_parent_home_practice?: string | null
          ai_teacher_reflection_prompt?: string | null
          book_title?: string | null
          class_id?: string
          created_at?: string
          created_by?: string | null
          day_of_week?: string
          end_time?: string | null
          id?: string
          internal_resource_id?: string | null
          key_words?: Json
          page_from?: string | null
          page_to?: string | null
          resource_source_type?: string
          session_date?: string
          skill_focus?: string
          start_time?: string | null
          subject?: string
          teacher_note?: string | null
          teacher_review_status?: string
          timetable_slot_id?: string | null
          updated_at?: string
          updated_by?: string | null
          week_plan_id?: string
          weekly_teaching_subject_id?: string | null
          worksheet_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_teaching_sessions_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_teaching_sessions_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_week_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_teaching_sessions_weekly_teaching_subject_id_fkey"
            columns: ["weekly_teaching_subject_id"]
            isOneToOne: false
            referencedRelation: "weekly_teaching_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_teaching_subjects: {
        Row: {
          class_id: string | null
          created_at: string
          created_by: string | null
          id: string
          key_words: Json
          learning_goals: Json
          notes: string | null
          resources: Json
          subject: string
          updated_at: string
          updated_by: string | null
          week_plan_id: string
          what_teaching: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key_words?: Json
          learning_goals?: Json
          notes?: string | null
          resources?: Json
          subject: string
          updated_at?: string
          updated_by?: string | null
          week_plan_id: string
          what_teaching?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          key_words?: Json
          learning_goals?: Json
          notes?: string | null
          resources?: Json
          subject?: string
          updated_at?: string
          updated_by?: string | null
          week_plan_id?: string
          what_teaching?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_teaching_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_teaching_subjects_week_plan_id_fkey"
            columns: ["week_plan_id"]
            isOneToOne: false
            referencedRelation: "curriculum_week_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      worksheets: {
        Row: {
          age_groups: string[] | null
          author: string | null
          branch_id: string | null
          content_text: string | null
          created_at: string | null
          description: string | null
          domains: string[] | null
          embedding: string | null
          id: string
          is_ai_reference: boolean
          language: string
          learning_areas: string[] | null
          metadata_tags: string[] | null
          pdf_url: string
          resource_type: string
          source_url: string | null
          subject: string
          title: string
          updated_at: string | null
        }
        Insert: {
          age_groups?: string[] | null
          author?: string | null
          branch_id?: string | null
          content_text?: string | null
          created_at?: string | null
          description?: string | null
          domains?: string[] | null
          embedding?: string | null
          id?: string
          is_ai_reference?: boolean
          language?: string
          learning_areas?: string[] | null
          metadata_tags?: string[] | null
          pdf_url: string
          resource_type?: string
          source_url?: string | null
          subject: string
          title: string
          updated_at?: string | null
        }
        Update: {
          age_groups?: string[] | null
          author?: string | null
          branch_id?: string | null
          content_text?: string | null
          created_at?: string | null
          description?: string | null
          domains?: string[] | null
          embedding?: string | null
          id?: string
          is_ai_reference?: boolean
          language?: string
          learning_areas?: string[] | null
          metadata_tags?: string[] | null
          pdf_url?: string
          resource_type?: string
          source_url?: string | null
          subject?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "worksheets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      yearly_outcomes: {
        Row: {
          age_group_id: string
          created_at: string
          domain_id: string
          id: string
          mastery_expectation: string | null
          outcome_code: string
          outcome_description: string | null
          outcome_title: string
          smart_achievable: string | null
          smart_measurable: string | null
          smart_relevant: string | null
          smart_score: number | null
          smart_specific: string | null
          smart_timebound: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          age_group_id: string
          created_at?: string
          domain_id: string
          id?: string
          mastery_expectation?: string | null
          outcome_code: string
          outcome_description?: string | null
          outcome_title: string
          smart_achievable?: string | null
          smart_measurable?: string | null
          smart_relevant?: string | null
          smart_score?: number | null
          smart_specific?: string | null
          smart_timebound?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          age_group_id?: string
          created_at?: string
          domain_id?: string
          id?: string
          mastery_expectation?: string | null
          outcome_code?: string
          outcome_description?: string | null
          outcome_title?: string
          smart_achievable?: string | null
          smart_measurable?: string | null
          smart_relevant?: string | null
          smart_score?: number | null
          smart_specific?: string | null
          smart_timebound?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "yearly_outcomes_age_group_id_fkey"
            columns: ["age_group_id"]
            isOneToOne: false
            referencedRelation: "age_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yearly_outcomes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yearly_outcomes_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
        ]
      }
      yearly_themes: {
        Row: {
          academic_year_id: string
          age_group: number | null
          created_at: string | null
          development_focus: Json | null
          end_date: string
          family_connection: Json | null
          id: string
          key_questions: Json | null
          key_vocabulary: Json | null
          main_theme: string
          month_number: number | null
          observation_focus: Json | null
          rationale: string | null
          sort_order: number | null
          start_date: string
          sub_theme: string | null
          term_number: number | null
          theme_bank_id: string | null
          updated_at: string | null
          week_number: number
          weekly_focus: string | null
        }
        Insert: {
          academic_year_id: string
          age_group?: number | null
          created_at?: string | null
          development_focus?: Json | null
          end_date: string
          family_connection?: Json | null
          id?: string
          key_questions?: Json | null
          key_vocabulary?: Json | null
          main_theme: string
          month_number?: number | null
          observation_focus?: Json | null
          rationale?: string | null
          sort_order?: number | null
          start_date: string
          sub_theme?: string | null
          term_number?: number | null
          theme_bank_id?: string | null
          updated_at?: string | null
          week_number: number
          weekly_focus?: string | null
        }
        Update: {
          academic_year_id?: string
          age_group?: number | null
          created_at?: string | null
          development_focus?: Json | null
          end_date?: string
          family_connection?: Json | null
          id?: string
          key_questions?: Json | null
          key_vocabulary?: Json | null
          main_theme?: string
          month_number?: number | null
          observation_focus?: Json | null
          rationale?: string | null
          sort_order?: number | null
          start_date?: string
          sub_theme?: string | null
          term_number?: number | null
          theme_bank_id?: string | null
          updated_at?: string | null
          week_number?: number
          weekly_focus?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "yearly_themes_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yearly_themes_theme_bank_id_fkey"
            columns: ["theme_bank_id"]
            isOneToOne: false
            referencedRelation: "theme_bank"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_child_progress_domain_rollup: {
        Row: {
          average_status_score: number | null
          developing_count: number | null
          domain_code: string | null
          domain_id: string | null
          domain_name: string | null
          emerging_count: number | null
          evidence_count: number | null
          last_observed_at: string | null
          not_yet_count: number | null
          observed_skill_count: number | null
          secure_count: number | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "child_skill_progress_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "development_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_skill_progress_domain_id_fkey"
            columns: ["domain_id"]
            isOneToOne: false
            referencedRelation: "v_student_domain_rollup"
            referencedColumns: ["domain_id"]
          },
          {
            foreignKeyName: "child_skill_progress_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      v_school_calendar: {
        Row: {
          academic_year_id: string | null
          affects_attendance: boolean | null
          branch_id: string | null
          end_date: string | null
          event_kind: Database["public"]["Enums"]["calendar_event_kind"] | null
          is_paid: boolean | null
          name: string | null
          school_closed: boolean | null
          source_id: string | null
          source_table: string | null
          start_date: string | null
        }
        Relationships: []
      }
      v_student_domain_rollup: {
        Row: {
          avg_prof_90d: number | null
          domain_code: string | null
          domain_id: string | null
          domain_name: string | null
          last_observed_at: string | null
          obs_30d: number | null
          obs_60d: number | null
          obs_90d: number | null
          student_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_observations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_custom_leave_balances: {
        Args: {
          _branch_id: string
          _total: number
          _type_id: string
          _user_ids: string[]
          _year: number
        }
        Returns: number
      }
      calc_cost_per_student: {
        Args: { _branch_id: string; _month: number; _year: number }
        Returns: number
      }
      calc_royalty_due: {
        Args: { _branch_id: string; _month: number; _year: number }
        Returns: number
      }
      can_manage_route: {
        Args: { _route: string; _user_id: string }
        Returns: boolean
      }
      can_parent_access_app: { Args: { _user_id: string }; Returns: boolean }
      can_parent_view_learning_activity: {
        Args: { _activity_id: string; _parent_id: string }
        Returns: boolean
      }
      can_parent_view_learning_activity_student: {
        Args: { _activity_id: string; _parent_id: string; _student_id: string }
        Returns: boolean
      }
      can_parent_view_learning_album: {
        Args: { _album_id: string; _parent_id: string }
        Returns: boolean
      }
      can_staff_modify_observation: {
        Args: { _obs_id: string; _user_id: string }
        Returns: boolean
      }
      can_user_view_child_update: {
        Args: { _update_id: string; _user_id: string }
        Returns: boolean
      }
      can_user_view_observation: {
        Args: { _obs_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_profile: {
        Args: { _target: string; _viewer: string }
        Returns: boolean
      }
      compute_payroll_month:
        | {
            Args: { _ot_date: string; _submitted_at: string }
            Returns: {
              is_allowed: boolean
              is_late: boolean
              payroll_month: string
            }[]
          }
        | {
            Args: {
              _branch_id?: string
              _ot_date: string
              _submitted_at: string
            }
            Returns: {
              is_allowed: boolean
              is_late: boolean
              payroll_month: string
            }[]
          }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      dispatch_transactional_email: {
        Args: {
          _category?: string
          _idempotency_key: string
          _recipient_email: string
          _template_data: Json
          _template_name: string
          _user_id?: string
        }
        Returns: undefined
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      generate_credit_note_number: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      get_approval_settings: {
        Args: { _branch_id: string }
        Returns: {
          auto_cc_depth: number
          auto_cc_reporting_chain: boolean
          branch_id: string | null
          claims_l2_enabled: boolean
          claims_l2_threshold: number
          created_at: string
          delegate_on_leave: boolean
          id: string
          leave_l2_enabled: boolean
          ot_l2_enabled: boolean
          payroll_l2_enabled: boolean
          sla_claim_hours: number
          sla_leave_hours: number
          sla_ot_hours: number
          sla_payroll_hours: number
          updated_at: string
          use_reports_to: boolean
        }
        SetofOptions: {
          from: "*"
          to: "approval_settings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_branch_approver_ids: {
        Args: { _branch_id: string }
        Returns: string[]
      }
      get_conversation_branch: {
        Args: { _conversation_id: string }
        Returns: string
      }
      get_conversation_parent: {
        Args: { _conversation_id: string }
        Returns: string
      }
      get_eform_by_token: {
        Args: { p_token: string }
        Returns: {
          branch_id: string
          created_at: string
          created_by: string
          default_fields: Json | null
          description: string | null
          form_type: string
          id: string
          is_active: boolean
          name: string
          share_token: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "eforms"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_or_create_system_account: {
        Args: {
          _branch_id: string
          _code: string
          _name: string
          _type: string
        }
        Returns: string
      }
      get_teacher_class_ids: {
        Args: { _branch_id: string; _user_id: string }
        Returns: string[]
      }
      get_user_allowed_routes: { Args: { _user_id: string }; Returns: string[] }
      get_user_managed_routes: { Args: { _user_id: string }; Returns: string[] }
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_branch_manager: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      is_conversation_participant: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      is_member_of_branch: {
        Args: { _branch_id: string; _user_id: string }
        Returns: boolean
      }
      is_student_in_user_branch: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_teacher_blocked_from_class: {
        Args: { _branch_id: string; _class_id: string; _user_id: string }
        Returns: boolean
      }
      is_teacher_blocked_from_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      match_worksheets: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          id: string
          metadata_tags: string[]
          pdf_url: string
          similarity: number
          subject: string
          title: string
        }[]
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      notify_approval_pending_email:
        | {
            Args: {
              _branch_id: string
              _company_name: string
              _details: Json
              _exclude_user_id: string
              _idem_prefix: string
              _ref_id: string
              _request_type: string
              _requester_name: string
              _summary: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _branch_id: string
              _company_name: string
              _details: Json
              _exclude_user_id: string
              _idem_prefix: string
              _inbox_url?: string
              _ref_id: string
              _request_type: string
              _requester_name: string
              _summary: string
            }
            Returns: undefined
          }
      notify_approvers: {
        Args: {
          _action_url?: string
          _branch_id: string
          _exclude_user_id: string
          _group_key?: string
          _message: string
          _priority?: string
          _reference_id?: string
          _title: string
          _type: string
        }
        Returns: undefined
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_child_skill_progress:
        | {
            Args: {
              p_domain_id: string
              p_indicator_id: string
              p_indicator_label: string
              p_proficiency_level: string
              p_skill_id: string
              p_student_id: string
              p_update_id: string
            }
            Returns: string
          }
        | {
            Args: {
              p_curriculum_indicator_id?: string
              p_curriculum_objective_id?: string
              p_domain_id: string
              p_indicator_id: string
              p_indicator_label: string
              p_proficiency_level: string
              p_skill_id: string
              p_student_id: string
              p_update_id: string
            }
            Returns: string
          }
      resolve_approvers: {
        Args: { _user_id: string; _workflow: string }
        Returns: {
          l1_approver: string
          l2_approver: string
          notify_decision: string[]
          notify_submit: string[]
        }[]
      }
      search_resources_for_ai: {
        Args: {
          p_age_groups?: string[]
          p_branch_id: string
          p_match_count?: number
          p_resource_types: string[]
          p_search_tags?: string[]
        }
        Returns: {
          age_groups: string[]
          author: string
          content_text: string
          id: string
          metadata_tags: string[]
          pdf_url: string
          relevance: number
          resource_type: string
          source_url: string
          subject: string
          title: string
        }[]
      }
      search_worksheets_by_tags: {
        Args: { match_count?: number; search_tags: string[] }
        Returns: {
          id: string
          metadata_tags: string[]
          pdf_url: string
          relevance: number
          subject: string
          title: string
        }[]
      }
      send_missed_chat_reminders: { Args: never; Returns: undefined }
      send_moments_digest: { Args: never; Returns: undefined }
      send_payment_reminders: { Args: never; Returns: undefined }
      submit_eform: {
        Args: {
          p_child_level: string
          p_child_name: string
          p_recipient_email: string
          p_recipient_name: string
          p_recipient_phone: string
          p_share_token: string
          p_submitted_data: Json
        }
        Returns: string
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "franchisee"
        | "teacher"
        | "parent"
        | "admin"
        | "staff"
      approval_action_type:
        | "payment_reversal"
        | "refund"
        | "discount_override"
        | "write_off"
        | "invoice_cancellation"
        | "backdated_payment"
        | "manual_wallet_adjustment"
        | "due_date_override"
      approval_request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "escalated"
        | "cancelled"
      attendance_status: "present" | "absent" | "late" | "excused"
      audit_question_category:
        | "health_safety"
        | "teacher_quality"
        | "curriculum_standards"
        | "facility"
        | "general"
      calendar_event_kind:
        | "public_holiday"
        | "term_break"
        | "replacement_holiday"
        | "staff_training"
        | "school_activity"
        | "ptm_day"
        | "assessment_window"
        | "normal"
      curriculum_level: "skill" | "standard" | "sub_standard"
      leave_status: "pending" | "approved" | "rejected" | "cancelled"
      leave_type:
        | "annual"
        | "medical"
        | "maternity"
        | "paternity"
        | "unpaid"
        | "emergency"
        | "compassionate"
        | "replacement"
        | "hospitalisation"
        | "custom"
      next_focus_source:
        | "ai_growth_summary"
        | "weekly_plan"
        | "assessment"
        | "teacher_manual"
        | "principal_manual"
      next_focus_status:
        | "suggested"
        | "teacher_reviewed"
        | "approved"
        | "archived"
      proficiency_level: "TP1" | "TP2" | "TP3"
      student_enrollment_status:
        | "active"
        | "on_hold"
        | "withdrawn"
        | "graduated"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "franchisee",
        "teacher",
        "parent",
        "admin",
        "staff",
      ],
      approval_action_type: [
        "payment_reversal",
        "refund",
        "discount_override",
        "write_off",
        "invoice_cancellation",
        "backdated_payment",
        "manual_wallet_adjustment",
        "due_date_override",
      ],
      approval_request_status: [
        "pending",
        "approved",
        "rejected",
        "escalated",
        "cancelled",
      ],
      attendance_status: ["present", "absent", "late", "excused"],
      audit_question_category: [
        "health_safety",
        "teacher_quality",
        "curriculum_standards",
        "facility",
        "general",
      ],
      calendar_event_kind: [
        "public_holiday",
        "term_break",
        "replacement_holiday",
        "staff_training",
        "school_activity",
        "ptm_day",
        "assessment_window",
        "normal",
      ],
      curriculum_level: ["skill", "standard", "sub_standard"],
      leave_status: ["pending", "approved", "rejected", "cancelled"],
      leave_type: [
        "annual",
        "medical",
        "maternity",
        "paternity",
        "unpaid",
        "emergency",
        "compassionate",
        "replacement",
        "hospitalisation",
        "custom",
      ],
      next_focus_source: [
        "ai_growth_summary",
        "weekly_plan",
        "assessment",
        "teacher_manual",
        "principal_manual",
      ],
      next_focus_status: [
        "suggested",
        "teacher_reviewed",
        "approved",
        "archived",
      ],
      proficiency_level: ["TP1", "TP2", "TP3"],
      student_enrollment_status: [
        "active",
        "on_hold",
        "withdrawn",
        "graduated",
      ],
    },
  },
} as const
