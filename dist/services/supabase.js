import { createClient } from '@supabase/supabase-js';
import { config } from '../config/env.js';
import axios from 'axios';
// We use the Service Role Key here so the backend has full access
export const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceKey);
export async function uploadExternalImageToSupabase(externalUrl, fin) {
    try {
        // 1. Download the image from Fayda
        const response = await axios.get(externalUrl, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary');
        // 2. Define the path (e.g., avatars/123456789012.jpg)
        const filePath = `${fin}.jpg`;
        // 3. Upload to our 'avatars' bucket
        const { data, error } = await supabaseAdmin.storage
            .from('avatars')
            .upload(filePath, buffer, {
            contentType: 'image/jpeg',
            upsert: true // If the user registers again, overwrite the old photo
        });
        if (error)
            throw error;
        // 4. Get the Public URL of our new copy
        const { data: { publicUrl } } = supabaseAdmin.storage
            .from('avatars')
            .getPublicUrl(filePath);
        return publicUrl;
    }
    catch (error) {
        console.error("Error proxying Fayda image:", error);
        return externalUrl; // Fallback to the original URL if our upload fails
    }
}
