import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/supabase'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY requises (voir .env.example)',
  )
}

// Database : types générés depuis la base réelle (src/types/supabase.ts) ;
// les repositories en déduisent des lignes typées, jamais l'inverse.
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
