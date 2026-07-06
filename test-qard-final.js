import { generarPdfTarjetasQard } from "./src/lib/qardPrint.js";

async function main() {
  await generarPdfTarjetasQard("5226030000000104", "12/99", "Juan");
}

main().catch(console.error);
