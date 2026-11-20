import sys
from playwright.sync_api import sync_playwright
src, out = sys.argv[1], sys.argv[2]
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.goto('file://' + src)
    pg.pdf(path=out, width='210mm', height='297mm', margin={'top':'0','bottom':'0','left':'0','right':'0'}, print_background=True, prefer_css_page_size=True)
    b.close()
