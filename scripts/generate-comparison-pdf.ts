import { readFileSync, writeFileSync } from 'node:fs';
import { createComparisonPdf } from '../src/lib/comparisonPdf';

const imageData = (path: string, mime: string) => `data:${mime};base64,${readFileSync(path).toString('base64')}`;
const doc = createComparisonPdf({
  community: imageData('src/assets/comparativa-comunidad.jpg', 'image/jpeg'),
  logo: imageData('public/icon-512.png', 'image/png'),
});
writeFileSync('public/downloads/TodoCerca-Analisis-Comparativo.pdf', Buffer.from(doc.output('arraybuffer')));
console.log(`PDF generado: ${doc.getNumberOfPages()} páginas carta.`);