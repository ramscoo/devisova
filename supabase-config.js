// Configuration publique Supabase pour Devisova.
//
// SEULE la cle publique ("publishable"/"anon") va ici : elle est concue
// pour etre visible cote navigateur, la securite reelle vient des
// policies RLS definies dans supabase/migrations/. Ne jamais mettre ici
// une cle "service_role" ou un secret serveur (Stripe, etc.) : ces
// cles-la ne doivent exister que dans des Edge Functions, jamais dans
// un fichier charge par le navigateur.
const SUPABASE_URL = 'https://bifucjhxdzvgspwbrgjx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-_jmadbTDTlMFG01YF5mGA_oCnm_yxb';
