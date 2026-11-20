import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://hpfyhesicjxztvzsmynq.supabase.co';
const supabaseAnonKey = 'sb_publishable_vlWCHmbNYm-drgDJ-tBpkw_gSSKDg3-';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function uploadEvidenceFile(file, userId, folder = 'general') {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}/${folder}/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('evidences')
    .upload(fileName, file);

  if (uploadError) throw uploadError;
  return fileName;
}

export async function getSignedEvidenceUrl(filePath) {
  if (!filePath) return null;
  const { data, error } = await supabase.storage
    .from('evidences')
    .createSignedUrl(filePath, 3600);

  if (error) {
    console.error('Gagal memuat signed URL:', error);
    return null;
  }
  return data.signedUrl;
}