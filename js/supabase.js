// Supabase configuration
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const supabaseUrl = "https://wwqzhckptibzltizaqnf.supabase.co";

const supabaseKey = "sb_publishable_x9VnglZzIB5GNgrkSng4fg_Gl07aurI";

// Initialize Supabase
export const supabase = createClient(
    supabaseUrl,
    supabaseKey
);

// Images storage bucket
export const storageBucket = "lujain-products";