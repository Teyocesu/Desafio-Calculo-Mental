import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempDir = '/private/tmp/desafio-calculo-mental-docx';
const outputPath = path.join(root, 'Descripcion_Funcionalidades.docx');

const screenshots = [
  ['Inicio y configuracion', '01-inicio.png'],
  ['Modo verdadero / falso', '02-juego-verdadero-falso.png'],
  ['Feedback de respuesta', '03-feedback.png'],
  ['Resultado de ronda', '04-resultado.png'],
  ['Historial y estadisticas', '05-historial.png'],
];

const escapeXml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const twip = (pt) => Math.round(pt * 20);
const emu = (inch) => Math.round(inch * 914400);

function readPngSize(buffer) {
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function runText(text, options = {}) {
  const attrs = [];
  if (options.bold) attrs.push('<w:b/>');
  if (options.color) attrs.push(`<w:color w:val="${options.color}"/>`);
  if (options.size) attrs.push(`<w:sz w:val="${twip(options.size)}"/>`);
  const props = attrs.length ? `<w:rPr>${attrs.join('')}</w:rPr>` : '';
  return `<w:r>${props}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function paragraph(text, options = {}) {
  const style = options.style ? `<w:pStyle w:val="${options.style}"/>` : '';
  const spacing = `<w:spacing w:after="${twip(options.after ?? 6)}"/>`;
  const numPr = options.bullet
    ? '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>'
    : '';
  return `<w:p><w:pPr>${style}${numPr}${spacing}</w:pPr>${runText(text, options)}</w:p>`;
}

function heading(text, level = 1) {
  return paragraph(text, { style: `Heading${level}`, after: level === 1 ? 8 : 6 });
}

function table(headers, rows) {
  const cols = headers.length;
  const colWidth = Math.floor(9360 / cols);
  const grid = headers.map(() => `<w:gridCol w:w="${colWidth}"/>`).join('');
  const cell = (value, header = false) => `
    <w:tc>
      <w:tcPr>
        <w:tcW w:w="${colWidth}" w:type="dxa"/>
        ${header ? '<w:shd w:fill="F2F4F7"/>' : ''}
        <w:tcMar>
          <w:top w:w="80" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/>
          <w:start w:w="120" w:type="dxa"/><w:end w:w="120" w:type="dxa"/>
        </w:tcMar>
      </w:tcPr>
      ${paragraph(value, { bold: header, after: 0 })}
    </w:tc>`;
  const headerRow = `<w:tr>${headers.map((item) => cell(item, true)).join('')}</w:tr>`;
  const bodyRows = rows
    .map((row) => `<w:tr>${row.map((item) => cell(item)).join('')}</w:tr>`)
    .join('');
  return `
    <w:tbl>
      <w:tblPr>
        <w:tblW w:w="9360" w:type="dxa"/>
        <w:tblInd w:w="120" w:type="dxa"/>
        <w:tblBorders>
          <w:top w:val="single" w:sz="4" w:color="9AA8B6"/>
          <w:left w:val="single" w:sz="4" w:color="9AA8B6"/>
          <w:bottom w:val="single" w:sz="4" w:color="9AA8B6"/>
          <w:right w:val="single" w:sz="4" w:color="9AA8B6"/>
          <w:insideH w:val="single" w:sz="4" w:color="9AA8B6"/>
          <w:insideV w:val="single" w:sz="4" w:color="9AA8B6"/>
        </w:tblBorders>
      </w:tblPr>
      <w:tblGrid>${grid}</w:tblGrid>
      ${headerRow}${bodyRows}
    </w:tbl>`;
}

function imageParagraph({ relId, name, widthEmu, heightEmu, docPrId }) {
  return `
    <w:p>
      <w:pPr><w:spacing w:before="${twip(4)}" w:after="${twip(12)}"/></w:pPr>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0">
            <wp:extent cx="${widthEmu}" cy="${heightEmu}"/>
            <wp:docPr id="${docPrId}" name="${escapeXml(name)}" descr="${escapeXml(name)}"/>
            <wp:cNvGraphicFramePr>
              <a:graphicFrameLocks noChangeAspect="1"/>
            </wp:cNvGraphicFramePr>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="${docPrId}" name="${escapeXml(name)}"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="${relId}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm>
                      <a:off x="0" y="0"/>
                      <a:ext cx="${widthEmu}" cy="${heightEmu}"/>
                    </a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>`;
}

async function writePackageFile(relativePath, content) {
  const fullPath = path.join(tempDir, relativePath);
  await mkdir(path.dirname(fullPath), { recursive: true });
  await writeFile(fullPath, content, 'utf8');
}

async function main() {
  await rm(tempDir, { recursive: true, force: true });
  await rm(outputPath, { force: true });
  await mkdir(path.join(tempDir, 'word', 'media'), { recursive: true });

  const imageInfo = [];
  for (let index = 0; index < screenshots.length; index += 1) {
    const [caption, file] = screenshots[index];
    const source = path.join(root, 'screenshots', file);
    const target = path.join(tempDir, 'word', 'media', file);
    const buffer = await readFile(source);
    const size = readPngSize(buffer);
    const width = emu(2.65);
    const height = Math.round(width * (size.height / size.width));
    await cp(source, target);
    imageInfo.push({
      caption,
      file,
      relId: `rId${index + 1}`,
      widthEmu: width,
      heightEmu: height,
      docPrId: index + 1,
    });
  }

  const screenshotBlocks = imageInfo
    .map(
      (item) =>
        paragraph(item.caption, { style: 'Caption', bold: true, after: 4 }) +
        imageParagraph({
          relId: item.relId,
          name: item.caption,
          widthEmu: item.widthEmu,
          heightEmu: item.heightEmu,
          docPrId: item.docPrId,
        }),
    )
    .join('');

  const body = [
    paragraph('Desafio Calculo Mental', { style: 'Title', after: 8 }),
    paragraph('Descripcion de funcionalidades implementadas y decisiones de diseno.', {
      color: '586879',
      after: 14,
    }),
    paragraph(
      'Resumen: se desarrollo una aplicacion movil en Expo + React Native + TypeScript para resolver operaciones matematicas bajo presion de tiempo, registrar desempeno y persistir estadisticas localmente.',
      { after: 12 },
    ),
    heading('Funcionalidades implementadas', 1),
    ...[
      'Configuracion de dificultad: facil, medio y dificil.',
      'Generacion aleatoria de operaciones segun dificultad.',
      'Cuatro modos de juego: clasico, verdadero/falso, multiple choice y contra reloj.',
      'Cantidad de iteraciones configurable en rondas no continuas.',
      'Timer por operacion y timer total para contra reloj.',
      'Validacion de respuestas, feedback visual y progresion automatica.',
      'Puntaje por precision y velocidad.',
      'Historial, mejores puntajes y estadisticas visuales con persistencia local.',
    ].map((item) => paragraph(item, { bullet: true, after: 4 })),
    heading('Modos de juego', 1),
    table(
      ['Modo', 'Funcionamiento', 'Validacion'],
      [
        ['Clasico', 'El usuario escribe el resultado de la operacion.', 'Compara el numero ingresado contra el resultado correcto.'],
        ['Verdadero / falso', 'Se muestra una igualdad con resultado propuesto.', 'El usuario decide si la igualdad es correcta.'],
        ['Multiple choice', 'Se presentan cuatro opciones unicas.', 'Una opcion es correcta y tres son distractores plausibles.'],
        ['Contra reloj', 'Operaciones continuas hasta fallar o agotar el tiempo total.', 'Usa respuesta directa y finaliza ante error o timeout.'],
      ],
    ),
    heading('Sistema de puntaje', 1),
    table(
      ['Evento', 'Puntos'],
      [
        ['Respuesta correcta rapida, antes del 75% del tiempo', '+100'],
        ['Respuesta correcta dentro del tiempo', '+70'],
        ['Respuesta incorrecta', '-30'],
        ['Sin respuesta o timeout', '-50'],
      ],
    ),
    heading('Arquitectura y decisiones de diseno', 1),
    ...[
      'Base tecnica: Expo Router, React Native y TypeScript para una entrega movil rapida y tipada.',
      'Motor del juego separado en src/game/engine.ts, con generacion de operaciones, calculo de tiempo y puntaje.',
      'Tipos compartidos en src/game/types.ts para dificultad, modo, operaciones, rondas y sesiones guardadas.',
      'Persistencia aislada en src/game/storage.ts usando AsyncStorage.',
      'UI en espanol, con controles tactiles, iconos, feedback animado y visualizaciones simples sin librerias externas de graficos.',
    ].map((item) => paragraph(item, { bullet: true, after: 4 })),
    heading('Persistencia local', 1),
    paragraph('La aplicacion no usa internet ni backend en tiempo de ejecucion. Los datos se guardan localmente con claves versionadas:'),
    paragraph('mentalCalc.settings.v1: ultima configuracion elegida.', { bullet: true, after: 4 }),
    paragraph('mentalCalc.sessions.v1: historial de rondas y metricas.', { bullet: true, after: 4 }),
    heading('Capturas de pantalla', 1),
    screenshotBlocks,
    heading('Pruebas realizadas', 1),
    ...[
      'npx tsc --noEmit: verificacion TypeScript sin errores.',
      'npm run lint: lint de Expo sin errores.',
      'Servidor web local en http://127.0.0.1:8082 verificado con respuesta HTTP 200.',
      'Capturas automatizadas con Chrome headless para inicio, juego, feedback, resultado e historial.',
    ].map((item) => paragraph(item, { bullet: true, after: 4 })),
  ].join('');

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document
  xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
  xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
  xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;

  const rels = imageInfo
    .map(
      (item) =>
        `<Relationship Id="${item.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.file}"/>`,
    )
    .join('');

  await writePackageFile(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`,
  );
  await writePackageFile(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`,
  );
  await writePackageFile(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rStyle" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
  ${rels}
</Relationships>`,
  );
  await writePackageFile(
    'word/styles.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/></w:rPr><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="44"/></w:rPr><w:pPr><w:spacing w:after="160"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="32"/></w:rPr><w:pPr><w:spacing w:before="320" w:after="160"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="2E74B5"/><w:sz w:val="26"/></w:rPr><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr></w:style>
  <w:style w:type="paragraph" w:styleId="Caption"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:color w:val="586879"/></w:rPr><w:pPr><w:spacing w:after="80"/></w:pPr></w:style>
</w:styles>`,
  );
  await writePackageFile(
    'word/numbering.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="1">
    <w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr></w:lvl>
  </w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`,
  );
  await writePackageFile('word/document.xml', documentXml);
  await writePackageFile(
    'docProps/core.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Desafio Calculo Mental</dc:title>
  <dc:creator>Codex</dc:creator>
  <cp:lastModifiedBy>Codex</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">2026-05-18T12:00:00Z</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">2026-05-18T12:00:00Z</dcterms:modified>
</cp:coreProperties>`,
  );
  await writePackageFile(
    'docProps/app.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Codex</Application>
</Properties>`,
  );

  execFileSync('/usr/bin/zip', ['-qr', outputPath, '.'], { cwd: tempDir, stdio: 'inherit' });
  console.log(outputPath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
