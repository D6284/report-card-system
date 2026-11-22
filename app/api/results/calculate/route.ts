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
      const redirectUrl = new URL('/admin/results', req.url);
      redirectUrl.searchParams.set('error', syncError);
      return NextResponse.redirect(redirectUrl, 303);
    }
  }

  const form = await req.formData();
  const classId = String(form.get('class_id') ?? '');
  const yearId = String(form.get('academic_year_id') ?? '');
  const termNo = Number(form.get('term'));
  if (!classId || !yearId || ![1, 2, 3].includes(termNo)) {
    const redirectUrl = new URL('/admin/results', req.url);
    redirectUrl.searchParams.set('error', 'Select a valid class, academic year and term.');
    return NextResponse.redirect(redirectUrl, 303);
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
    const redirectUrl = new URL('/admin/results', req.url);
    redirectUrl.searchParams.set('class_id', classId);
    redirectUrl.searchParams.set('academic_year_id', yearId);
    redirectUrl.searchParams.set('term', String(termNo));
    redirectUrl.searchParams.set(
      'success',
      `Calculated ${result.completeStudents} complete and ${result.incompleteStudents} provisional student result(s).`,
    );
    return NextResponse.redirect(redirectUrl, 303);
  } catch (error) {
    const redirectUrl = new URL('/admin/results', req.url);
    redirectUrl.searchParams.set('class_id', classId);
    redirectUrl.searchParams.set('academic_year_id', yearId);
    redirectUrl.searchParams.set('term', String(termNo));
    redirectUrl.searchParams.set('error', error instanceof Error ? error.message : 'Calculation failed.');
    return NextResponse.redirect(redirectUrl, 303);
  }
}
