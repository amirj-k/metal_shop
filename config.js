const SUPABASE_URL =
    "https://upuqgnysdzqlxpfehqhp.supabase.co";

const SUPABASE_ANON_KEY =
    "sb_publishable_6LUu00I0Jyqvufr7RC9Llg_asKqCMTF";

window.supabaseClient =
    window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_ANON_KEY
    );