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
      favoritos: {
        Row: {
          created_at: string
          id: string
          listing_id: string | null
          precio_guardado: number | null
          producto_id: string | null
          proveedor_id: string | null
          stock_guardado: number | null
          tipo: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id?: string | null
          precio_guardado?: number | null
          producto_id?: string | null
          proveedor_id?: string | null
          stock_guardado?: number | null
          tipo: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string | null
          precio_guardado?: number | null
          producto_id?: string | null
          proveedor_id?: string | null
          stock_guardado?: number | null
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favoritos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favoritos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favoritos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      fotos_listings: {
        Row: {
          alt_text: string | null
          created_at: string
          es_principal: boolean
          file_size: number | null
          id: string
          listing_id: string
          mime_type: string | null
          nombre_archivo: string
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          es_principal?: boolean
          file_size?: number | null
          id?: string
          listing_id: string
          mime_type?: string | null
          nombre_archivo: string
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          es_principal?: boolean
          file_size?: number | null
          id?: string
          listing_id?: string
          mime_type?: string | null
          nombre_archivo?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "fotos_listings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
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
      gps_alerts: {
        Row: {
          alert_type: string
          created_at: string
          geofence_id: string | null
          group_id: string
          id: string
          is_read: boolean | null
          is_resolved: boolean | null
          latitude: number | null
          longitude: number | null
          message: string | null
          resolved_at: string | null
          resolved_by: string | null
          speed: number | null
          title: string
          tracker_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          geofence_id?: string | null
          group_id: string
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          latitude?: number | null
          longitude?: number | null
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          speed?: number | null
          title: string
          tracker_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          geofence_id?: string | null
          group_id?: string
          id?: string
          is_read?: boolean | null
          is_resolved?: boolean | null
          latitude?: number | null
          longitude?: number | null
          message?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          speed?: number | null
          title?: string
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_alerts_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "gps_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_alerts_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_alerts_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "gps_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_geofences: {
        Row: {
          alert_on_enter: boolean | null
          alert_on_exit: boolean | null
          center_lat: number | null
          center_lng: number | null
          created_at: string
          description: string | null
          fence_type: string
          group_id: string
          id: string
          is_active: boolean | null
          name: string
          polygon_points: Json | null
          radius_meters: number | null
          updated_at: string
        }
        Insert: {
          alert_on_enter?: boolean | null
          alert_on_exit?: boolean | null
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          description?: string | null
          fence_type?: string
          group_id: string
          id?: string
          is_active?: boolean | null
          name: string
          polygon_points?: Json | null
          radius_meters?: number | null
          updated_at?: string
        }
        Update: {
          alert_on_enter?: boolean | null
          alert_on_exit?: boolean | null
          center_lat?: number | null
          center_lng?: number | null
          created_at?: string
          description?: string | null
          fence_type?: string
          group_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          polygon_points?: Json | null
          radius_meters?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_geofences_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracker_geofences: {
        Row: {
          created_at: string
          geofence_id: string
          id: string
          is_inside: boolean | null
          last_checked_at: string | null
          tracker_id: string
        }
        Insert: {
          created_at?: string
          geofence_id: string
          id?: string
          is_inside?: boolean | null
          last_checked_at?: string | null
          tracker_id: string
        }
        Update: {
          created_at?: string
          geofence_id?: string
          id?: string
          is_inside?: boolean | null
          last_checked_at?: string | null
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracker_geofences_geofence_id_fkey"
            columns: ["geofence_id"]
            isOneToOne: false
            referencedRelation: "gps_geofences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gps_tracker_geofences_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "gps_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracker_history: {
        Row: {
          altitude: number | null
          course: number | null
          created_at: string
          engine_status: boolean | null
          external_voltage: number | null
          fuel_level: number | null
          gsm_signal: number | null
          hdop: number | null
          id: string
          ignition: boolean | null
          latitude: number
          longitude: number
          odometer: number | null
          satellites: number | null
          speed: number | null
          timestamp: string
          tracker_id: string
        }
        Insert: {
          altitude?: number | null
          course?: number | null
          created_at?: string
          engine_status?: boolean | null
          external_voltage?: number | null
          fuel_level?: number | null
          gsm_signal?: number | null
          hdop?: number | null
          id?: string
          ignition?: boolean | null
          latitude: number
          longitude: number
          odometer?: number | null
          satellites?: number | null
          speed?: number | null
          timestamp?: string
          tracker_id: string
        }
        Update: {
          altitude?: number | null
          course?: number | null
          created_at?: string
          engine_status?: boolean | null
          external_voltage?: number | null
          fuel_level?: number | null
          gsm_signal?: number | null
          hdop?: number | null
          id?: string
          ignition?: boolean | null
          latitude?: number
          longitude?: number
          odometer?: number | null
          satellites?: number | null
          speed?: number | null
          timestamp?: string
          tracker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracker_history_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: false
            referencedRelation: "gps_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracker_locations: {
        Row: {
          altitude: number | null
          course: number | null
          external_voltage: number | null
          gsm_signal: number | null
          id: string
          ignition: boolean | null
          latitude: number
          longitude: number
          odometer: number | null
          satellites: number | null
          speed: number | null
          tracker_id: string
          updated_at: string
        }
        Insert: {
          altitude?: number | null
          course?: number | null
          external_voltage?: number | null
          gsm_signal?: number | null
          id?: string
          ignition?: boolean | null
          latitude: number
          longitude: number
          odometer?: number | null
          satellites?: number | null
          speed?: number | null
          tracker_id: string
          updated_at?: string
        }
        Update: {
          altitude?: number | null
          course?: number | null
          external_voltage?: number | null
          gsm_signal?: number | null
          id?: string
          ignition?: boolean | null
          latitude?: number
          longitude?: number
          odometer?: number | null
          satellites?: number | null
          speed?: number | null
          tracker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracker_locations_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: true
            referencedRelation: "gps_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_tracker_settings: {
        Row: {
          battery_alert_enabled: boolean | null
          created_at: string
          engine_kill_enabled: boolean | null
          engine_kill_password: string | null
          id: string
          ignition_alert_enabled: boolean | null
          low_battery_threshold: number | null
          odometer_offset: number | null
          offline_alert_enabled: boolean | null
          offline_threshold_minutes: number | null
          power_cut_alert_enabled: boolean | null
          speed_alert_enabled: boolean | null
          speed_limit_kmh: number | null
          tracker_id: string
          updated_at: string
        }
        Insert: {
          battery_alert_enabled?: boolean | null
          created_at?: string
          engine_kill_enabled?: boolean | null
          engine_kill_password?: string | null
          id?: string
          ignition_alert_enabled?: boolean | null
          low_battery_threshold?: number | null
          odometer_offset?: number | null
          offline_alert_enabled?: boolean | null
          offline_threshold_minutes?: number | null
          power_cut_alert_enabled?: boolean | null
          speed_alert_enabled?: boolean | null
          speed_limit_kmh?: number | null
          tracker_id: string
          updated_at?: string
        }
        Update: {
          battery_alert_enabled?: boolean | null
          created_at?: string
          engine_kill_enabled?: boolean | null
          engine_kill_password?: string | null
          id?: string
          ignition_alert_enabled?: boolean | null
          low_battery_threshold?: number | null
          odometer_offset?: number | null
          offline_alert_enabled?: boolean | null
          offline_threshold_minutes?: number | null
          power_cut_alert_enabled?: boolean | null
          speed_alert_enabled?: boolean | null
          speed_limit_kmh?: number | null
          tracker_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gps_tracker_settings_tracker_id_fkey"
            columns: ["tracker_id"]
            isOneToOne: true
            referencedRelation: "gps_trackers"
            referencedColumns: ["id"]
          },
        ]
      }
      gps_trackers: {
        Row: {
          battery_level: number | null
          created_at: string
          engine_blocked: boolean | null
          external_voltage: number | null
          group_id: string
          gsm_signal: number | null
          id: string
          ignition: boolean | null
          imei: string
          is_active: boolean | null
          last_seen: string | null
          model: string | null
          name: string
          odometer: number | null
          satellites: number | null
          updated_at: string | null
        }
        Insert: {
          battery_level?: number | null
          created_at?: string
          engine_blocked?: boolean | null
          external_voltage?: number | null
          group_id: string
          gsm_signal?: number | null
          id?: string
          ignition?: boolean | null
          imei: string
          is_active?: boolean | null
          last_seen?: string | null
          model?: string | null
          name: string
          odometer?: number | null
          satellites?: number | null
          updated_at?: string | null
        }
        Update: {
          battery_level?: number | null
          created_at?: string
          engine_blocked?: boolean | null
          external_voltage?: number | null
          group_id?: string
          gsm_signal?: number | null
          id?: string
          ignition?: boolean | null
          imei?: string
          is_active?: boolean | null
          last_seen?: string | null
          model?: string | null
          name?: string
          odometer?: number | null
          satellites?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gps_trackers_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracking_groups"
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
      listing_comments: {
        Row: {
          created_at: string
          id: string
          is_read: boolean | null
          listing_id: string
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          listing_id: string
          message: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean | null
          listing_id?: string
          message?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "listing_comments_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          estado: string | null
          expires_at: string
          id: string
          is_active: boolean | null
          is_free: boolean | null
          latitude: number | null
          longitude: number | null
          municipio: string | null
          price: number | null
          profile_id: string
          title: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          estado?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
          price?: number | null
          profile_id: string
          title: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          estado?: string | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          is_free?: boolean | null
          latitude?: number | null
          longitude?: number | null
          municipio?: string | null
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
          is_read: boolean | null
          message: string
          receiver_id: string | null
          sender_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_panic?: boolean | null
          is_read?: boolean | null
          message: string
          receiver_id?: string | null
          sender_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_panic?: boolean | null
          is_read?: boolean | null
          message?: string
          receiver_id?: string | null
          sender_id?: string
        }
        Relationships: []
      }
      paises: {
        Row: {
          codigo_iso: string
          codigo_iso3: string | null
          codigo_telefono: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          moneda: string | null
          nombre: string
        }
        Insert: {
          codigo_iso: string
          codigo_iso3?: string | null
          codigo_telefono?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          moneda?: string | null
          nombre: string
        }
        Update: {
          codigo_iso?: string
          codigo_iso3?: string | null
          codigo_telefono?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          moneda?: string | null
          nombre?: string
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
          exported_at: string | null
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
          exported_at?: string | null
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
          exported_at?: string | null
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
      phone_verification_codes: {
        Row: {
          code: string
          created_at: string
          expires_at: string
          id: string
          phone: string
          used: boolean | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          expires_at?: string
          id?: string
          phone: string
          used?: boolean | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string
          id?: string
          phone?: string
          used?: boolean | null
          user_id?: string | null
        }
        Relationships: []
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
          ciudad: string | null
          created_at: string
          descripcion: string | null
          estado: string | null
          id: string
          is_available: boolean | null
          is_mobile: boolean
          keywords: string | null
          nombre: string
          pais: string | null
          precio: number
          proveedor_id: string
          stock: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          ciudad?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          id?: string
          is_available?: boolean | null
          is_mobile?: boolean
          keywords?: string | null
          nombre: string
          pais?: string | null
          precio: number
          proveedor_id: string
          stock?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          ciudad?: string | null
          created_at?: string
          descripcion?: string | null
          estado?: string | null
          id?: string
          is_available?: boolean | null
          is_mobile?: boolean
          keywords?: string | null
          nombre?: string
          pais?: string | null
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
          contact_token: string | null
          created_at: string
          email: string | null
          estado: Database["public"]["Enums"]["user_status"] | null
          id: string
          nombre: string
          phone: string | null
          phone_verification_code: string | null
          phone_verification_expires_at: string | null
          phone_verified: boolean | null
          postal_code: string | null
          provider_type: Database["public"]["Enums"]["provider_type"] | null
          role: Database["public"]["Enums"]["user_role"]
          route_name: string | null
          tarifa_km: number | null
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
          contact_token?: string | null
          created_at?: string
          email?: string | null
          estado?: Database["public"]["Enums"]["user_status"] | null
          id?: string
          nombre: string
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verified?: boolean | null
          postal_code?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"] | null
          role?: Database["public"]["Enums"]["user_role"]
          route_name?: string | null
          tarifa_km?: number | null
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
          contact_token?: string | null
          created_at?: string
          email?: string | null
          estado?: Database["public"]["Enums"]["user_status"] | null
          id?: string
          nombre?: string
          phone?: string | null
          phone_verification_code?: string | null
          phone_verification_expires_at?: string | null
          phone_verified?: boolean | null
          postal_code?: string | null
          provider_type?: Database["public"]["Enums"]["provider_type"] | null
          role?: Database["public"]["Enums"]["user_role"]
          route_name?: string | null
          tarifa_km?: number | null
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
      subdivisiones_nivel1: {
        Row: {
          codigo: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          nombre: string
          pais_id: string
          slug: string
          tipo: string
        }
        Insert: {
          codigo?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nombre: string
          pais_id: string
          slug: string
          tipo?: string
        }
        Update: {
          codigo?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          nombre?: string
          pais_id?: string
          slug?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "subdivisiones_nivel1_pais_id_fkey"
            columns: ["pais_id"]
            isOneToOne: false
            referencedRelation: "paises"
            referencedColumns: ["id"]
          },
        ]
      }
      subdivisiones_nivel2: {
        Row: {
          codigo_postal: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          latitud: number | null
          longitud: number | null
          nivel1_id: string
          nombre: string
          poblacion: number | null
          slug: string
          tipo: string
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          latitud?: number | null
          longitud?: number | null
          nivel1_id: string
          nombre: string
          poblacion?: number | null
          slug: string
          tipo?: string
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          latitud?: number | null
          longitud?: number | null
          nivel1_id?: string
          nombre?: string
          poblacion?: number | null
          slug?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "subdivisiones_nivel2_nivel1_id_fkey"
            columns: ["nivel1_id"]
            isOneToOne: false
            referencedRelation: "subdivisiones_nivel1"
            referencedColumns: ["id"]
          },
        ]
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
      taxi_requests: {
        Row: {
          accepted_at: string | null
          cancelled_at: string | null
          completed_at: string | null
          created_at: string
          destination_address: string | null
          destination_lat: number
          destination_lng: number
          distance_km: number
          driver_id: string
          driver_start_lat: number | null
          driver_start_lng: number | null
          id: string
          passenger_id: string
          pickup_address: string | null
          pickup_lat: number
          pickup_lng: number
          status: string
          tarifa_km: number
          total_fare: number
        }
        Insert: {
          accepted_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat: number
          destination_lng: number
          distance_km: number
          driver_id: string
          driver_start_lat?: number | null
          driver_start_lng?: number | null
          id?: string
          passenger_id: string
          pickup_address?: string | null
          pickup_lat: number
          pickup_lng: number
          status?: string
          tarifa_km: number
          total_fare: number
        }
        Update: {
          accepted_at?: string | null
          cancelled_at?: string | null
          completed_at?: string | null
          created_at?: string
          destination_address?: string | null
          destination_lat?: number
          destination_lng?: number
          distance_km?: number
          driver_id?: string
          driver_start_lat?: number | null
          driver_start_lng?: number | null
          id?: string
          passenger_id?: string
          pickup_address?: string | null
          pickup_lat?: number
          pickup_lng?: number
          status?: string
          tarifa_km?: number
          total_fare?: number
        }
        Relationships: []
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
          invite_token: string | null
          invited_by: string
          nickname: string
          phone_number: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          group_id: string
          id?: string
          invite_token?: string | null
          invited_by: string
          nickname: string
          phone_number?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          group_id?: string
          id?: string
          invite_token?: string | null
          invited_by?: string
          nickname?: string
          phone_number?: string | null
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
      user_contacts: {
        Row: {
          contact_user_id: string
          created_at: string
          id: string
          nickname: string | null
          user_id: string
        }
        Insert: {
          contact_user_id: string
          created_at?: string
          id?: string
          nickname?: string | null
          user_id: string
        }
        Update: {
          contact_user_id?: string
          created_at?: string
          id?: string
          nickname?: string | null
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_bidirectional_contact: {
        Args: { p_contact_user_id: string; p_nickname?: string }
        Returns: boolean
      }
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
      get_geografia_completa: {
        Args: { p_nivel2_id: string }
        Returns: {
          nivel1_id: string
          nivel1_nombre: string
          nivel1_slug: string
          nivel1_tipo: string
          nivel2_id: string
          nivel2_nombre: string
          nivel2_slug: string
          nivel2_tipo: string
          pais_codigo: string
          pais_id: string
          pais_nombre: string
        }[]
      }
      get_nivel2_by_slugs: {
        Args: {
          p_nivel1_slug: string
          p_nivel2_slug: string
          p_pais_codigo: string
        }
        Returns: {
          latitud: number
          longitud: number
          nivel1_id: string
          nivel1_nombre: string
          nivel2_id: string
          nivel2_nombre: string
          pais_id: string
          pais_nombre: string
        }[]
      }
      get_user_email_by_id: { Args: { p_user_id: string }; Returns: string }
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
      provider_type: "taxi" | "ruta"
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
      provider_type: ["taxi", "ruta"],
      subscription_status: ["activa", "vencida", "pendiente"],
      user_role: ["admin", "cliente", "proveedor"],
      user_status: ["available", "busy", "offline"],
      user_type: ["cliente", "proveedor", "empresa"],
    },
  },
} as const
