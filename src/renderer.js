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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function monthToYYYYMM(value) {
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
  return `<span class="${cls}">${escapeHtml(status)}</span>`;
}

// ---------------- Register ----------------
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

// ---------------- Reports ----------------
const monthPick = $("monthPick");
const statusPick = $("statusPick");
const locationPick = $("locationPick");
const btnLoad = $("btnLoad");
const btnExportXlsx = $("btnExportXlsx");
const btnExportPdf = $("btnExportPdf");
const summary = $("summary");
const reportBody = $("reportBody");
const reportMsg = $("reportMsg");

let lastRowsById = new Map();

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

  lastRowsById = new Map(res.rows.map(r => [String(r.id), r]));

  summary.textContent =
    `Total: ${res.summary.total}   |   Pending: ${res.summary.pending}   |   Complete: ${res.summary.complete}`;

  reportBody.innerHTML = res.rows.map(r => {
    const toggleTo = r.status === "Pending" ? "Complete" : "Pending";
    const problemFull = r.problem || "";
    const problemShort = problemFull.length > 60 ? problemFull.slice(0, 60) + "..." : problemFull;

    return `
      <tr>
        <td>${escapeHtml(r.complaint_no)}</td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.mobile)}</td>
        <td>${escapeHtml(r.location)}</td>
        <td>${escapeHtml(r.department)}</td>
        <td>${escapeHtml(r.product)}</td>
        <td>${escapeHtml(r.serial_number)}</td>
        <td title="${escapeHtml(problemFull)}">${escapeHtml(problemShort)}</td>
        <td>${badge(r.status)}</td>
        <td>${escapeHtml(fmtDate(r.created_at))}</td>
        <td style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btn" data-action="toggle" data-id="${r.id}" data-next="${toggleTo}">Mark ${escapeHtml(toggleTo)}</button>
          <button class="btn" data-action="edit" data-id="${r.id}">Edit</button>
        </td>
      </tr>
    `;
  }).join("");

  reportBody.querySelectorAll("button[data-action]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.getAttribute("data-id");
      const action = btn.getAttribute("data-action");

      if (action === "toggle") {
        const next = btn.getAttribute("data-next");
        const u = await window.api.updateStatus({ id: Number(id), status: next });
        if (!u.ok) reportMsg.textContent = "Update failed.";
        await loadReport();
      }

      if (action === "edit") {
        openEditModal(id);
      }
    });
  });
}

btnLoad.addEventListener("click", loadReport);

btnExportXlsx.addEventListener("click", async () => {
  const monthYYYYMM = monthToYYYYMM(monthPick.value);
  if (!monthYYYYMM) return (reportMsg.textContent = "Select a month to export.");

  const res = await window.api.exportXlsx({
    monthYYYYMM,
    status: statusPick.value,
    location: locationPick.value
  });

  reportMsg.textContent = res.ok ? `Exported: ${res.filePath}` : (res.message || "Export failed");
});

btnExportPdf.addEventListener("click", async () => {
  const monthYYYYMM = monthToYYYYMM(monthPick.value);
  if (!monthYYYYMM) return (reportMsg.textContent = "Select a month to export.");

  const res = await window.api.exportPdf({
    monthYYYYMM,
    status: statusPick.value,
    location: locationPick.value
  });

  reportMsg.textContent = res.ok ? `Exported: ${res.filePath}` : (res.message || "Export failed");
});

// ---------------- Edit Modal ----------------
const modal = $("modal");
const btnCloseModal = $("btnCloseModal");
const editForm = $("editForm");
const editMsg = $("editMsg");
const editComplaintNo = $("editComplaintNo");

function openEditModal(id) {
  editMsg.textContent = "";
  const r = lastRowsById.get(String(id));
  if (!r) return;

  editComplaintNo.textContent = r.complaint_no;

  editForm.elements["id"].value = r.id;
  editForm.elements["name"].value = r.name;
  editForm.elements["mobile"].value = r.mobile;
  editForm.elements["product"].value = r.product;
  editForm.elements["serial_number"].value = r.serial_number;
  editForm.elements["status"].value = r.status;
  editForm.elements["problem"].value = r.problem || "";

  modal.classList.remove("hidden");
}

function closeEditModal() {
  modal.classList.add("hidden");
}

btnCloseModal.addEventListener("click", closeEditModal);
modal.addEventListener("click", (e) => {
  if (e.target === modal) closeEditModal();
});

editForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  editMsg.textContent = "Saving...";

  const fd = new FormData(editForm);
  const payload = Object.fromEntries(fd.entries());
  payload.id = Number(payload.id);

  const res = await window.api.updateComplaint(payload);
  if (!res.ok) {
    editMsg.textContent = res.message || "Failed to save";
    return;
  }

  editMsg.textContent = "Saved.";
  await loadReport();
  closeEditModal();
});

// Default month = current month
(function initMonth() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  monthPick.value = `${yyyy}-${mm}`;
})();
