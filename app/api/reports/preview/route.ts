import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSchoolSession } from '@/lib/auth/session';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { buildClassReports } from '@/lib/results/build-report';
import { renderDocument } from '@/lib/report/render';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export async function GET(req: Request) {
  const session = await requireSchoolSession('school_admin');
  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id') ?? '';
  const yearId = searchParams.get('academic_year_id') ?? '';
  const termParam = Number(searchParams.get('term'));
  const termNo = ([1, 2, 3].includes(termParam) ? termParam : 3) as 1 | 2 | 3;
  const localAuth = isLocalAuthEnabled();
  if (localAuth) {
    const syncError = await syncLocalTeachingStructure(session.schoolId);
    if (syncError) return NextResponse.json({ error: `Could not prepare report-card data: ${syncError}` }, { status: 500 });
  }
  const sb = localAuth ? createAdminClient() : await createClient();

  const [{ data: cls }, { data: year }] = await Promise.all([
    classId ? sb.from('classes').select('id').eq('id', classId).eq('school_id', session.schoolId).maybeSingle() : Promise.resolve({ data: null }),
    yearId ? sb.from('academic_years').select('id').eq('id', yearId).eq('school_id', session.schoolId).maybeSingle() : Promise.resolve({ data: null }),
  ]);

  if (!cls || !year) {
    return new Response('<main style="font-family:sans-serif;padding:32px"><h1>No preview available</h1><p>Select a valid class, academic year and term to preview report cards.</p></main>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  try {
    const built = await buildClassReports(sb, {
      schoolId: session.schoolId,
      classId,
      yearId,
      termNo,
      provisional: true,
      includePendingMarks: true,
      enrollmentIds: searchParams.getAll('enrollment_id').filter(Boolean),
    });
    if (!built.cards.length) {
      return new Response('<main style="font-family:sans-serif;padding:32px"><h1>No report cards available</h1><p>No enrolled students have reportable records for this selection.</p></main>', {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
    const { html, blocked } = renderDocument(built.cards.slice(0, 5));
    if (blocked.length) {
      return NextResponse.json({ error: 'Some report cards cannot fit on one A4 page.', blocked }, { status: 422 });
    }
    const previewHtml = html.replace('<body>', `
    <body style="background:#475569;padding:20px 0;">
      <div id="preview-toolbar" style="position:fixed;top:10px;right:20px;z-index:9999;display:flex;gap:10px;background:rgba(15,23,42,0.9);padding:8px 16px;border-radius:8px;box-shadow:0 4px 6px rgba(0,0,0,0.3);">
        <span style="color:white;font-family:sans-serif;font-size:13px;align-self:center;">A4 Preview (first ${Math.min(5, built.cards.length)} of ${built.cards.length})</span>
        <button onclick="window.print()" style="background:#2563eb;color:white;border:none;padding:6px 14px;border-radius:4px;font-size:13px;font-weight:600;cursor:pointer;">Print / Save as PDF</button>
      </div>
      <style>
        .page { background:white; box-shadow:0 10px 25px -5px rgba(0,0,0,0.4); margin:0 auto 20px auto; }
        @media print { #preview-toolbar { display:none !important; } body { background:white !important; padding:0 !important; } .page { box-shadow:none !important; margin:0 !important; } }
      </style>
    `);
    return new Response(previewHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
