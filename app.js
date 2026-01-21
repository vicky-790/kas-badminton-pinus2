/* =========================================================
  Kas Badminton Pinus 2 - ONLINE (Firebase Firestore)
  FINAL VERSION (Auto Features)
  MODE: Hemat limit + admin code (no-login)

  ✅ Fitur:
  - Load data per bulan (hemat reads)
  - Cache LocalStorage
  - Refresh manual tombol
  - ✅ Tambah anggota dari Admin (update settings/members)
  - ✅ Hapus anggota terpilih
  - ✅ Top 5 telat membership bulan ini
  - ✅ Export CSV bulan ini
  - ✅ Export PDF (print -> save as PDF)
  - ✅ Saldo total GLOBAL real (summary/ledger)

  Struktur Firestore:
  - settings/members  (list anggota)
  - months/{YYYY-MM}/payments/{autoId}
  - months/{YYYY-MM}/expenses/{autoId}
  - summary/ledger    (saldo global total)

========================================================= */

/* =============================
  0) CONFIG YANG BISA KAMU EDIT
============================= */
const ADMIN_CODE = "pinus2"; // ✅ ganti kode admin
const IURAN_MEMBERSHIP = 70000;
const IURAN_MAIN = 20000;

/* =============================
  1) FIREBASE CONFIG
============================= */
const firebaseConfig = {
  apiKey: "AIzaSyCBY9EkUYwTmDD_AOEBbxngSrY242WdaZs",
  authDomain: "kas-badminton-pinus2.firebaseapp.com",
  projectId: "kas-badminton-pinus2",
  storageBucket: "kas-badminton-pinus2.firebasestorage.app",
  messagingSenderId: "1634727359",
  appId: "1:1634727359:web:1aadbd01ca157f0a65dd0a"
};

/* =============================
  2) IMPORT FIREBASE VIA CDN
============================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc,
  collection, getDocs, addDoc, serverTimestamp, query, orderBy,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =============================
  3) INIT FIREBASE
============================= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =============================
  4) APP STATE
============================= */
const BULAN_LIST = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

let state = {
  members: [],
  payments: [],
  expenses: [],
  filter: {
    bulan: "",
    tahun: "",
    kind: "all",
  }
};

// cache key biar hemat reads
const CACHE_KEY = "PINUS2_FIREBASE_CACHE_V2";

/* =========================================================
  UTIL
========================================================= */
function rupiah(num){
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function todayISO(){
  return new Date().toISOString().slice(0,10);
}

function getNowMonthYear(){
  const d = new Date();
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

function yyyyMM(bulan, tahun){
  // convert "Jan" + "2026" => "2026-01"
  const mIndex = BULAN_LIST.indexOf(bulan) + 1;
  const mm = String(mIndex).padStart(2,"0");
  return `${tahun}-${mm}`;
}

function monthYearFromDate(iso){
  const d = new Date(iso);
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

function safeText(s){
  return String(s || "").replaceAll("\n"," ").trim();
}

/* =========================================================
  NAVIGATION
========================================================= */
function showPage(page){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("show"));
  document.querySelector(`#page-${page}`)?.classList.add("show");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-page="${page}"]`)?.classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.page));
});
document.querySelectorAll("[data-goto]").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.goto));
});

/* =========================================================
  FILTER INIT
========================================================= */
function initFilter(){
  const fb = document.getElementById("filterBulan");
  const ft = document.getElementById("filterTahun");
  if(!fb || !ft) return;

  fb.innerHTML = BULAN_LIST.map(b=> `<option value="${b}">${b}</option>`).join("");

  const yNow = new Date().getFullYear();
  const years = [];
  for(let y=yNow-2; y<=yNow+2; y++) years.push(String(y));
  ft.innerHTML = years.map(y=> `<option value="${y}">${y}</option>`).join("");

  const {bulan, tahun} = getNowMonthYear();
  state.filter.bulan = bulan;
  state.filter.tahun = tahun;

  fb.value = bulan;
  ft.value = tahun;

  fb.addEventListener("change", ()=> { state.filter.bulan = fb.value; loadMonth(false); });
  ft.addEventListener("change", ()=> { state.filter.tahun = ft.value; loadMonth(false); });
}
initFilter();

/* =========================================================
  TAB FILTER
========================================================= */
document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    t.classList.add("active");
    state.filter.kind = t.dataset.kind;
    renderLaporan();
  });
});

/* =========================================================
  ADMIN LOCK
========================================================= */
document.getElementById("btnUnlock")?.addEventListener("click", ()=>{
  const code = document.getElementById("adminCode").value.trim();
  if(code === ADMIN_CODE){
    document.getElementById("adminLock")?.classList.add("hide");
    document.getElementById("adminPanel")?.classList.remove("hide");
  }else{
    alert("Kode admin salah!");
  }
});

/* =========================================================
  SET DEFAULT DATE
========================================================= */
function setDefaultDates(){
  const payT = document.getElementById("payTanggal");
  const expT = document.getElementById("expTanggal");
  if(payT) payT.value = todayISO();
  if(expT) expT.value = todayISO();
}
setDefaultDates();

/* =========================================================
  CACHE
========================================================= */
function loadCache(){
  try{
    return JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
  }catch(e){
    return null;
  }
}
function saveCache(){
  const cache = loadCache() || { members: [], months: {} };
  cache.members = state.members;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

/* =========================================================
  LEDGER GLOBAL (saldo total semua bulan)
  - disimpan di summary/ledger
========================================================= */
async function initLedger(){
  const ref = doc(db, "summary", "ledger");
  const snap = await getDoc(ref);
  if(!snap.exists()){
    await setDoc(ref, {
      incomeTotal: 0,
      expenseTotal: 0,
      updatedAt: serverTimestamp()
    });
  }
}

async function loadGlobalSaldo(){
  try{
    const ref = doc(db, "summary", "ledger");
    const snap = await getDoc(ref);
    if(!snap.exists()) return;

    const data = snap.data() || {};
    const income = Number(data.incomeTotal||0);
    const exp = Number(data.expenseTotal||0);
    const saldo = income - exp;

    document.getElementById("saldoTotal").textContent = rupiah(saldo);
  }catch(e){
    console.error("loadGlobalSaldo error", e);
  }
}

/* =========================================================
  MEMBERS INIT (settings/members)
========================================================= */
async function initMembers(){
  // 1) cache
  const cache = loadCache();
  if(cache?.members?.length){
    state.members = cache.members;
    fillMemberDropdown();
    renderMembers();
    renderTopTelat();
  }

  // 2) firestore
  const ref = doc(db, "settings", "members");
  const snap = await getDoc(ref);

  if(!snap.exists()){
    const defaultMembers = [
      { id: 1, nama: "Vicky", status: "aktif" }
    ];
    await setDoc(ref, { list: defaultMembers });
    state.members = defaultMembers;
  }else{
    state.members = snap.data().list || [];
  }

  fillMemberDropdown();
  renderMembers();
  renderTopTelat();
  saveCache();
}

/* =========================================================
  LOAD MONTH DATA
========================================================= */
async function loadMonth(force){
  const {bulan, tahun} = state.filter;
  const key = yyyyMM(bulan, tahun);

  // cache check
  const cache = loadCache();
  const cachedMonth = cache?.months?.[key];

  if(!force && cachedMonth){
    state.payments = cachedMonth.payments || [];
    state.expenses = cachedMonth.expenses || [];
    renderAll();
    return;
  }

  try{
    const payRef = collection(db, "months", key, "payments");
    const expRef = collection(db, "months", key, "expenses");

    const payQ = query(payRef, orderBy("tanggal", "desc"));
    const expQ = query(expRef, orderBy("tanggal", "desc"));

    const paySnap = await getDocs(payQ);
    const expSnap = await getDocs(expQ);

    state.payments = paySnap.docs.map(d => ({ _id: d.id, ...d.data() }));
    state.expenses = expSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

    renderAll();

    // update cache
    const newCache = cache || { members: [], months: {} };
    newCache.months[key] = { payments: state.payments, expenses: state.expenses, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));
  }catch(err){
    console.error(err);
    alert("Gagal load data bulan ini. Cek config Firebase / Rules / internet.");
  }
}

/* =========================================================
  RENDER
========================================================= */
function renderAll(){
  renderDashboard();
  renderLaporan();
  renderMembers();
  renderTopTelat();
}

function renderDashboard(){
  const {bulan, tahun} = state.filter;

  const membership = state.payments
    .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  const main = state.payments
    .filter(p => p.jenis === "main" && p.bulan === bulan && String(p.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  const expense = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  document.getElementById("totalMembership").textContent = rupiah(membership);
  document.getElementById("totalMain").textContent = rupiah(main);
  document.getElementById("totalExpense").textContent = rupiah(expense);

  // saldo total global di-load dari ledger
}

function renderLaporan(){
  const {bulan, tahun, kind} = state.filter;

  const incomeRows = state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .map(p => ({
      tanggal: p.tanggal,
      jenis: p.jenis,
      nama: p.nama,
      nominal: Number(p.nominal||0),
      catatan: p.catatan || ""
    }));

  const expRows = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .map(e => ({
      tanggal: e.tanggal,
      jenis: "expense",
      nama: e.kategori,
      nominal: Number(e.nominal||0),
      catatan: e.catatan || ""
    }));

  let rows = [...incomeRows, ...expRows];

  if(kind !== "all"){
    rows = rows.filter(r => r.jenis === kind);
  }

  rows.sort((a,b)=> String(b.tanggal).localeCompare(String(a.tanggal)));

  const pemasukan = incomeRows.reduce((a,b)=> a + b.nominal, 0);
  const pengeluaran = expRows.reduce((a,b)=> a + b.nominal, 0);
  const selisih = pemasukan - pengeluaran;

  document.getElementById("lapPemasukan").textContent = rupiah(pemasukan);
  document.getElementById("lapPengeluaran").textContent = rupiah(pengeluaran);
  document.getElementById("lapSelisih").textContent = rupiah(selisih);

  const tb = document.getElementById("txTable");
  if(!tb) return;

  if(rows.length === 0){
    tb.innerHTML = `<tr><td colspan="5" class="muted">Belum ada transaksi bulan ini.</td></tr>`;
    return;
  }

  tb.innerHTML = rows.map(r=>{
    const badge =
      r.jenis === "membership" ? "💳 Membership" :
      r.jenis === "main" ? "🏸 Main" :
      "🧾 Expense";

    return `
      <tr>
        <td>${r.tanggal || "-"}</td>
        <td>${badge}</td>
        <td><b>${safeText(r.nama || "-")}</b></td>
        <td><b>${rupiah(r.nominal)}</b></td>
        <td class="muted">${safeText(r.catatan || "")}</td>
      </tr>
    `;
  }).join("");
}

function renderMembers(){
  const {bulan, tahun} = state.filter;

  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.member_id))
  );

  const tb = document.getElementById("memberTable");
  if(!tb) return;

  if(state.members.length === 0){
    tb.innerHTML = `<tr><td colspan="3" class="muted">Data member kosong.</td></tr>`;
    return;
  }

  tb.innerHTML = state.members.map(m=>{
    const paid = paidSet.has(String(m.id));
    return `
      <tr>
        <td><b>${safeText(m.nama)}</b></td>
        <td class="muted">${safeText(m.status || "aktif")}</td>
        <td>${paid ? "✅ Lunas" : "❌ Belum"}</td>
      </tr>
    `;
  }).join("");
}

function fillMemberDropdown(){
  const dd = document.getElementById("payMember");
  if(!dd) return;
  dd.innerHTML = state.members.map(m => `<option value="${m.id}">${safeText(m.nama)}</option>`).join("");
}

/* =========================================================
  TOP 5 TELAT MEMBERSHIP
========================================================= */
function renderTopTelat(){
  const {bulan, tahun} = state.filter;

  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.member_id))
  );

  const telat = state.members
    .filter(m => (m.status||"aktif")==="aktif" && !paidSet.has(String(m.id)))
    .slice(0, 5);

  const el = document.getElementById("topTelat");
  if(!el) return;

  if(telat.length === 0){
    el.innerHTML = "✅ Semua sudah bayar membership bulan ini.";
    return;
  }

  el.innerHTML = telat.map((m,i)=> `#${i+1} <b>${safeText(m.nama)}</b>`).join("<br>");
}

/* =========================================================
  SUBMIT FORMS -> ADD DOC TO FIRESTORE + UPDATE LEDGER
========================================================= */
document.getElementById("btnSubmitPay")?.addEventListener("click", async ()=>{
  const jenis = document.getElementById("payJenis").value;
  const tanggal = document.getElementById("payTanggal").value;
  const member_id = Number(document.getElementById("payMember").value);
  const member = state.members.find(m=>Number(m.id)===member_id);
  const nama = member?.nama || "-";
  const nominal = Number(document.getElementById("payNominal").value || 0);
  const metode = document.getElementById("payMetode").value;
  const catatan = document.getElementById("payCatatan").value;

  if(!tanggal || nominal <= 0){
    alert("Tanggal & nominal wajib diisi.");
    return;
  }

  const {bulan, tahun} = monthYearFromDate(tanggal);
  const key = yyyyMM(bulan, tahun);

  const payload = {
    tanggal, jenis, member_id, nama,
    bulan, tahun,
    nominal, metode,
    catatan,
    createdAt: serverTimestamp()
  };

  const ok = confirm(`Simpan pemasukan ${jenis} untuk ${nama} sebesar ${rupiah(nominal)}?`);
  if(!ok) return;

  try{
    await addDoc(collection(db, "months", key, "payments"), payload);

    // ✅ update ledger incomeTotal
    await runTransaction(db, async (tx)=>{
      const ledgerRef = doc(db, "summary", "ledger");
      const ledgerSnap = await tx.get(ledgerRef);
      const cur = ledgerSnap.exists() ? ledgerSnap.data() : { incomeTotal:0, expenseTotal:0 };

      tx.set(ledgerRef, {
        incomeTotal: Number(cur.incomeTotal||0) + nominal,
        expenseTotal: Number(cur.expenseTotal||0),
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    document.getElementById("payCatatan").value = "";
    alert("✅ Berhasil simpan pemasukan!");
    await loadMonth(true);
    await loadGlobalSaldo();
  }catch(e){
    console.error(e);
    alert("Gagal simpan pemasukan. Cek rules / internet.");
  }
});

document.getElementById("btnSubmitExp")?.addEventListener("click", async ()=>{
  const tanggal = document.getElementById("expTanggal").value;
  const kategori = document.getElementById("expKategori").value.trim();
  const nominal = Number(document.getElementById("expNominal").value || 0);
  const catatan = document.getElementById("expCatatan").value;

  if(!tanggal || !kategori || nominal <= 0){
    alert("Tanggal, kategori, nominal wajib diisi.");
    return;
  }

  const {bulan, tahun} = monthYearFromDate(tanggal);
  const key = yyyyMM(bulan, tahun);

  const payload = {
    tanggal, kategori,
    bulan, tahun,
    nominal,
    catatan,
    createdAt: serverTimestamp()
  };

  const ok = confirm(`Simpan pengeluaran ${kategori} sebesar ${rupiah(nominal)}?`);
  if(!ok) return;

  try{
    await addDoc(collection(db, "months", key, "expenses"), payload);

    // ✅ update ledger expenseTotal
    await runTransaction(db, async (tx)=>{
      const ledgerRef = doc(db, "summary", "ledger");
      const ledgerSnap = await tx.get(ledgerRef);
      const cur = ledgerSnap.exists() ? ledgerSnap.data() : { incomeTotal:0, expenseTotal:0 };

      tx.set(ledgerRef, {
        incomeTotal: Number(cur.incomeTotal||0),
        expenseTotal: Number(cur.expenseTotal||0) + nominal,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    alert("✅ Berhasil simpan pengeluaran!");
    document.getElementById("expKategori").value = "";
    document.getElementById("expNominal").value = "";
    document.getElementById("expCatatan").value = "";

    await loadMonth(true);
    await loadGlobalSaldo();
  }catch(e){
    console.error(e);
    alert("Gagal simpan pengeluaran. Cek rules / internet.");
  }
});

document.getElementById("btnReloadAll")?.addEventListener("click", async ()=> {
  await initMembers();
  await loadMonth(true);
  await loadGlobalSaldo();
});

/* =========================================================
  REFRESH BUTTON (hemat limit: manual)
========================================================= */
document.getElementById("btnRefresh")?.addEventListener("click", ()=> loadMonth(true));

/* =========================================================
  AUTO NOMINAL
========================================================= */
const payJenis = document.getElementById("payJenis");
const payNominal = document.getElementById("payNominal");
if(payJenis && payNominal){
  payJenis.addEventListener("change", ()=>{
    payNominal.value = payJenis.value === "membership" ? IURAN_MEMBERSHIP : IURAN_MAIN;
  });
  payNominal.value = IURAN_MEMBERSHIP;
}

/* =========================================================
  ADMIN: ADD / REMOVE MEMBER
  - update settings/members
========================================================= */
document.getElementById("btnAddMember")?.addEventListener("click", async ()=>{
  const name = document.getElementById("newMemberName").value.trim();
  const status = document.getElementById("newMemberStatus").value;

  if(!name){
    alert("Nama anggota wajib diisi.");
    return;
  }

  const maxId = state.members.reduce((m, x)=> Math.max(m, Number(x.id||0)), 0);
  const newMember = { id: maxId + 1, nama: name, status };

  const ok = confirm(`Tambah anggota: ${name} (${status}) ?`);
  if(!ok) return;

  try{
    const ref = doc(db, "settings", "members");
    const next = [...state.members, newMember];

    await updateDoc(ref, { list: next });

    state.members = next;
    fillMemberDropdown();
    renderMembers();
    renderTopTelat();
    saveCache();

    document.getElementById("newMemberName").value = "";
    alert("✅ Anggota berhasil ditambahkan!");
  }catch(e){
    console.error(e);
    alert("Gagal tambah anggota. Cek rules / koneksi.");
  }
});

document.getElementById("btnRemoveMember")?.addEventListener("click", async ()=>{
  const member_id = Number(document.getElementById("payMember").value);
  const member = state.members.find(m=>Number(m.id)===member_id);

  if(!member){
    alert("Pilih anggota dulu.");
    return;
  }

  const ok = confirm(`Hapus anggota: ${member.nama}?`);
  if(!ok) return;

  try{
    const ref = doc(db, "settings", "members");
    const next = state.members.filter(m=>Number(m.id)!==member_id);

    await updateDoc(ref, { list: next });

    state.members = next;
    fillMemberDropdown();
    renderMembers();
    renderTopTelat();
    saveCache();

    alert("✅ Anggota berhasil dihapus!");
  }catch(e){
    console.error(e);
    alert("Gagal hapus anggota. Cek rules / koneksi.");
  }
});

/* =========================================================
  EXPORT CSV & PDF
========================================================= */
function downloadFile(filename, content, mime){
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV(){
  const {bulan, tahun} = state.filter;
  const key = yyyyMM(bulan, tahun);

  const rows = [];
  rows.push(["tanggal","jenis","nama/kategori","nominal","catatan"].join(","));

  const incomeRows = state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .map(p => [
      p.tanggal,
      p.jenis,
      `"${safeText(p.nama).replaceAll('"','""')}"`,
      Number(p.nominal||0),
      `"${safeText(p.catatan).replaceAll('"','""')}"`
    ].join(","));

  const expRows = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .map(e => [
      e.tanggal,
      "expense",
      `"${safeText(e.kategori).replaceAll('"','""')}"`,
      Number(e.nominal||0),
      `"${safeText(e.catatan).replaceAll('"','""')}"`
    ].join(","));

  [...incomeRows, ...expRows].forEach(r=> rows.push(r));

  const csv = rows.join("\n");
  downloadFile(`laporan-${key}.csv`, csv, "text/csv;charset=utf-8;");
}

document.getElementById("btnExportCSV")?.addEventListener("click", exportCSV);

document.getElementById("btnExportPDF")?.addEventListener("click", ()=>{
  showPage("laporan");
  setTimeout(()=> window.print(), 250);
});

/* =========================================================
  FIRST LOAD
========================================================= */
(async function start(){
  try{
    await initLedger();
    await initMembers();
    await loadMonth(false);
    await loadGlobalSaldo();
  }catch(e){
    console.error(e);
    alert("Init gagal. Cek config Firebase / rules / internet.");
  }
})();