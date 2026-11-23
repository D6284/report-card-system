import { NextResponse } from 'next/server';
import { requireSchoolSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { calculateApprovedResults } from '@/lib/results/calculate';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await requireSchoolSession('school_admin');
  const localAuth = isLocalAuthEnabled();
  if (localAuth) {
    const syncError = await syncLocalTeachingStructure(session.schoolId);
    if (syncError) {
      return NextResponse.json({ ok: false, error: `Could not prepare calculation: ${syncError}` }, { status: 500 });
    }
  }

  const form = await req.formData();
  const classId = String(form.get('class_id') ?? '');
  const yearId = String(form.get('academic_year_id') ?? '');
  const termNo = Number(form.get('term'));
  if (!classId || !yearId || ![1, 2, 3].includes(termNo)) {
    return NextResponse.json({ ok: false, error: 'Select a valid class, academic year and term.' }, { status: 400 });
  }

  try {
    const sb = createAdminClient();
    const result = await calculateApprovedResults(sb, {
      schoolId: session.schoolId,
      classId,
      yearId,
      termNo: termNo as 1 | 2 | 3,
      initiatedBy: localAuth ? null : session.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Calculation failed.' },
      { status: 400 },
    );
  }
}
