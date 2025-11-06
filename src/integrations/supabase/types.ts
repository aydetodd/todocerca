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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          icon: string | null
          id: string
          is_product: boolean
          name: string
          parent_id: string | null
        }
        Insert: {
          created_at?: string
          icon?: string | null
          id?: string
          is_product?: boolean
          name: string
          parent_id?: string | null
        }
        Update: {
          created_at?: string
          icon?: string | null
          id?: string
          is_product?: boolean
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      chats: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          receiver_id: string
          sender_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chats_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          codigo_postal: string | null
          created_at: string
          email: string
          id: string
          nombre: string
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string
          email: string
          id?: string
          nombre: string
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string
          email?: string
          id?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fotos_productos: {
        Row: {
          alt_text: string | null
          created_at: string
          es_principal: boolean
          file_size: number | null
          id: string
          mime_type: string | null
          nombre_archivo: string
          producto_id: string
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          es_principal?: boolean
          file_size?: number | null
          id?: string
          mime_type?: string | null
          nombre_archivo: string
          producto_id: string
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          es_principal?: boolean
          file_size?: number | null
          id?: string
          mime_type?: string | null
          nombre_archivo?: string
          producto_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_productos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      items_pedido: {
        Row: {
          cantidad: number
          created_at: string
          id: string
          pedido_id: string
          person_index: number
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Insert: {
          cantidad: number
          created_at?: string
          id?: string
          pedido_id: string
          person_index?: number
          precio_unitario: number
          producto_id: string
          subtotal: number
        }
        Update: {
          cantidad?: number
          created_at?: string
          id?: string
          pedido_id?: string
          person_index?: number
          precio_unitario?: number
          producto_id?: string
          subtotal?: number
        }
        Relationships: [
          {
            foreignKeyName: "items_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_pedido_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
        ]
      }
      job_postings: {
        Row: {
          created_at: string
          description: string
          id: string
          is_active: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          profile_id: string
          requirements: string | null
          salary_range: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          profile_id: string
          requirements?: string | null
          salary_range?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          profile_id?: string
          requirements?: string | null
          salary_range?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_postings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          is_free: boolean | null
          latitude: number | null
          longitude: number | null
          price: number | null
          profile_id: string
          title: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          price?: number | null
          profile_id: string
          title: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          price?: number | null
          profile_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          created_at: string | null
          id: string
          is_panic: boolean | null
          message: string
          receiver_id: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_panic?: boolean | null
          message: string
          receiver_id?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_panic?: boolean | null
          message?: string
          receiver_id?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      password_recovery_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          phone: string
          used: boolean | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone: string
          used?: boolean | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          phone?: string
          used?: boolean | null
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          cliente_nombre: string
          cliente_telefono: string
          cliente_user_id: string | null
          created_at: string
          entregado: boolean | null
          estado: string
          id: string
          impreso: boolean | null
          notas: string | null
          numero_orden: number
          pagado: boolean | null
          preparado: boolean | null
          proveedor_id: string
          total: number
          updated_at: string
        }
        Insert: {
          cliente_nombre: string
          cliente_telefono: string
          cliente_user_id?: string | null
          created_at?: string
          entregado?: boolean | null
          estado?: string
          id?: string
          impreso?: boolean | null
          notas?: string | null
          numero_orden?: number
          pagado?: boolean | null
          preparado?: boolean | null
          proveedor_id: string
          total?: number
          updated_at?: string
        }
        Update: {
          cliente_nombre?: string
          cliente_telefono?: string
          cliente_user_id?: string | null
          created_at?: string
          entregado?: boolean | null
          estado?: string
          id?: string
          impreso?: boolean | null
          notas?: string | null
          numero_orden?: number
          pagado?: boolean | null
          preparado?: boolean | null
          proveedor_id?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      productos: {
        Row: {
          category_id: string | null
          created_at: string
          descripcion: string | null
          id: string
          is_available: boolean | null
          keywords: string | null
          nombre: string
          precio: number
          proveedor_id: string
          stock: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          is_available?: boolean | null
          keywords?: string | null
          nombre: string
          precio: number
          proveedor_id: string
          stock?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          descripcion?: string | null
          id?: string
          is_available?: boolean | null
          keywords?: string | null
          nombre?: string
          precio?: number
          proveedor_id?: string
          stock?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "productos_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "productos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apodo: string | null
          codigo_postal: string | null
          consecutive_number: number
          created_at: string
          email: string | null
          estado: Database["public"]["Enums"]["user_status"] | null
          id: string
          nombre: string
          phone: string | null
          postal_code: string | null
          role: Database["public"]["Enums"]["user_role"]
          telefono: string | null
          updated_at: string
          user_id: string
          user_type: Database["public"]["Enums"]["user_type"] | null
          verification_code: string | null
          verified: boolean | null
        }
        Insert: {
          apodo?: string | null
          codigo_postal?: string | null
          consecutive_number?: number
          created_at?: string
          email?: string | null
          estado?: Database["public"]["Enums"]["user_status"] | null
          id?: string
          nombre: string
          phone?: string | null
          postal_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          telefono?: string | null
          updated_at?: string
          user_id: string
          user_type?: Database["public"]["Enums"]["user_type"] | null
          verification_code?: string | null
          verified?: boolean | null
        }
        Update: {
          apodo?: string | null
          codigo_postal?: string | null
          consecutive_number?: number
          created_at?: string
          email?: string | null
          estado?: Database["public"]["Enums"]["user_status"] | null
          id?: string
          nombre?: string
          phone?: string | null
          postal_code?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          telefono?: string | null
          updated_at?: string
          user_id?: string
          user_type?: Database["public"]["Enums"]["user_type"] | null
          verification_code?: string | null
          verified?: boolean | null
        }
        Relationships: []
      }
      proveedor_locations: {
        Row: {
          id: string
          latitude: number
          longitude: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          id?: string
          latitude: number
          longitude: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          id?: string
          latitude?: number
          longitude?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          business_address: string | null
          business_phone: string | null
          codigo_postal: string | null
          created_at: string
          description: string | null
          email: string
          id: string
          latitude: number | null
          longitude: number | null
          nombre: string
          telefono: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          business_address?: string | null
          business_phone?: string | null
          codigo_postal?: string | null
          created_at?: string
          description?: string | null
          email: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nombre: string
          telefono?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          business_address?: string | null
          business_phone?: string | null
          codigo_postal?: string | null
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          nombre?: string
          telefono?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          end_date: string | null
          id: string
          payment_method: string | null
          profile_id: string
          start_date: string | null
          status: Database["public"]["Enums"]["subscription_status"] | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string | null
          end_date?: string | null
          id?: string
          payment_method?: string | null
          profile_id: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          end_date?: string | null
          id?: string
          payment_method?: string | null
          profile_id?: string
          start_date?: string | null
          status?: Database["public"]["Enums"]["subscription_status"] | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_devices: {
        Row: {
          accepted: boolean | null
          device_name: string | null
          group_id: string
          id: string
          is_active: boolean | null
          last_updated: string | null
          latitude: number | null
          longitude: number | null
          profile_id: string
        }
        Insert: {
          accepted?: boolean | null
          device_name?: string | null
          group_id: string
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          latitude?: number | null
          longitude?: number | null
          profile_id: string
        }
        Update: {
          accepted?: boolean | null
          device_name?: string | null
          group_id?: string
          id?: string
          is_active?: boolean | null
          last_updated?: string | null
          latitude?: number | null
          longitude?: number | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_devices_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracking_devices_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_group_members: {
        Row: {
          group_id: string
          id: string
          is_owner: boolean | null
          joined_at: string
          nickname: string
          phone_number: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          is_owner?: boolean | null
          joined_at?: string
          nickname: string
          phone_number?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          is_owner?: boolean | null
          joined_at?: string
          nickname?: string
          phone_number?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_groups: {
        Row: {
          created_at: string
          id: string
          max_devices: number | null
          name: string
          owner_id: string
          subscription_end: string | null
          subscription_status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          max_devices?: number | null
          name: string
          owner_id: string
          subscription_end?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          max_devices?: number | null
          name?: string
          owner_id?: string
          subscription_end?: string | null
          subscription_status?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tracking_invitations: {
        Row: {
          created_at: string | null
          expires_at: string | null
          group_id: string
          id: string
          invited_by: string
          nickname: string
          phone_number: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          invited_by: string
          nickname: string
          phone_number: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          invited_by?: string
          nickname?: string
          phone_number?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracking_invitations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tracking_member_locations: {
        Row: {
          group_id: string
          id: string
          latitude: number
          longitude: number
          updated_at: string
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          latitude: number
          longitude: number
          updated_at?: string
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          latitude?: number
          longitude?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracking_member_locations_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      find_user_by_phone: {
        Args: { phone_param: string }
        Returns: {
          phone: string
          user_id: string
        }[]
      }
      get_current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      has_valid_tracking_invitation: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_tracking_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      normalize_phone: { Args: { phone: string }; Returns: string }
      reset_order_sequence: {
        Args: { proveedor_id_param: string }
        Returns: undefined
      }
    }
    Enums: {
      availability_status: "disponible" | "ocupado" | "no_disponible"
      subscription_status: "activa" | "vencida" | "pendiente"
      user_role: "admin" | "cliente" | "proveedor"
      user_status: "available" | "busy" | "offline"
      user_type: "cliente" | "proveedor" | "empresa"
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
      availability_status: ["disponible", "ocupado", "no_disponible"],
      subscription_status: ["activa", "vencida", "pendiente"],
      user_role: ["admin", "cliente", "proveedor"],
      user_status: ["available", "busy", "offline"],
      user_type: ["cliente", "proveedor", "empresa"],
    },
  },
} as const
