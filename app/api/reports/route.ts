import { randomUUID } from 'node:crypto';
import { existsSync, rmSync, unlinkSync } from 'node:fs';
import { NextResponse } from 'next/server';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';
import { requireSchoolSession } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isLocalAuthEnabled } from '@/lib/auth/local';
import { buildClassReports } from '@/lib/results/build-report';
import { renderDocument } from '@/lib/report/render';
import { syncLocalTeachingStructure } from '@/lib/local-preview';

export const runtime = 'nodejs';
export const maxDuration = 60;

let vercelChromiumPath: Promise<string> | undefined;

async function getVercelChromiumPath() {
  if (!process.env.VERCEL || process.platform === 'win32') return chromium.executablePath();
  if (!vercelChromiumPath) {
    vercelChromiumPath = (async () => {
      const libraryPath = '/tmp/al2023/lib';
      const chromiumPath = '/tmp/chromium';
      const libraryArchivePath = '/tmp/al2023';
      const fontsDirectory = '/tmp/fonts';
      const fontPath = '/tmp/fonts/Open_Sans/OpenSans-Regular.ttf';
      const hasLibraries = existsSync(`${libraryPath}/libnss3.so`);
      const hasFonts = existsSync(fontPath);
      if (!hasLibraries && existsSync(libraryArchivePath)) {
        rmSync(libraryArchivePath, { recursive: true, force: true });
      }
      if (!hasFonts && existsSync(fontsDirectory)) {
        rmSync(fontsDirectory, { recursive: true, force: true });
      }
      if ((!hasLibraries || !hasFonts) && existsSync(chromiumPath)) {
        unlinkSync(chromiumPath);
      }

      const previousRuntime = process.env.AWS_LAMBDA_JS_RUNTIME;
      const existingLibraryPaths = (process.env.LD_LIBRARY_PATH ?? '').split(':').filter(Boolean);
      process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs20.x';
      process.env.FONTCONFIG_PATH = fontsDirectory;
      process.env.LD_LIBRARY_PATH = [libraryPath, ...existingLibraryPaths.filter((path) => path !== libraryPath)].join(':');
      try {
        return await chromium.executablePath();
      } finally {
        if (previousRuntime === undefined) delete process.env.AWS_LAMBDA_JS_RUNTIME;
        else process.env.AWS_LAMBDA_JS_RUNTIME = previousRuntime;
      }
    })();
  }

  try {
    return await vercelChromiumPath;
  } catch (error) {
    vercelChromiumPath = undefined;
    throw error;
  }
}

async function getPdfBrowserConfig() {
  const configuredPath = process.env.CHROME_PATH;
  const windowsCandidates = [
    `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.ProgramFiles ?? 'C:\\Program Files'}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA ?? ''}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  const executablePath = configuredPath
    ? configuredPath
    : process.platform === 'win32'
      ? windowsCandidates.find((candidate) => existsSync(candidate))
      : await getVercelChromiumPath();

  if (!executablePath || !existsSync(executablePath)) {
    throw new Error(process.platform === 'win32'
      ? 'Install Google Chrome or Microsoft Edge, or set CHROME_PATH in .env.local to the browser executable.'
      : 'Chromium could not be found. Set CHROME_PATH to a Chromium executable.');
  }
  return {
    executablePath,
    args: process.platform === 'win32' ? ['--no-sandbox', '--disable-setuid-sandbox'] : chromium.args,
  };
}

export async function POST(req: Request) {
  const session = await requireSchoolSession('school_admin');
  const localAuth = isLocalAuthEnabled();
  if (localAuth) {
    const syncError = await syncLocalTeachingStructure(session.schoolId);
    if (syncError) return NextResponse.json({ error: `Could not prepare report-card data: ${syncError}` }, { status: 500 });
  }
  const fd = await req.formData();
  const classId = String(fd.get('class_id') ?? '');
  const yearId = String(fd.get('academic_year_id') ?? '');
  const termNo = Number(fd.get('term'));
  if (![1, 2, 3].includes(termNo)) return NextResponse.json({ error: 'Invalid term' }, { status: 400 });

  const enrollmentIds = fd.getAll('enrollment_id').map(String).filter(Boolean);
  const provisional = fd.get('provisional') === 'on';
  const sb = localAuth ? createAdminClient() : await createClient();
  const { data: cls } = await sb.from('classes').select('id').eq('id', classId).eq('school_id', session.schoolId).maybeSingle();
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 });

  let built: Awaited<ReturnType<typeof buildClassReports>>;
  try {
    built = await buildClassReports(sb, {
      schoolId: session.schoolId,
      classId,
      yearId,
      termNo: termNo as 1 | 2 | 3,
      enrollmentIds: enrollmentIds.length ? enrollmentIds : undefined,
      provisional,
      includePendingMarks: provisional,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to build report cards.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
  if (built.cards.length === 0) {
    return NextResponse.json({ error: 'No report cards can be generated.', skipped: built.skipped }, { status: 422 });
  }

  const { html, blocked } = renderDocument(built.cards);
  if (blocked.length) return NextResponse.json({ error: 'Some report cards cannot fit on one A4 page.', blocked }, { status: 422 });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>>;
  try {
    const config = await getPdfBrowserConfig();
    browser = await puppeteer.launch({ ...config, headless: true });
  } catch (error) {
    console.error('Unable to launch the PDF browser:', error);
    const message = error instanceof Error ? error.message : 'Unknown browser launch error';
    return NextResponse.json({ error: `PDF generation could not start. ${message}` }, { status: 500 });
  }
  let pdf: Buffer;
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pageLayouts = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('.page'))
      .map((element) => ({ studentId: element.dataset.student, height: element.clientHeight, contentHeight: element.scrollHeight })));
    const overflow = pageLayouts.filter((layout) => layout.contentHeight > layout.height + 1);
    if (overflow.length) {
      return NextResponse.json({ error: 'Some report cards contain content that exceeds one A4 page.', overflow }, { status: 422 });
    }
    pdf = Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      preferCSSPageSize: true,
    }));
  } finally {
    await browser.close();
  }

  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  if (pages !== built.cards.length) {
    return NextResponse.json({ error: `Layout error: expected ${built.cards.length} pages but produced ${pages}. Nothing was issued.` }, { status: 500 });
  }

  let uploadError: { message: string } | null = null;
  let storagePath: string | null = null;
  if (!localAuth) {
    const admin = createAdminClient();
    storagePath = `${session.schoolId}/${yearId}/term-${termNo}/${randomUUID()}.pdf`;
    const { error } = await admin.storage.from('report-archives').upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false,
    });
    uploadError = error;
  }

  const admin = createAdminClient();
  if (!provisional) {
    const termRows = [...built.termResults.values()].map((r) => ({
      school_id: session.schoolId,
      enrollment_id: r.enrollmentId,
      term_id: built.termId,
      status: r.status,
      total_weighted: r.totalWeighted,
      total_coefficients: r.totalCoefficients,
      average: r.average,
      position: r.position,
      eligible_count: built.classStats.eligibleCount,
      incomplete_subjects: r.incompleteSubjects,
    }));
    const { error: termError } = await admin.from('student_term_results').upsert(termRows, { onConflict: 'enrollment_id,term_id' });
    if (termError) return NextResponse.json({ error: termError.message }, { status: 500 });

    if (termNo === 3) {
      const annualRows = [...built.annualResults.entries()].map(([enrollmentId, a]) => ({
        school_id: session.schoolId,
        enrollment_id: enrollmentId,
        annual_average: a.average,
        annual_position: a.position,
        auto_decision: a.decision,
      }));
      if (annualRows.length) {
        const { error: annualError } = await admin.from('student_annual_results').upsert(annualRows, { onConflict: 'enrollment_id' });
        if (annualError) return NextResponse.json({ error: annualError.message }, { status: 500 });
      }
    }
  }

  if (!localAuth) {
    const { data: classEnrollments } = await sb.from('student_enrollments').select('id,student_id')
      .eq('class_id', classId).eq('academic_year_id', yearId);
    const enrollmentByStudent = new Map((classEnrollments ?? []).map((e: any) => [e.student_id as string, e.id as string]));

    const { error: historyError } = await admin.from('report_cards').insert(built.cards.map((card) => ({
      school_id: session.schoolId,
      enrollment_id: enrollmentByStudent.get(card.student.id) ?? null,
      class_id: classId,
      term_id: built.termId,
      generated_by: session.userId,
      is_provisional: !!card.provisional,
      page_count: 1,
      storage_path: uploadError ? null : storagePath,
    })));
    if (historyError) return NextResponse.json({ error: historyError.message }, { status: 500 });
  }

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="report-cards-term${termNo}.pdf"`,
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'CDN-Cache-Control': 'no-store',
      'X-Skipped': String(built.skipped.length),
      'X-Archive': localAuth ? 'skipped-local-session' : uploadError ? 'failed' : 'saved',
      ...(localAuth ? { 'X-Report-History': 'skipped-local-session' } : {}),
    },
  });
}
