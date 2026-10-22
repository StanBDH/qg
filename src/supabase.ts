import { createClient } from '@supabase/supabase-js'

// ponytail: valeurs publiques (adresse et clé publiable), protégées par la RLS ; pas de .env à tenir.
const URL = 'https://A_RENSEIGNER.supabase.co'
const CLE_PUBLIABLE = 'A_RENSEIGNER'

export const supabase = createClient(URL, CLE_PUBLIABLE)
