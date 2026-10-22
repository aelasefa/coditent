import fs from "node:fs/promises";
import { FileBlob, PresentationFile } from "@oai/artifact-tool";

const input = process.argv[2];
const output = process.argv[3];
const p = await PresentationFile.importPptx(await FileBlob.load(input));
await fs.mkdir(output, { recursive: true });
const inspection = await p.inspect({
  kind: "slide,textbox,shape,image,table,chart,notes,layout",
  maxChars: 80000,
});
await fs.writeFile(`${output}/inspection.ndjson`, inspection.ndjson);
const montage = await p.export({ format: "webp", montage: true });
await fs.writeFile(`${output}/montage.webp`, new Uint8Array(await montage.arrayBuffer()));
for (const [index, slide] of p.slides.items.entries()) {
  const png = await p.export({ slide, format: "png", scale: 1 });
  await fs.writeFile(`${output}/slide-${String(index + 1).padStart(2, "0")}.png`, new Uint8Array(await png.arrayBuffer()));
}
console.log(JSON.stringify({ slides: p.slides.items.length, size: p.slideSize }));
