import { NextResponse } from 'next/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocalAuthEnabled } from '@/lib/auth/local';

const TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX = 2 * 1024 * 1024;
const KINDS = new Set(['logo', 'signature', 'stamp']);

export async function POST(req: Request) {
  const session = await requireSchoolSession('school_admin');
  const fd = await req.formData();
  const kind = String(fd.get('kind') ?? '');
  const file = fd.get('file');
  if (!KINDS.has(kind)) return NextResponse.json({ error: 'Invalid asset kind' }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: 'Use JPG, PNG or WebP' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Max 2 MB' }, { status: 400 });

  const sb = isLocalAuthEnabled() ? createAdminClient() : await createClient();
  const { data: school, error: schoolLookupError } = await sb.from('schools')
    .select('id').eq('id', session.schoolId).maybeSingle();
  if (schoolLookupError) return NextResponse.json({ error: schoolLookupError.message }, { status: 500 });
  if (!school) return NextResponse.json({ error: 'Save the school identity first to initialize its workspace.' }, { status: 422 });
  const path = `${session.schoolId}/${kind}.${ext}`;
  const { error: uploadError } = await sb.storage.from('school-assets').upload(path, Buffer.from(await file.arrayBuffer()), {
    contentType: file.type,
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  if (kind === 'logo') {
    const { error } = await sb.from('schools').update({ logo_path: path }).eq('id', session.schoolId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await sb.from('school_settings').upsert({
      school_id: session.schoolId,
      [kind === 'signature' ? 'signature_path' : 'stamp_path']: path,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'school_id' });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { error: assetError } = await sb.from('school_assets').insert({
    school_id: session.schoolId, kind, storage_path: path, label: file.name,
  });
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  return NextResponse.json({ storage_path: path });
}
