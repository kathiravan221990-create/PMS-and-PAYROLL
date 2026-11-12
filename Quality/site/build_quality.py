import re
src=open('/home/claude/build/CP_PAYROLL.html',encoding='utf8').read()
head=src[:src.find('</style>')].replace('<title>CP PAYROLL</title>','<title>CP QUALITY</title>')
extra=".kpi>div{background:linear-gradient(150deg,#143a78,#0a2150)!important;color:#f0cf6a!important;border:1px solid rgba(240,207,106,.55)!important;border-left:5px solid #d9b341!important;box-shadow:0 4px 14px rgba(0,0,0,.35);font-weight:600}.kpi>div b{color:#f0cf6a!important;font-size:20px}\n"
brand=re.search(r'<div class="brand"><img src="(data:image/png;base64,[^"]+)"',src).group(1)
ic=src[src.find('const IC='):src.find('const NAV=')]
nav=src[src.find('const NAV='):]; nav=nav[:nav.find('};')+2]
h=src[src.find('const I=n=>'):src.find('function csv(')]
body=open('quality_body.js').read().replace('__BRAND__',brand)
out=head+extra+'</style></head><body><div id="app"></div><script>\n'+ic+nav+'\n'+h+'\n'+body+'\n</script></body></html>'
open('CP_QUALITY.html','w',encoding='utf8').write(out)
open('/tmp/q_check.js','w').write(re.search(r'<script>([\s\S]*)</script>',out).group(1))
