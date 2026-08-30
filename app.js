import { auth, db, firebaseConfigured } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js";
import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  query,
  where,
  orderBy,
  getDocs,
  limit,
  serverTimestamp,
  deleteDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js";

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const roleLabels = { customer: "ลูกค้า", mechanic: "ช่าง", owner: "เจ้าของร้าน" };

const state = {
  user: null,
  profile: null,
  route: "dashboard",
  calc: {},
  records: { motorcycles: [], bookings: [], repairs: [], calculations: [] }
};

const navByRole = {
  customer: [
    ["dashboard","fa-house","ภาพรวม"],
    ["motorcycles","fa-motorcycle","รถของฉัน"],
    ["booking","fa-calendar-plus","นัดหมาย"],
    ["repairs","fa-screwdriver-wrench","งานซ่อม"],
    ["history","fa-clock-rotate-left","ประวัติ"],
    ["calculator","fa-gauge-high","Engine Lab"]
  ],
  mechanic: [
    ["dashboard","fa-house","ภาพรวมงาน"],
    ["jobs","fa-screwdriver-wrench","งานของฉัน"],
    ["booking","fa-calendar-check","นัดหมาย"],
    ["calculator","fa-gauge-high","Engine Lab"],
    ["history","fa-clock-rotate-left","ประวัติ"]
  ],
  owner: [
    ["dashboard","fa-chart-pie","Dashboard"],
    ["customers","fa-users","ลูกค้า"],
    ["jobs","fa-screwdriver-wrench","งานซ่อม"],
    ["inventory","fa-boxes-stacked","สต๊อกอะไหล่"],
    ["reports","fa-chart-line","รายงาน"],
    ["calculator","fa-gauge-high","Engine Lab"]
  ]
};

const titles = {
  dashboard: ["DASHBOARD","ภาพรวมร้าน"],
  motorcycles: ["GARAGE","รถของฉัน"],
  booking: ["BOOKING","นัดหมายเข้าร้าน"],
  repairs: ["REPAIR","งานซ่อม"],
  jobs: ["WORK ORDERS","งานของฉัน"],
  history: ["HISTORY","ประวัติการใช้งาน"],
  customers: ["CUSTOMERS","ลูกค้า"],
  inventory: ["INVENTORY","สต๊อกอะไหล่"],
  reports: ["REPORTS","รายงาน"],
  calculator: ["ENGINE LAB","Engine Modification Calculator"],
  profile: ["PROFILE","โปรไฟล์"]
};

function toast(message, type="info") {
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${type==="success"?"fa-circle-check":type==="error"?"fa-circle-exclamation":"fa-circle-info"}"></i><span>${escapeHtml(message)}</span>`;
  $("#toast-root").appendChild(el);
  setTimeout(()=>el.remove(), 3400);
}

function escapeHtml(v="") {
  return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
}

function showAuthTab(tab) {
  $$(".auth-tab").forEach(b => b.classList.toggle("active", b.dataset.authTab === tab));
  $("#login-form").classList.toggle("hidden", tab !== "login");
  $("#register-form").classList.toggle("hidden", tab !== "register");
}

$$(".auth-tab").forEach(b => b.addEventListener("click", ()=>showAuthTab(b.dataset.authTab)));

$("#login-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!firebaseConfigured) return toast("กรุณาใส่ Firebase Config ใน firebase-config.js ก่อน", "error");
  try {
    await signInWithEmailAndPassword(auth, $("#login-email").value.trim(), $("#login-password").value);
    toast("เข้าสู่ระบบสำเร็จ", "success");
  } catch (err) { toast(firebaseError(err), "error"); }
});

$("#register-form").addEventListener("submit", async (e)=>{
  e.preventDefault();
  if (!firebaseConfigured) return toast("กรุณาใส่ Firebase Config ใน firebase-config.js ก่อน", "error");
  try {
    const email = $("#register-email").value.trim();
    const password = $("#register-password").value;
    const name = $("#register-name").value.trim();
    const role = "customer";
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await setDoc(doc(db,"users",cred.user.uid), {
      uid: cred.user.uid, name, email, role,
      createdAt: serverTimestamp()
    });
    toast("สร้างบัญชีสำเร็จ", "success");
  } catch (err) { toast(firebaseError(err), "error"); }
});

function firebaseError(err) {
  const map = {
    "auth/invalid-credential":"อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    "auth/email-already-in-use":"อีเมลนี้ถูกใช้งานแล้ว",
    "auth/weak-password":"รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
    "auth/invalid-email":"รูปแบบอีเมลไม่ถูกต้อง"
  };
  return map[err?.code] || err?.message || "เกิดข้อผิดพลาด";
}

onAuthStateChanged(auth, async (user)=>{
  if (!user) {
    state.user = null;
    $("#auth-screen").classList.remove("hidden");
    $("#app-screen").classList.add("hidden");
    return;
  }
  state.user = user;
  try {
    const snap = await getDoc(doc(db,"users",user.uid));
    state.profile = snap.exists() ? snap.data() : {
      uid: user.uid, name: user.displayName || user.email, email: user.email, role: "customer"
    };
  } catch {
    state.profile = { uid:user.uid, name:user.displayName || user.email, email:user.email, role:"customer" };
  }
  bootApp();
});

function bootApp() {
  $("#auth-screen").classList.add("hidden");
  $("#app-screen").classList.remove("hidden");
  buildNav();
  $("#avatar").textContent = (state.profile.name || "U").slice(0,1).toUpperCase();
  $("#role-badge").textContent = roleLabels[state.profile.role] || "ผู้ใช้";
  route(state.profile.role === "mechanic" ? "jobs" : state.profile.role === "owner" ? "dashboard" : "dashboard");
}

function buildNav() {
  const nav = $("#main-nav");
  nav.innerHTML = (navByRole[state.profile.role] || navByRole.customer).map(([id,icon,label]) =>
    `<button class="nav-item ${state.route===id?"active":""}" data-route="${id}"><i class="fa-solid ${icon}"></i><span>${label}</span></button>`
  ).join("");
  $$("#main-nav .nav-item").forEach(btn => btn.addEventListener("click",()=>route(btn.dataset.route)));
}

$("#main-nav").addEventListener("click", ()=>{ if (window.innerWidth < 900) $(".sidebar").classList.remove("open"); });
$("#mobile-menu").addEventListener("click", ()=>$(".sidebar").classList.toggle("open"));
$$("[data-action]").forEach(b=>b.addEventListener("click", async ()=>{
  const action=b.dataset.action;
  if(action==="logout") await signOut(auth);
  else route(action);
}));

async function route(name) {
  state.route = name;
  if (!titles[name]) name = "dashboard";
  $("#page-kicker").textContent = titles[name][0];
  $("#page-title").textContent = titles[name][1];
  buildNav();
  const view = $("#view-root");
  view.innerHTML = `<div class="loading"><div class="spinner"></div>กำลังโหลด...</div>`;
  try {
    if(name === "dashboard") await renderDashboard(view);
    else if(name === "motorcycles") await renderMotorcycles(view);
    else if(name === "booking") await renderBooking(view);
    else if(name === "repairs" || name === "jobs") await renderJobs(view);
    else if(name === "history") await renderHistory(view);
    else if(name === "customers") await renderCustomers(view);
    else if(name === "inventory") await renderInventory(view);
    else if(name === "reports") await renderReports(view);
    else if(name === "calculator") renderCalculator(view);
    else if(name === "profile") renderProfile(view);
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><h3>โหลดข้อมูลไม่สำเร็จ</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

async function fetchCollection(name, filters=[]) {
  let qref = collection(db,name);
  if (filters.length) {
    const constraints = filters.map(f=>where(f[0],f[1],f[2]));
    qref = query(qref, ...constraints, limit(50));
  } else {
    qref = query(qref, limit(50));
  }
  const snap = await getDocs(qref);
  return snap.docs.map(d=>({id:d.id,...d.data()}));
}

function statusPill(status="รอดำเนินการ") {
  const map = {
  "เสร็จสิ้น":"success",
  "กำลังซ่อม":"warn",
  "รอตรวจ":"info",
  "รับงานแล้ว":"info",
  "รออนุมัติ":"warn",
  "ยกเลิก":"danger",
  "รอดำเนินการ":"info"
};
  return `<span class="status ${map[status]||"info"}">${escapeHtml(status)}</span>`;
}

async function renderDashboard(view) {
  const role = state.profile.role;
  if (role === "owner") {
    const [customers, jobs, parts] = await Promise.all([
      fetchCollection("users",[["role","==","customer"]]),
      fetchCollection("repairs"),
      fetchCollection("parts")
    ]);
    const total = jobs.reduce((s,x)=>s+(Number(x.totalCost)||0),0);
    const low = parts.filter(x=>(Number(x.stock)||0)<=5).length;
    view.innerHTML = `
      <div class="bento-grid dashboard-grid">
        ${metricCard("รายได้รวม","฿"+total.toLocaleString(),"fa-baht-sign","orange")}
        ${metricCard("ลูกค้า",""+customers.length,"fa-users","blue")}
        ${metricCard("งานซ่อม",""+jobs.length,"fa-screwdriver-wrench","green")}
        ${metricCard("อะไหล่ใกล้หมด",""+low,"fa-box-open","red")}
        <div class="bento-card wide"><div class="card-head"><div><span class="eyebrow">SERVICE FLOW</span><h3>ภาพรวมงานล่าสุด</h3></div><button class="icon-btn" onclick="location.hash='jobs'"><i class="fa-solid fa-arrow-up-right-from-square"></i></button></div>
          ${jobs.slice(0,6).map(j=>`<div class="list-row"><div class="row-icon"><i class="fa-solid fa-wrench"></i></div><div class="row-main"><strong>${escapeHtml(j.motorcycleModel||"รถไม่ระบุ")}</strong><span>${escapeHtml(j.problem||"งานซ่อม")}</span></div>${statusPill(j.status)}</div>`).join("") || emptyInline("ยังไม่มีงานซ่อม")}
        </div>
        <div class="bento-card tall"><div class="card-head"><div><span class="eyebrow">LOW STOCK</span><h3>อะไหล่ต้องเติม</h3></div></div>
          ${parts.filter(x=>(Number(x.stock)||0)<=5).slice(0,7).map(p=>`<div class="stock-row"><span>${escapeHtml(p.name)}</span><b>${Number(p.stock)||0}</b></div>`).join("") || emptyInline("สต๊อกยังปกติ")}
        </div>
      </div>`;
  } else if (role === "mechanic") {
    const jobs = await fetchCollection("repairs",[["mechanicId","==",state.user.uid]]);
    const active = jobs.filter(j=>j.status!=="เสร็จสิ้น");
    view.innerHTML = `<div class="bento-grid">
      ${metricCard("งานทั้งหมด",jobs.length,"fa-list-check","blue")}
      ${metricCard("กำลังทำ",active.length,"fa-fire","orange")}
      ${metricCard("เสร็จแล้ว",jobs.filter(j=>j.status==="เสร็จสิ้น").length,"fa-circle-check","green")}
      <div class="bento-card wide"><div class="card-head"><div><span class="eyebrow">MY WORK ORDERS</span><h3>งานที่ต้องจัดการ</h3></div><button class="btn btn-small btn-primary" onclick="window.routeForUI('jobs')">ดูทั้งหมด</button></div>
        ${jobs.slice(0,8).map(j=>jobRow(j)).join("") || emptyInline("ยังไม่มีงานที่ได้รับมอบหมาย")}
      </div>
      <div class="bento-card accent-card"><i class="fa-solid fa-bolt"></i><span class="eyebrow">ENGINE LAB</span><h3>คำนวณสเปกก่อนลงมือ</h3><p>CC • CR • Rod Ratio • Vg • หัวฉีด • ลิ้นเร่ง • ท่อไอเสีย</p><button class="btn btn-ghost" onclick="window.routeForUI('calculator')">เปิด Engine Lab</button></div>
    </div>`;
  } else {
    const [bikes, bookings, repairs, calcs] = await Promise.all([
      fetchCollection("motorcycles",[["customerId","==",state.user.uid]]),
      fetchCollection("bookings",[["customerId","==",state.user.uid]]),
      fetchCollection("repairs",[["customerId","==",state.user.uid]]),
      fetchCollection("engineCalculations",[["userId","==",state.user.uid]])
    ]);
    view.innerHTML = `<div class="bento-grid">
      ${metricCard("รถของฉัน",bikes.length,"fa-motorcycle","blue")}
      ${metricCard("นัดหมาย",bookings.length,"fa-calendar-days","orange")}
      ${metricCard("งานซ่อม",repairs.length,"fa-screwdriver-wrench","green")}
      ${metricCard("แบบคำนวณ",calcs.length,"fa-calculator","purple")}
      <div class="bento-card wide"><div class="card-head"><div><span class="eyebrow">MY GARAGE</span><h3>รถของฉัน</h3></div><button class="btn btn-small btn-primary" onclick="window.routeForUI('motorcycles')">จัดการรถ</button></div>
        ${bikes.slice(0,5).map(b=>`<div class="list-row"><div class="bike-photo"><i class="fa-solid fa-motorcycle"></i></div><div class="row-main"><strong>${escapeHtml(b.brand)} ${escapeHtml(b.model)}</strong><span>${escapeHtml(b.plate||"ไม่ระบุทะเบียน")} • ${Number(b.mileage||0).toLocaleString()} km</span></div><span class="muted">${escapeHtml(b.year||"")}</span></div>`).join("") || emptyInline("ยังไม่มีรถ")}
      </div>
      <div class="bento-card"><div class="card-head"><div><span class="eyebrow">NEXT STEP</span><h3>อยากเข้าร้านเมื่อไหร่?</h3></div></div><p class="muted">จองคิวซ่อม/เช็กระยะได้จากมือถือในไม่กี่คลิก</p><button class="btn btn-primary" onclick="window.routeForUI('booking')"><i class="fa-solid fa-calendar-plus"></i> นัดหมายเลย</button></div>
      <div class="bento-card accent-card"><span class="eyebrow">ENGINE LAB</span><h3>เก็บสเปกเครื่องไว้กับบัญชีคุณ</h3><p>แบบคำนวณเดิมถูกเก็บเป็นประวัติใน Firestore ได้</p><button class="btn btn-ghost" onclick="window.routeForUI('calculator')">เปิดเครื่องคำนวณ</button></div>
    </div>`;
  }
}

function metricCard(label,value,icon,tone) {
  return `<div class="bento-card metric ${tone}"><div class="metric-icon"><i class="fa-solid ${icon}"></i></div><div><span>${label}</span><strong>${value}</strong></div></div>`;
}
function emptyInline(text){ return `<div class="empty-inline"><i class="fa-regular fa-face-meh"></i>${escapeHtml(text)}</div>`; }
function jobRow(j){ return `<div class="list-row"><div class="row-icon"><i class="fa-solid fa-wrench"></i></div><div class="row-main"><strong>${escapeHtml(j.motorcycleModel||"รถไม่ระบุ")}</strong><span>${escapeHtml(j.problem||"-")}</span></div><div>${statusPill(j.status)}</div></div>`; }

async function renderMotorcycles(view) {
  const bikes = await fetchCollection("motorcycles",[["customerId","==",state.user.uid]]);
  view.innerHTML = `<div class="page-actions"><button class="btn btn-primary" id="add-bike"><i class="fa-solid fa-plus"></i> เพิ่มรถ</button></div>
    <div class="bento-grid cards-grid">${bikes.map(b=>`
      <div class="bento-card bike-card">
        <div class="bike-hero"><i class="fa-solid fa-motorcycle"></i><span>${escapeHtml(b.year||"")}</span></div>
        <span class="eyebrow">${escapeHtml(b.brand||"BRAND")}</span><h3>${escapeHtml(b.model||"Motorcycle")}</h3>
        <div class="spec-line"><span>ทะเบียน</span><b>${escapeHtml(b.plate||"-")}</b></div>
        <div class="spec-line"><span>เลขตัวถัง</span><b>${escapeHtml(b.vin||"-")}</b></div>
        <div class="spec-line"><span>เลขไมล์</span><b>${Number(b.mileage||0).toLocaleString()} km</b></div>
      </div>`).join("") || emptyState("ยังไม่มีรถในโรงรถ","เพิ่มรถคันแรกเพื่อเริ่มใช้งานระบบ")}
    </div>`;
  $("#add-bike")?.addEventListener("click",()=>openFormModal("เพิ่มรถ", [
    ["brand","ยี่ห้อ","Honda","text"],["model","รุ่น","Click 125","text"],["year","ปี","2025","number"],["plate","ทะเบียน","กข 1234","text"],["vin","เลขตัวถัง","-","text"],["mileage","เลขไมล์","0","number"]
  ], async data=>{
    await addDoc(collection(db,"motorcycles"),{...data,year:Number(data.year)||0,mileage:Number(data.mileage)||0,customerId:state.user.uid,createdAt:serverTimestamp()});
    toast("เพิ่มรถแล้ว","success"); route("motorcycles");
  }));
}

async function renderBooking(view) {

  const role = state.profile.role;

  // ==============================
  // ลูกค้า
  // ==============================
  if (role === "customer") {

    const bikes = await fetchCollection(
      "motorcycles",
      [["customerId", "==", state.user.uid]]
    );

    const bookings = await fetchCollection(
      "bookings",
      [["customerId", "==", state.user.uid]]
    );

    view.innerHTML = `
      <div class="bento-grid">

        <div class="bento-card wide">
          <div class="card-head">
            <div>
              <span class="eyebrow">NEW BOOKING</span>
              <h3>สร้างนัดหมาย</h3>
            </div>
          </div>

          <form id="booking-form" class="form-grid">

            <label>
              รถ
              <select id="booking-bike" required>
                ${bikes.map(b => `
                  <option value="${b.id}">
                    ${escapeHtml(b.brand)}
                    ${escapeHtml(b.model)}
                    — ${escapeHtml(b.plate || "-")}
                  </option>
                `).join("")}
              </select>
            </label>

            <label>
              วันที่
              <input id="booking-date" type="date" required>
            </label>

            <label>
              เวลา
              <input id="booking-time" type="time" required>
            </label>

            <label>
              บริการ
              <select id="booking-service">
                <option>เช็กระยะ</option>
                <option>เปลี่ยนน้ำมันเครื่อง</option>
                <option>ระบบเบรก</option>
                <option>ระบบไฟ</option>
                <option>เครื่องยนต์</option>
                <option>อื่น ๆ</option>
              </select>
            </label>

            <label class="full">
              รายละเอียดอาการ / สิ่งที่ต้องการ
              <input
                id="booking-note"
                placeholder="เช่น มีเสียงดังตอนเร่ง"
              >
            </label>

            <button
              class="btn btn-primary full"
              type="submit"
            >
              <i class="fa-solid fa-calendar-check"></i>
              ยืนยันนัดหมาย
            </button>

          </form>
        </div>

        <div class="bento-card">
          <span class="eyebrow">BOOKING STATUS</span>
          <h3>นัดหมายล่าสุด</h3>

          ${
            bookings.map(b => `
              <div class="list-row compact">

                <div class="row-main">

                  <strong>
                    ${escapeHtml(b.date || "-")}
                    ${escapeHtml(b.time || "")}
                  </strong>

                  <span>
                    ${escapeHtml(b.service || "-")}
                  </span>

                </div>

                ${statusPill(b.status || "รอดำเนินการ")}

              </div>
            `).join("")
            || emptyInline("ยังไม่มีนัดหมาย")
          }

        </div>

      </div>
    `;

    $("#booking-form")?.addEventListener("submit", async e => {

      e.preventDefault();

      if (!bikes.length) {
        return toast(
          "กรุณาเพิ่มรถก่อนจองคิว",
          "error"
        );
      }

      const bike = bikes.find(
        x => x.id === $("#booking-bike").value
      );

      await addDoc(
        collection(db, "bookings"),
        {
          customerId: state.user.uid,

          motorcycleId: bike.id,

          motorcycleModel:
            `${bike.brand} ${bike.model}`,

          plate: bike.plate || "",

          date: $("#booking-date").value,

          time: $("#booking-time").value,

          service: $("#booking-service").value,

          note: $("#booking-note").value,

          status: "รอดำเนินการ",

          createdAt: serverTimestamp()
        }
      );

      toast(
        "สร้างนัดหมายแล้ว",
        "success"
      );

      route("booking");
    });

    return;
  }


  // ==============================
  // ช่าง
  // ==============================
  if (role === "mechanic") {

    // ช่างต้องเห็น Booking ของลูกค้าทั้งหมด
    const bookings = await fetchCollection("bookings");

    view.innerHTML = `
      <div class="bento-grid">

        <div class="bento-card wide">

          <div class="card-head">

            <div>
              <span class="eyebrow">
                CUSTOMER BOOKINGS
              </span>

              <h3>
                นัดหมายจากลูกค้า
              </h3>
            </div>

            <span class="status info">
              ${bookings.length} รายการ
            </span>

          </div>

          ${
            bookings.map(b => `
              <div class="list-row">

                <div class="row-icon">
                  <i class="fa-solid fa-calendar-check"></i>
                </div>

                <div class="row-main">

                  <strong>
                    ${escapeHtml(
                      b.motorcycleModel || "รถไม่ระบุ"
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(b.plate || "")}
                    •
                    ${escapeHtml(b.date || "-")}
                    ${escapeHtml(b.time || "")}
                  </span>

                  <span>
                    ${escapeHtml(
                      b.service || "-"
                    )}
                    ${b.note
                      ? ` • ${escapeHtml(b.note)}`
                      : ""}
                  </span>

                </div>

                <div class="booking-actions">

                  ${statusPill(
                    b.status || "รอดำเนินการ"
                  )}

                  ${
                    b.status === "รอดำเนินการ"
                    ? `
                      <button
                        class="btn btn-small btn-primary accept-booking"
                        data-id="${b.id}"
                      >
                        <i class="fa-solid fa-check"></i>
                        รับงาน
                      </button>
                    `
                    : ""
                  }

                </div>

              </div>
            `).join("")
            || emptyInline(
              "ยังไม่มีลูกค้าจองคิว"
            )
          }

        </div>

      </div>
    `;


    // ==============================
    // ปุ่มรับงาน
    // ==============================
    $$(".accept-booking").forEach(btn => {

      btn.addEventListener("click", async () => {

        const booking = bookings.find(
          b => b.id === btn.dataset.id
        );

        if (!booking) return;

        try {

          // 1. สร้าง Repair Job
          await addDoc(
            collection(db, "repairs"),
            {
              bookingId: booking.id,

              customerId:
                booking.customerId,

              motorcycleId:
                booking.motorcycleId || "",

              motorcycleModel:
                booking.motorcycleModel || "ไม่ระบุ",

              plate:
                booking.plate || "",

              mechanicId:
                state.user.uid,

              mechanicName:
                state.profile.name || "ช่าง",

              problem:
                booking.note || booking.service || "",

              service:
                booking.service || "",

              status:
                "รอตรวจ",

              laborCost: 0,

              totalCost: 0,

              createdAt:
                serverTimestamp()
            }
          );


          // 2. เปลี่ยนสถานะ Booking
          await updateDoc(
            doc(db, "bookings", booking.id),
            {
              status: "รับงานแล้ว",

              mechanicId:
                state.user.uid,

              mechanicName:
                state.profile.name || "ช่าง",

              acceptedAt:
                serverTimestamp()
            }
          );


          toast(
            "รับงานเรียบร้อยแล้ว",
            "success"
          );

          route("booking");

        } catch (err) {

          console.error(err);

          toast(
            "รับงานไม่สำเร็จ: " + err.message,
            "error"
          );

        }

      });

    });

    return;
  }


  // ==============================
  // Owner
  // ==============================
  if (role === "owner") {

    const bookings =
      await fetchCollection("bookings");

    view.innerHTML = `
      <div class="bento-grid">

        <div class="bento-card wide">

          <span class="eyebrow">
            BOOKING MANAGEMENT
          </span>

          <h3>
            นัดหมายทั้งหมด
          </h3>

          ${
            bookings.map(b => `
              <div class="list-row">

                <div class="row-icon">
                  <i class="fa-solid fa-calendar-days"></i>
                </div>

                <div class="row-main">

                  <strong>
                    ${escapeHtml(
                      b.motorcycleModel || "รถไม่ระบุ"
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(b.date || "-")}
                    ${escapeHtml(b.time || "")}
                  </span>

                  <span>
                    ${escapeHtml(
                      b.service || "-"
                    )}
                  </span>

                </div>

                ${statusPill(
                  b.status || "รอดำเนินการ"
                )}

              </div>
            `).join("")
            || emptyInline(
              "ยังไม่มีนัดหมาย"
            )
          }

        </div>

      </div>
    `;

    return;
  }

}

async function renderJobs(view) {
  const role=state.profile.role;
  const jobs=role==="mechanic" ? await fetchCollection("repairs",[["mechanicId","==",state.user.uid]]) :
    role==="customer" ? await fetchCollection("repairs",[["customerId","==",state.user.uid]]) :
    await fetchCollection("repairs");
  view.innerHTML = `<div class="page-actions"><button class="btn btn-primary" id="new-job"><i class="fa-solid fa-plus"></i> เพิ่มงานซ่อม</button></div>
    <div class="table-card"><div class="table-head"><span>รถ</span><span>อาการ</span><span>ช่าง</span><span>สถานะ</span><span>ค่าใช้จ่าย</span></div>
    ${jobs.map(j=>`<div class="table-row" data-id="${j.id}"><span><strong>${escapeHtml(j.motorcycleModel||"-")}</strong><small>${escapeHtml(j.plate||"")}</small></span><span>${escapeHtml(j.problem||"-")}</span><span>${escapeHtml(j.mechanicName||"-")}</span><span>${statusPill(j.status)}</span><span>฿${Number(j.totalCost||0).toLocaleString()}</span></div>`).join("") || `<div class="empty-state"><i class="fa-solid fa-wrench"></i><h3>ยังไม่มีงานซ่อม</h3><p>ข้อมูลจะปรากฏเมื่อมีใบงาน</p></div>`}
    </div>`;
  $("#new-job")?.addEventListener("click",()=>{
    if(role==="customer") return toast("ลูกค้าสร้างใบงานโดยตรงไม่ได้ ให้สร้างนัดหมายแทน","info");
    openFormModal("เพิ่มงานซ่อม",[
      ["motorcycleModel","รถ / รุ่น","Honda Click 125","text"],
      ["plate","ทะเบียน","กข 1234","text"],
      ["problem","อาการ","เครื่องสั่น","text"],
      ["mechanicName","ชื่อช่าง","ช่างบอล","text"],
      ["status","สถานะ","รอตรวจ","text"],
      ["totalCost","ค่าใช้จ่าย","0","number"]
    ],async data=>{
      const record={...data,totalCost:Number(data.totalCost)||0,createdAt:serverTimestamp()};
      if(role==="mechanic") record.mechanicId=state.user.uid;
      await addDoc(collection(db,"repairs"),record);
      toast("สร้างงานซ่อมแล้ว","success"); route(role==="owner"?"jobs":"jobs");
    });
  });
  $$(".table-row").forEach(row=>row.addEventListener("click",()=>openJobDetail(jobs.find(j=>j.id===row.dataset.id))));
}

async function openJobDetail(job) {
  if(!job) return;
  const isStaff=["owner","mechanic"].includes(state.profile.role);
  const modal=document.createElement("div");
  modal.className="modal-backdrop";
  modal.innerHTML=`<div class="modal"><button class="modal-close">×</button><span class="eyebrow">WORK ORDER</span><h3>${escapeHtml(job.motorcycleModel||"งานซ่อม")}</h3>
  <div class="detail-grid">
    <div><span>อาการ</span><b>${escapeHtml(job.problem||"-")}</b></div>
    <div><span>ช่าง</span><b>${escapeHtml(job.mechanicName||"-")}</b></div>
    <div><span>สถานะ</span><b>${statusPill(job.status)}</b></div>
    <div><span>ค่าใช้จ่าย</span><b>฿${Number(job.totalCost||0).toLocaleString()}</b></div>
  </div>
  ${isStaff?`<div class="modal-actions"><select id="edit-status"><option>รอตรวจ</option><option>กำลังซ่อม</option><option>รออนุมัติ</option><option>เสร็จสิ้น</option><option>ยกเลิก</option></select><button class="btn btn-primary" id="save-status">บันทึกสถานะ</button></div>`:""}</div>`;
  $("#modal-root").appendChild(modal);
  modal.querySelector(".modal-close").onclick=()=>modal.remove();
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove()});
  modal.querySelector("#save-status")?.addEventListener("click",async()=>{
    await updateDoc(doc(db,"repairs",job.id),{status:modal.querySelector("#edit-status").value,updatedAt:serverTimestamp()});
    modal.remove(); toast("อัปเดตสถานะแล้ว","success"); route(state.route);
  });
}

async function renderHistory(view) {

  const role = state.profile.role;

  // =========================
  // Engine Lab History
  // =========================
  const calcs = await fetchCollection(
    "engineCalculations",
    [["userId", "==", state.user.uid]]
  );


  // =========================
  // Repair History
  // =========================
  let repairs = [];

  if (role === "mechanic") {

    repairs = await fetchCollection(
      "repairs",
      [["mechanicId", "==", state.user.uid]]
    );

  } else if (role === "customer") {

    repairs = await fetchCollection(
      "repairs",
      [["customerId", "==", state.user.uid]]
    );

  } else if (role === "owner") {

    repairs = await fetchCollection("repairs");

  }


  // =========================
  // สร้างหน้าเว็บ
  // =========================
  view.innerHTML = `

    <div class="bento-grid">


      <!-- =========================
           ENGINE LAB HISTORY
           ========================= -->
      <div class="bento-card wide">

        <div class="card-head">

          <div>
            <span class="eyebrow">
              ENGINE CALCULATIONS
            </span>

            <h3>
              ประวัติ Engine Lab
            </h3>
          </div>

          <span class="status info">
            ${calcs.length} รายการ
          </span>

        </div>


        ${
          calcs.length > 0

          ? calcs.map(c => `

              <div class="list-row">

                <div class="row-icon purple">
                  <i class="fa-solid fa-gauge-high"></i>
                </div>


                <div class="row-main">

                  <strong>
                    ${escapeHtml(
                      c.label || "Engine Build"
                    )}
                  </strong>

                  <span>
                    ${Number(c.cc || 0).toFixed(0)}
                    CC
                    •
                    CR ${escapeHtml(c.cr || "-")}
                    •
                    ${Number(c.rpm || 0).toLocaleString()}
                    RPM
                  </span>

                </div>


                <span class="muted">
                  ${escapeHtml(
                    c.createdAtText || ""
                  )}
                </span>

              </div>

            `).join("")

          : emptyInline(
              "ยังไม่มีแบบคำนวณที่บันทึก"
            )
        }

      </div>



      <!-- =========================
           REPAIR HISTORY
           ========================= -->
      <div class="bento-card wide">

        <div class="card-head">

          <div>
            <span class="eyebrow">
              REPAIR HISTORY
            </span>

            <h3>
              ประวัติงานซ่อม
            </h3>
          </div>

          <span class="status success">
            ${repairs.length} งาน
          </span>

        </div>


        ${
          repairs.length > 0

          ? repairs.map(j => `

              <div class="list-row">

                <div class="row-icon">
                  <i class="fa-solid fa-screwdriver-wrench"></i>
                </div>


                <div class="row-main">

                  <strong>
                    ${escapeHtml(
                      j.motorcycleModel ||
                      "รถไม่ระบุ"
                    )}
                  </strong>

                  <span>
                    ${escapeHtml(
                      j.service ||
                      j.problem ||
                      "งานซ่อม"
                    )}
                  </span>

                  ${
                    j.mechanicName
                    ? `
                      <span>
                        ช่าง:
                        ${escapeHtml(
                          j.mechanicName
                        )}
                      </span>
                    `
                    : ""
                  }

                </div>


                <div>

                  ${statusPill(
                    j.status ||
                    "รอดำเนินการ"
                  )}

                  <div
                    class="muted"
                    style="margin-top:5px;text-align:right;"
                  >
                    ฿${Number(
                      j.totalCost || 0
                    ).toLocaleString()}
                  </div>

                </div>

              </div>

            `).join("")

          : emptyInline(
              "ยังไม่มีประวัติงานซ่อม"
            )
        }

      </div>


    </div>
  `;
}

async function renderCustomers(view) {
  const customers=await fetchCollection("users",[["role","==","customer"]]);
  view.innerHTML=`<div class="table-card"><div class="table-head"><span>ลูกค้า</span><span>อีเมล</span><span>โทรศัพท์</span><span>สถานะ</span></div>
  ${customers.map(c=>`<div class="table-row"><span><strong>${escapeHtml(c.name||"-")}</strong><small>${escapeHtml(c.uid||"").slice(0,8)}</small></span><span>${escapeHtml(c.email||"-")}</span><span>${escapeHtml(c.phone||"-")}</span><span class="status success">ACTIVE</span></div>`).join("")||emptyInline("ไม่มีลูกค้า")}</div>`;
}

async function renderInventory(view) {
  const parts=await fetchCollection("parts");
  view.innerHTML=`<div class="page-actions"><button class="btn btn-primary" id="add-part"><i class="fa-solid fa-plus"></i> เพิ่มอะไหล่</button></div>
  <div class="bento-grid cards-grid">${parts.map(p=>`<div class="bento-card part-card"><div class="part-icon"><i class="fa-solid fa-box"></i></div><span class="eyebrow">PART</span><h3>${escapeHtml(p.name)}</h3><div class="spec-line"><span>ราคาขาย</span><b>฿${Number(p.price||0).toLocaleString()}</b></div><div class="spec-line"><span>คงเหลือ</span><b class="${Number(p.stock||0)<=5?'danger-text':''}">${Number(p.stock||0)}</b></div></div>`).join("")||emptyState("ยังไม่มีอะไหล่","เพิ่มอะไหล่สำหรับทดลองระบบสต๊อก")}</div>`;
  $("#add-part")?.addEventListener("click",()=>openFormModal("เพิ่มอะไหล่",[["name","ชื่ออะไหล่","น้ำมันเครื่อง","text"],["price","ราคาขาย","180","number"],["cost","ต้นทุน","120","number"],["stock","จำนวน","10","number"]],async d=>{
    await addDoc(collection(db,"parts"),{...d,price:Number(d.price)||0,cost:Number(d.cost)||0,stock:Number(d.stock)||0,createdAt:serverTimestamp()});
    toast("เพิ่มอะไหล่แล้ว","success"); route("inventory");
  }));
}

async function renderReports(view) {
  const jobs=await fetchCollection("repairs");
  const total=jobs.reduce((s,j)=>s+(Number(j.totalCost)||0),0);
  const done=jobs.filter(j=>j.status==="เสร็จสิ้น").length;
  view.innerHTML=`<div class="bento-grid">
    ${metricCard("รายได้จากงานซ่อม","฿"+total.toLocaleString(),"fa-baht-sign","orange")}
    ${metricCard("งานเสร็จ",""+done,"fa-check-double","green")}
    ${metricCard("งานทั้งหมด",""+jobs.length,"fa-clipboard-list","blue")}
    <div class="bento-card wide chart-card"><span class="eyebrow">SERVICE MIX</span><h3>สถานะงานซ่อม</h3>${["รอดำเนินการ","รอตรวจ","กำลังซ่อม","รออนุมัติ","เสร็จสิ้น","ยกเลิก"].map(s=>{const n=jobs.filter(x=>x.status===s).length; const pct=jobs.length?Math.round(n/jobs.length*100):0;return `<div class="bar-row"><span>${s}</span><div><i style="width:${pct}%"></i></div><b>${n}</b></div>`}).join("")}</div>
  </div>`;
}

function renderProfile(view) {
  const p=state.profile;
  view.innerHTML=`<div class="bento-grid"><div class="bento-card wide profile-card"><div class="avatar big">${(p.name||"U").slice(0,1).toUpperCase()}</div><div><span class="eyebrow">${escapeHtml((p.role||"").toUpperCase())}</span><h3>${escapeHtml(p.name||"-")}</h3><p class="muted">${escapeHtml(p.email||"-")}</p></div></div>
  <div class="bento-card"><span class="eyebrow">ACCOUNT ID</span><h3>${escapeHtml(p.uid||"").slice(0,16)}...</h3><p class="muted">ข้อมูลบัญชีถูกผูกกับ Firebase Authentication</p></div></div>`;
}

function renderCalculator(view) {
  view.innerHTML = calculatorHtml();
  bindCalculator();
  calcEngine();
}

function calculatorHtml() {
  return `<div class="calc-layout">
    <div class="calc-nav">
      ${["engine","cr","rod","gas","fuel","throttle","exhaust","summary"].map((id,i)=>`<button class="calc-nav-btn ${i===0?"active":""}" data-calc-tab="${id}"><span>${String(i+1).padStart(2,"0")}</span>${["กำหนดเป้าหมาย & CC","อัตราส่วนการอัด (CR)","Rod Ratio (ก้านสูบ)","ความเร็วลม (Vg)","ระบบน้ำมัน & หัวฉีด","ลิ้นเร่ง","ขนาดท่อไอเสีย","Summary"][i]}</button>`).join("")}
    </div>

    <div class="calc-workspace">
      <section id="calc-engine" class="calc-panel active"><div class="calc-header"><span class="eyebrow">01 / DISPLACEMENT</span><h3>กำหนดเป้าหมาย & คำนวณ CC</h3><p>คงสูตรเดิมจาก Engine Modify Analysis</p></div>
        <div class="calc-grid">
          <div class="input-card">
            ${numberField("bore","ขนาดลูกสูบ (Bore) [mm]","เช่น 66")}
            <div class="two-col">${numberField("stroke-orig","ระยะชักเดิม [mm]","57.9","57.9")}${numberField("stroke-plus","ระยะยืดชัก [mm]","เช่น 7")}</div>
            ${numberField("max-rpm","รอบเครื่องยนต์สูงสุด (RPM)","เช่น 10500")}
            <div class="two-col"><label>ประเภทฝาสูบ<select id="head-type"><option value="2v">ฝา 2 วาล์ว</option><option value="4v" selected>ฝา 4 วาล์ว</option></select></label><label>เชื้อเพลิง<select id="fuel-type"><option value="95">เบนซิน 95 / E10</option><option value="e20">แก๊สโซฮอล์ E20</option><option value="e85">แก๊สโซฮอล์ E85</option></select></label></div>
          </div>
          <div class="result-card orange"><span>ระยะชักรวม</span><strong id="res-total-stroke">0.00</strong><small>mm</small><div class="result-divider"></div><span>ปริมาตรกระบอกสูบรวม</span><strong class="huge" id="res-cc">0</strong><small>CC</small></div>
        </div>
      </section>

      <section id="calc-cr" class="calc-panel"><div class="calc-header"><span class="eyebrow">02 / COMPRESSION</span><h3>อัตราส่วนการอัด (CR)</h3><p>คำนวณจาก cc ฝา + ลูกตก + ปะเก็น ตามสูตรเดิม</p></div>
        <div class="calc-grid"><div class="input-card">${numberField("cc-head","CC เบ้าฝาสูบ [cc]","เช่น 13.4")}${numberField("piston-drop","ระยะลูกตก ณ TDC [mm]","เช่น 2.5")}${numberField("gasket-thick","ความหนาปะเก็นฝาสูบ [mm]","เช่น 0.5")}</div>
        <div class="result-card green"><span>CC รวมเหนือฝา</span><strong id="res-total-cc-top">0.00</strong><small>cc</small><div class="result-divider"></div><span>Compression Ratio</span><strong class="huge" id="res-cr-ratio-display">0.0:1</strong><div id="cr-status-box" class="calc-status"></div></div></div>
      </section>

      <section id="calc-rod" class="calc-panel"><div class="calc-header"><span class="eyebrow">03 / MECHANICAL</span><h3>Rod Ratio & ความเร็วลูกสูบ (MPS)</h3></div>
        <div class="calc-grid"><div class="input-card">${numberField("rod-length","ความยาวก้านสูบ [mm]","กรอกความยาวก้าน")}</div><div class="result-card purple"><span>Rod Ratio</span><strong class="huge" id="res-rod-ratio-display">0.00</strong><div id="rod-status-msg" class="calc-status"></div><div class="result-divider"></div><span>MPS ณ รอบสูงสุด</span><strong id="res-mps-val">0.00</strong><small>m/s</small><div id="mps-warning-text" class="mini-status"></div></div></div>
      </section>

      <section id="calc-gas" class="calc-panel"><div class="calc-header"><span class="eyebrow">04 / AIRFLOW</span><h3>สมการความเร็วลม (Vg)</h3></div>
        <div class="calc-grid"><div class="input-card"><div class="input-note">ฝา <b id="head-type-display-v">4V</b> — ระบบล็อกจำนวนวาล์วให้อัตโนมัติ</div>${numberField("v-in-size","ขนาดวาล์วไอดี [mm]","เช่น 26")}${numberField("v-out-size","ขนาดวาล์วไอเสีย [mm]","เช่น 22")}</div>
        <div class="result-stack"><div class="result-card blue"><span>Vg Intake</span><strong id="res-vg-in">0.00</strong><small>m/s</small><div id="vg-in-status" class="mini-status"></div></div><div class="result-card red"><span>Vg Exhaust</span><strong id="res-vg-out">0.00</strong><small>m/s</small><div id="vg-out-status" class="mini-status"></div></div></div></div>
      </section>

      <section id="calc-fuel" class="calc-panel"><div class="calc-header"><span class="eyebrow">05 / FUEL</span><h3>ระบบน้ำมัน & หัวฉีด</h3></div>
        <div class="calc-grid"><div class="input-card">${numberField("target-hp","แรงม้าที่ต้องการ (Target HP)","ระบุแรงม้าเป้าหมาย")}<div class="two-col">${numberField("input-bsfc","ค่า BSFC","0.48","0.48")}${numberField("input-duty","Duty Cycle","0.8","0.8")}</div><div class="input-note">เบนซินประมาณ 0.45–0.50 • E85 ประมาณ 0.60–0.65</div></div>
        <div class="result-card red"><span>ปริมาณน้ำมันที่ต้องการ</span><strong id="res-injector-flow">0.00</strong><small>cc/min</small><div class="result-divider"></div><span>แนะนำขนาดหัวฉีด</span><strong id="injector-range-text">-</strong></div></div>
      </section>

      <section id="calc-throttle" class="calc-panel"><div class="calc-header"><span class="eyebrow">06 / INTAKE</span><h3>สมการหาลิ้นเร่ง</h3></div>
        <div class="calc-grid"><div class="input-card">${numberField("input-ve","ประสิทธิภาพการประจุไอดี (VE)","0.90","0.90")}${numberField("input-v-target","ความเร็วลมเป้าหมาย (v) [m/s]","75","75")}</div><div class="result-card orange"><span>ขนาดลิ้นเร่งที่แนะนำ</span><strong class="huge" id="res-throttle-dia">0.0</strong><small>มิลลิเมตร (mm)</small></div></div>
      </section>

      <section id="calc-exhaust" class="calc-panel"><div class="calc-header"><span class="eyebrow">07 / EXHAUST</span><h3>สมการหาขนาดท่อไอเสีย</h3></div>
        <div class="calc-grid"><div class="result-card slate"><span>พื้นที่หน้าตัด</span><strong id="res-exhaust-area">0.000</strong><small>sq.in</small><div class="result-divider"></div><span>ขนาดคอท่อแนะนำ</span><strong class="huge" id="res-exhaust-dia">0.0</strong><small>mm</small></div><div class="bento-card inner-info"><p>สูตรเดิม: Area (sq.in) = (Vs[ci] × RPM) ÷ 88,000</p><p class="muted">ใช้เป็นแนวทางเบื้องต้นในการกำหนดขนาดคอท่อเท่านั้น</p></div></div>
      </section>

      <section id="calc-summary" class="calc-panel"><div class="calc-header row-between"><div><span class="eyebrow">08 / SUMMARY</span><h3>Engine Build Sheet</h3></div><div class="action-cluster"><button class="btn btn-ghost" id="save-calc"><i class="fa-solid fa-cloud-arrow-up"></i> บันทึก Firebase</button><button class="btn btn-primary" id="capture-calc"><i class="fa-solid fa-camera"></i> บันทึกภาพ</button></div></div>
        <div id="capture-area" class="build-sheet"><div class="build-brand"><div class="brand-mark small"><i class="fa-solid fa-motorcycle"></i></div><div><strong>ENGINE BUILD DATA SHEET</strong><span>MOTOBOX ENGINE LAB</span></div></div>
          <div class="sheet-section"><b>01. ENGINE DISPLACEMENT</b><div><span>Bore</span><strong id="d-bore">-</strong></div><div><span>Stroke</span><strong id="d-stroke">-</strong></div><div><span>Max RPM</span><strong id="d-max-rpm">-</strong></div><div><span>Head Type</span><strong id="d-head-type">-</strong></div><div><span>Total Volume</span><strong id="d-cc">-</strong> CC</div></div>
          <div class="sheet-section"><b>02. COMPRESSION RATIO</b><div><span>Head / Drop / Gasket</span><strong id="d-cc-head">0</strong> / <strong id="d-p-drop">0</strong> / <strong id="d-g-thick">0</strong></div><div><span>CR</span><strong id="d-cr">-</strong></div></div>
          <div class="sheet-section"><b>03. MECHANICAL SAFETY</b><div><span>Rod Length / Ratio</span><strong id="d-rod-len">-</strong> / <strong id="d-rod-rat">-</strong></div><div><span>Piston Speed</span><strong id="d-mps">-</strong> m/s</div></div>
          <div class="sheet-section"><b>04. PORT VELOCITY</b><div><span>Valve ID / EX</span><strong id="d-vin">-</strong> / <strong id="d-vout">-</strong></div><div><span>Vg I / E</span><strong id="d-vg-in">-</strong> / <strong id="d-vg-out">-</strong></div></div>
          <div class="sheet-section"><b>05. FUEL SYSTEM</b><div><span>Target HP / Fuel</span><strong id="d-hp">-</strong> / <strong id="d-fuel">-</strong></div><div><span>Injector</span><strong id="d-inj">-</strong> cc/min</div></div>
          <div class="sheet-section"><b>06. INTAKE DIAMETER</b><div><span>VE / Speed</span><strong id="d-ve">-</strong> / <strong id="d-vt">-</strong></div><div><span>Throttle</span><strong id="d-thr">-</strong> mm</div></div>
          <div class="sheet-section"><b>07. EXHAUST HEADER</b><div><span>Area</span><strong id="d-exh-area">-</strong> sq.in</div><div><span>Header Pipe ID</span><strong id="d-exh-dia">-</strong> mm</div></div>
          <div class="sheet-footer">MOTOBOX • FIRESTORE SAVED BUILD DATA</div>
        </div>
      </section>
    </div>
  </div>`;
}

function numberField(id,label,placeholder,value=""){ return `<label>${label}<input id="${id}" type="number" inputmode="decimal" step="any" placeholder="${placeholder}" ${value?`value="${value}"`:""}></label>`; }

function bindCalculator() {
  $$(".calc-nav-btn").forEach(b=>b.addEventListener("click",()=>{
    $$(".calc-nav-btn").forEach(x=>x.classList.remove("active"));
    $$(".calc-panel").forEach(x=>x.classList.remove("active"));
    b.classList.add("active"); $(`#calc-${b.dataset.calcTab}`).classList.add("active");
    if(b.dataset.calcTab==="summary") updateDashboard();
  }));
  $$(".calc-workspace input,.calc-workspace select").forEach(el=>el.addEventListener("input",calcEngine));
  $("#head-type").addEventListener("change",calcEngine);
  $("#fuel-type").addEventListener("change",calcEngine);
  $("#save-calc").addEventListener("click", saveCalculation);
  $("#capture-calc").addEventListener("click", captureDashboard);
}

let lastFuel = "";

function val(id){ return parseFloat(document.getElementById(id)?.value)||0; }

function calcEngine() {
  const bore=val("bore"), sOrig=val("stroke-orig"), sPlus=val("stroke-plus"), maxRpm=val("max-rpm");
  const headType=$("#head-type").value, fuel=$("#fuel-type").value;
  if(fuel!==lastFuel){ $("#input-bsfc").value = fuel==="e85" ? "0.62":"0.48"; lastFuel=fuel; }
  const totalStroke=sOrig+(sPlus*2);
  $("#res-total-stroke").textContent=totalStroke.toFixed(2);
  const ccEngine=(bore*bore*totalStroke*Math.PI)/4000;
  $("#res-cc").textContent=Math.round(ccEngine);

  const mpsVal=(totalStroke*maxRpm)/30000;
  $("#res-mps-val").textContent=mpsVal.toFixed(2);
  $("#mps-warning-text").textContent=mpsVal>21?"🚨 โอกาสพังสูง!":"🟢 ปั่นรอบได้อีก";
  $("#mps-warning-text").className=mpsVal>21?"mini-status danger-text":"mini-status success-text";

  const ccHead=val("cc-head"), pDrop=val("piston-drop"), gThick=val("gasket-thick");
  if(bore>0){
    const totalCCTop=ccHead+((bore*bore*Math.PI*pDrop)/4000)+((bore*bore*Math.PI*gThick)/4000);
    $("#res-total-cc-top").textContent=totalCCTop.toFixed(2);
    if(totalCCTop>0){
      const cr=(ccEngine+totalCCTop)/totalCCTop;
      $("#res-cr-ratio-display").textContent=cr.toFixed(1)+":1";
      const limits={'95':{'2v':11.0,'4v':11.5},'e20':{'2v':12.0,'4v':12.5},'e85':{'2v':13.5,'4v':14.0}};
      const safeLimit=limits[fuel]?.[headType]??11.5;
      const status=$("#cr-status-box");
      if(cr<8.5){status.textContent="⚠️ ต่ำเกินไป";status.className="calc-status warn-text";}
      else if(cr<=safeLimit){status.textContent=`✅ ปลอดภัย (${fuel.toUpperCase()})`;status.className="calc-status success-text";}
      else{status.textContent=`🚨 อันตราย (เกิน ${safeLimit}:1)`;status.className="calc-status danger-text";}
    }
  }

  const rodLength=val("rod-length");
  if(rodLength>0 && totalStroke>0){
    const rodRatio=rodLength/totalStroke;
    $("#res-rod-ratio-display").textContent=rodRatio.toFixed(2);
    $("#rod-status-msg").textContent=rodRatio<1.5?"เน้นทอร์ค (มุมงัดมาก)":"เน้นปั่นรอบ (มุมงัดน้อย)";
    $("#rod-status-msg").className=rodRatio<1.5?"calc-status warn-text":"calc-status info-text";
  }

  $("#head-type-display-v").textContent=headType.toUpperCase();
  const vInCount=headType==="4v"?2:1, vOutCount=headType==="4v"?2:1;
  const vInSize=val("v-in-size"), vOutSize=val("v-out-size");
  const pistonArea=(bore*bore*Math.PI)/4;
  if(vInSize>0 && mpsVal>0){
    const vgIn=(pistonArea/((vInSize*vInSize*Math.PI/4)*vInCount))*mpsVal;
    $("#res-vg-in").textContent=vgIn.toFixed(2);
    $("#vg-in-status").textContent=vgIn>=75&&vgIn<=85?"Sweet Spot!":vgIn>90?"อั้นรอบสูง!":"ย่านใช้งาน";
  }
  if(vOutSize>0 && mpsVal>0){
    const vgOut=(pistonArea/((vOutSize*vOutSize*Math.PI/4)*vOutCount))*mpsVal;
    $("#res-vg-out").textContent=vgOut.toFixed(2);
    $("#vg-out-status").textContent=vgOut>=85&&vgOut<=100?"คายไอเสียสมบูรณ์":"ย่านใช้งาน";
  }

  const targetHP=val("target-hp"), bsfc=val("input-bsfc"), duty=val("input-duty")||0.8;
  if(targetHP>0 && bsfc>0 && duty>0){
    const injectorFlow=(targetHP*bsfc*10.5)/duty;
    $("#res-injector-flow").textContent=injectorFlow.toFixed(2);
    const minRange=Math.floor(injectorFlow/10)*10;
    $("#injector-range-text").textContent=`${minRange} cc - ${minRange+30} cc`;
  }

  const ve=val("input-ve")||0.90, vTarget=val("input-v-target")||75;
  if(ccEngine>0 && maxRpm>0 && vTarget>0) $("#res-throttle-dia").textContent=Math.sqrt((ccEngine*maxRpm*ve)/(20*vTarget)).toFixed(1);

  if(ccEngine>0 && maxRpm>0){
    const ciEngine=ccEngine*0.0610237;
    const areaSqIn=(ciEngine*maxRpm)/88000;
    $("#res-exhaust-area").textContent=areaSqIn.toFixed(3);
    $("#res-exhaust-dia").textContent=(Math.sqrt((areaSqIn*4)/Math.PI)*25.4).toFixed(1);
  }
}

function updateDashboard(){
  const map={
    "d-bore":$("#bore").value||"-","d-stroke":$("#res-total-stroke").textContent||"-","d-max-rpm":$("#max-rpm").value||"-",
    "d-head-type":$("#head-type").value.toUpperCase(),"d-cc":$("#res-cc").textContent||"-","d-cc-head":$("#cc-head").value||"0",
    "d-p-drop":$("#piston-drop").value||"0","d-g-thick":$("#gasket-thick").value||"0","d-cr":$("#res-cr-ratio-display").textContent||"-",
    "d-rod-len":$("#rod-length").value||"-","d-rod-rat":$("#res-rod-ratio-display").textContent||"-","d-mps":$("#res-mps-val").textContent||"-",
    "d-vin":$("#v-in-size").value||"-","d-vout":$("#v-out-size").value||"-","d-vg-in":$("#res-vg-in").textContent||"-","d-vg-out":$("#res-vg-out").textContent||"-",
    "d-hp":$("#target-hp").value||"-","d-fuel":$("#fuel-type").value.toUpperCase()||"-","d-inj":$("#res-injector-flow").textContent||"-",
    "d-ve":$("#input-ve").value||"-","d-vt":$("#input-v-target").value||"-","d-thr":$("#res-throttle-dia").textContent||"-",
    "d-exh-area":$("#res-exhaust-area").textContent||"-","d-exh-dia":$("#res-exhaust-dia").textContent||"-"
  };
  Object.entries(map).forEach(([id,v])=>{ const el=$("#"+id); if(el) el.textContent=v; });
}

function currentCalcData(){
  updateDashboard();
  return {
    label: `${$("#bore").value||"?"} bore / ${$("#res-cc").textContent||0} CC`,
    bore:val("bore"), stroke:val("stroke-orig"), strokePlus:val("stroke-plus"), totalStroke:val("res-total-stroke"),
    rpm:val("max-rpm"), headType:$("#head-type").value, fuel:$("#fuel-type").value, cc:Number($("#res-cc").textContent)||0,
    ccHead:val("cc-head"), pistonDrop:val("piston-drop"), gasket:val("gasket-thick"), cr:$("#res-cr-ratio-display").textContent,
    rodLength:val("rod-length"), rodRatio:$("#res-rod-ratio-display").textContent, mps:Number($("#res-mps-val").textContent)||0,,
    vIn:val("v-in-size"), vOut:val("v-out-size"), vgIn:$("#res-vg-in").textContent, vgOut:$("#res-vg-out").textContent,
    hp:val("target-hp"), bsfc:val("input-bsfc"), duty:val("input-duty"), injector:$("#res-injector-flow").textContent,
    ve:val("input-ve"), vTarget:val("input-v-target"), throttle:$("#res-throttle-dia").textContent,
    exhaustArea:$("#res-exhaust-area").textContent, exhaustDia:$("#res-exhaust-dia").textContent,
    userId:state.user.uid, createdAt:serverTimestamp(), createdAtText:new Date().toLocaleString("th-TH")
  };
}

async function saveCalculation(){
  if(!state.user) return;
  await addDoc(collection(db,"engineCalculations"),currentCalcData());
  toast("บันทึกแบบคำนวณลง Firebase แล้ว","success");
}

async function captureDashboard(){
  updateDashboard();
  const area=$("#capture-area");
  try{
    if(window.html2canvas===undefined){
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
    }
    const canvas=await window.html2canvas(area,{scale:2,backgroundColor:"#111318"});
    const link=document.createElement("a");
    link.download=`MOTOBOX_EngineBuild_${Date.now()}.png`;
    link.href=canvas.toDataURL("image/png");
    link.click();
  }catch(err){ toast("สร้างภาพไม่สำเร็จ: "+err.message,"error"); }
}

function loadScript(src){
  return new Promise((resolve,reject)=>{
    const s=document.createElement("script"); s.src=src;s.onload=resolve;s.onerror=reject;document.head.appendChild(s);
  });
}

function openFormModal(title, fields, onSubmit){
  const modal=document.createElement("div");
  modal.className="modal-backdrop";
  modal.innerHTML=`<div class="modal"><button class="modal-close">×</button><span class="eyebrow">MOTOBOX FORM</span><h3>${escapeHtml(title)}</h3><form id="generic-form" class="form-grid">${fields.map(([id,label,ph,type])=>`<label>${escapeHtml(label)}<input id="f-${id}" type="${type||"text"}" placeholder="${escapeHtml(ph||"")}" required></label>`).join("")}<button class="btn btn-primary full" type="submit">บันทึกข้อมูล</button></form></div>`;
  $("#modal-root").appendChild(modal);
  modal.querySelector(".modal-close").onclick=()=>modal.remove();
  modal.addEventListener("click",e=>{if(e.target===modal)modal.remove()});
  modal.querySelector("#generic-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const data={}; fields.forEach(([id])=>data[id]=modal.querySelector("#f-"+id).value);
    try{ await onSubmit(data); modal.remove(); }catch(err){toast(err.message,"error");}
  });
}

function emptyState(title,desc){return `<div class="empty-state wide"><i class="fa-solid fa-motorcycle"></i><h3>${escapeHtml(title)}</h3><p>${escapeHtml(desc)}</p></div>`;}

window.routeForUI=(r)=>route(r);

if(!firebaseConfigured){
  toast("โหมดตัวอย่าง: ตั้งค่า firebase-config.js เพื่อเปิด Auth/Firestore","info");
}
