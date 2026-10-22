import fs from "node:fs/promises";
import JSZip from "jszip";

const input = "/home/maelmahf/Desktop/coditent/outputs/coditent-backend-presentation-team-handoff.pptx";
const output = "/home/maelmahf/Desktop/coditent/outputs/coditent-backend-presentation-team-handoff-transitions.pptx";

const zip = await JSZip.loadAsync(await fs.readFile(input));
const slideNames = Object.keys(zip.files)
  .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]));

const transition = '<p:transition spd="med" advClick="1"><p:fade/></p:transition>';

for (const name of slideNames) {
  let xml = await zip.file(name).async("string");
  xml = xml
    .replace(/<p:transition\b[^>]*\/>/g, "")
    .replace(/<p:transition\b[\s\S]*?<\/p:transition>/g, "");

  if (xml.includes("<p:timing")) {
    xml = xml.replace("<p:timing", `${transition}<p:timing`);
  } else if (xml.includes("<p:extLst")) {
    xml = xml.replace("<p:extLst", `${transition}<p:extLst`);
  } else {
    xml = xml.replace("</p:sld>", `${transition}</p:sld>`);
  }
  zip.file(name, xml);
}

const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
await fs.writeFile(output, bytes, { flag: "wx" });
console.log(JSON.stringify({ output, slidesWithFadeTransition: slideNames.length }));
