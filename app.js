/* =========================================================
  Kas Badminton Pinus 2 - ONLINE (Firebase Firestore)
  Versi: Manual Member Input (bukan dropdown)

  ✅ Fitur:
  - Load data per bulan (hemat reads)
  - Cache localStorage
  - Input pemasukan/pengeluaran
  - Member input manual + suggestion datalist
  - Tambah anggota via admin
  - Top 5 telat bayar membership bulan ini (indikasi)
========================================================= */

/* =============================
  0) CONFIG YANG BISA KAMU EDIT
============================= */
const ADMIN_CODE = "pinus2"; // ✅ ganti kode admin
const IURAN_MEMBERSHIP = 70000; // ✅ iuran bulanan
const IURAN_MAIN = 20000; // ✅ iuran per datang/main

/* =============================
  1) FIREBASE CONFIG (ISI PUNYAMU)
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
  collection, getDocs, addDoc, serverTimestamp,
  query, orderBy
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
  members: [],     // ✅ list anggota (settings/members)
  payments: [],    // ✅ pemasukan bulan ini
  expenses: [],    // ✅ pengeluaran bulan ini
  filter: {
    bulan: "",
    tahun: "",
    kind: "all",
  }
};

/* ✅ key cache */
const CACHE_KEY = "PINUS2_FIREBASE_CACHE_V1";

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
  const mIndex = BULAN_LIST.indexOf(bulan) + 1;
  const mm = String(mIndex).padStart(2,"0");
  return `${tahun}-${mm}`;
}
function monthYearFromDate(iso){
  const d = new Date(iso);
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

/* =========================================================
  NAVIGATION
========================================================= */
function showPage(page){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("show"));
  document.querySelector(`#page-${page}`).classList.add("show");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add("active");
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
document.getElementById("btnUnlock").addEventListener("click", ()=>{
  const code = document.getElementById("adminCode").value.trim();
  if(code === ADMIN_CODE){
    document.getElementById("adminLock").classList.add("hide");
    document.getElementById("adminPanel").classList.remove("hide");
  }else{
    alert("Kode admin salah!");
  }
});

/* =========================================================
  SET DEFAULT DATE
========================================================= */
function setDefaultDates(){
  document.getElementById("payTanggal").value = todayISO();
  document.getElementById("expTanggal").value = todayISO();
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
  MEMBERS INIT (settings/members)
========================================================= */
async function initMembers(){
  // 1) load cache biar cepat
  const cache = loadCache();
  if(cache?.members?.length){
    state.members = cache.members;
    fillMemberDropdown();
    renderMembers();
  }

  // 2) ambil dari firestore
  const ref = doc(db, "settings", "members");
  const snap = await getDoc(ref);

  if(!snap.exists()){
    // ✅ kalau belum ada, buat default
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
  saveCache();
}

/* =========================================================
  LOAD MONTH DATA (hemat reads)
========================================================= */
async function loadMonth(force){
  const {bulan, tahun} = state.filter;
  const key = yyyyMM(bulan, tahun);

  // ✅ cache check
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

    // ✅ orderBy butuh field tanggal
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
    alert("Init gagal. Cek config Firebase / rules / internet.");
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
    .reduce((a,b)=> a + Number(e.nominal||0), 0);

  // ✅ saldo total dihitung dari cache bulan yg pernah dibuka
  const cache = loadCache();
  let totalIncome = 0;
  let totalExp = 0;

  if(cache?.months){
    Object.values(cache.months).forEach(m=>{
      (m.payments||[]).forEach(p=> totalIncome += Number(p.nominal||0));
      (m.expenses||[]).forEach(e=> totalExp += Number(e.nominal||0));
    });
  }

  const saldo = totalIncome - totalExp;

  document.getElementById("saldoTotal").textContent = rupiah(saldo);
  document.getElementById("totalMembership").textContent = rupiah(membership);
  document.getElementById("totalMain").textContent = rupiah(main);
  document.getElementById("totalExpense").textContent = rupiah(expense);
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
        <td><b>${r.nama || "-"}</b></td>
        <td><b>${rupiah(r.nominal)}</b></td>
        <td class="muted">${r.catatan || ""}</td>
      </tr>
    `;
  }).join("");
}

function renderMembers(){
  const {bulan, tahun} = state.filter;

  // ✅ paidSet = nama member yang sudah bayar membership bulan ini
  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.nama || "").toLowerCase())
  );

  const tb = document.getElementById("memberTable");
  if(state.members.length === 0){
    tb.innerHTML = `<tr><td colspan="3" class="muted">Data member kosong.</td></tr>`;
    return;
  }

  tb.innerHTML = state.members.map(m=>{
    const paid = paidSet.has(String(m.nama).toLowerCase());
    return `
      <tr>
        <td><b>${m.nama}</b></td>
        <td class="muted">${m.status || "aktif"}</td>
        <td>${paid ? "✅ Lunas" : "❌ Belum"}</td>
      </tr>
    `;
  }).join("");
}

/* =========================================================
  ✅ MEMBER SUGGESTION
  (bukan dropdown lagi)
========================================================= */
function fillMemberDropdown(){
  const dl = document.getElementById("memberSuggestions");
  if(!dl) return;

  dl.innerHTML = state.members
    .map(m => `<option value="${m.nama}"></option>`)
    .join("");
}

/* =========================================================
  TOP 5 TELAT BAYAR (bulan ini)
========================================================= */
function renderTopTelat(){
  const {bulan, tahun} = state.filter;

  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.nama||"").toLowerCase())
  );

  const telat = state.members
    .filter(m => !paidSet.has(String(m.nama).toLowerCase()))
    .slice(0,5);

  const el = document.getElementById("topTelat");
  if(!el) return;

  if(telat.length === 0){
    el.innerHTML = `<li class="muted">Semua sudah bayar ✅</li>`;
    return;
  }

  el.innerHTML = telat.map(m => `<li><b>${m.nama}</b></li>`).join("");
}

/* =========================================================
  SUBMIT PEMASUKAN (MANUAL MEMBER)
========================================================= */
document.getElementById("btnSubmitPay").addEventListener("click", async ()=>{
  const jenis = document.getElementById("payJenis").value;
  const tanggal = document.getElementById("payTanggal").value;

  // ✅ nama member manual
  const nama = (document.getElementById("payMemberName").value || "").trim();

  const nominal = Number(document.getElementById("payNominal").value || 0);
  const metode = document.getElementById("payMetode").value;
  const catatan = document.getElementById("payCatatan").value;

  if(!tanggal || nominal <= 0){
    alert("Tanggal & nominal wajib diisi.");
    return;
  }

  if(!nama){
    alert("Nama member wajib diisi.");
    return;
  }

  const {bulan, tahun} = monthYearFromDate(tanggal);
  const key = yyyyMM(bulan, tahun);

  const payload = {
    tanggal,
    jenis,
    nama, // ✅ manual input
    bulan, tahun,
    nominal,
    metode,
    catatan,
    createdAt: serverTimestamp()
  };

  const ok = confirm(`Simpan pemasukan ${jenis} untuk ${nama} sebesar ${rupiah(nominal)}?`);
  if(!ok) return;

  await addDoc(collection(db, "months", key, "payments"), payload);

  document.getElementById("payCatatan").value = "";
  document.getElementById("payMemberName").value = ""; // ✅ kosongkan input manual

  alert("✅ Berhasil simpan pemasukan!");
  await loadMonth(true);
});

/* =========================================================
  SUBMIT PENGELUARAN
========================================================= */
document.getElementById("btnSubmitExp").addEventListener("click", async ()=>{
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

  await addDoc(collection(db, "months", key, "expenses"), payload);

  alert("✅ Berhasil simpan pengeluaran!");
  document.getElementById("expKategori").value = "";
  document.getElementById("expNominal").value = "";
  document.getElementById("expCatatan").value = "";

  await loadMonth(true);
});

/* =========================================================
  ADMIN: TAMBAH ANGGOTA KE settings/members
========================================================= */
document.getElementById("btnAddMember").addEventListener("click", async ()=>{
  const name = (document.getElementById("newMemberName").value || "").trim();
  if(!name){
    alert("Nama anggota wajib diisi.");
    return;
  }

  const ref = doc(db, "settings", "members");
  const snap = await getDoc(ref);

  let list = [];
  if(snap.exists()){
    list = snap.data().list || [];
  }

  // ✅ bikin ID otomatis
  const maxId = list.reduce((m,x)=> Math.max(m, Number(x.id||0)), 0);
  const newMember = {
    id: maxId + 1,
    nama: name,
    status: "aktif"
  };

  list.push(newMember);

  await setDoc(ref, { list }, { merge: true });

  alert("✅ Anggota berhasil ditambahkan!");
  document.getElementById("newMemberName").value = "";

  // refresh data member + suggestion
  await initMembers();
});

/* =========================================================
  RELOAD ALL + REFRESH BULAN
========================================================= */
document.getElementById("btnReloadAll").addEventListener("click", async ()=> {
  await initMembers();
  await loadMonth(true);
});
document.getElementById("btnRefresh").addEventListener("click", ()=> loadMonth(true));

/* =========================================================
  AUTO NOMINAL PEMASUKAN
========================================================= */
const payJenis = document.getElementById("payJenis");
const payNominal = document.getElementById("payNominal");

payJenis.addEventListener("change", ()=>{
  payNominal.value = payJenis.value === "membership" ? IURAN_MEMBERSHIP : IURAN_MAIN;
});
payNominal.value = IURAN_MEMBERSHIP;

/* =========================================================
  EXPORT CSV (SIMPLE)
========================================================= */
document.getElementById("btnExportCSV").addEventListener("click", ()=>{
  const rows = [];

  // header
  rows.push(["Tanggal","Jenis","Nama/Kategori","Nominal","Catatan"].join(","));

  // data pemasukan
  state.payments.forEach(p=>{
    rows.push([p.tanggal, p.jenis, p.nama, p.nominal, (p.catatan||"")].map(x=> `"${String(x||"").replaceAll('"','""')}"`).join(","));
  });

  // data pengeluaran
  state.expenses.forEach(e=>{
    rows.push([e.tanggal, "expense", e.kategori, e.nominal, (e.catatan||"")].map(x=> `"${String(x||"").replaceAll('"','""')}"`).join(","));
  });

  const csvContent = rows.join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `kas_${yyyyMM(state.filter.bulan, state.filter.tahun)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* =========================================================
  EXPORT PDF (SIMPLE PRINT)
========================================================= */
document.getElementById("btnExportPDF").addEventListener("click", ()=>{
  window.print(); // ✅ paling simple export ke PDF via browser
});

/* =========================================================
  FIRST LOAD
========================================================= */
(async function start(){
  await initMembers();
  await loadMonth(false);
})();