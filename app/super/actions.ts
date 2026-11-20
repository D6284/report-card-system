'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';

const schoolSchema = z.object({
  name: z.string().trim().min(2).max(120),
  location: z.string().trim().max(120).optional(),
  admin_name: z.string().trim().min(2).max(120),
  admin_email: z.string().trim().email(),
  admin_password: z.string().min(8).max(72),
});

const back = (path: string, error?: string): never => redirect(error ? `${path}?error=${encodeURIComponent(error)}` : path);

export async function createSchool(fd: FormData) {
  await requireRole('super_admin');
  const raw = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ''));
  const parsed = schoolSchema.safeParse(raw);
  if (!parsed.success) return back('/super', parsed.error.issues[0].message);

  const d = parsed.data!;
  const admin = createAdminClient();
  const { data: created, error: userError } = await admin.auth.admin.createUser({
    email: d.admin_email,
    password: d.admin_password,
    email_confirm: true,
  });
  if (userError || !created.user) return back('/super', userError?.message ?? 'Could not create administrator');
  const userId = created.user!.id;

  const { data: school, error: schoolError } = await admin.from('schools')
    .insert({ name: d.name, location: d.location ?? null })
    .select('id').single();
  if (schoolError || !school) {
    await admin.auth.admin.deleteUser(userId);
    return back('/super', schoolError?.message ?? 'Could not create school');
  }
  const schoolId = school!.id;

  const { error: profileError } = await admin.from('profiles').insert({ id: userId, full_name: d.admin_name });
  const { error: membershipError } = await admin.from('school_memberships').insert({
    school_id: schoolId, user_id: userId, role: 'school_admin',
  });
  const { error: settingsError } = await admin.from('school_settings').insert({ school_id: schoolId });
  if (profileError || membershipError || settingsError) {
    await admin.from('schools').delete().eq('id', schoolId);
    await admin.auth.admin.deleteUser(userId);
    back('/super', (profileError ?? membershipError ?? settingsError)!.message);
  }

  revalidatePath('/super');
  back('/super');
}

export async function toggleSchoolStatus(fd: FormData) {
  await requireRole('super_admin');
  const id = String(fd.get('id') ?? '');
  const active = String(fd.get('is_active')) === 'true';
  if (!id) back('/super', 'Missing school');
  const { error } = await createAdminClient().from('schools').update({ is_active: !active }).eq('id', id);
  revalidatePath('/super');
  back('/super', error?.message);
}
