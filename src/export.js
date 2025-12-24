const ExcelJS = require("exceljs");
const PDFDocument = require("pdfkit");
const fs = require("fs");

const HEADERS = ["Complaint No","Created At","Name","Mobile","Location","Department","Product","Serial No","Status","Completed At"];

async function exportExcel(filePath, rows) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Complaints");
  ws.addRow(HEADERS);
  rows.forEach(r => ws.addRow(r));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach(col => { col.width = 18; });
  await wb.xlsx.writeFile(filePath);
}

async function exportPdf(filePath, title, rows) {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 20 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(18).text(title);
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("gray").text(`Generated: ${new Date().toISOString().slice(0,19).replace("T"," ")}`);
  doc.moveDown(1);
  doc.fillColor("black");

  // Simple table (lightweight)
  doc.fontSize(8);
  doc.text(HEADERS.join(" | "));
  doc.moveDown(0.5);
  rows.forEach(r => doc.text(r.join(" | ")));

  doc.end();

  await new Promise((res, rej) => {
    stream.on("finish", res);
    stream.on("error", rej);
  });
}

module.exports = { exportExcel, exportPdf, HEADERS };
