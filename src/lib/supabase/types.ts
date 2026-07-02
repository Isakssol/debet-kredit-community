export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          active: boolean
          blocked: boolean
          class: number | null
          default_vat_rate: number | null
          description: string | null
          name: string
          ne_field: string | null
          number: number
          sru_code: number | null
          vat_code: string | null
        }
        Insert: {
          active?: boolean
          blocked?: boolean
          class?: number | null
          default_vat_rate?: number | null
          description?: string | null
          name: string
          ne_field?: string | null
          number: number
          sru_code?: number | null
          vat_code?: string | null
        }
        Update: {
          active?: boolean
          blocked?: boolean
          class?: number | null
          default_vat_rate?: number | null
          description?: string | null
          name?: string
          ne_field?: string | null
          number?: number
          sru_code?: number | null
          vat_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_vat_code_fkey"
            columns: ["vat_code"]
            isOneToOne: false
            referencedRelation: "vat_codes"
            referencedColumns: ["code"]
          },
        ]
      }
      articles: {
        Row: {
          active: boolean
          article_no: string
          created_at: string
          id: string
          name: string
          price: number
          sales_account: number
          type: string
          unit: string
          vat_rate: number
        }
        Insert: {
          active?: boolean
          article_no: string
          created_at?: string
          id?: string
          name: string
          price?: number
          sales_account: number
          type?: string
          unit?: string
          vat_rate?: number
        }
        Update: {
          active?: boolean
          article_no?: string
          created_at?: string
          id?: string
          name?: string
          price?: number
          sales_account?: number
          type?: string
          unit?: string
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "articles_sales_account_fkey"
            columns: ["sales_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
        ]
      }
      asset_depreciations: {
        Row: {
          amount: number
          asset_id: string
          fiscal_year_id: string
          id: string
          method: string
          verification_id: string | null
        }
        Insert: {
          amount: number
          asset_id: string
          fiscal_year_id: string
          id?: string
          method: string
          verification_id?: string | null
        }
        Update: {
          amount?: number
          asset_id?: string
          fiscal_year_id?: string
          id?: string
          method?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "asset_depreciations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciations_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_depreciations_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "asset_depreciations_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          acc_depreciation: number
          account: number
          contra_account: number
          created_at: string
          depreciation_account: number
          disposal_amount: number | null
          disposal_date: string | null
          id: string
          name: string
          notes: string | null
          purchase_date: string
          purchase_value: number
          status: string
          useful_life_years: number
          verification_id: string | null
        }
        Insert: {
          acc_depreciation?: number
          account: number
          contra_account: number
          created_at?: string
          depreciation_account: number
          disposal_amount?: number | null
          disposal_date?: string | null
          id?: string
          name: string
          notes?: string | null
          purchase_date: string
          purchase_value: number
          status?: string
          useful_life_years?: number
          verification_id?: string | null
        }
        Update: {
          acc_depreciation?: number
          account?: number
          contra_account?: number
          created_at?: string
          depreciation_account?: number
          disposal_amount?: number | null
          disposal_date?: string | null
          id?: string
          name?: string
          notes?: string | null
          purchase_date?: string
          purchase_value?: number
          status?: string
          useful_life_years?: number
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "assets_contra_account_fkey"
            columns: ["contra_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "assets_depreciation_account_fkey"
            columns: ["depreciation_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "assets_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "assets_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          file_name: string
          id: string
          mime_type: string | null
          storage_path: string
          uploaded_at: string
          verification_id: string | null
        }
        Insert: {
          file_name: string
          id?: string
          mime_type?: string | null
          storage_path: string
          uploaded_at?: string
          verification_id?: string | null
        }
        Update: {
          file_name?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_at?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "attachments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          account_iban: string | null
          account_id: string | null
          consent_expires_at: string | null
          created_at: string
          id: string
          institution_id: string | null
          institution_name: string | null
          last_synced_at: string | null
          ledger_account: number
          provider: string
          requisition_id: string | null
          status: string
        }
        Insert: {
          account_iban?: string | null
          account_id?: string | null
          consent_expires_at?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          ledger_account?: number
          provider?: string
          requisition_id?: string | null
          status?: string
        }
        Update: {
          account_iban?: string | null
          account_id?: string | null
          consent_expires_at?: string | null
          created_at?: string
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_synced_at?: string | null
          ledger_account?: number
          provider?: string
          requisition_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_connections_ledger_account_fkey"
            columns: ["ledger_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          booking_date: string
          connection_id: string | null
          counterpart: string | null
          currency: string
          description: string
          external_id: string | null
          id: string
          imported_at: string
          status: string
          verification_id: string | null
        }
        Insert: {
          amount: number
          balance_after?: number | null
          booking_date: string
          connection_id?: string | null
          counterpart?: string | null
          currency?: string
          description: string
          external_id?: string | null
          id?: string
          imported_at?: string
          status?: string
          verification_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number | null
          booking_date?: string
          connection_id?: string | null
          counterpart?: string | null
          currency?: string
          description?: string
          external_id?: string | null
          id?: string
          imported_at?: string
          status?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bank_transactions_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "bank_transactions_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          address: string | null
          city: string | null
          country: string
          created_at: string
          currency: string
          customer_no: number
          delivery_address: string | null
          email: string | null
          id: string
          language: string
          name: string
          notes: string | null
          org_number: string | null
          our_reference: string | null
          payment_terms: number | null
          phone: string | null
          postal_code: string | null
          vat_number: string | null
          vat_type: string
          your_reference: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          customer_no?: number
          delivery_address?: string | null
          email?: string | null
          id?: string
          language?: string
          name: string
          notes?: string | null
          org_number?: string | null
          our_reference?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          vat_number?: string | null
          vat_type?: string
          your_reference?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          currency?: string
          customer_no?: number
          delivery_address?: string | null
          email?: string | null
          id?: string
          language?: string
          name?: string
          notes?: string | null
          org_number?: string | null
          our_reference?: string | null
          payment_terms?: number | null
          phone?: string | null
          postal_code?: string | null
          vat_number?: string | null
          vat_type?: string
          your_reference?: string | null
        }
        Relationships: []
      }
      fiscal_years: {
        Row: {
          accounting_method: string
          end_date: string
          ib_booked: boolean
          id: string
          start_date: string
          status: string
          year: number
        }
        Insert: {
          accounting_method?: string
          end_date: string
          ib_booked?: boolean
          id?: string
          start_date: string
          status?: string
          year: number
        }
        Update: {
          accounting_method?: string
          end_date?: string
          ib_booked?: boolean
          id?: string
          start_date?: string
          status?: string
          year?: number
        }
        Relationships: []
      }
      invoice_counter: {
        Row: {
          id: number
          next_no: number
        }
        Insert: {
          id?: number
          next_no?: number
        }
        Update: {
          id?: number
          next_no?: number
        }
        Relationships: []
      }
      invoice_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          invoice_id: string
          note: string | null
          payment_date: string
          verification_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          invoice_id: string
          note?: string | null
          payment_date: string
          verification_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          invoice_id?: string
          note?: string | null
          payment_date?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_payments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "invoice_payments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_reminders: {
        Row: {
          fee: number
          id: string
          invoice_id: string
          reminder_no: number
          sent_date: string
        }
        Insert: {
          fee?: number
          id?: string
          invoice_id: string
          reminder_no: number
          sent_date?: string
        }
        Update: {
          fee?: number
          id?: string
          invoice_id?: string
          reminder_no?: number
          sent_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_rows: {
        Row: {
          account: number | null
          article_id: string | null
          description: string
          discount_pct: number
          id: string
          invoice_id: string
          is_text_row: boolean
          quantity: number
          row_no: number
          unit: string
          unit_price: number
          vat_rate: number
        }
        Insert: {
          account?: number | null
          article_id?: string | null
          description?: string
          discount_pct?: number
          id?: string
          invoice_id: string
          is_text_row?: boolean
          quantity?: number
          row_no: number
          unit?: string
          unit_price?: number
          vat_rate?: number
        }
        Update: {
          account?: number | null
          article_id?: string | null
          description?: string
          discount_pct?: number
          id?: string
          invoice_id?: string
          is_text_row?: boolean
          quantity?: number
          row_no?: number
          unit?: string
          unit_price?: number
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_rows_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "invoice_rows_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_rows_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          credits_invoice_id: string | null
          currency: string
          customer_id: string
          customer_snapshot: Json | null
          due_date: string
          id: string
          internal_notes: string | null
          invoice_date: string
          invoice_no: number | null
          language: string
          net_amount: number
          notes: string | null
          ocr: string | null
          our_reference: string | null
          payment_terms: number
          pdf_path: string | null
          rounding: number
          sent_at: string | null
          status: string
          total_amount: number
          type: string
          updated_at: string
          vat_amount: number
          vat_type: string
          verification_id: string | null
          your_reference: string | null
        }
        Insert: {
          created_at?: string
          credits_invoice_id?: string | null
          currency?: string
          customer_id: string
          customer_snapshot?: Json | null
          due_date: string
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_no?: number | null
          language?: string
          net_amount?: number
          notes?: string | null
          ocr?: string | null
          our_reference?: string | null
          payment_terms?: number
          pdf_path?: string | null
          rounding?: number
          sent_at?: string | null
          status?: string
          total_amount?: number
          type?: string
          updated_at?: string
          vat_amount?: number
          vat_type?: string
          verification_id?: string | null
          your_reference?: string | null
        }
        Update: {
          created_at?: string
          credits_invoice_id?: string | null
          currency?: string
          customer_id?: string
          customer_snapshot?: Json | null
          due_date?: string
          id?: string
          internal_notes?: string | null
          invoice_date?: string
          invoice_no?: number | null
          language?: string
          net_amount?: number
          notes?: string | null
          ocr?: string | null
          our_reference?: string | null
          payment_terms?: number
          pdf_path?: string | null
          rounding?: number
          sent_at?: string | null
          status?: string
          total_amount?: number
          type?: string
          updated_at?: string
          vat_amount?: number
          vat_type?: string
          verification_id?: string | null
          your_reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_credits_invoice_id_fkey"
            columns: ["credits_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "invoices_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      period_locks: {
        Row: {
          fiscal_year_id: string
          id: string
          locked_at: string
          month: number
          reason: string
        }
        Insert: {
          fiscal_year_id: string
          id?: string
          locked_at?: string
          month: number
          reason?: string
        }
        Update: {
          fiscal_year_id?: string
          id?: string
          locked_at?: string
          month?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "period_locks_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      posting_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          rows: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          rows: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          rows?: Json
        }
        Relationships: []
      }
      recurring_invoices: {
        Row: {
          active: boolean
          customer_id: string
          end_date: string | null
          id: string
          interval_months: number
          next_date: string
          template: Json
        }
        Insert: {
          active?: boolean
          customer_id: string
          end_date?: string | null
          id?: string
          interval_months?: number
          next_date: string
          template: Json
        }
        Update: {
          active?: boolean
          customer_id?: string
          end_date?: string | null
          id?: string
          interval_months?: number
          next_date?: string
          template?: Json
        }
        Relationships: [
          {
            foreignKeyName: "recurring_invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_values: {
        Row: {
          description: string | null
          id: string
          key: string
          valid_from: string
          valid_to: string | null
          value: number
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          valid_from: string
          valid_to?: string | null
          value: number
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          valid_from?: string
          valid_to?: string | null
          value?: number
        }
        Relationships: []
      }
      settings: {
        Row: {
          address: string | null
          bankgiro: string | null
          bic: string | null
          city: string | null
          company_name: string
          default_accounting_method: string
          default_payment_terms: number
          email: string | null
          eu_trade: boolean
          iban: string | null
          id: number
          late_interest_rate: number | null
          logo_path: string | null
          municipal_tax_rate: number
          onboarded_at: string | null
          org_number: string | null
          phone: string | null
          plusgiro: string | null
          postal_code: string | null
          reminder_fee: number
          updated_at: string
          vat_number: string | null
          vat_period: string
        }
        Insert: {
          address?: string | null
          bankgiro?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          default_accounting_method?: string
          default_payment_terms?: number
          email?: string | null
          eu_trade?: boolean
          iban?: string | null
          id?: number
          late_interest_rate?: number | null
          logo_path?: string | null
          municipal_tax_rate?: number
          onboarded_at?: string | null
          org_number?: string | null
          phone?: string | null
          plusgiro?: string | null
          postal_code?: string | null
          reminder_fee?: number
          updated_at?: string
          vat_number?: string | null
          vat_period?: string
        }
        Update: {
          address?: string | null
          bankgiro?: string | null
          bic?: string | null
          city?: string | null
          company_name?: string
          default_accounting_method?: string
          default_payment_terms?: number
          email?: string | null
          eu_trade?: boolean
          iban?: string | null
          id?: number
          late_interest_rate?: number | null
          logo_path?: string | null
          municipal_tax_rate?: number
          onboarded_at?: string | null
          org_number?: string | null
          phone?: string | null
          plusgiro?: string | null
          postal_code?: string | null
          reminder_fee?: number
          updated_at?: string
          vat_number?: string | null
          vat_period?: string
        }
        Relationships: []
      }
      supplier_invoices: {
        Row: {
          attachment_path: string | null
          created_at: string
          due_date: string
          expense_account: number | null
          id: string
          invoice_date: string
          invoice_no: string | null
          notes: string | null
          ocr: string | null
          status: string
          supplier_id: string
          total_amount: number
          vat_amount: number
          vat_rate: number
          verification_id: string | null
        }
        Insert: {
          attachment_path?: string | null
          created_at?: string
          due_date: string
          expense_account?: number | null
          id?: string
          invoice_date: string
          invoice_no?: string | null
          notes?: string | null
          ocr?: string | null
          status?: string
          supplier_id: string
          total_amount: number
          vat_amount?: number
          vat_rate?: number
          verification_id?: string | null
        }
        Update: {
          attachment_path?: string | null
          created_at?: string
          due_date?: string
          expense_account?: number | null
          id?: string
          invoice_date?: string
          invoice_no?: string | null
          notes?: string | null
          ocr?: string | null
          status?: string
          supplier_id?: string
          total_amount?: number
          vat_amount?: number
          vat_rate?: number
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_invoices_expense_account_fkey"
            columns: ["expense_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "supplier_invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_invoices_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "supplier_invoices_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_date: string
          supplier_invoice_id: string
          verification_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_date: string
          supplier_invoice_id: string
          verification_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_date?: string
          supplier_invoice_id?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_supplier_invoice_id_fkey"
            columns: ["supplier_invoice_id"]
            isOneToOne: false
            referencedRelation: "supplier_invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "supplier_payments_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          bankgiro: string | null
          created_at: string
          default_expense_account: number | null
          id: string
          name: string
          notes: string | null
          org_number: string | null
          payment_terms: number
          plusgiro: string | null
        }
        Insert: {
          active?: boolean
          bankgiro?: string | null
          created_at?: string
          default_expense_account?: number | null
          id?: string
          name: string
          notes?: string | null
          org_number?: string | null
          payment_terms?: number
          plusgiro?: string | null
        }
        Update: {
          active?: boolean
          bankgiro?: string | null
          created_at?: string
          default_expense_account?: number | null
          id?: string
          name?: string
          notes?: string | null
          org_number?: string | null
          payment_terms?: number
          plusgiro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_default_expense_account_fkey"
            columns: ["default_expense_account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
        ]
      }
      tax_allocation_reserves: {
        Row: {
          amount: number
          id: string
          reversed_amount: number
          tax_year: number
        }
        Insert: {
          amount: number
          id?: string
          reversed_amount?: number
          tax_year: number
        }
        Update: {
          amount?: number
          id?: string
          reversed_amount?: number
          tax_year?: number
        }
        Relationships: []
      }
      tax_carryforwards: {
        Row: {
          amount: number
          id: string
          key: string
          tax_year: number
        }
        Insert: {
          amount: number
          id?: string
          key: string
          tax_year: number
        }
        Update: {
          amount?: number
          id?: string
          key?: string
          tax_year?: number
        }
        Relationships: []
      }
      tax_deadlines: {
        Row: {
          auto_generated: boolean
          due_date: string
          id: string
          period_end: string | null
          period_start: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          auto_generated?: boolean
          due_date: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          title: string
          type: string
        }
        Update: {
          auto_generated?: boolean
          due_date?: string
          id?: string
          period_end?: string | null
          period_start?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          created_at: string
          from_location: string
          id: string
          km: number
          purpose: string
          to_location: string
          trip_date: string
          verification_id: string | null
        }
        Insert: {
          created_at?: string
          from_location: string
          id?: string
          km: number
          purpose: string
          to_location: string
          trip_date: string
          verification_id?: string | null
        }
        Update: {
          created_at?: string
          from_location?: string
          id?: string
          km?: number
          purpose?: string
          to_location?: string
          trip_date?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "trips_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      vat_codes: {
        Row: {
          boxes: Json
          code: string
          description: string
        }
        Insert: {
          boxes?: Json
          code: string
          description: string
        }
        Update: {
          boxes?: Json
          code?: string
          description?: string
        }
        Relationships: []
      }
      vat_rates: {
        Row: {
          id: string
          rate: number
          rate_type: string
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          id?: string
          rate: number
          rate_type: string
          valid_from: string
          valid_to?: string | null
        }
        Update: {
          id?: string
          rate?: number
          rate_type?: string
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: []
      }
      vat_reports: {
        Row: {
          approved_at: string | null
          boxes: Json
          created_at: string
          eskd_xml: string | null
          fiscal_year_id: string
          id: string
          period_end: string
          period_start: string
          status: string
          verification_id: string | null
        }
        Insert: {
          approved_at?: string | null
          boxes?: Json
          created_at?: string
          eskd_xml?: string | null
          fiscal_year_id: string
          id?: string
          period_end: string
          period_start: string
          status?: string
          verification_id?: string | null
        }
        Update: {
          approved_at?: string | null
          boxes?: Json
          created_at?: string
          eskd_xml?: string | null
          fiscal_year_id?: string
          id?: string
          period_end?: string
          period_start?: string
          status?: string
          verification_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vat_reports_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vat_reports_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "vat_reports_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_rows: {
        Row: {
          account: number
          credit: number
          debit: number
          id: string
          note: string | null
          row_no: number
          verification_id: string
        }
        Insert: {
          account: number
          credit?: number
          debit?: number
          id?: string
          note?: string | null
          row_no: number
          verification_id: string
        }
        Update: {
          account?: number
          credit?: number
          debit?: number
          id?: string
          note?: string | null
          row_no?: number
          verification_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "verification_rows_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "verification_rows_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "verification_rows_verification_id_fkey"
            columns: ["verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
      verification_series: {
        Row: {
          code: string
          fiscal_year_id: string
          id: string
          manual_entry: boolean
          name: string
          next_number: number
        }
        Insert: {
          code: string
          fiscal_year_id: string
          id?: string
          manual_entry?: boolean
          name: string
          next_number?: number
        }
        Update: {
          code?: string
          fiscal_year_id?: string
          id?: string
          manual_entry?: boolean
          name?: string
          next_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "verification_series_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      verifications: {
        Row: {
          corrected_by_id: string | null
          corrects_id: string | null
          counterparty: string | null
          description: string
          fiscal_year_id: string
          id: string
          number: number
          registered_at: string
          series_id: string
          source: string
          verification_date: string
        }
        Insert: {
          corrected_by_id?: string | null
          corrects_id?: string | null
          counterparty?: string | null
          description: string
          fiscal_year_id: string
          id?: string
          number: number
          registered_at?: string
          series_id: string
          source?: string
          verification_date: string
        }
        Update: {
          corrected_by_id?: string | null
          corrects_id?: string | null
          counterparty?: string | null
          description?: string
          fiscal_year_id?: string
          id?: string
          number?: number
          registered_at?: string
          series_id?: string
          source?: string
          verification_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "verifications_corrected_by_id_fkey"
            columns: ["corrected_by_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "verifications_corrected_by_id_fkey"
            columns: ["corrected_by_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "verifications_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "verifications_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "verification_series"
            referencedColumns: ["id"]
          },
        ]
      }
      year_end_closings: {
        Row: {
          checklist: Json
          completed_at: string | null
          equity_verification_id: string | null
          fiscal_year_id: string
          id: string
          k1_data: Json | null
          ne_data: Json | null
          result_verification_id: string | null
          status: string
        }
        Insert: {
          checklist?: Json
          completed_at?: string | null
          equity_verification_id?: string | null
          fiscal_year_id: string
          id?: string
          k1_data?: Json | null
          ne_data?: Json | null
          result_verification_id?: string | null
          status?: string
        }
        Update: {
          checklist?: Json
          completed_at?: string | null
          equity_verification_id?: string | null
          fiscal_year_id?: string
          id?: string
          k1_data?: Json | null
          ne_data?: Json | null
          result_verification_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "year_end_closings_equity_verification_id_fkey"
            columns: ["equity_verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "year_end_closings_equity_verification_id_fkey"
            columns: ["equity_verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_end_closings_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: true
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "year_end_closings_result_verification_id_fkey"
            columns: ["result_verification_id"]
            isOneToOne: false
            referencedRelation: "ledger_entries"
            referencedColumns: ["verification_id"]
          },
          {
            foreignKeyName: "year_end_closings_result_verification_id_fkey"
            columns: ["result_verification_id"]
            isOneToOne: false
            referencedRelation: "verifications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      account_balances: {
        Row: {
          account: number | null
          account_name: string | null
          balance: number | null
          class: number | null
          fiscal_year_id: string | null
          total_credit: number | null
          total_debit: number | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_rows_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "verifications_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
      ledger_entries: {
        Row: {
          account: number | null
          account_name: string | null
          credit: number | null
          debit: number | null
          description: string | null
          fiscal_year_id: string | null
          id: string | null
          note: string | null
          verification_date: string | null
          verification_id: string | null
          verification_label: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_rows_account_fkey"
            columns: ["account"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["number"]
          },
          {
            foreignKeyName: "verifications_fiscal_year_id_fkey"
            columns: ["fiscal_year_id"]
            isOneToOne: false
            referencedRelation: "fiscal_years"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      assign_invoice_no: { Args: never; Returns: number }
      book_verification: {
        Args: {
          p_corrects?: string
          p_counterparty?: string
          p_date: string
          p_description: string
          p_rows: Json
          p_series_code: string
          p_source?: string
        }
        Returns: {
          out_id: string
          out_number: number
          out_series: string
        }[]
      }
      correct_verification: {
        Args: {
          p_new_date: string
          p_new_description: string
          p_new_rows: Json
          p_original: string
          p_reason: string
        }
        Returns: {
          replacement_id: string
          reversal_id: string
        }[]
      }
      is_period_locked: { Args: { p_date: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

