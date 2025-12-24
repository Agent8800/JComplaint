const $ = (id) => document.getElementById(id);

const tabRegister = $("tabRegister");
const tabReports = $("tabReports");
const viewRegister = $("viewRegister");
const viewReports = $("viewReports");

function show(view) {
  const isReg = view === "register";
  viewRegister.classList.toggle("hidden", !isReg);
  viewReports.classList.toggle("hidden", isReg);
  tabRegister.classList.toggle("tab--active", isReg);
  tabReports.classList.toggle("tab--active", !isReg);
}

tabRegister.addEventListener("click", () => show("register"));
tabReports.addEventListener("click", () => show("reports"));

const form = $("formComplaint");
const saveMsg = $("saveMsg");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  saveMsg.textContent = "Saving...";

  const fd = new FormData(form);
  const payload = Object.fromEntries(fd.entries());

  const res = await window.api.createComplaint(payload);
  if (!res.ok) {
    saveMsg.textContent = res.message || "Failed to save";
    return;
  }

  saveMsg.textContent = `Saved: ${res.complaint_no}`;
  form.reset();
});

// Reports
const monthPick = $("monthPick");
const statusPick = $("statusPick");
const locationPick = $("locationPick");
const btnLoad = $("btnLoad");
const btnExport = $("btnExport");
const summary = $("summary");
const reportBody = $("reportBody");
const reportMsg = $("reportMsg");

function monthToYYYYMM(value) {
  // input type="month" gives "YYYY-MM"
  if (!value) return "";
  return value.replace("-", "");
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function badge(status) {
  const cls = status === "Complete" ? "badge badge--complete" : "badge badge--pending";
  return `<span class="${cls}">${status}</span>`;
}

async function loadReport() {
  reportMsg.textContent = "";
  reportBody.innerHTML = "";
  summary.textContent = "";

  const monthYYYYMM = monthToYYYYMM(monthPick.value);
  if (!monthYYYYMM) {
    reportMsg.textContent = "Select a month.";
    return;
  }

  const res = await window.api.listByMonth({
    monthYYYYMM,
    status: statusPick.value,
    location: locationPick.value
  });

  if (!res.ok) {
    reportMsg.textContent = res.message || "Failed to load";
    return;
  }

  summary.textContent =
    `Total: ${res.summary.total}   |   Pending: ${res.summary.pending}   |   Complete: ${res.summary.complete}`;

  reportBody.innerHTML = res.rows.map(r => {
    const toggleTo = r.status === "Pending" ? "Complete" : "Pending";
    return `
      <tr>
        <td>${r.complaint_no}</td>
        <td>${r.name}</td>
        <td>${r.mobile}</td>
        <td>${r.location}</td>
        <td>${r.department}</td>
        <td>${r.product}</td>
        <td>${r.serial_number}</td>
        <td>${badge(r.status)}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td>
          <button class="btn" data-id="${r.id}" data-next="${toggleTo}">
            Mark ${toggleTo}
          </button>
        </td>
      </tr>
    `;
  }).join("");

  // attach listeners
  reportBody.querySelectorAll("button[data-id]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = Number(btn.getAttribute("data-id"));
      const next = btn.getAttribute("data-next");
      const u = await window.api.updateStatus({ id, status: next });
      if (!u.ok) {
        reportMsg.textContent = "Update failed.";
        return;
      }
      await loadReport();
    });
  });
}

btnLoad.addEventListener("click", loadReport);

btnExport.addEventListener("click", async () => {
  const monthYYYYMM = monthToYYYYMM(monthPick.value);
  if (!monthYYYYMM) {
    reportMsg.textContent = "Select a month to export.";
    return;
  }
  const res = await window.api.exportCsv({
    monthYYYYMM,
    status: statusPick.value,
    location: locationPick.value
  });
  reportMsg.textContent = res.ok ? `Exported: ${res.filePath}` : (res.message || "Export failed");
});

// default month = current month
(function initMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  monthPick.value = `${yyyy}-${mm}`;
})();
