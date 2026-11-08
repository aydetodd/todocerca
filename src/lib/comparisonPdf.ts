import { jsPDF } from 'jspdf';
import { comparisonSections, comparisonSources } from '../data/comparativa';

// Print palette is isolated from the website theme: all artwork stays vector-based.
const ink = {
  orange: '#FF6B35', navy: '#1A2B3C', text: '#374151', muted: '#64748B',
  paper: '#FFFFFF', pale: '#F3F5F7', border: '#DDE3E8',
  green: '#23834B', red: '#BD3434', yellow: '#AD7600',
  orangePale: '#FFF1EB', bluePale: '#EDF4FA', greenPale: '#EDF8F0',
  redPale: '#FFF0F0', yellowPale: '#FFF8DE',
};
type Icon = 'bus' | 'bank' | 'chat' | 'chart' | 'check' | 'cross' | 'warning' | 'lock' | 'coin' | 'phone';
export type ComparisonPdfAssets = { community?: string; logo?: string };

export function createComparisonPdf(assets: ComparisonPdfAssets = {}) {
  const doc = new jsPDF({ format: 'letter', unit: 'mm', compress: true });
  const left = 25.4, right = 190.5, width = right - left, bottom = 249;
  let y = 44;
  let runningTitle = 'Análisis Comparativo Estratégico';
  const text = (value: string, x: number, baseline: number, size = 11, color = ink.text, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    doc.setTextColor(color); doc.text(value, x, baseline);
  };
  const rect = (x: number, top: number, w: number, h: number, color: string) => {
    doc.setFillColor(color); doc.rect(x, top, w, h, 'F');
  };
  const wrap = (value: string, w: number, size: number, bold = false): string[] => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size);
    return doc.splitTextToSize(value, w) as string[];
  };
  const icon = (kind: Icon, x: number, top: number, s: number, color: string) => {
    doc.setDrawColor(color); doc.setLineWidth(0.55); doc.setFillColor(color);
    const line = (a: number, b: number, c: number, d: number) => doc.line(x+a*s, top+b*s, x+c*s, top+d*s);
    if (kind === 'check') { line(.15,.5,.4,.75); line(.4,.75,.85,.2); }
    else if (kind === 'cross') { line(.2,.2,.8,.8); line(.8,.2,.2,.8); }
    else if (kind === 'warning') {
      doc.triangle(x+s/2,top,x,top+s,x+s,top+s,'S'); line(.5,.3,.5,.65); doc.circle(x+s*.5,top+s*.82,.35,'F');
    } else if (kind === 'coin') {
      doc.circle(x+s/2,top+s/2,s*.43,'S'); text('$',x+s*.31,top+s*.72,s*2.1,color,true);
    } else if (kind === 'chat') {
      doc.roundedRect(x,top,s,s*.7,1,1,'S'); line(.2,.7,.2,1); line(.2,1,.45,.7);
      [.25,.5,.75].forEach(a=>doc.circle(x+a*s,top+s*.35,.35,'F'));
    } else if (kind === 'bank') {
      doc.triangle(x+s/2,top,x,top+s*.3,x+s,top+s*.3,'S'); [.2,.5,.8].forEach(a=>line(a,.4,a,.85)); line(0,1,1,1);
    } else if (kind === 'lock') {
      doc.roundedRect(x+s*.1,top+s*.4,s*.8,s*.6,1,1,'S');
      doc.roundedRect(x+s*.3,top,s*.4,s*.55,1,1,'S'); line(.5,.6,.5,.8);
    } else if (kind === 'phone') {
      doc.roundedRect(x+s*.2,top,s*.6,s,1,1,'S'); line(.35,.15,.65,.15); line(.45,.85,.55,.85);
    } else if (kind === 'bus') {
      doc.roundedRect(x+s*.1,top,s*.8,s*.8,1,1,'S'); doc.rect(x+s*.2,top+s*.15,s*.6,s*.3,'S');
      [.28,.72].forEach(a=>doc.circle(x+s*a,top+s*.65,s*.045,'F')); line(.25,.8,.25,1); line(.75,.8,.75,1);
    } else { line(0,0,0,1); line(0,1,1,1); [.2,.45,.7].forEach((a,i)=>doc.rect(x+s*a,top+s*(.65-i*.2),s*.15,s*(.35+i*.2),'F')); }
  };
  const brand = (top: number) => {
    if (assets.logo) doc.addImage(assets.logo,'PNG',left,top-6,9,9);
    text('TodoCerca',left+11,top,12,ink.orange,true);
  };
  const header = () => {
    brand(29); text('ANÁLISIS / MÉXICO · BRASIL · CHINA',right-78,29,8,ink.muted);
    rect(left,34,width,.5,ink.border);
    const title = wrap(runningTitle,width,9,true);
    text(title[0] ?? '',left,40,9,ink.navy,true);
    y=49;
  };
  const newPage = () => { doc.addPage(); header(); };
  const ensure = (height: number) => { if (y+height>bottom) newPage(); };
  const paragraph = (value: string, color = ink.text) => {
    const lines=wrap(value,width,11); const leading=5.25;
    ensure(lines.length*leading+3.5);
    for (const valueLine of lines) { ensure(leading); text(valueLine,left,y+3.8,11,color); y+=leading; }
    y+=3.5;
  };
  const box = (value: string, bg: string, color: string, kind: Icon) => {
    const lines=wrap(value,width-23,11); const h=lines.length*5.2+12; ensure(h+4);
    rect(left,y,width,h,bg); rect(left,y,1.2,h,color); icon(kind,left+5,y+6,7,color);
    lines.forEach((v,i)=>text(v,left+17,y+8.5+i*5.2,11,ink.text)); y+=h+6;
  };
  const blockHeading = (value: string, firstParagraph?: string) => {
    const color=value.startsWith('TodoCerca')?ink.orange:ink.navy;
    const bg=value.startsWith('TodoCerca')?ink.orangePale:value.startsWith('Pix')?ink.bluePale:ink.pale;
    const lines=wrap(value,width-18,18,true); const h=lines.length*7.8+10;
    const isCallout=firstParagraph?.startsWith('A favor:') || firstParagraph?.startsWith('Límites:');
    const followingHeight=firstParagraph ? wrap(firstParagraph,width-(isCallout?23:0),11).length*5.25+(isCallout?18:4) : 22;
    ensure(h+5+followingHeight); rect(left,y,width,h,bg);
    icon(value.startsWith('TodoCerca')?'bus':value.startsWith('Pix')?'bank':value.startsWith('WeChat')?'chat':'chart',left+4,y+5,7,color);
    lines.forEach((v,i)=>text(v,left+15,y+8.7+i*7.8,18,color,true)); y+=h+5;
  };
  const sectionIcons: Icon[]=['bus','phone','coin','chart','lock','chat','chart'];
  const tableRows: string[][][] = [
    [['TodoCerca','Plataforma local','México'],['PIX','Riel interoperable','Brasil'],['WeChat Pay','Ecosistema Tencent','China']],
    [['TodoCerca','CURP / INE / e.firma','Según nivel'],['PIX','Cuenta participante','Banco o entidad de pago'],['WeChat Pay','Identificación y tarjeta','Según producto y país']],
    [['TodoCerca','Recarga: $15 MXN','Activación principal: $150'],['PIX','Gratuidad con excepciones','Tarifas empresariales'],['WeChat Pay','Costos variables','Según tarjeta y contexto']],
    [['TodoCerca','Guía estática RESICO','CFDI y nómina pendientes'],['PIX','Infraestructura brasileña','No formaliza ante SAT'],['WeChat Pay','Servicios de terceros','No solución nativa SAT']],
    [['TodoCerca','Llave y contraseña locales','Validación SAT pendiente'],['PIX','Identidad y transacciones','Controles institucionales'],['WeChat Pay','Políticas de datos','Alcance según producto']],
    [['TodoCerca','Movilidad y QaRd','Orientación local'],['PIX','Múltiples participantes','Interoperabilidad'],['WeChat Pay','Pagos y comunicación','Servicios y miniapps']],
    [['TodoCerca','Integración local','Completar y verificar'],['PIX','Interoperabilidad','Cuenta participante'],['WeChat Pay','Ecosistema integrado','Condiciones variables']],
  ];
  const table = (index: number) => {
    ensure(58); text('COMPARATIVA DE UN VISTAZO',left,y+4,10,ink.navy,true); y+=9;
    const cols=[43,61,width-104]; rect(left,y,width,10,ink.navy);
    ['Modelo','Enfoque / condición','Alcance / límite'].forEach((v,i)=>text(v,left+4+cols.slice(0,i).reduce((a,b)=>a+b,0),y+6.5,10,ink.paper,true)); y+=10;
    tableRows[index].forEach((row,r)=>{
      const lines=row.map((v,c)=>wrap(v,cols[c]-(c===0?13:8),10,c===0));
      const h=Math.max(...lines.map(v=>v.length))*4.7+8;
      rect(left,y,width,h,r%2===0?ink.paper:ink.pale); doc.setDrawColor(ink.border); doc.rect(left,y,width,h,'S');
      icon((['bus','bank','chat'] as Icon[])[r],left+3,y+4,5,r===0?ink.orange:ink.navy);
      lines.forEach((vs,c)=>vs.forEach((v,l)=>text(v,left+cols.slice(0,c).reduce((a,b)=>a+b,0)+(c===0?11:4),y+6.2+l*4.7,10,ink.text,c===0)));
      y+=h;
    }); y+=8;
  };
  doc.setProperties({title:'Análisis Comparativo Estratégico: TodoCerca vs. PIX vs. WeChat Pay',author:'TodoCerca',subject:'Capacidades, costos y hoja de ruta con fuentes'});

  // Cover: the original web image, uncropped, inside the one-inch print safe area.
  rect(left,25.4,width,189,ink.navy); brand(38);
  text('MÉXICO / BRASIL / CHINA',left+7,52,10,ink.paper,true);
  ['TodoCerca vs. PIX','vs. WeChat Pay'].forEach((v,i)=>{
    text(v,left+7.5,68.5+i*12,28,'#0F1B26',true); text(v,left+7,68+i*12,28,ink.paper,true);
  });
  text('Análisis Comparativo Estratégico',left+7,94,15,ink.paper);
  if (assets.community) doc.addImage(assets.community,'JPEG',left,103,width,94);
  rect(left+7,201,width-14,11,ink.orange);
  text('Descargar Análisis Completo en PDF',left+14,208.3,12,ink.paper,true);
  doc.link(left+7,201,width-14,11,{url:'https://todocerca.mx/comparativa'});
  y=222;
  const disclaimer='Edición: 2 de noviembre de 2026. Información del proyecto y referencias públicas; no constituye asesoría fiscal, autorización financiera ni garantía de depósitos.';
  wrap(disclaimer,width,9).forEach((v,i)=>text(v,left,y+i*4.3,9,ink.muted)); y+=18;
  wrap('Distingue funciones disponibles en el proyecto de propuestas e integraciones no acreditadas. El PDF contiene todas las secciones, aunque estén cerradas en la página.',width,9).forEach((v,i)=>text(v,left,y+i*4.3,9,ink.muted));
  // Retain the original subtitle verbatim, alongside the redesigned cover title.
  text('TodoCerca vs. PIX (Brasil) vs. WeChat Pay (China)',left,254,9,ink.navy,true);

  for (const [index,section] of comparisonSections.entries()) {
    runningTitle=section.title; newPage();
    text(String(index+1).padStart(2,'0'),left,y+12,28,ink.orange,true);
    icon(sectionIcons[index],right-12,y+1,11,ink.orange); y+=22;
    const titleLines=wrap(section.title,width,20,true);
    titleLines.forEach((v,i)=>text(v,left,y+6+i*8.4,20,ink.navy,true)); y+=titleLines.length*8.4+9;
    rect(left,y,width,1,ink.orange); y+=8;
    box(section.summary,ink.yellowPale,ink.yellow,'warning');
    table(index);
    for (const block of section.blocks) {
      blockHeading(block.title,block.paragraphs[0]);
      for (const p of block.paragraphs) {
        if (p.startsWith('A favor:')) box(p,ink.greenPale,ink.green,'check');
        else if (p.startsWith('Límites:')) box(p,ink.redPale,ink.red,'cross');
        else paragraph(p);
      }
    }
    paragraph(`Referencias: ${section.sources.map(id=>comparisonSources.find(s=>s.id===id)?.label).filter(Boolean).join('; ')}`,ink.muted);
  }
  runningTitle='Fuentes y metodología'; newPage();
  text('Fuentes y metodología',left,y+7,24,ink.orange,true); y+=20;
  box('Estado de TodoCerca basado en los flujos y pendientes del proyecto; no se realizaron consultas pagadas, movimientos financieros ni certificaciones independientes para este documento. Referencias externas sujetas a cambios.',ink.yellowPale,ink.yellow,'warning');
  for (const [index,source] of comparisonSources.entries()) {
    const label=wrap(source.label,width-13,11,true), url=wrap(source.url,width-13,9);
    const h=label.length*5.3+url.length*4.2+10; ensure(h+5);
    rect(left,y,width,h,index%2===0?ink.bluePale:ink.pale);
    label.forEach((v,i)=>text(v,left+6,y+7+i*5.3,11,ink.navy,true));
    url.forEach((v,i)=>text(v,left+6,y+8+label.length*5.3+i*4.2,9,ink.muted));
    doc.link(left,y,width,h,{url:source.url}); y+=h+4;
  }
  runningTitle='Balance estratégico'; newPage();
  text('Tres modelos. Una decisión.',left,y+7,24,ink.orange,true); y+=18;
  paragraph('Pros y límites: una lectura visual del análisis completo.');
  const gap=4, col=(width-gap*2)/3, top=y;
  const balances=[
    {name:'TodoCerca',color:ink.orange,bg:ink.orangePale,kind:'bus' as Icon,pros:['Movilidad y comunidad mexicana','Control de tarjetas adicionales','Equipo por invitación','Guía estática de formalización','e.firma sin transferir llave o contraseña'],cons:['Menor efecto de red','Validación SAT pendiente','Saldo empresarial pendiente de verificación','Custodia regulada no acreditada','CFDI, asistencia y nómina propuestos']},
    {name:'PIX',color:ink.navy,bg:ink.bluePale,kind:'bank' as Icon,pros:['Infraestructura del Banco Central','Interoperabilidad','Operación continua','Alcance consolidado en Brasil','Gratuidad habitual para personas físicas'],cons:['Exige cuenta participante','No resuelve obligaciones fiscales mexicanas','Posibles tarifas empresariales','Límites y riesgo de fraude']},
    {name:'WeChat Pay',color:ink.muted,bg:ink.pale,kind:'chat' as Icon,pros:['Pagos integrados','Comercio y servicios','Experiencia consolidada','Visitantes con tarjetas internacionales bajo condiciones'],cons:['Reglas de plataforma','Verificación y cobertura variables','Costos según contexto','Revisión del tratamiento de datos','No solución nativa RESICO, nómina o SAT']},
  ];
  balances.forEach((b,c)=>{
    const x=left+c*(col+gap); rect(x,top,col,bottom-top,b.bg); rect(x,top,col,2,b.color);
    icon(b.kind,x+5,top+7,9,b.color); text(b.name,x+5,top+25,13,b.color,true);
    let cy=top+34;
    const list=(label:string,values:string[],color:string,kind:Icon)=>{
      text(label,x+5,cy,12,color,true); cy+=7;
      values.forEach(v=>{ const lines=wrap(v,col-15,11); icon(kind,x+4,cy-2.5,3.5,color); lines.forEach((line,i)=>text(line,x+10,cy+i*4.7,11,ink.text)); cy+=lines.length*4.7+2; }); cy+=3;
    };
    list('Pros',b.pros,ink.green,'check'); list('Límites',b.cons,ink.red,'cross');
  });
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++) {
    doc.setPage(page); rect(left,260,width,.4,ink.border);
    text('todocerca.mx/comparativa',left,267,8,ink.muted); text(`${page} / ${pages}`,right-13,267,8,ink.navy,true);
    doc.link(left,263,65,6,{url:'https://todocerca.mx/comparativa'});
  }
  return doc;
}