import Module from 'node:module';
import { writeFileSync, existsSync } from 'node:fs';

const orig = (Module as any)._load;
(Module as any)._load = function(request: string, ...args: any[]) {
  if (request === 'server-only') return {};
  return orig.call(this, request, ...args);
};

async function main() {
  const { createClient } = await import('@supabase/supabase-js');
  const ws = (await import('ws')).default;
  const { buildClassReports } = await import('../lib/results/build-report.ts');
  const { renderDocument } = await import('../lib/report/render.ts');
  const puppeteer = (await import('puppeteer-core')).default;

  const { SUPABASE_PUBLIC_CONFIG } = await import('../lib/supabase/public-config.ts');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    console.error('Set SUPABASE_SERVICE_ROLE_KEY in .env.local before running this script.');
    process.exitCode = 1;
    return;
  }
  const sb = createClient(SUPABASE_PUBLIC_CONFIG.url, key, { auth: { persistSession: false }, realtime: { transport: ws } });

  try {
    const res = await buildClassReports(sb, {
      schoolId: '00000000-0000-0000-0000-000000000001',
      classId: '607e3b6a-9542-4736-9ac1-5e03ca56f819',
      yearId: 'e6b5bc3f-3afc-4484-b140-0742ad9eaba5',
      termNo: 1,
      provisional: true,
      includePendingMarks: true,
    });
    console.log('Skipped count:', res.skipped.length, res.skipped);
    console.log('Cards count:', res.cards.length);

    const { html, blocked } = renderDocument(res.cards);
    writeFileSync('out/current-test.html', html);
    console.log('HTML written to out/current-test.html. Blocked:', blocked);

    const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const execPath = existsSync(chromePath) ? chromePath : edgePath;
    console.log('Browser path:', execPath);

    const browser = await puppeteer.launch({ executablePath: execPath, headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '0', right: '0', bottom: '0', left: '0' } });
    await browser.close();
    writeFileSync('out/current-generated.pdf', pdf);
    console.log('PDF successfully generated at out/current-generated.pdf');
  } catch (e) {
    console.error('ERROR:', e);
  }
}

main();
