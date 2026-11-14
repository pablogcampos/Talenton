import {readFileSync,writeFileSync} from 'node:fs';
const title='CinthIA | Entrevista virtual · Techcenter';
const description='Conoce a CinthIA, nuestra asistente de selección. Realiza tu entrevista virtual desde tu celular en aproximadamente 5 minutos.';
const image='https://talent-ontech.up.railway.app/cinthia-techcenter-preview-v1.png';
let html=readFileSync('dist/index.html','utf8');
html=html.replace(/<title>[^<]*<\/title>/,`<title>${title}</title>`)
 .replace(/<meta\s+(?:name="(?:description|twitter:[^"]+)"|property="og:[^"]+")[^>]*>/g,'')
 .replace('</head>',`<meta name="description" content="${description}" />
<meta property="og:title" content="${title}" />
<meta property="og:description" content="${description}" />
<meta property="og:type" content="website" />
<meta property="og:image" content="${image}" />
<meta property="og:image:secure_url" content="${image}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="CinthIA, asistente de selección, junto al logo de Techcenter" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${title}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
</head>`);
writeFileSync('dist/cinthia.html',html);
