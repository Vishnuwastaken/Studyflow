export async function readFileText(file){
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if(ext === 'pdf'){
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data:buf }).promise;
    let text = '';
    for(let i=1;i<=pdf.numPages;i++){
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map(it => it.str).join(' ') + '\n';
    }
    return text;
  }
  if(ext === 'docx'){
    const buf = await file.arrayBuffer();
    const res = await mammoth.extractRawText({ arrayBuffer:buf });
    return res.value || '';
  }
  return file.text();
}

export function extractLinks(text){
  const matches = text.match(/https?:\/\/[^\s)]+/gi) || [];
  return [...new Set(matches)].slice(0, 25);
}
