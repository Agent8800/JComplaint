const HEADERS = ["Complaint No","Created At","Name","Mobile","Location","Department","Product","Serial No","Status","Completed At"];

const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];

let selectedNo = null;
let currentList = [];
let currentReport = [];

function qs(id){ return document.getElementById(id); }

function setTab(name){
  document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("active", p.id === name));
}

document.querySelectorAll(".tab").forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

function renderTable(el, items){
  selectedNo = null;
  el.innerHTML = `
    <thead><tr>${HEADERS.map(h => `<th>${h}</th>`).join("")}</tr></thead>
    <tbody>
      ${items.map(x => `
        <tr data-no="${x.complaint_no}">
          <td>${x.complaint_no}</td>
          <td>${x.created_at}</td>
          <td>${x.name}</td>
          <td>${x.mobile}</td>
          <td>${x.location}</td>
          <td>${x.department}</td>
          <td>${x.product}</td>
          <td>${x.serial_no}</td>
          <td>${x.status}</td>
          <td>${x.completed_at || ""}</td>
        </tr>`).join("")}
    </tbody>
  `;

  el.querySelectorAll("tbody tr").forEach(tr => {
    tr.addEventListener("click", () => {
      el.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
      tr.classList.add("selected");
      selectedNo = tr.dataset.no;
    });
  });
}

async function refreshList(){
  const status = qs("f_status").value;
  const from = qs("f_from").value || null;
  const to = qs("f_to").value || null;
  const search = qs("f_search").value || "";
  currentList = await window.api.listComplaints({ status, from, to, search });
  renderTable(qs("tbl"), currentList);
}

async function refreshReport(){
  const year = parseInt(qs("r_year").value, 10);
  const month = qs("r_month").selectedIndex + 1;
  const status = qs("r_status").value;
  const res = await window.api.monthlyReport({ year, month, status });
  currentReport = res.items;

  qs("summary").textContent =
    `Summary ${year}-${String(month).padStart(2,"0")}: Pending=${res.pending} Completed=${res.completed} Total=${res.items.length}`;

  renderTable(qs("rtbl"), currentReport);
}

function rowsForExport(items){
  return items.map(x => [
    x.complaint_no, x.created_at, x.name, x.mobile, x.location,
    x.department, x.product, x.serial_no, x.status, x.completed_at || ""
  ]);
}

qs("saveNew").addEventListener("click", async () => {
  const payload = {
    name: qs("name").value,
    mobile: qs("mobile").value,
    location: qs("location").value,
    department: qs("department").value,
    product: qs("product").value,
    serial_no: qs("serial_no").value,
    details: qs("details").value
  };
  const res = await window.api.createComplaint(payload);
  alert("Saved.\nComplaint No:\n" + res.complaint_no);

  ["name","mobile","location","department","product","serial_no","details"].forEach(id => qs(id).value = "");
  await refreshList();
  await refreshReport();
});

qs("apply").addEventListener("click", refreshList);

qs("toggle").addEventListener("click", async () => {
  if (!selectedNo) return alert("Select a complaint row first.");
  const item = currentList.find(x => x.complaint_no === selectedNo);
  if (!item) return;

  const newStatus = item.status === "Pending" ? "Completed" : "Pending";
  await window.api.updateComplaint({
    ...item,
    complaint_no: item.complaint_no,
    status: newStatus
  });

  await refreshList();
  await refreshReport();
});

qs("edit").addEventListener("click", async () => {
  if (!selectedNo) return alert("Select a complaint row first.");
  const item = currentList.find(x => x.complaint_no === selectedNo);
  if (!item) return;

  const name = prompt("Edit Name:", item.name);
  if (name === null) return;
  item.name = name.trim();

  await window.api.updateComplaint(item);
  await refreshList();
  await refreshReport();
});

qs("expXlsx").addEventListener("click", async () => {
  const rows = rowsForExport(currentList);
  const res = await window.api.exportExcel({ rows, defaultName: "complaints_export" });
  if (res.ok) alert("Excel exported:\n" + res.filePath);
});
qs("expPdf").addEventListener("click", async () => {
  const rows = rowsForExport(currentList);
  const res = await window.api.exportPdf({ rows, title: "Complaints Export", defaultName: "complaints_export" });
  if (res.ok) alert("PDF exported:\n" + res.filePath);
});

qs("gen").addEventListener("click", refreshReport);
qs("rXlsx").addEventListener("click", async () => {
  const rows = rowsForExport(currentReport);
  const res = await window.api.exportExcel({ rows, defaultName: "monthly_report" });
  if (res.ok) alert("Excel exported:\n" + res.filePath);
});
qs("rPdf").addEventListener("click", async () => {
  const rows = rowsForExport(currentReport);
  const res = await window.api.exportPdf({ rows, title: "Monthly Report", defaultName: "monthly_report" });
  if (res.ok) alert("PDF exported:\n" + res.filePath);
});

(function init(){
  // Month dropdown
  const m = qs("r_month");
  months.forEach((x, i) => {
    const opt = document.createElement("option");
    opt.textContent = x;
    opt.value = String(i+1);
    m.appendChild(opt);
  });

  const now = new Date();
  qs("r_month").selectedIndex = now.getMonth();
  qs("r_year").value = String(now.getFullYear());

  // default filters
  const from = new Date(now);
  from.setMonth(from.getMonth() - 1);
  qs("f_from").value = from.toISOString().slice(0,10);
  qs("f_to").value = now.toISOString().slice(0,10);

  refreshList();
  refreshReport();
})();
