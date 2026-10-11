const state = { customers: [], items: [], quantities: [], units: [], bills: [], history: [] };
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
const byId = (id) => document.getElementById(id);
const MIN_UI_SCALE = 0.8;
const MAX_UI_SCALE = 1.4;
const UI_SCALE_STEP = 0.1;
const savedTheme = localStorage.getItem("hisaab-theme");
document.documentElement.dataset.theme = savedTheme === "light" ? "light" : "dark";
let toastTimer;
let editingRecord;
let editingBillId = null;
let editingReturnDate = "";
let pendingBillDeleteId = null;
let editingMasterRecord = null;
let pendingMasterDelete = null;

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("hisaab-theme", theme);
  const lightTheme = theme === "light";
  byId("theme-toggle").textContent = lightTheme ? "☾" : "☀";
  byId("theme-toggle").setAttribute(
    "aria-label",
    `Switch to ${lightTheme ? "dark" : "light"} theme`,
  );
  byId("theme-toggle").title = `Switch to ${lightTheme ? "dark" : "light"} theme`;
}

function setUiScale(scale) {
  const normalizedScale = Math.min(
    MAX_UI_SCALE,
    Math.max(MIN_UI_SCALE, Math.round(scale * 10) / 10),
  );
  document.documentElement.style.zoom = `${normalizedScale * 100}%`;
  localStorage.setItem("hisaab-ui-scale", normalizedScale.toFixed(1));
  byId("font-decrease").disabled = normalizedScale <= MIN_UI_SCALE;
  byId("font-increase").disabled = normalizedScale >= MAX_UI_SCALE;
  byId("font-decrease").title = `Font chhota karein (current ${Math.round(normalizedScale * 100)}%)`;
  byId("font-increase").title = `Font bada karein (current ${Math.round(normalizedScale * 100)}%)`;
  byId("font-decrease").setAttribute(
    "aria-label",
    `Font chhota karein, current ${Math.round(normalizedScale * 100)}%`,
  );
  byId("font-increase").setAttribute(
    "aria-label",
    `Font bada karein, current ${Math.round(normalizedScale * 100)}%`,
  );
  return normalizedScale;
}

const storedUiScale = Number(localStorage.getItem("hisaab-ui-scale"));
let uiScale = setUiScale(Number.isFinite(storedUiScale) && storedUiScale > 0
  ? storedUiScale
  : 1);
byId("font-decrease").addEventListener("click", () => {
  uiScale = setUiScale(uiScale - UI_SCALE_STEP);
});
byId("font-increase").addEventListener("click", () => {
  uiScale = setUiScale(uiScale + UI_SCALE_STEP);
});

byId("theme-toggle").addEventListener("click", () => {
  setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
});
setTheme(document.documentElement.dataset.theme);

function showToast(message, isError = false) {
  const toast = byId("toast");
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const contentType = response.headers.get("content-type") || "";
  const result = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) throw new Error(result?.error || "Request poori nahi ho saki.");
  return result;
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function fillSelect(select, entries, placeholder, getLabel) {
  const previous = select.value;
  select.replaceChildren(option("", placeholder));
  entries.forEach((entry) => select.add(option(String(entry.id), getLabel(entry))));
  if (entries.some((entry) => String(entry.id) === previous)) select.value = previous;
}

function renderMasters() {
  byId("customer-count").textContent = `${state.customers.length} ${state.customers.length === 1 ? "customer" : "customers"}`;
  byId("item-count").textContent = `${state.items.length} ${state.items.length === 1 ? "item" : "items"}`;
  fillSelect(byId("customer-select"), state.customers, "Customer chunein", (customer) => customer.name);
  fillSelect(byId("history-customer"), state.customers, "Saare customers", (customer) => customer.name);
  renderMasterRecords("customer-list", state.customers, "customers", (customer) => customer.name);
  renderMasterRecords("item-list", state.items, "items", (item) => item.name);
  renderMasterRecords("quantity-list", state.quantities, "quantities", (quantity) => quantity.value);
  renderMasterRecords("unit-list", state.units, "units", (unit) => unit.name);
  document.querySelectorAll(".item-select").forEach((select) => {
    const selectedValue = select.value;
    const selectedOption = select.selectedOptions[0];
    const snapshotName = selectedValue.startsWith("snapshot:")
      ? selectedOption?.textContent
      : null;
    fillSelect(select, state.items, "Item chunein", (item) => item.name);
    if (snapshotName && !state.items.some((item) => String(item.id) === selectedValue)) {
      select.add(option(selectedValue, snapshotName));
      select.value = selectedValue;
    }
    updateRowOptions(select);
  });
  document.querySelectorAll(".unit-select").forEach((select) => {
    const selectedValue = select.value;
    const selectedOption = select.selectedOptions[0];
    const snapshotName = selectedValue.startsWith("snapshot:")
      ? selectedOption?.textContent
      : null;
    fillSelect(select, state.units, "Unit chunein", (unit) => unit.name);
    if (snapshotName && !state.units.some((unit) => String(unit.id) === selectedValue)) {
      select.add(option(selectedValue, snapshotName));
      select.value = selectedValue;
    }
  });
  updateBillEntryState();
}

function renderMasterRecords(id, records, type, getValue) {
  const list = byId(id);
  list.replaceChildren();
  records.forEach((record) => {
    const row = document.createElement("div");
    row.className = "master-record";
    const value = document.createElement("span");
    value.className = "master-record-value";
    value.textContent = getValue(record);
    const actions = document.createElement("div");
    actions.className = "master-record-actions";
    const edit = document.createElement("button");
    edit.className = "text-action";
    edit.type = "button";
    edit.textContent = "Edit";
    edit.addEventListener("click", () => {
      if (type === "quantities") {
        openEditDialog(type, record, getValue(record));
      } else {
        editMasterRecord(type, record);
      }
    });
    const remove = document.createElement("button");
    remove.className = "text-action delete-action";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.addEventListener("click", () => deleteMasterRecord(type, record));
    actions.append(edit, remove);
    row.append(value, actions);
    list.append(row);
  });
}

function openEditDialog(type, record, currentValue) {
  editingRecord = { type, id: record.id };
  byId("edit-title").textContent = `Edit ${type === "quantities" ? "quantity" : type === "units" ? "unit" : type.slice(0, -1)}`;
  byId("edit-label").textContent = type === "quantities" ? "Quantity" : "Hindi name";
  byId("edit-value").value = currentValue;
  byId("edit-value").inputMode = type === "quantities" ? "decimal" : "text";
  byId("edit-value").maxLength = type === "units" ? 30 : 120;
  byId("edit-dialog").showModal();
}

async function deleteMasterRecord(type, record) {
  const label = type === "quantities" ? record.value : record.name;
  pendingMasterDelete = { type, id: record.id };
  byId("delete-master-message").textContent = `"${label}" ko delete karna chahte hain?`;
  byId("delete-master-dialog").showModal();
}

byId("cancel-delete-master").addEventListener("click", () => {
  pendingMasterDelete = null;
  byId("delete-master-dialog").close();
});

byId("delete-master-dialog").addEventListener("close", () => {
  pendingMasterDelete = null;
});

byId("delete-master-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!pendingMasterDelete) return;
  const { type, id } = pendingMasterDelete;
  const confirmButton = byId("confirm-delete-master");
  confirmButton.disabled = true;
  try {
    await request(`/api/${type}/${id}`, { method: "DELETE" });
    if (editingMasterRecord?.type === type && editingMasterRecord.id === id) {
      cancelMasterEdit(type);
    }
    pendingMasterDelete = null;
    byId("delete-master-dialog").close();
    await refreshData();
    if (!byId("page-bill-history").hidden) await loadHistory();
    showToast("Data delete ho gaya.");
  } catch (error) {
    showToast(error.message, true);
  } finally {
    confirmButton.disabled = false;
  }
});

function masterFormFields(type) {
  return {
    customers: {
      form: byId("customer-form"),
      english: byId("customer-name"),
      hindi: byId("customer-name-hindi"),
      submit: byId("customer-submit"),
    },
    items: {
      form: byId("item-form"),
      english: byId("item-name"),
      hindi: byId("item-name-hindi"),
      submit: byId("item-submit"),
    },
    units: {
      form: byId("unit-form"),
      english: byId("unit-name"),
      hindi: byId("unit-name-hindi"),
      submit: byId("unit-submit"),
    },
  }[type];
}

function editMasterRecord(type, record) {
  const fields = masterFormFields(type);
  if (editingMasterRecord?.type === type && editingMasterRecord.id === record.id) {
    cancelMasterEdit(type);
    return;
  }
  if (editingMasterRecord) cancelMasterEdit(editingMasterRecord.type);
  editingMasterRecord = { type, id: record.id };
  fields.english.value = record.english_name || "";
  fields.hindi.value = record.name;
  fields.hindi.dataset.edited = "true";
  fields.submit.textContent = "✓";
  fields.submit.setAttribute("aria-label", `${type.slice(0, -1)} changes save karein`);
  fields.submit.title = "Changes save karein";
  fields.form.scrollIntoView({ behavior: "smooth", block: "center" });
  fields.english.focus();
}

function cancelMasterEdit(type) {
  const fields = masterFormFields(type);
  if (!fields) return;
  fields.form.reset();
  fields.hindi.dataset.edited = "";
  fields.submit.textContent = "＋";
  fields.submit.setAttribute("aria-label", `${type.slice(0, -1)} add karein`);
  fields.submit.title = `Add ${type.slice(0, -1)}`;
  if (editingMasterRecord?.type === type) editingMasterRecord = null;
}

async function saveMasterForm(type) {
  const fields = masterFormFields(type);
  const isEditing = editingMasterRecord?.type === type;
  const url = isEditing
    ? `/api/${type}/${editingMasterRecord.id}`
    : `/api/${type}`;
  try {
    await request(url, {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify({
        english_name: fields.english.value,
        name: fields.hindi.value,
      }),
    });
    cancelMasterEdit(type);
    await refreshData();
    showToast(isEditing ? "Data update ho gaya." : "Data add ho gaya.");
  } catch (error) {
    showToast(error.message, true);
  }
}

async function loadHistory() {
  const params = new URLSearchParams();
  if (byId("history-customer").value) params.set("customer_id", byId("history-customer").value);
  if (byId("history-from").value) params.set("from", byId("history-from").value);
  if (byId("history-to").value) params.set("to", byId("history-to").value);
  state.history = await request(`/api/history?${params.toString()}`);
  renderHistory();
}

function formatHistoryDate(value) {
  const [year, month, day] = value.split("-");
  return `${day}-${month}-${year}`;
}

function renderHistory() {
  const body = byId("history-rows");
  body.replaceChildren();
  byId("history-total").textContent = `${state.history.length} ${state.history.length === 1 ? "bill" : "bills"}`;
  byId("history-empty").hidden = state.history.length > 0;
  state.history.forEach((bill) => {
    const row = body.insertRow();
    [bill.id, formatHistoryDate(bill.date), bill.customer_name, bill.item_count, currency.format(bill.total)].forEach((value) => {
      const cell = row.insertCell();
      cell.textContent = value;
    });
    const exportCell = row.insertCell();
    const link = document.createElement("a");
    link.className = "record-export";
    link.href = `/api/bills/${bill.id}/export`;
    link.setAttribute("aria-label", `Bill #${bill.id} Excel download karein`);
    link.innerHTML = "<span aria-hidden=\"true\">↧</span> Excel";
    exportCell.append(link);
    const deleteCell = row.insertCell();
    const remove = document.createElement("button");
    remove.className = "record-delete";
    remove.type = "button";
    remove.textContent = "Delete";
    remove.setAttribute("aria-label", `Bill #${bill.id} delete karein`);
    remove.addEventListener("click", () => confirmDeleteBill(bill));
    deleteCell.append(remove);
  });
}

function confirmDeleteBill(bill) {
  pendingBillDeleteId = bill.id;
  byId("delete-bill-message").textContent =
    `Bill #${bill.id} (${bill.customer_name}, ${bill.date}) delete karna chahte hain?`;
  byId("delete-bill-dialog").showModal();
}

byId("cancel-delete-bill").addEventListener("click", () => {
  pendingBillDeleteId = null;
  byId("delete-bill-dialog").close();
});

byId("delete-bill-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (pendingBillDeleteId === null) return;
  const billId = pendingBillDeleteId;
  const confirmButton = byId("confirm-delete-bill");
  confirmButton.disabled = true;
  try {
    await request(`/api/bills/${billId}`, { method: "DELETE" });
    pendingBillDeleteId = null;
    byId("delete-bill-dialog").close();
    await refreshData();
    showToast(`Bill #${billId} delete ho gaya.`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    confirmButton.disabled = false;
  }
});

function showPage(pageName, updateHash = true) {
  const selected = document.querySelector(`[data-page="${pageName}"]`)
    ? pageName
    : "new-bill";
  document.querySelectorAll(".app-page").forEach((page) => {
    page.hidden = page.dataset.page !== selected;
  });
  document.querySelectorAll("[data-page-link]").forEach((link) => {
    const active = link.dataset.pageLink === selected;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  byId("breadcrumb-page").textContent = ({
    "new-bill": "New Bill",
    "manage-data": "Manage Data",
    "bill-history": "Bill History",
  })[selected];
  if (updateHash && window.location.hash !== `#${selected}`) {
    window.location.hash = selected;
  }
  if (selected === "bill-history") loadHistory().catch((error) => showToast(error.message, true));
}

function makeSelect(className, placeholder) {
  const select = document.createElement("select");
  select.className = className;
  select.setAttribute("aria-label", placeholder);
  select.add(option("", placeholder));
  return select;
}

function unitPriceFactor(unitName) {
  const normalized = unitName.trim().toLocaleLowerCase().replace(/[\s._-]+/g, "");
  return [
    "g", "gm", "gms", "gram", "grams", "ग्राम", "ग्राम्स", "ग्रा", "ग्र",
  ].includes(normalized)
    ? 0.001
    : 1;
}

function updateBillEntryState() {
  const enabled = Boolean(byId("customer-select").value) || editingBillId !== null;
  document.querySelectorAll("#bill-rows .item-select, #bill-rows .quantity-select, #bill-rows .unit-select, #bill-rows .remove-row")
    .forEach((control) => { control.disabled = !enabled; });
  document.querySelectorAll("#bill-rows tr").forEach((row) => {
    const unitSelect = row.querySelector(".unit-select");
    row.querySelector(".price-input").disabled = !enabled || !unitSelect.value;
  });
  byId("add-row").disabled = !enabled;
  byId("save-bill").disabled = !enabled;
}

function addBillRow() {
  const row = document.createElement("tr");
  const itemCell = row.insertCell();
  const quantityCell = row.insertCell();
  const unitCell = row.insertCell();
  const priceCell = row.insertCell();
  const totalCell = row.insertCell();
  const removeCell = row.insertCell();

  const itemSelect = makeSelect("item-select", "Item chunein");
  itemSelect.addEventListener("change", () => {
    delete row.dataset.itemName;
    updateRowOptions(itemSelect);
    calculateTotal();
  });
  const quantitySelect = makeSelect("quantity-select", "Qty");
  quantitySelect.addEventListener("change", () => {
    delete row.dataset.quantity;
    calculateTotal();
  });
  const unitSelect = makeSelect("unit-select", "Unit chunein");
  const priceInput = document.createElement("input");
  priceInput.className = "price-input";
  priceInput.type = "number";
  priceInput.min = "0";
  priceInput.step = "0.01";
  priceInput.inputMode = "decimal";
  priceInput.placeholder = "₹ / kg";
  priceInput.setAttribute("aria-label", "Price per kg");
  priceInput.addEventListener("input", calculateTotal);
  unitSelect.addEventListener("change", () => {
    if (!unitSelect.value) priceInput.value = "";
    updateBillEntryState();
    calculateTotal();
  });
  const amount = document.createElement("span");
  amount.className = "line-amount";
  amount.textContent = currency.format(0);
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "remove-row";
  remove.textContent = "×";
  remove.title = "Item hataayein";
  remove.setAttribute("aria-label", "Item hataayein");
  remove.addEventListener("click", () => {
    if (byId("bill-rows").rows.length === 1) {
      itemSelect.value = "";
      delete row.dataset.itemName;
      delete row.dataset.quantity;
      quantitySelect.value = "";
      unitSelect.value = "";
      priceInput.value = "";
      updateRowOptions(itemSelect);
      updateBillEntryState();
    } else {
      row.remove();
    }
    calculateTotal();
  });

  itemCell.append(itemSelect);
  quantityCell.append(quantitySelect);
  unitCell.append(unitSelect);
  priceCell.append(priceInput);
  totalCell.append(amount);
  removeCell.append(remove);
  row.dataset.amount = "0";
  byId("bill-rows").append(row);
  fillSelect(itemSelect, state.items, "Item chunein", (item) => item.name);
  fillSelect(unitSelect, state.units, "Unit chunein", (unit) => unit.name);
  updateRowOptions(itemSelect);
  updateBillEntryState();
}

function updateRowOptions(itemSelect) {
  const row = itemSelect.closest("tr");
  const quantitySelect = row.querySelector(".quantity-select");
  fillSelect(quantitySelect, state.quantities, "Qty", (quantity) => quantity.value);
  calculateTotal();
}

function calculateTotal() {
  let total = 0;
  document.querySelectorAll("#bill-rows tr").forEach((row) => {
    const quantity = state.quantities.find((entry) => String(entry.id) === row.querySelector(".quantity-select").value);
    const quantityValue = Number(quantity?.value ?? row.dataset.quantity);
    const unitSelect = row.querySelector(".unit-select");
    const unit = unitSelect.value ? unitSelect.selectedOptions[0]?.textContent || "" : "";
    const price = Number(row.querySelector(".price-input").value);
    const amount = unit && Number.isFinite(quantityValue) && quantityValue > 0
      && Number.isFinite(price) && price >= 0
      ? Math.round(quantityValue * price * unitPriceFactor(unit) * 100) / 100
      : 0;
    row.dataset.amount = String(amount);
    row.querySelector(".line-amount").textContent = currency.format(amount);
    total += amount;
  });
  byId("bill-total").textContent = currency.format(total);
}

function renderBills() {
  const list = byId("bill-list");
  list.replaceChildren();
  if (!state.bills.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const icon = document.createElement("span");
    icon.className = "empty-icon";
    icon.textContent = "▤";
    const title = document.createElement("strong");
    title.textContent = "Abhi koi bill nahi";
    const note = document.createElement("span");
    note.textContent = "Pehla bill save karte hi yahan dikhega.";
    empty.append(icon, title, note);
    list.append(empty);
  } else {
    state.bills.forEach((bill) => {
      const record = document.createElement("div");
      record.className = "bill-record";
      const main = document.createElement("div");
      main.className = "record-main";
      const name = document.createElement("span");
      name.className = "record-name";
      name.textContent = bill.customer_name;
      const meta = document.createElement("span");
      meta.className = "record-meta";
      meta.textContent = `Bill #${bill.id} · ${new Date(bill.created_at.replace(" ", "T") + "Z").toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
      const total = document.createElement("span");
      total.className = "record-total";
      total.textContent = currency.format(bill.total);
      const edit = document.createElement("button");
      edit.className = "record-edit";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => editBill(bill.id));
      main.append(name, meta);
      const actions = document.createElement("div");
      actions.className = "record-actions";
      actions.append(total, edit);
      record.append(main, actions);
      list.append(record);
    });
  }
  const revenue = state.bills.reduce((sum, bill) => sum + bill.total, 0);
  byId("bill-count").textContent = state.bills.length;
  byId("day-total").textContent = currency.format(revenue);
  byId("history-count").textContent = `${state.bills.length} ${state.bills.length === 1 ? "bill" : "bills"}`;
}

async function editBill(billId) {
  try {
    const bill = await request(`/api/bills/${billId}`);
    editingBillId = bill.id;
    editingReturnDate = byId("bill-date").value;
    byId("bill-date").value = bill.date;
    byId("customer-select").value = bill.customer_id ? String(bill.customer_id) : "";
    byId("customer-select").disabled = true;
    byId("bill-title").textContent = `Edit bill #${bill.id}`;
    byId("clear-bill").textContent = "Cancel";
    byId("save-bill").querySelector("span:first-child").textContent = "Changes save karein";
    byId("bill-rows").replaceChildren();

    bill.items.forEach((billItem) => {
      addBillRow();
      const row = byId("bill-rows").lastElementChild;
      const itemSelect = row.querySelector(".item-select");
      const existingItem = state.items.find((item) => String(item.id) === String(billItem.item_id));
      if (existingItem) {
        itemSelect.value = String(billItem.item_id);
      } else {
        const snapshotItem = option(`snapshot:${billItem.item_name}`, billItem.item_name);
        itemSelect.add(snapshotItem);
        itemSelect.value = snapshotItem.value;
        row.dataset.itemName = billItem.item_name;
      }

      const quantitySelect = row.querySelector(".quantity-select");
      const existingQuantity = state.quantities.find((quantity) => quantity.value === String(billItem.quantity));
      if (existingQuantity) {
        quantitySelect.value = String(existingQuantity.id);
      } else {
        const snapshotQuantity = option(`snapshot:${billItem.quantity}`, billItem.quantity);
        quantitySelect.add(snapshotQuantity);
        quantitySelect.value = snapshotQuantity.value;
        row.dataset.quantity = String(billItem.quantity);
      }
      const unitSelect = row.querySelector(".unit-select");
      const existingUnit = state.units.find((unit) => unit.name === billItem.unit);
      if (existingUnit) {
        unitSelect.value = String(existingUnit.id);
      } else if (billItem.unit) {
        const snapshotUnit = option(`snapshot:${billItem.unit}`, billItem.unit);
        unitSelect.add(snapshotUnit);
        unitSelect.value = snapshotUnit.value;
      }
      row.querySelector(".price-input").value = String(billItem.price);
    });

    byId("draft-tag").lastChild.textContent = " Editing";
    updateBillEntryState();
    calculateTotal();
  } catch (error) {
    showToast(error.message, true);
  }
}

function cancelBillEdit() {
  editingBillId = null;
  byId("customer-select").disabled = false;
  byId("customer-select").value = "";
  byId("bill-date").value = editingReturnDate || localToday;
  editingReturnDate = "";
  byId("bill-title").textContent = "Naya bill";
  byId("clear-bill").textContent = "Clear";
  byId("save-bill").querySelector("span:first-child").textContent = "Bill save karein";
  byId("draft-tag").lastChild.textContent = " Draft";
  byId("bill-rows").replaceChildren();
  addBillRow();
  updateBillEntryState();
  calculateTotal();
}

async function refreshData() {
  const data = await request(`/api/bootstrap?date=${encodeURIComponent(byId("bill-date").value)}`);
  state.customers = data.customers;
  state.items = data.items;
  state.quantities = data.quantities;
  state.units = data.units;
  state.bills = data.bills;
  renderMasters();
  renderBills();
  if (!byId("page-bill-history").hidden) {
    await loadHistory();
  }
  if (!byId("bill-rows").rows.length) addBillRow();
}

async function submitForm(form, url, body, successMessage) {
  try {
    await request(url, { method: "POST", body: JSON.stringify(body) });
    form.reset();
    await refreshData();
    showToast(successMessage);
  } catch (error) {
    showToast(error.message, true);
  }
}

function bindHindiPreview(sourceId, previewId) {
  const source = byId(sourceId);
  const preview = byId(previewId);
  let timer;
  preview.addEventListener("input", () => { preview.dataset.edited = "true"; });
  source.addEventListener("input", () => {
    clearTimeout(timer);
    preview.dataset.edited = "";
    const text = source.value.trim();
    if (!text) {
      preview.value = "";
      return;
    }
    timer = setTimeout(async () => {
      try {
        const result = await request("/api/transliterate", {
          method: "POST",
          body: JSON.stringify({ text }),
        });
        if (source.value.trim() === text && !preview.dataset.edited) {
          preview.value = result.hindi;
        }
      } catch (error) {
        showToast(error.message, true);
      }
    }, 220);
  });
}

bindHindiPreview("customer-name", "customer-name-hindi");
bindHindiPreview("item-name", "item-name-hindi");
bindHindiPreview("unit-name", "unit-name-hindi");

byId("customer-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveMasterForm("customers");
});

byId("item-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveMasterForm("items");
});

byId("quantity-form").addEventListener("submit", (event) => {
  event.preventDefault();
  submitForm(event.currentTarget, "/api/quantities", { value: byId("quantity-value").value }, "Quantity option add ho gaya.");
});

byId("unit-form").addEventListener("submit", (event) => {
  event.preventDefault();
  saveMasterForm("units");
});

byId("edit-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!editingRecord) return;
  const value = byId("edit-value").value.trim();
  const body = editingRecord.type === "quantities" ? { value } : { name: value };
  try {
    await request(`/api/${editingRecord.type}/${editingRecord.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
    byId("edit-dialog").close();
    editingRecord = null;
    await refreshData();
    showToast("Data update ho gaya.");
  } catch (error) {
    showToast(error.message, true);
  }
});

byId("cancel-edit").addEventListener("click", () => byId("edit-dialog").close());
byId("cancel-edit-icon").addEventListener("click", () => byId("edit-dialog").close());
byId("history-filters").addEventListener("submit", (event) => {
  event.preventDefault();
  loadHistory().catch((error) => showToast(error.message, true));
});
byId("clear-history-filters").addEventListener("click", () => {
  byId("history-filters").reset();
  loadHistory().catch((error) => showToast(error.message, true));
});

byId("add-row").addEventListener("click", addBillRow);
byId("customer-select").addEventListener("change", updateBillEntryState);
byId("clear-bill").addEventListener("click", () => {
  if (editingBillId !== null) {
    cancelBillEdit();
    return;
  }
  byId("customer-select").value = "";
  byId("bill-rows").replaceChildren();
  addBillRow();
  updateBillEntryState();
  calculateTotal();
});

byId("save-bill").addEventListener("click", async () => {
  const customerId = byId("customer-select").value;
  const rows = [...document.querySelectorAll("#bill-rows tr")].map((row) => ({
    item_id: state.items.find((item) => String(item.id) === row.querySelector(".item-select").value)?.id ?? null,
    item_name: row.dataset.itemName || row.querySelector(".item-select").selectedOptions[0]?.textContent || "",
    quantity_id: row.querySelector(".quantity-select").value,
    quantity: state.quantities.find((quantity) => String(quantity.id) === row.querySelector(".quantity-select").value)?.value ?? row.dataset.quantity ?? "",
    unit_id: row.querySelector(".unit-select").value.startsWith("snapshot:") ? "" : row.querySelector(".unit-select").value,
    unit: row.querySelector(".unit-select").value
      ? row.querySelector(".unit-select").selectedOptions[0]?.textContent || ""
      : "",
    price: row.querySelector(".price-input").value,
  }));
  if (!customerId && editingBillId === null) return showToast("Bill save karne se pehle customer chunein.", true);
  if (!rows.length || rows.some((row) => (!row.item_id && !row.item_name) || (!row.quantity_id && !row.quantity) || (!row.unit_id && !row.unit) || row.price === "")) {
    return showToast("Har bill row mein item, quantity, unit aur price bharein.", true);
  }
  const button = byId("save-bill");
  button.disabled = true;
  try {
    const isEditing = editingBillId !== null;
    const result = await request(isEditing ? `/api/bills/${editingBillId}` : "/api/bills", {
      method: isEditing ? "PUT" : "POST",
      body: JSON.stringify({
        ...(isEditing ? {} : { customer_id: customerId }),
        date: byId("bill-date").value,
        items: rows.map(({ item_id, item_name, quantity_id, quantity, unit_id, unit, price }) =>
          isEditing
            ? { item_id, item_name, quantity, unit_id, unit, price }
            : { item_id, quantity_id, unit_id, price }
        ),
      }),
    });
    if (isEditing) {
      editingReturnDate = byId("bill-date").value;
      cancelBillEdit();
    }
    else {
      byId("customer-select").value = "";
      byId("bill-rows").replaceChildren();
      addBillRow();
    }
    await refreshData();
    showToast(`Bill #${result.id} ${isEditing ? "update" : "save"} ho gaya · ${currency.format(result.total)}`);
  } catch (error) {
    showToast(error.message, true);
  } finally {
    updateBillEntryState();
  }
});

byId("bill-date").addEventListener("change", () => {
  refreshData().catch((error) => showToast(error.message, true));
});
document.querySelectorAll("[data-page-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(link.dataset.pageLink);
  });
});
window.addEventListener("hashchange", () => showPage(window.location.hash.slice(1), false));

let dateRefreshTimer;
function updateTodayLabel() {
  const now = new Date();
  byId("today-label").textContent = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now).replace(",", "");

  clearTimeout(dateRefreshTimer);
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  dateRefreshTimer = setTimeout(updateTodayLabel, nextMidnight.getTime() - now.getTime() + 100);
}

const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
byId("bill-date").value = localToday;
updateTodayLabel();
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateTodayLabel();
});
showPage(window.location.hash.slice(1), false);
refreshData().catch((error) => showToast(error.message, true));
