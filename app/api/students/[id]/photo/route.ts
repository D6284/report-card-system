import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { createClient } from '@/lib/supabase/server';

const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX = 2 * 1024 * 1024;

/** Admin-only. Validates, crops to 3:4 around the most prominent area, stores privately, saves the path. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: student } = await supabase.from('students').select('id,school_id').eq('id', id).single(); // RLS: own school only
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: isAdmin } = await supabase.rpc('is_school_admin', { sid: student.school_id });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const file = (await req.formData()).get('photo');
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 });
  if (!TYPES.has(file.type)) return NextResponse.json({ error: 'Use JPG, PNG or WebP' }, { status: 400 });
  if (file.size > MAX) return NextResponse.json({ error: 'Max 2 MB' }, { status: 400 });

  const jpg = await sharp(Buffer.from(await file.arrayBuffer())).rotate()
    .resize(450, 600, { fit: 'cover', position: 'attention' }).jpeg({ quality: 88 }).toBuffer();
  const path = `${student.school_id}/${student.id}/photo.jpg`;
  const { error: upErr } = await supabase.storage.from('student-photos').upload(path, jpg, { contentType: 'image/jpeg', upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
  await supabase.from('students').update({ photo_path: path }).eq('id', student.id);
  return NextResponse.json({ photo_path: path });
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: student } = await supabase.from('students').select('id,school_id,photo_path').eq('id', id).single();
  if (!student) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data: isAdmin } = await supabase.rpc('is_school_admin', { sid: student.school_id });
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (student.photo_path) await supabase.storage.from('student-photos').remove([student.photo_path]);
  await supabase.from('students').update({ photo_path: null }).eq('id', student.id);
  return NextResponse.json({ ok: true });
}
