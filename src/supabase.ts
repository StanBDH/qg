import { createClient } from '@supabase/supabase-js'

// ponytail: valeurs publiques (adresse et clé publiable), protégées par la RLS ; pas de .env à tenir.
const URL = 'https://kcxdldvgrhogtwwvmpru.supabase.co'
const CLE_PUBLIABLE = 'sb_publishable_RkL9ZmZ7zJafqpazZXC8fQ_Hm5gcUbI'

export const supabase = createClient(URL, CLE_PUBLIABLE)
