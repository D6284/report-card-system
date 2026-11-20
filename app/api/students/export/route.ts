import { createClient } from '@/lib/supabase/server';
import { isLocalAuthEnabled, readLocalSession } from '@/lib/auth/local';
import { localClasses, localStudents, localYears } from '@/lib/local-preview';

function csvCell(value: unknown) {
  const text = value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(req: Request) {
  const localSession = await readLocalSession();
  if (isLocalAuthEnabled() && !localSession) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sb = await createClient();
  if (!isLocalAuthEnabled()) {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const current = params.get('year') ?? '';
  const q = params.get('q')?.replace(/[%,]/g, '').toLowerCase() ?? '';
  const classId = params.get('class');
  const gender = params.get('gender');
  const status = params.get('status');
  let rows: any[] = [];

  if (isLocalAuthEnabled()) {
    const [students, classes, years] = await Promise.all([localStudents(), localClasses(), localYears()]);
    const classMap = new Map(classes.map((c) => [c.id, c]));
    const yearMap = new Map(years.map((y) => [y.id, y]));
    rows = students
      .filter((s) => !current || s.academic_year_id === current)
      .filter((s) => !classId || s.class_id === classId)
      .filter((s) => !gender || s.gender === gender)
      .filter((s) => status !== 'active' || s.is_active)
      .filter((s) => status !== 'inactive' || !s.is_active)
      .filter((s) => !q || s.full_name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q))
      .map((s) => ({
        students: s,
        classes: classMap.get(s.class_id),
        academic_years: yearMap.get(s.academic_year_id),
        status: 'active',
      }));
  } else {
    let query = sb.from('student_enrollments').select('id,status,classes(name,stream),academic_years(name),students(full_name,admission_no,gender,is_active,guardian_name,guardian_phone,date_of_birth)');
    if (current) query = query.eq('academic_year_id', current);
    if (classId) query = query.eq('class_id', classId);
    if (q) query = query.or(`students.full_name.ilike.%${q}%,students.admission_no.ilike.%${q}%`);
    if (gender) query = query.eq('students.gender', gender);
    if (status === 'active') query = query.eq('students.is_active', true);
    if (status === 'inactive') query = query.eq('students.is_active', false);
    const { data, error } = await query.order('id');
    if (error) return Response.json({ error: error.message }, { status: 400 });
    rows = (data ?? []) as any[];
  }
  const header = ['Student', 'Admission number', 'Gender', 'Date of birth', 'Class', 'Academic year', 'Guardian', 'Guardian phone', 'Enrollment status', 'Student status'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    lines.push([
      r.students?.full_name, r.students?.admission_no, r.students?.gender, r.students?.date_of_birth,
      `${r.classes?.name ?? ''} ${r.classes?.stream ?? ''}`.trim(), r.academic_years?.name,
      r.students?.guardian_name, r.students?.guardian_phone, r.status, r.students?.is_active ? 'active' : 'inactive',
    ].map(csvCell).join(','));
  }

  return new Response(`\uFEFF${lines.join('\r\n')}`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="students-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
