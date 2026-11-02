import { jsPDF } from 'jspdf';
import { comparisonSections, comparisonSources } from '@/data/comparativa';

export function downloadComparisonPdf() {
  const doc = new jsPDF({format:'letter',unit:'mm'});
  const width = 175;
  let y = 22;
  const line = (text: string, size = 10, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lines = doc.splitTextToSize(text, width) as string[];
    const height = size * 0.46;
    for (const value of lines) {
      if (y + height > 254) { doc.addPage(); y = 22; }
      doc.text(value, 20, y); y += height;
    }
    y += 3;
  };
  doc.setProperties({title:'Análisis Comparativo Estratégico: TodoCerca vs. PIX vs. WeChat Pay',author:'TodoCerca',subject:'Capacidades, costos y hoja de ruta con fuentes'});
  line('TodoCerca',24,true);
  line('Análisis Comparativo Estratégico',18,true);
  line('TodoCerca vs. PIX (Brasil) vs. WeChat Pay (China)',13,true);
  line('Edición: 2 de noviembre de 2026. Información del proyecto y referencias públicas; no constituye asesoría fiscal, autorización financiera ni garantía de depósitos.');
  line('Distingue funciones disponibles en el proyecto de propuestas e integraciones no acreditadas. El PDF contiene todas las secciones, aunque estén cerradas en la página.');
  for (const [index, section] of comparisonSections.entries()) {
    y += 4; line(`${index+1}. ${section.title}`,15,true);line(section.summary,10);
    for (const block of section.blocks) {line(block.title,12,true);for(const paragraph of block.paragraphs)line(paragraph);}
    line(`Referencias: ${section.sources.map(id=>comparisonSources.find(s=>s.id===id)?.label).filter(Boolean).join('; ')}`,9);
  }
  line('Fuentes y metodología',15,true);
  line('Estado de TodoCerca basado en los flujos y pendientes del proyecto; no se realizaron consultas pagadas, movimientos financieros ni certificaciones independientes para este documento. Referencias externas sujetas a cambios.');
  for (const source of comparisonSources) {line(source.label,10,true);line(source.url,9);}
  const pages=doc.getNumberOfPages();
  for(let page=1;page<=pages;page++) {doc.setPage(page);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(`TodoCerca | todocerca.mx/comparativa | ${page} / ${pages}`,20,267);}
  doc.save('TodoCerca-Analisis-Comparativo.pdf');
}