import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 4000,
  faydaUrl: process.env.FAYDA_API_URL!,
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
};