/* =========================================================
  Kas Badminton Pinus 2 - ONLINE (Firebase Firestore)
  FILE: app.js (FINAL FULL)
  ---------------------------------------------------------
  ✅ KUNCI UI: Tidak mengubah index.html / style.css yang sudah kamu suka
  ✅ Semua fitur lama tetap
  ✅ Export PDF otomatis format tabel resmi + header + footer hijau/merah
  ✅ Baris pertama Export PDF: "Saldo awal bulan" otomatis (REAL)
  ✅ Ledger saldo global (summary/ledger)
  ✅ Admin: tambah anggota + hapus anggota
  ✅ Top 5 telat real jatuh tempo 5/10
========================================================= */

/* =============================
  0) CONFIG EDITABLE (BOLEH EDIT)
============================= */
const ADMIN_CODE = "pinus2";     // ✅ kode admin
const IURAN_MEMBERSHIP = 70000;  // ✅ iuran membership per bulan
const IURAN_MAIN = 20000;        // ✅ iuran main minggu per hadir

/* =============================
  1) FIREBASE CONFIG
  - dari Firebase Console -> Project Settings -> Web App config
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
  2) IMPORT FIREBASE (CDN)
  - WAJIB type="module" di index.html
============================= */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore,
  doc, getDoc, setDoc,
  collection, getDocs, addDoc,
  serverTimestamp, query, orderBy,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

/* =============================
  3) INIT FIREBASE
============================= */
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

/* =============================
  4) STATE APP
============================= */
const BULAN_LIST = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

let state = {
  members: [],       // list anggota dari settings/members
  payments: [],      // data pemasukan dari months/{YYYY-MM}/payments
  expenses: [],      // data pengeluaran dari months/{YYYY-MM}/expenses
  filter: {          // filter laporan
    bulan: "",
    tahun: "",
    kind: "all",
  },
  ledger: {          // saldo global realtime dari summary/ledger
    saldo: 0,
    totalIncome: 0,
    totalExpense: 0,
    updatedAt: null
  }
};

/* =============================
  5) CACHE KEY (LOCAL STORAGE)
============================= */
const CACHE_KEY = "PINUS2_FIREBASE_CACHE_V4";

/* =========================================================
  UTIL / HELPER
========================================================= */
function rupiah(num){
  // tampil versi "Rp 70.000"
  return "Rp " + Number(num || 0).toLocaleString("id-ID");
}

function rupiahPlain(num){
  // tampil versi "70.000" (untuk tabel PDF resmi)
  return Number(num || 0).toLocaleString("id-ID");
}

function todayISO(){
  // format YYYY-MM-DD
  return new Date().toISOString().slice(0,10);
}

function todayDate(){
  // object Date full
  return new Date();
}

function pad2(n){
  // padding angka -> 01 02 03
  return String(n).padStart(2,"0");
}

function todayHuman(){
  // format DD-MM-YYYY untuk tampilan "Hari ini"
  const d = todayDate();
  return `${pad2(d.getDate())}-${pad2(d.getMonth()+1)}-${d.getFullYear()}`;
}

function formatTanggalIndo(iso){
  // format tanggal resmi: 2026-01-04 => 04 Januari 2026
  try{
    const d = new Date(iso);
    const bulan = [
      "Januari","Februari","Maret","April","Mei","Juni",
      "Juli","Agustus","September","Oktober","November","Desember"
    ];
    return `${pad2(d.getDate())} ${bulan[d.getMonth()]} ${d.getFullYear()}`;
  }catch(e){
    return iso || "-";
  }
}

function escapeHTML(str){
  // buat aman dari karakter html di tabel export
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getNowMonthYear(){
  // dapat bulan/tahun sekarang untuk filter awal
  const d = new Date();
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

function yyyyMM(bulan, tahun){
  // convert "Jan"+"2026" => "2026-01"
  const mIndex = BULAN_LIST.indexOf(bulan) + 1;
  const mm = String(mIndex).padStart(2,"0");
  return `${tahun}-${mm}`;
}

function monthYearFromDate(iso){
  // convert tanggal ISO ke object bulan/tahun
  const d = new Date(iso);
  return { bulan: BULAN_LIST[d.getMonth()], tahun: String(d.getFullYear()) };
}

/* =========================================================
  NAVIGATION (SPA)
========================================================= */
function showPage(page){
  // hide semua halaman
  document.querySelectorAll(".page").forEach(p => p.classList.remove("show"));

  // show halaman yg dipilih
  document.querySelector(`#page-${page}`).classList.add("show");

  // reset tombol nav
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));

  // aktifkan tombol nav yg dipilih
  document.querySelector(`.nav-btn[data-page="${page}"]`).classList.add("active");
}

document.querySelectorAll(".nav-btn").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.page));
});

document.querySelectorAll("[data-goto]").forEach(btn=>{
  btn.addEventListener("click", ()=> showPage(btn.dataset.goto));
});

/* =========================================================
  FILTER INIT (Bulan/Tahun)
========================================================= */
function initFilter(){
  const fb = document.getElementById("filterBulan");
  const ft = document.getElementById("filterTahun");

  // isi dropdown bulan
  fb.innerHTML = BULAN_LIST.map(b=> `<option value="${b}">${b}</option>`).join("");

  // isi dropdown tahun +/- 2 tahun
  const yNow = new Date().getFullYear();
  const years = [];
  for(let y=yNow-2; y<=yNow+2; y++) years.push(String(y));
  ft.innerHTML = years.map(y=> `<option value="${y}">${y}</option>`).join("");

  // set default filter ke bulan/tahun sekarang
  const {bulan, tahun} = getNowMonthYear();
  state.filter.bulan = bulan;
  state.filter.tahun = tahun;

  fb.value = bulan;
  ft.value = tahun;

  // event saat filter diganti
  fb.addEventListener("change", ()=> { state.filter.bulan = fb.value; loadMonth(false); });
  ft.addEventListener("change", ()=> { state.filter.tahun = ft.value; loadMonth(false); });
}
initFilter();

/* =========================================================
  TAB FILTER LAPORAN
========================================================= */
document.querySelectorAll(".tab").forEach(t=>{
  t.addEventListener("click", ()=>{
    // reset tab
    document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));

    // aktifkan tab yang dipilih
    t.classList.add("active");

    // simpan filter jenis transaksi
    state.filter.kind = t.dataset.kind;

    // render laporan
    renderLaporan();
  });
});

/* =========================================================
  ADMIN LOCK
========================================================= */
document.getElementById("btnUnlock").addEventListener("click", ()=>{
  const code = document.getElementById("adminCode").value.trim();

  if(code === ADMIN_CODE){
    // hide lock
    document.getElementById("adminLock").classList.add("hide");
    // show panel
    document.getElementById("adminPanel").classList.remove("hide");
  }else{
    alert("Kode admin salah!");
  }
});

/* =========================================================
  SET DEFAULT DATE INPUT
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
  LEDGER GLOBAL (summary/ledger)
  - ini saldo real keseluruhan (semua bulan)
========================================================= */
async function initLedger(){
  try{
    const ref = doc(db, "summary", "ledger");
    const snap = await getDoc(ref);

    if(!snap.exists()){
      // kalau belum ada -> buat doc default
      await setDoc(ref, {
        totalIncome: 0,
        totalExpense: 0,
        saldo: 0,
        updatedAt: serverTimestamp()
      });

      state.ledger = { totalIncome:0, totalExpense:0, saldo:0, updatedAt:null };
    }else{
      // load ledger dari firestore
      state.ledger = snap.data();
    }

    renderLedger();
  }catch(err){
    console.error("ERROR initLedger:", err);
    renderLedger(true);
  }
}

function renderLedger(fallback=false){
  const saldoEl = document.getElementById("saldoTotal");
  const updatedEl = document.getElementById("saldoUpdated");

  if(!saldoEl) return;

  // tampilkan saldo global
  saldoEl.textContent = rupiah(Number(state.ledger?.saldo || 0));

  // info status ledger
  if(updatedEl){
    if(fallback) updatedEl.textContent = "Saldo global tidak terbaca (cek rules).";
    else updatedEl.textContent = "Saldo global realtime (summary/ledger).";
  }
}

/* =========================================================
  MEMBERS INIT (settings/members)
========================================================= */
async function initMembers(){
  // load dari cache dulu biar cepat
  const cache = loadCache();
  if(cache?.members?.length){
    state.members = cache.members;
    renderMembers();
    fillRemoveMemberSelect();
  }

  try{
    // ambil dari firestore
    const ref = doc(db, "settings", "members");
    const snap = await getDoc(ref);

    if(!snap.exists()){
      // buat default kalau doc belum ada
      const defaultMembers = [{ id: 1, nama: "Vicky", status: "aktif" }];
      await setDoc(ref, { list: defaultMembers });
      state.members = defaultMembers;
    }else{
      state.members = snap.data().list || [];
    }

    // render ulang
    renderMembers();
    renderTopTelatReal();
    fillRemoveMemberSelect();

    // simpan cache
    saveCache();
  }catch(err){
    console.error("ERROR initMembers:", err);
    renderMembers();
    fillRemoveMemberSelect();
  }
}

/* =========================================================
  ADMIN DROPDOWN HAPUS MEMBER
========================================================= */
function fillRemoveMemberSelect(){
  const sel = document.getElementById("removeMemberSelect");
  if(!sel) return;

  if(!state.members || state.members.length === 0){
    sel.innerHTML = `<option value="">(kosong)</option>`;
    return;
  }

  // urutkan berdasarkan nama
  const list = [...state.members].sort((a,b)=> String(a.nama).localeCompare(String(b.nama)));

  // isi dropdown
  sel.innerHTML = list.map(m => `<option value="${m.id}">${m.nama} (${m.status||"aktif"})</option>`).join("");
}

/* =========================================================
  LOAD DATA BULAN AKTIF (hemat limit)
========================================================= */
async function loadMonth(force){
  const {bulan, tahun} = state.filter;
  const key = yyyyMM(bulan, tahun);

  // coba dari cache
  const cache = loadCache();
  const cachedMonth = cache?.months?.[key];

  if(!force && cachedMonth){
    state.payments = cachedMonth.payments || [];
    state.expenses = cachedMonth.expenses || [];
    renderAll();
    renderTopTelatReal();
    return;
  }

  try{
    // koleksi payments dan expenses bulan ini
    const payRef = collection(db, "months", key, "payments");
    const expRef = collection(db, "months", key, "expenses");

    // urut tanggal desc
    const payQ = query(payRef, orderBy("tanggal", "desc"));
    const expQ = query(expRef, orderBy("tanggal", "desc"));

    // fetch
    const paySnap = await getDocs(payQ);
    const expSnap = await getDocs(expQ);

    // simpan ke state
    state.payments = paySnap.docs.map(d => ({ _id: d.id, ...d.data() }));
    state.expenses = expSnap.docs.map(d => ({ _id: d.id, ...d.data() }));

    // render halaman
    renderAll();
    renderTopTelatReal();

    // update cache bulan ini
    const newCache = cache || { members: [], months: {} };
    newCache.months[key] = {
      payments: state.payments,
      expenses: state.expenses,
      cachedAt: Date.now()
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(newCache));

  }catch(err){
    console.error("ERROR loadMonth:", err);
    alert("Init gagal. Cek config Firebase / rules / internet.");
  }
}

/* =========================================================
  RENDER UTAMA
========================================================= */
function renderAll(){
  renderDashboard();
  renderLaporan();
  renderMembers();
}

/* =============================
  DASHBOARD
============================= */
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

  renderLedger();
}

/* =============================
  LAPORAN TABLE UI NORMAL (kunci)
============================= */
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

  // filter jenis transaksi
  if(kind !== "all") rows = rows.filter(r => r.jenis === kind);

  // sort terbaru dulu
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
      r.jenis === "main" ? "🏸 Main (Minggu)" :
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

/* =============================
  MEMBERSHIP TABLE
============================= */
function renderMembers(){
  const {bulan, tahun} = state.filter;

  // cari member yg sudah bayar membership bulan ini
  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.nama || "").toLowerCase().trim())
  );

  const tb = document.getElementById("memberTable");

  if(!state.members || state.members.length === 0){
    tb.innerHTML = `<tr><td colspan="3" class="muted">Data anggota belum ada / gagal load.</td></tr>`;
    return;
  }

  // urut berdasarkan nama
  const list = [...state.members].sort((a,b)=> String(a.nama).localeCompare(String(b.nama)));

  // render table
  tb.innerHTML = list.map(m=>{
    const paid = paidSet.has(String(m.nama || "").toLowerCase().trim());
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
  TOP 5 TELAT REAL (jatuh tempo 5/10)
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

  // belum lewat jatuh tempo -> belum telat
  if(currentDay < dueDay){
    el.innerHTML = `⏳ Belum dihitung telat. Jatuh tempo tanggal <b>${dueDay}</b>.`;
    return;
  }

  // yang sudah bayar membership bulan ini
  const paidSet = new Set(
    state.payments
      .filter(p => p.jenis === "membership" && p.bulan === bulan && String(p.tahun) === String(tahun))
      .map(p => String(p.nama || "").toLowerCase().trim())
  );

  // ambil member yg belum bayar
  const telat = state.members
    .filter(m => !paidSet.has(String(m.nama || "").toLowerCase().trim()))
    .slice(0,5);

  if(telat.length === 0){
    el.innerHTML = "✅ Semua anggota sudah bayar membership (tidak ada yang telat).";
    return;
  }

  // render list telat
  el.innerHTML = telat
    .map((m,i)=> `#${i+1} <b>${m.nama}</b> <span class="muted">— belum bayar</span>`)
    .join("<br>");
}

// event jatuh tempo berubah
const dueSelect = document.getElementById("dueDaySelect");
if(dueSelect){
  dueSelect.addEventListener("change", ()=> renderTopTelatReal());
}

/* =========================================================
  HITUNG SALDO AWAL BULAN (AUTO)
  Rumus:
  saldoAwal = ledgerSaldoSekarang - (incomeBulanIni - expenseBulanIni)
========================================================= */
function hitungSaldoAwalBulan(){
  const {bulan, tahun} = state.filter;

  // total pemasukan bulan aktif
  const incomeBulanIni = state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  // total pengeluaran bulan aktif
  const expenseBulanIni = state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .reduce((a,b)=> a + Number(b.nominal||0), 0);

  // saldo global sekarang
  const ledgerSaldoSekarang = Number(state.ledger?.saldo || 0);

  // saldo awal bulan ini
  const saldoAwal = ledgerSaldoSekarang - (incomeBulanIni - expenseBulanIni);

  return { saldoAwal, incomeBulanIni, expenseBulanIni };
}

/* =========================================================
  UPDATE LEDGER SAAT INPUT
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
  SUBMIT PEMASUKAN (INPUT MANUAL)
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
    tanggal, jenis, nama,
    bulan, tahun,
    nominal, metode,
    catatan,
    createdAt: serverTimestamp()
  };

  const ok = confirm(`Simpan pemasukan ${jenis} untuk ${nama} sebesar ${rupiah(nominal)}?`);
  if(!ok) return;

  try{
    // simpan payment
    await addDoc(collection(db, "months", key, "payments"), payload);

    // update ledger global
    await updateLedgerAfterIncome(nominal);
    await initLedger();

    // reset input kecil
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
    // simpan expense
    await addDoc(collection(db, "months", key, "expenses"), payload);

    // update ledger global
    await updateLedgerAfterExpense(nominal);
    await initLedger();

    // reset input kecil
    document.getElementById("expKategori").value = "";
    document.getElementById("expNominal").value = "";
    document.getElementById("expCatatan").value = "";

    alert("✅ Berhasil simpan pengeluaran!");
    await loadMonth(true);

  }catch(err){
    console.error("ERROR add expense:", err);
    alert("❌ Gagal simpan pengeluaran. Cek rules Firestore.");
  }
});

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
    // load list lama
    const snap = await getDoc(ref);
    let list = [];
    if(snap.exists()) list = snap.data().list || [];

    // cek duplikat nama
    const exists = list.some(m => String(m.nama).toLowerCase().trim() === name.toLowerCase().trim());
    if(exists){
      alert("Nama sudah ada di daftar anggota.");
      return;
    }

    // ambil max id
    const maxId = list.reduce((mx, m)=> Math.max(mx, Number(m.id||0)), 0);

    // buat member baru
    const newMember = { id: maxId + 1, nama: name, status: status || "aktif" };

    // push list
    list.push(newMember);

    // simpan ke firestore
    await setDoc(ref, { list }, { merge: true });

    alert("✅ Anggota berhasil ditambahkan!");
    document.getElementById("newMemberName").value = "";

    // reload state
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
  BUTTONS
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
  AUTO NOMINAL (ubah jenis)
========================================================= */
const payJenis = document.getElementById("payJenis");
const payNominal = document.getElementById("payNominal");

payJenis.addEventListener("change", ()=>{
  payNominal.value = payJenis.value === "membership" ? IURAN_MEMBERSHIP : IURAN_MAIN;
});
payNominal.value = IURAN_MEMBERSHIP;

/* =========================================================
  EXPORT CSV (bulan aktif)
========================================================= */
function exportCSV(){
  const {bulan, tahun} = state.filter;
  const rows = [];
  rows.push(["Tanggal","Jenis","Nama/Kategori","Nominal","Catatan"]);

  state.payments
    .filter(p=> p.bulan===bulan && String(p.tahun)===String(tahun))
    .forEach(p=> rows.push([p.tanggal, p.jenis, p.nama, p.nominal, p.catatan||""]));

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
  EXPORT PDF (FORMAT RESMI + SALDO AWAL BULAN)
  - tidak mengubah UI utama
  - hanya munculkan printArea saat export
========================================================= */
document.getElementById("btnExportPDF").addEventListener("click", ()=>{
  showPage("laporan");          // pastikan filter tepat
  renderPrintTableOfficial();   // build print HTML

  setTimeout(()=>{
    window.print();
    cleanupPrintArea();         // balik normal setelah print
  }, 300);
});

/* =========================================================
  PRINT AREA - BUILD TABLE RESMI + SALDO AWAL
========================================================= */
function renderPrintTableOfficial(){
  const printArea = document.getElementById("printArea");
  if(!printArea) return;

  // aktifkan mode print
  document.body.classList.add("print-mode");
  printArea.style.display = "block";

  const {bulan, tahun} = state.filter;

  // ✅ hitung saldo awal bulan dari ledger
  const { saldoAwal } = hitungSaldoAwalBulan();

  // gabungkan semua transaksi bulan ini
  const rows = [];

  // pemasukan
  state.payments
    .filter(p => p.bulan === bulan && String(p.tahun) === String(tahun))
    .forEach(p => {
      rows.push({
        tanggal: p.tanggal,
        keterangan: p.jenis === "membership" ? `Membership - ${p.nama}` : `Main Minggu - ${p.nama}`,
        pemasukan: Number(p.nominal||0),
        pengeluaran: 0
      });
    });

  // pengeluaran
  state.expenses
    .filter(e => e.bulan === bulan && String(e.tahun) === String(tahun))
    .forEach(e => {
      rows.push({
        tanggal: e.tanggal,
        keterangan: e.kategori || "Pengeluaran",
        pemasukan: 0,
        pengeluaran: Number(e.nominal||0)
      });
    });

  // sort tanggal ASC agar saldo jalan rapih
  rows.sort((a,b)=> String(a.tanggal).localeCompare(String(b.tanggal)));

  // running saldo dimulai dari saldo awal bulan
  let runningSaldo = saldoAwal;

  // total pemasukan/pengeluaran
  let totalIn = 0;
  let totalOut = 0;

  // baris pertama: saldo awal bulan (NO=1)
  const monthIndex = BULAN_LIST.indexOf(bulan) + 1;
  const saldoAwalTanggal = `${tahun}-${String(monthIndex).padStart(2,"0")}-01`;

  let bodyHTML = `
    <tr>
      <td class="c-no">1</td>
      <td class="c-date">${formatTanggalIndo(saldoAwalTanggal)}</td>
      <td class="c-desc">Saldo awal bulan (sisa saldo bulan sebelumnya)</td>
      <td class="c-in">${rupiahPlain(saldoAwal)}</td>
      <td class="c-out">-</td>
      <td class="c-saldo">${rupiahPlain(runningSaldo)}</td>
    </tr>
  `;

  // transaksi mulai NO=2
  bodyHTML += rows.map((r, idx)=>{
    runningSaldo += (r.pemasukan - r.pengeluaran);
    totalIn += r.pemasukan;
    totalOut += r.pengeluaran;

    return `
      <tr>
        <td class="c-no">${idx+2}</td>
        <td class="c-date">${formatTanggalIndo(r.tanggal)}</td>
        <td class="c-desc">${escapeHTML(r.keterangan)}</td>
        <td class="c-in">${r.pemasukan ? rupiahPlain(r.pemasukan) : "-"}</td>
        <td class="c-out">${r.pengeluaran ? rupiahPlain(r.pengeluaran) : "-"}</td>
        <td class="c-saldo">${rupiahPlain(runningSaldo)}</td>
      </tr>
    `;
  }).join("");

  // saldo akhir bulan = saldo awal + selisih transaksi bulan ini
  const saldoAkhir = saldoAwal + (totalIn - totalOut);

  // render html print resmi
  printArea.innerHTML = buildPrintHTML({
    bulan, tahun, bodyHTML,
    totalIn, totalOut, saldoAkhir
  });
}

/* =========================================================
  TEMPLATE HTML PRINT RESMI
========================================================= */
function buildPrintHTML({ bulan, tahun, bodyHTML, totalIn, totalOut, saldoAkhir }){
  const titleMonth = `${bulan} ${tahun}`;

  return `
    <div class="print-wrap">
      <div class="print-title">KAS Badminton Pinus 2</div>
      <div class="print-subtitle">Laporan Bulan: ${titleMonth}</div>

      <table class="print-table">
        <thead>
          <tr>
            <th class="c-no">NO</th>
            <th class="c-date">Tanggal</th>
            <th class="c-desc">Keterangan</th>
            <th class="c-in">Pemasukan</th>
            <th class="c-out">Pengeluaran</th>
            <th class="c-saldo">Saldo</th>
          </tr>
        </thead>

        <tbody>
          ${bodyHTML || `<tr><td colspan="6" style="text-align:center;">Belum ada transaksi</td></tr>`}
        </tbody>

        <tfoot>
          <tr>
            <td colspan="3" class="tfoot-label">Total</td>
            <td class="tfoot-in">${rupiahPlain(totalIn)}</td>
            <td class="tfoot-out">${rupiahPlain(totalOut)}</td>
            <td class="tfoot-saldo">${rupiahPlain(saldoAkhir)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;
}

/* =========================================================
  CLEANUP PRINT MODE
========================================================= */
function cleanupPrintArea(){
  const printArea = document.getElementById("printArea");

  if(printArea){
    printArea.innerHTML = "";
    printArea.style.display = "none";
  }

  document.body.classList.remove("print-mode");
}

/* =========================================================
  FIRST LOAD APP
========================================================= */
(async function start(){
  // set input hari ini
  const todayEl = document.getElementById("todayView");
  if(todayEl) todayEl.value = todayHuman();

  // init semua
  await initLedger();
  await initMembers();
  await loadMonth(false);

  // render telat
  renderTopTelatReal();
})();