/* =========================================================
  Kas Badminton Pinus 2 - ONLINE (Firebase Firestore)
  FILE: app.js (FINAL LOCKED VERSION)
  ✅ Style / UI / Layout: TIDAK DIUBAH (kunci aman)
  ✅ Main Minggu pagi
  ✅ Member input manual (pemasukan main bisa beda2)
  ✅ Tambah anggota / hapus anggota
  ✅ Top 5 telat REAL (jatuh tempo 5/10)
  ✅ Ledger saldo global (summary/ledger)
  ✅ Export CSV + Export PDF format resmi
  ✅ Saldo awal bulan otomatis (row pertama)
  ✅ Tombol Edit + Hapus setiap baris laporan
========================================================= */


/* =============================
  0) CONFIG (BISA EDIT)
============================= */
const ADMIN_CODE = "pinus2";               // kode admin
const IURAN_MEMBERSHIP = 70000;            // iuran membership
const IURAN_MAIN = 20000;                  // iuran main minggu


/* =============================
  1) FIREBASE CONFIG (KUNCI)
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
  2) IMPORT FIREBASE CDN
============================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc, getDoc, setDoc,
  collection, getDocs, addDoc,
  serverTimestamp, query, orderBy,
  runTransaction, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


/* =============================
  3) INIT FIREBASE
============================= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


/* =============================
  4) STATE APLIKASI
============================= */
const BULAN_LIST = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

let state = {
  members: [],
  payments: [],
  expenses: [],
  filter: { bulan:"", tahun:"", kind:"all" },
  ledger: { saldo:0, totalIncome:0, totalExpense:0, updatedAt:null }
};

// cache hemat reads
const CACHE_KEY = "PINUS2_FIREBASE_CACHE_V5";


/* =========================================================
  UTIL
========================================================= */

// format rupiah
function rupiah(num){
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

// tanggal iso (yyyy-mm-dd) buat input date
function todayISO(){
  return new Date().toISOString().slice(0,10);
}

// date object sekarang
function todayDate(){
  return new Date();
}

// padding 2 digit
function pad2(n){
  return String(n).padStart(2,"0");
}

// tampilan hari ini (dd-mm-yyyy)
function todayHuman(){
  const d = todayDate();
  return `${pad2(d.getDate())}-${pad2(d.getMonth()+1)}-${d.getFullYear()}`;
}

// default filter bulan tahun sekarang
function getNowMonthYear(){
  const d = new Date();
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

// convert Jan 2026 -> 2026-01
function yyyyMM(bulan, tahun){
  const mIndex = BULAN_LIST.indexOf(bulan) + 1;
  const mm = String(mIndex).padStart(2,"0");
  return `${tahun}-${mm}`;
}

// ambil bulan tahun dari tanggal iso input
function monthYearFromDate(iso){
  const d = new Date(iso);
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

// helper nama clean biar cocok matching membership
function normalizeName(name){
  return String(name || "").toLowerCase().trim();
}


/* =========================================================
  NAVIGATION SPA
========================================================= */
function showPage(page){
  document.querySelectorAll(".page").forEach(p => p.classList.remove("show"));
  document.querySelector(`#page-${page}`).classList.add("show");

  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add("active");
}

// tombol nav
document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.page));
});

// tombol data-goto (CTA)
document.querySelectorAll("[data-goto]").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.goto));
});


/* =========================================================
  FILTER INIT (bulan/tahun)
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
  TAB FILTER LAPORAN
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
  DEFAULT DATE INPUT FORM
========================================================= */
function setDefaultDates(){
  document.getElementById("payTanggal").value = todayISO();
  document.getElementById("expTanggal").value = todayISO();
}
setDefaultDates();


/* =========================================================
  CACHE LOCAL STORAGE
========================================================= */
function loadCache(){
  try{ return JSON.parse(localStorage.getItem(CACHE_KEY) || "null"); }
  catch(e){ return null; }
}

function saveCache(){
  const cache = loadCache() || { members: [], months: {} };
  cache.members = state.members;
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}


/* =========================================================
  LEDGER GLOBAL (summary/ledger)
  - ini jadi sumber saldo total global
========================================================= */
async function initLedger(){
  try{
    const ref = doc(db, "summary", "ledger");
    const snap = await getDoc(ref);

    if(!snap.exists()){
      // kalau belum ada, buat default
      await setDoc(ref, {
        totalIncome: 0,
        totalExpense: 0,
        saldo: 0,
        updatedAt: serverTimestamp()
      });
      state.ledger = { totalIncome:0, totalExpense:0, saldo:0, updatedAt:null };
    }else{
      state.ledger = snap.data();
    }

    renderLedger(false);
  }catch(err){
    console.error("ERROR initLedger:", err);
    renderLedger(true);
  }
}

function renderLedger(fallback=false){
  const saldoEl = document.getElementById("saldoTotal");
  const updatedEl = document.getElementById("saldoUpdated");
  if(!saldoEl) return;

  saldoEl.textContent = rupiah(Number(state.ledger?.saldo || 0));

  if(updatedEl){
    if(fallback) updatedEl.textContent = "Saldo global tidak terbaca (cek rules).";
    else updatedEl.textContent = "Saldo global realtime (summary/ledger).";
  }
}


/* =========================================================
  MEMBERS INIT (settings/members)
========================================================= */
async function initMembers(){
  // cache dulu biar cepat
  const cache = loadCache();
  if(cache?.members?.length){
    state.members = cache.members;
    renderMembers();
    fillRemoveMemberSelect();
  }

  try{
    const ref = doc(db, "settings", "members");
    const snap = await getDoc(ref);

    if(!snap.exists()){
      const defaultMembers = [{ id: 1, nama: "Vicky", status: "aktif" }];
      await setDoc(ref, { list: defaultMembers });
      state.members = defaultMembers;
    }else{
      state.members = snap.data().list || [];
    }

    renderMembers();
    renderTopTelatReal();
    fillRemoveMemberSelect();
    saveCache();
  }catch(err){
    console.error("ERROR initMembers:", err);
    renderMembers();
    fillRemoveMemberSelect();
  }
}


/* =========================================================
  SELECT REMOVE MEMBER (ADMIN)
========================================================= */
function fillRemoveMemberSelect(){
  const sel = document.getElementById("removeMemberSelect");
  if(!sel) return;

  if(!state.members || state.members.length === 0){
    sel.innerHTML = `<option value="">(kosong)</option>`;
    return;
  }

  const list = [...state.members].sort((a,b)=> String(a.nama).localeCompare(String(b.nama)));
  sel.innerHTML = list.map(m => `<option value="${m.id}">${m.nama} (${m.status||"aktif"})</option>`).join("");
}


/* =========================================================
  LOAD MONTH DATA
========================================================= */
async function loadMonth(force){
  const {bulan, tahun} = state.filter;
  const key = yyyyMM(bulan, tahun);

  // cek cache dulu
  const cache = loadCache();
  const cachedMonth = cache?.months?.[key];

  if(!force && cachedMonth){
    state.payments = cachedMonth.payments || [];
    state.expenses = cachedMonth.expenses || [];
    renderAll();
    renderTopTelatReal();
    return;
  }

  // fetch firestore
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
    renderTopTelatReal();

    // simpan cache bulan ini
    const newCache = cache || { members: [], months: {} };
    newCache.months[key] = { payments: state.payments, expenses: state.expenses, cachedAt: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));

  }catch(err){
    console.error("ERROR loadMonth:", err);
    alert("Init gagal. Cek config Firebase / rules / internet.");
  }
}


/* =========================================================
  RENDER ALL
========================================================= */
function renderAll(){
  renderDashboard();
  renderLaporan();
  renderMembers();
}


/* =========================================================
  DASHBOARD
========================================================= */
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

  // saldo global
  renderLedger();
}


/* =========================================================
  LAPORAN TABLE + EDIT/HAPUS BUTTON
========================================================= */
function renderLaporan(){
  const {bulan, tahun, kind} = state.filter;

  // pemasukan
  const incomeRows = state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .map(p => ({
      _id: p._id,
      _type: "payment",
      tanggal: p.tanggal,
      jenis: p.jenis,
      nama: p.nama,
      nominal: Number(p.nominal||0),
      catatan: p.catatan || "",
      keyMonth: yyyyMM(p.bulan, p.tahun)
    }));

  // pengeluaran
  const expRows = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .map(e => ({
      _id: e._id,
      _type: "expense",
      tanggal: e.tanggal,
      jenis: "expense",
      nama: e.kategori,
      nominal: Number(e.nominal||0),
      catatan: e.catatan || "",
      keyMonth: yyyyMM(e.bulan, e.tahun)
    }));

  let rows = [...incomeRows, ...expRows];

  // filter tab
  if(kind !== "all"){
    rows = rows.filter(r => r.jenis === kind);
  }

  // urut desc
  rows.sort((a,b)=> String(b.tanggal).localeCompare(String(a.tanggal)));

  // summary angka
  const pemasukan = incomeRows.reduce((a,b)=> a + b.nominal, 0);
  const pengeluaran = expRows.reduce((a,b)=> a + b.nominal, 0);
  const selisih = pemasukan - pengeluaran;

  document.getElementById("lapPemasukan").textContent = rupiah(pemasukan);
  document.getElementById("lapPengeluaran").textContent = rupiah(pengeluaran);

  /* =====================================================
    ✅ PERUBAHAN 1X SAJA (KUNCI)
    - dulu: lapSelisih
    - sekarang: lapSaldoSaatIni
    - lainnya TIDAK DIUBAH
  ====================================================== */
  const saldoEl = document.getElementById("lapSaldoSaatIni");
  if(saldoEl){
    saldoEl.textContent = rupiah(selisih);
  }else{
    // fallback aman kalau elemen belum ada
    const oldSelisihEl = document.getElementById("lapSelisih");
    if(oldSelisihEl) oldSelisihEl.textContent = rupiah(selisih);
  }

  // saldo awal bulan otomatis (baris pertama)
  const saldoAwal = getSaldoAwalBulan();

  const tb = document.getElementById("txTable");

  // kalau tidak ada transaksi
  if(rows.length === 0){
    tb.innerHTML = `
      <tr>
        <td colspan="5" class="muted">Belum ada transaksi bulan ini.</td>
      </tr>`;
    return;
  }

  // render tabel + tombol edit/hapus
  tb.innerHTML = `
    ${renderSaldoAwalRow(saldoAwal)}
    ${rows.map(r=>{
      const badge =
        r.jenis === "membership" ? "💳 Membership" :
        r.jenis === "main" ? "🏸 Main (Minggu)" :
        "🧾 Expense";

      return `
        <tr>
          <td>${r.tanggal || "-"}</td>
          <td>${badge}</td>
          <td><b>${r.nama || "-"}</b></td>
          <td><b>${rupiah(r.nominal)}</b></td>
          <td class="muted">
            ${r.catatan || ""}
            <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
              <button class="btn ghost" data-edit="${r._type}:${r.keyMonth}:${r._id}">✏️ Edit</button>
              <button class="btn danger" data-del="${r._type}:${r.keyMonth}:${r._id}">🗑️ Hapus</button>
            </div>
          </td>
        </tr>
      `;
    }).join("")}
  `;

  // pasang event tombol edit/hapus
  bindEditDeleteButtons();
}


/* =========================================================
  SALDO AWAL BULAN
  - Auto dihitung dari ledger saldo global - (transaksi bulan ini)
  ✅ PATCH: Januari 2026 FIX 358.000
========================================================= */
function getSaldoAwalBulan(){
  const {bulan, tahun} = state.filter;

  /* =====================================================
    ✅ PATCH 1X SAJA (KUNCI)
    - SALDO AWAL JANUARI 2026 HARUS 358.000
    - sesuai sisa saldo tahun 2025 (contoh tabel)
  ====================================================== */
  if(bulan === "Jan" && String(tahun) === "2026"){
    return 358000;
  }

  const incomeMonth = state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  const expMonth = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  // saldoAwal = saldoGlobal - (incomeMonth - expMonth)
  const saldoGlobal = Number(state.ledger?.saldo || 0);
  return saldoGlobal - (incomeMonth - expMonth);
}

function renderSaldoAwalRow(saldoAwal){
  const {bulan, tahun} = state.filter;
  return `
    <tr>
      <td>01 ${bulan} ${tahun}</td>
      <td>📌 Saldo Awal</td>
      <td><b>Sisa saldo bulan sebelumnya</b></td>
      <td><b>${rupiah(saldoAwal)}</b></td>
      <td class="muted">Auto dari ledger</td>
    </tr>
  `;
}


/* =========================================================
  MEMBERS TABLE (Lunas / Belum)
========================================================= */
function renderMembers(){
  const {bulan, tahun} = state.filter;

  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => normalizeName(p.nama))
  );

  const tb = document.getElementById("memberTable");
  if(!state.members || state.members.length === 0){
    tb.innerHTML = `<tr><td colspan="3" class="muted">Data anggota belum ada / gagal load.</td></tr>`;
    return;
  }

  const list = [...state.members].sort((a,b)=> String(a.nama).localeCompare(String(b.nama)));

  tb.innerHTML = list.map(m=>{
    const paid = paidSet.has(normalizeName(m.nama));
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
  TOP TELAT REAL (jatuh tempo 5/10)
========================================================= */
function renderTopTelatReal(){
  const el = document.getElementById("topTelat");
  if(!el) return;

  const todayEl = document.getElementById("todayView");
  if(todayEl) todayEl.value = todayHuman();

  const dueSelect = document.getElementById("dueDaySelect");
  const dueDay = Number(dueSelect?.value || 5);

  const {bulan, tahun} = state.filter;

  if(!state.members || state.members.length === 0){
    el.innerHTML = `<span class="muted">Belum ada data anggota.</span>`;
    return;
  }

  const now = todayDate();
  const currentDay = now.getDate();

  if(currentDay < dueDay){
    el.innerHTML = `⏳ Belum dihitung telat. Jatuh tempo tanggal <b>${dueDay}</b>.`;
    return;
  }

  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => normalizeName(p.nama))
  );

  const telat = state.members
    .filter(m => !paidSet.has(normalizeName(m.nama)))
    .slice(0,5);

  if(telat.length === 0){
    el.innerHTML = "✅ Semua anggota sudah bayar membership (tidak ada yang telat).";
    return;
  }

  el.innerHTML = telat.map((m,i)=> `#${i+1} <b>${m.nama}</b> <span class="muted">— belum bayar</span>`).join("<br>");
}

// kalau jatuh tempo diganti -> rerender
const dueSelect = document.getElementById("dueDaySelect");
if(dueSelect){
  dueSelect.addEventListener("change", ()=> renderTopTelatReal());
}


/* =========================================================
  LEDGER UPDATE (TRANSACTION)
========================================================= */
async function updateLedgerAfterIncome(amount){
  const ref = doc(db, "summary", "ledger");
  await runTransaction(db, async (trx)=>{
    const snap = await trx.get(ref);
    if(!snap.exists()){
      trx.set(ref, { totalIncome: amount, totalExpense: 0, saldo: amount, updatedAt: serverTimestamp() });
      return;
    }
    const data = snap.data();
    const totalIncome = Number(data.totalIncome||0) + Number(amount||0);
    const totalExpense = Number(data.totalExpense||0);
    trx.update(ref, {
      totalIncome,
      saldo: totalIncome - totalExpense,
      updatedAt: serverTimestamp()
    });
  });
}

async function updateLedgerAfterExpense(amount){
  const ref = doc(db, "summary", "ledger");
  await runTransaction(db, async (trx)=>{
    const snap = await trx.get(ref);
    if(!snap.exists()){
      trx.set(ref, { totalIncome: 0, totalExpense: amount, saldo: 0-amount, updatedAt: serverTimestamp() });
      return;
    }
    const data = snap.data();
    const totalIncome = Number(data.totalIncome||0);
    const totalExpense = Number(data.totalExpense||0) + Number(amount||0);
    trx.update(ref, {
      totalExpense,
      saldo: totalIncome - totalExpense,
      updatedAt: serverTimestamp()
    });
  });
}


/* =========================================================
  SUBMIT PEMASUKAN (manual member input)
========================================================= */
document.getElementById("btnSubmitPay").addEventListener("click", async ()=>{
  const jenis = document.getElementById("payJenis").value;
  const tanggal = document.getElementById("payTanggal").value;
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
    tanggal, jenis,
    nama,
    bulan, tahun,
    nominal, metode,
    catatan,
    createdAt: serverTimestamp()
  };

  const ok = confirm(`Simpan pemasukan ${jenis} untuk ${nama} sebesar ${rupiah(nominal)}?`);
  if(!ok) return;

  try{
    await addDoc(collection(db, "months", key, "payments"), payload);

    // update ledger global
    await updateLedgerAfterIncome(nominal);
    await initLedger();

    // reset input
    document.getElementById("payCatatan").value = "";
    document.getElementById("payMemberName").value = "";

    alert("✅ Berhasil simpan pemasukan!");
    await loadMonth(true);

  }catch(err){
    console.error("ERROR add payment:", err);
    alert("❌ Gagal simpan pemasukan. Cek rules Firestore.");
  }
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

  try{
    await addDoc(collection(db, "months", key, "expenses"), payload);

    await updateLedgerAfterExpense(nominal);
    await initLedger();

    alert("✅ Berhasil simpan pengeluaran!");
    document.getElementById("expKategori").value = "";
    document.getElementById("expNominal").value = "";
    document.getElementById("expCatatan").value = "";

    await loadMonth(true);

  }catch(err){
    console.error("ERROR add expense:", err);
    alert("❌ Gagal simpan pengeluaran. Cek rules Firestore.");
  }
});


/* =========================================================
  EDIT & DELETE TRANSAKSI (laporan)
========================================================= */

// pasang event tombol edit/hapus
function bindEditDeleteButtons(){
  // edit
  document.querySelectorAll("[data-edit]").forEach(btn=>{
    btn.onclick = async ()=>{
      const [type, keyMonth, id] = btn.dataset.edit.split(":");
      await handleEditRow(type, keyMonth, id);
    };
  });

  // delete
  document.querySelectorAll("[data-del]").forEach(btn=>{
    btn.onclick = async ()=>{
      const [type, keyMonth, id] = btn.dataset.del.split(":");
      await handleDeleteRow(type, keyMonth, id);
    };
  });
}

// edit row popup prompt
async function handleEditRow(type, keyMonth, id){
  try{
    // ambil existing data dari state
    let row = null;

    if(type === "payment"){
      row = state.payments.find(x => x._id === id);
    }else{
      row = state.expenses.find(x => x._id === id);
    }

    if(!row){
      alert("Data tidak ditemukan.");
      return;
    }

    // input edit
    const newTanggal = prompt("Edit Tanggal (YYYY-MM-DD)", row.tanggal || "");
    if(!newTanggal) return;

    const newNominal = prompt("Edit Nominal", String(row.nominal || 0));
    if(!newNominal) return;

    const nominalNumber = Number(newNominal || 0);
    if(nominalNumber <= 0){
      alert("Nominal tidak valid");
      return;
    }

    // update payload minimal
    const payload = { tanggal: newTanggal, nominal: nominalNumber };

    // doc path
    if(type === "payment"){
      // payments
      const ref = doc(db, "months", keyMonth, "payments", id);

      // koreksi ledger: nominal lama -> nominal baru
      const oldNominal = Number(row.nominal || 0);
      const diff = nominalNumber - oldNominal;
      if(diff !== 0){
        await updateLedgerAfterIncome(diff);
        await initLedger();
      }

      await updateDoc(ref, payload);

    }else{
      // expenses
      const ref = doc(db, "months", keyMonth, "expenses", id);

      // koreksi ledger expense
      const oldNominal = Number(row.nominal || 0);
      const diff = nominalNumber - oldNominal;
      if(diff !== 0){
        await updateLedgerAfterExpense(diff);
        await initLedger();
      }

      await updateDoc(ref, payload);
    }

    alert("✅ Berhasil edit data!");
    await loadMonth(true);

  }catch(err){
    console.error("ERROR edit row:", err);
    alert("❌ Gagal edit. Cek rules Firestore.");
  }
}

// hapus row
async function handleDeleteRow(type, keyMonth, id){
  const ok = confirm("Yakin hapus transaksi ini?");
  if(!ok) return;

  try{
    if(type === "payment"){
      const row = state.payments.find(x => x._id === id);
      if(!row){ alert("Data tidak ditemukan."); return; }

      // update ledger (-income)
      await updateLedgerAfterIncome(0 - Number(row.nominal||0));
      await initLedger();

      await deleteDoc(doc(db, "months", keyMonth, "payments", id));

    }else{
      const row = state.expenses.find(x => x._id === id);
      if(!row){ alert("Data tidak ditemukan."); return; }

      // update ledger (-expense) => balikkan expense
      await updateLedgerAfterExpense(0 - Number(row.nominal||0));
      await initLedger();

      await deleteDoc(doc(db, "months", keyMonth, "expenses", id));
    }

    alert("✅ Data berhasil dihapus!");
    await loadMonth(true);

  }catch(err){
    console.error("ERROR delete row:", err);
    alert("❌ Gagal hapus. Cek rules Firestore.");
  }
}


/* =========================================================
  ADMIN: TAMBAH ANGGOTA
========================================================= */
document.getElementById("btnAddMember").addEventListener("click", async ()=>{
  const name = (document.getElementById("newMemberName").value || "").trim();
  const status = document.getElementById("newMemberStatus").value;

  if(!name){
    alert("Nama anggota wajib diisi.");
    return;
  }

  const ref = doc(db, "settings", "members");

  try{
    const snap = await getDoc(ref);
    let list = [];
    if(snap.exists()) list = snap.data().list || [];

    const exists = list.some(m => normalizeName(m.nama) === normalizeName(name));
    if(exists){
      alert("Nama sudah ada di daftar anggota.");
      return;
    }

    const maxId = list.reduce((mx, m)=> Math.max(mx, Number(m.id||0)), 0);
    const newMember = { id: maxId + 1, nama: name, status: status || "aktif" };

    list.push(newMember);

    await setDoc(ref, { list }, { merge: true });

    alert("✅ Anggota berhasil ditambahkan!");
    document.getElementById("newMemberName").value = "";
    await initMembers();

  }catch(err){
    console.error("ERROR add member:", err);
    alert("❌ Gagal tambah anggota. Cek rules Firestore.");
  }
});


/* =========================================================
  ADMIN: HAPUS ANGGOTA
========================================================= */
document.getElementById("btnRemoveMember").addEventListener("click", async ()=>{
  const sel = document.getElementById("removeMemberSelect");
  const id = Number(sel.value || 0);
  if(!id){
    alert("Pilih anggota dulu.");
    return;
  }

  const target = state.members.find(m => Number(m.id) === id);
  if(!target){
    alert("Data anggota tidak ditemukan.");
    return;
  }

  const ok = confirm(`Hapus anggota "${target.nama}" dari list?`);
  if(!ok) return;

  try{
    const ref = doc(db, "settings", "members");
    const snap = await getDoc(ref);

    if(!snap.exists()){
      alert("Doc members tidak ada.");
      return;
    }

    let list = snap.data().list || [];
    list = list.filter(m => Number(m.id) !== id);

    await setDoc(ref, { list }, { merge: true });

    alert("✅ Anggota berhasil dihapus dari list!");
    await initMembers();

  }catch(err){
    console.error("ERROR remove member:", err);
    alert("❌ Gagal hapus anggota. Cek rules Firestore.");
  }
});


/* =========================================================
  BUTTONS ACTION
========================================================= */
document.getElementById("btnReloadAll").addEventListener("click", async ()=> {
  await initLedger();
  await initMembers();
  await loadMonth(true);
});

document.getElementById("btnRefresh").addEventListener("click", ()=> loadMonth(true));

const btnReloadMembers = document.getElementById("btnReloadMembers");
if(btnReloadMembers){
  btnReloadMembers.addEventListener("click", ()=> initMembers());
}


/* =========================================================
  AUTO NOMINAL (membership/main)
========================================================= */
const payJenis = document.getElementById("payJenis");
const payNominal = document.getElementById("payNominal");

payJenis.addEventListener("change", ()=>{
  payNominal.value = payJenis.value === "membership" ? IURAN_MEMBERSHIP : IURAN_MAIN;
});
payNominal.value = IURAN_MEMBERSHIP;


/* =========================================================
  EXPORT CSV
========================================================= */
function exportCSV(){
  const {bulan, tahun} = state.filter;
  const rows = [];
  rows.push(["Tanggal","Jenis","Nama/Kategori","Nominal","Catatan"]);

  // saldo awal
  const saldoAwal = getSaldoAwalBulan();
  rows.push([`01 ${bulan} ${tahun}`, "saldo_awal", "Sisa saldo bulan sebelumnya", saldoAwal, "Auto dari ledger"]);

  // payments
  state.payments
    .filter(p=> p.bulan===bulan && String(p.tahun)===String(tahun))
    .forEach(p=> rows.push([p.tanggal, p.jenis, p.nama, p.nominal, p.catatan||""]));

  // expenses
  state.expenses
    .filter(e=> e.bulan===bulan && String(e.tahun)===String(tahun))
    .forEach(e=> rows.push([e.tanggal, "expense", e.kategori, e.nominal, e.catatan||""]));

  const csv = rows.map(r =>
    r.map(cell => `"${String(cell??"").replaceAll('"','""')}"`).join(",")
  ).join("\n");

  const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `kas-pinus2_${tahun}-${bulan}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

document.getElementById("btnExportCSV").addEventListener("click", exportCSV);


/* =========================================================
  EXPORT PDF FORMAT RESMI (tanpa ubah style/index)
  - trik: sebelum print, kita bikin "PRINT HEADER" via DOM sementara
========================================================= */
document.getElementById("btnExportPDF").addEventListener("click", ()=>{
  showPage("laporan");

  // inject header judul resmi untuk print
  injectPrintHeader();

  setTimeout(()=>{
    window.print();
    // bersihin setelah print
    setTimeout(removePrintHeader, 1000);
  }, 300);
});

// buat header print sementara
function injectPrintHeader(){
  if(document.getElementById("printHeaderKas")) return;

  const wrap = document.querySelector("#page-laporan");
  const header = document.createElement("div");
  header.id = "printHeaderKas";
  header.style.marginBottom = "14px";
  header.innerHTML = `
    <div style="text-align:center; font-weight:900; font-size:18px; margin-bottom:6px;">
      KAS Badminton Pinus 2
    </div>
    <div style="text-align:center; font-size:12px;">
      Rekap Bulan: ${state.filter.bulan} ${state.filter.tahun}
    </div>
    <hr style="margin:12px 0; border:0; height:1px; background:#ccc;">
  `;

  // taro paling atas page laporan
  wrap.prepend(header);
}

// hapus header print
function removePrintHeader(){
  const el = document.getElementById("printHeaderKas");
  if(el) el.remove();
}


/* =========================================================
  FIRST LOAD
========================================================= */
(async function start(){
  // isi input hari ini
  const todayEl = document.getElementById("todayView");
  if(todayEl) todayEl.value = todayHuman();

  await initLedger();
  await initMembers();
  await loadMonth(false);
  renderTopTelatReal();
})();