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
  updateDoc,
  onSnapshot
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

// ==========================================
// NOTIFICATION SYSTEM
// ==========================================

let notificationUnsubs = [];
let notificationStore = new Map();
let notificationInitialSnapshots = 0;
let notificationListenerCount = 0;
let notificationReady = false;
let notificationButtonBound = false;
let notificationOutsideClickBound = false;

function ensureNotificationUI() {
  const topUser = document.querySelector(".top-user");
  if (!topUser) return;

  let btn = document.querySelector("#notification-btn");

  // ใช้ปุ่มจาก index.html ถ้ามีอยู่แล้ว
  // ถ้าไม่มี ค่อยสร้างให้เอง
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "notification-btn";
    btn.className = "notification-btn";
    btn.title = "การแจ้งเตือน";
    btn.innerHTML =
      '<i class="fa-solid fa-bell"></i>' +
      '<span id="notification-count" class="notification-count hidden">0</span>';

    topUser.insertBefore(btn, topUser.firstElementChild);
  }

  // ถ้ามีปุ่มแล้ว แต่ไม่มีตัวเลข
  if (!btn.querySelector("#notification-count")) {
    const count = document.createElement("span");
    count.id = "notification-count";
    count.className = "notification-count hidden";
    count.textContent = "0";
    btn.appendChild(count);
  }

  // ผูก event แค่ครั้งเดียว
  if (!notificationButtonBound) {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      renderNotificationPanel();
    });
    notificationButtonBound = true;
  }

  // ปิด panel เมื่อคลิกข้างนอก
  if (!notificationOutsideClickBound) {
    document.addEventListener("click", (e) => {
      const panel = document.querySelector("#notification-panel");
      const button = document.querySelector("#notification-btn");

      if (!panel) return;

      if (
        !panel.contains(e.target) &&
        e.target !== button &&
        !button?.contains(e.target)
      ) {
        panel.remove();
      }
    });

    notificationOutsideClickBound = true;
  }

  // CSS ของ Notification
  if (!document.querySelector("#notification-inline-style")) {
    const style = document.createElement("style");
    style.id = "notification-inline-style";
    style.textContent = `
      .notification-btn{
        width:40px;
        height:40px;
        border-radius:12px;
        border:1px solid var(--line);
        background:var(--panel2);
        color:#cbd2d9;
        display:grid;
        place-items:center;
        position:relative;
        cursor:pointer;
        flex:none;
      }

      .notification-btn:hover{
        color:#fff;
        border-color:var(--orange);
      }

      .notification-count{
        position:absolute;
        top:-5px;
        right:-5px;
        min-width:18px;
        height:18px;
        padding:0 5px;
        display:grid;
        place-items:center;
        background:var(--red);
        color:#fff;
        border-radius:999px;
        font-size:9px;
        font-weight:700;
        border:2px solid var(--bg);
      }

      .notification-count.hidden{
        display:none;
      }

      .notification-dashboard-card{
        background:
          linear-gradient(
            145deg,
            rgba(255,122,0,.10),
            var(--panel)
          );
      }

      .notification-big-icon{
        color:var(--orange);
        font-size:20px;
      }

      .notification-row{
        display:flex;
        align-items:center;
        gap:12px;
        padding:12px 0;
        border-bottom:1px solid var(--line);
        cursor:pointer;
      }

      .notification-row:last-child{
        border-bottom:0;
      }

      .notification-row:hover{
        opacity:.86;
      }

      .notification-row.unread{
        background:rgba(255,122,0,.05);
        border-radius:12px;
        padding-left:8px;
        padding-right:8px;
      }

      .notification-row-icon{
        width:38px;
        height:38px;
        border-radius:12px;
        background:rgba(255,122,0,.10);
        color:var(--orange);
        display:grid;
        place-items:center;
        flex:none;
      }

      .notification-row-main{
        min-width:0;
        flex:1;
      }

      .notification-row-main strong{
        display:block;
        margin-bottom:3px;
      }

      .notification-row-main span{
        display:block;
        color:var(--muted);
        font-size:12px;
        line-height:1.5;
        word-break:break-word;
      }

      .notification-row-time{
        font-size:10px;
        color:var(--muted);
        white-space:nowrap;
      }

      .notification-panel{
        position:fixed;
        top:76px;
        right:24px;
        width:min(390px,calc(100vw - 32px));
        max-height:70vh;
        overflow:auto;
        z-index:9999;
        background:var(--panel);
        border:1px solid var(--line);
        border-radius:20px;
        box-shadow:var(--shadow);
        padding:16px;
      }

      .notification-panel-head{
        display:flex;
        justify-content:space-between;
        align-items:center;
        gap:12px;
        margin-bottom:8px;
      }

      .notification-panel-close{
        border:0;
        background:transparent;
        color:var(--muted);
        font-size:22px;
        cursor:pointer;
      }

      .notification-empty{
        min-height:80px;
        display:flex;
        align-items:center;
        justify-content:center;
        gap:10px;
        color:var(--muted);
        font-size:13px;
        text-align:center;
      }

      @media(max-width:650px){
        .notification-panel{
          top:68px;
          right:12px;
          width:calc(100vw - 24px);
        }

        .notification-row-time{
          display:none;
        }
      }
    `;

    document.head.appendChild(style);
  }
}

function notificationIcon(type="") {
  if (type === "new_booking") return "fa-calendar-check";
  if (type === "job_accepted") return "fa-screwdriver-wrench";
  if (type === "status_change") return "fa-arrows-rotate";
  if (type === "repair_note") return "fa-comment-dots";
  if (type === "mechanic_note") return "fa-user-gear";
  return "fa-bell";
}

function notificationTime(data) {
  const raw = data?.createdAt;

  if (!raw) return "เมื่อสักครู่";

  try {
    const d = raw.toDate ? raw.toDate() : new Date(raw);

    if (Number.isNaN(d.getTime())) {
      return "เมื่อสักครู่";
    }

    return d.toLocaleString("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  } catch {
    return "เมื่อสักครู่";
  }
}

function startNotificationListener() {
  notificationUnsubs.forEach(unsub => {
    try {
      unsub();
    } catch {}
  });

  notificationUnsubs = [];
  notificationStore = new Map();
  notificationInitialSnapshots = 0;
  notificationListenerCount = 0;
  notificationReady = false;

  ensureNotificationUI();

  if (!state.user || !state.profile) {
    renderNotificationUI();
    return;
  }

  const uid = state.user.uid;
  const role = state.profile.role;
  const listeners = [];

  // Notification ส่วนตัว
  listeners.push(
    query(
      collection(db, "notifications"),
      where("recipientId", "==", uid),
      limit(30)
    )
  );

  // Notification สำหรับ Mechanic / Owner
  if (role === "mechanic" || role === "owner") {
    listeners.push(
      query(
        collection(db, "notifications"),
        where("audience", "==", "staff"),
        limit(30)
      )
    );
  }

  // Notification สำหรับ Owner
  if (role === "owner") {
    listeners.push(
      query(
        collection(db, "notifications"),
        where("audience", "==", "owner"),
        limit(30)
      )
    );
  }

  notificationListenerCount = listeners.length;

  listeners.forEach((qref) => {
    const unsub = onSnapshot(
      qref,
      snapshot => {

        // ข้อมูลชุดแรก = Notification เก่า
        // ไม่ต้อง Toast
        const isInitial =
          notificationInitialSnapshots <
          notificationListenerCount;

        snapshot.forEach(docSnap => {
          const old =
            notificationStore.get(docSnap.id);

          notificationStore.set(
            docSnap.id,
            {
              id: docSnap.id,
              ...docSnap.data(),
              _toastShown:
                old?._toastShown || false
            }
          );
        });

        notificationInitialSnapshots++;

        if (
          notificationInitialSnapshots >=
          notificationListenerCount
        ) {
          notificationReady = true;
        }

        // หลังจากโหลดข้อมูลเก่าเสร็จแล้ว
        // Notification ใหม่จึง Toast
        if (!isInitial && notificationReady) {
          snapshot.docChanges().forEach(change => {

            if (change.type !== "added") return;

            const data = change.doc.data();
            const current =
              notificationStore.get(change.doc.id);

            if (!current?._toastShown) {

              notificationStore.set(
                change.doc.id,
                {
                  id: change.doc.id,
                  ...data,
                  _toastShown: true
                }
              );

              showNotificationToast(data);
            }
          });
        }

        renderNotificationUI();
      },

      error => {
        console.error(
          "Notification listener error:",
          error
        );

        renderNotificationUI();
      }
    );

    notificationUnsubs.push(unsub);
  });

  renderNotificationUI();
}

function showNotificationToast(data) {
  const title =
    data?.title || "มีการแจ้งเตือนใหม่";

  const message =
    data?.message || "";

  toast(
    `${title}: ${message}`,
    "info"
  );
}

function getNotificationItems() {
  return [...notificationStore.values()]
    .sort((a, b) => {

      const ta =
        a.createdAt?.toMillis
          ? a.createdAt.toMillis()
          : 0;

      const tb =
        b.createdAt?.toMillis
          ? b.createdAt.toMillis()
          : 0;

      return tb - ta;
    });
}

function renderNotificationUI() {
  ensureNotificationUI();

  const items =
    getNotificationItems();

  const unread =
    items.filter(
      item => item.read !== true
    ).length;

  // จำนวนบนกระดิ่ง
  const count =
    $("#notification-count");

  if (count) {

    count.textContent =
      unread > 99
        ? "99+"
        : String(unread);

    count.classList.toggle(
      "hidden",
      unread === 0
    );
  }

  // Card บน Dashboard
  const dashboard =
    $("#dashboard-notifications");

  if (dashboard) {

    dashboard.innerHTML =
      items.length
        ? items
            .slice(0, 5)
            .map(notificationRowHtml)
            .join("")
        : `
          <div class="notification-empty">
            <i class="fa-regular fa-bell"></i>
            ยังไม่มีการแจ้งเตือน
          </div>
        `;

    bindNotificationRows(dashboard);
  }

  // อัปเดต Panel ถ้าเปิดอยู่
  const panel =
    $("#notification-panel");

  if (panel) {
    renderNotificationPanel(true);
  }
}

function notificationRowHtml(n) {

  return `
    <div
      class="${
        n.read === true
          ? "notification-row"
          : "notification-row unread"
      }"
      data-notification-id="${escapeHtml(n.id)}"
    >

      <div class="notification-row-icon">
        <i class="fa-solid ${notificationIcon(n.type)}"></i>
      </div>

      <div class="notification-row-main">

        <strong>
          ${escapeHtml(
            n.title || "แจ้งเตือน"
          )}
        </strong>

        <span>
          ${escapeHtml(
            n.message || ""
          )}
        </span>

      </div>

      <div class="notification-row-time">
        ${escapeHtml(
          notificationTime(n)
        )}
      </div>

    </div>
  `;
}

function bindNotificationRows(root) {
  if (!root) return;

  root
    .querySelectorAll(
      ".notification-row"
    )
    .forEach(row => {

      row.onclick = async () => {

        const id =
          row.dataset.notificationId;

        const notification =
          notificationStore.get(id);

        if (!notification) return;

        const relatedType =
          notification.relatedType;

        if (
          notification.read !== true
        ) {

          try {

            await updateDoc(
              doc(
                db,
                "notifications",
                id
              ),
              {
                read: true
              }
            );

            const current =
              notificationStore.get(id);

            if (current) {
              current.read = true;
              notificationStore.set(
                id,
                current
              );
            }

            renderNotificationUI();

          } catch (err) {

            console.error(
              "Mark notification as read:",
              err
            );

            toast(
              "อ่านแจ้งเตือนไม่สำเร็จ",
              "error"
            );
          }
        }

        document
          .querySelector(
            "#notification-panel"
          )
          ?.remove();

        if (relatedType === "booking") {
          route("booking");
        }

        if (relatedType === "repair") {
          route(
            state.profile.role === "customer"
              ? "repairs"
              : "jobs"
          );
        }
      };
    });
}

function renderNotificationPanel(refreshOnly = false) {

  const old =
    document.querySelector(
      "#notification-panel"
    );

  if (old && !refreshOnly) {
    old.remove();
    return;
  }

  let panel = old;

  if (!panel) {
    panel =
      document.createElement("div");

    panel.id =
      "notification-panel";

    panel.className =
      "notification-panel";

    document.body.appendChild(panel);
  }

  const items =
    getNotificationItems();

  panel.innerHTML = `
    <div class="notification-panel-head">

      <div>
        <span class="eyebrow">
          NOTIFICATIONS
        </span>

        <h3>
          การแจ้งเตือน
        </h3>
      </div>

      <div
        style="
          display:flex;
          align-items:center;
          gap:8px;
        "
      >

        <button
          id="mark-all-notifications"
          class="notification-panel-close"
          style="font-size:11px;"
        >
          อ่านทั้งหมด
        </button>

        <button
          id="close-notification-panel"
          class="notification-panel-close"
          aria-label="ปิด"
        >
          ×
        </button>

      </div>

    </div>

    <div class="notification-panel-list">

      ${
        items.length
          ? items
              .map(notificationRowHtml)
              .join("")
          : `
            <div class="notification-empty">
              <i class="fa-regular fa-bell"></i>
              ยังไม่มีการแจ้งเตือน
            </div>
          `
      }

    </div>
  `;

  $("#close-notification-panel")
    ?.addEventListener(
      "click",
      () => panel.remove()
    );

  $("#mark-all-notifications")
    ?.addEventListener(
      "click",
      markAllNotificationsRead
    );

  bindNotificationRows(panel);
}

async function markAllNotificationsRead() {

  const unread =
    getNotificationItems().filter(
      n => n.read !== true
    );

  if (!unread.length) {
    toast(
      "ไม่มีแจ้งเตือนที่ยังไม่ได้อ่าน",
      "info"
    );
    return;
  }

  try {

    for (const notification of unread) {

      await updateDoc(
        doc(
          db,
          "notifications",
          notification.id
        ),
        {
          read: true
        }
      );

      const current =
        notificationStore.get(
          notification.id
        );

      if (current) {
        current.read = true;
        notificationStore.set(
          notification.id,
          current
        );
      }
    }

    renderNotificationUI();
    renderNotificationPanel(true);

  } catch (err) {

    console.error(
      "Mark all notifications:",
      err
    );

    toast(
      "อ่านแจ้งเตือนทั้งหมดไม่สำเร็จ",
      "error"
    );
  }
}

function notificationCardHtml() {

  return `
    <div
      class="bento-card wide notification-dashboard-card"
    >

      <div class="card-head">

        <div>
          <span class="eyebrow">
            NOTIFICATIONS
          </span>

          <h3>
            แจ้งเตือนล่าสุด
          </h3>
        </div>

        <i
          class="fa-solid fa-bell notification-big-icon"
        ></i>

      </div>

      <div id="dashboard-notifications">

        <div class="notification-empty">
          <i class="fa-regular fa-bell"></i>
          กำลังโหลดการแจ้งเตือน...
        </div>

      </div>

    </div>
  `;
}

function createNotification(data) {
  return addDoc(
    collection(db, "notifications"),
    {
      ...data,
      read: false,
      createdAt: serverTimestamp()
    }
  );
}

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
  ensureNotificationUI();
  startNotificationListener();
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
$$("[data-action]").forEach(b => b.addEventListener("click", async () => {

  const action = b.dataset.action;

  // ปิด Sidebar เมื่อกดเมนูด้านล่างบนมือถือ
  if (window.innerWidth < 900) {
    $(".sidebar").classList.remove("open");
  }

  // ออกจากระบบ
  if (action === "logout") {

    await signOut(auth);
    return;

  }

  // ไปยังหน้าที่เลือก
  route(action);

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
  const [customers, jobs] = await Promise.all([
    fetchCollection("users", [["role", "==", "customer"]]),
    fetchCollection("repairs")
  ]);
    jobs.sort((a, b) => {

  const timeA =
    a.createdAt?.toMillis
      ? a.createdAt.toMillis()
      : a.createdAt
        ? new Date(a.createdAt).getTime()
        : 0;

  const timeB =
    b.createdAt?.toMillis
      ? b.createdAt.toMillis()
      : b.createdAt
        ? new Date(b.createdAt).getTime()
        : 0;

  return timeB - timeA;
});

  const total = jobs.reduce(
    (sum, job) => sum + (Number(job.totalCost) || 0),
    0
  );

  view.innerHTML = `
    <div class="bento-grid dashboard-grid">

      <!-- รายได้รวม -->
      ${metricCard(
        "รายได้รวม",
        "฿" + total.toLocaleString(),
        "fa-baht-sign",
        "orange"
      )}

      <!-- จำนวนลูกค้า -->
      ${metricCard(
        "ลูกค้า",
        String(customers.length),
        "fa-users",
        "blue"
      )}

      <!-- จำนวนงานซ่อม -->
      ${metricCard(
        "งานซ่อม",
        String(jobs.length),
        "fa-screwdriver-wrench",
        "green"
      )}

      <!-- งานล่าสุด -->
      <div class="bento-card wide">

        <div class="card-head">

          <div>
            <span class="eyebrow">
              SERVICE FLOW
            </span>

            <h3>
              ภาพรวมงานล่าสุด
            </h3>
          </div>

          <button
            class="icon-btn"
            onclick="location.hash='jobs'"
            title="ดูงานซ่อม"
          >
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </button>

        </div>

        ${
          jobs.length
            ? jobs
                .slice(0, 6)
                .map(job => `
                  <div class="list-row">

                    <div class="row-icon">
                      <i class="fa-solid fa-wrench"></i>
                    </div>

                    <div class="row-main">

                      <strong>
                        ${escapeHtml(
                          job.motorcycleModel ||
                          "รถไม่ระบุ"
                        )}
                      </strong>

                      <span>
                        ${escapeHtml(
                          job.problem ||
                          "งานซ่อม"
                        )}
                      </span>

                    </div>

                    ${statusPill(job.status)}

                  </div>
                `)
                .join("")
            : emptyInline("ยังไม่มีงานซ่อม")
        }

      </div>

      <!-- แจ้งเตือน -->
      ${notificationCardHtml()}

    </div>
  `;

  // อัปเดต Notification บน Dashboard
  renderNotificationUI();

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
      ${notificationCardHtml()}
      <div class="bento-card accent-card"><i class="fa-solid fa-bolt"></i><span class="eyebrow">ENGINE LAB</span><h3>คำนวณสเปกก่อนลงมือ</h3><p>CC • CR • Rod Ratio • Vg • หัวฉีด • ลิ้นเร่ง • ท่อไอเสีย</p><button class="btn btn-ghost" onclick="window.routeForUI('calculator')">เปิด Engine Lab</button></div>
    </div>`;
    renderNotificationUI();
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
      ${notificationCardHtml()}
      <div class="bento-card"><div class="card-head"><div><span class="eyebrow">NEXT STEP</span><h3>อยากเข้าร้านเมื่อไหร่?</h3></div></div><p class="muted">จองคิวซ่อม/เช็กระยะได้จากมือถือในไม่กี่คลิก</p><button class="btn btn-primary" onclick="window.routeForUI('booking')"><i class="fa-solid fa-calendar-plus"></i> นัดหมายเลย</button></div>
      <div class="bento-card accent-card"><span class="eyebrow">ENGINE LAB</span><h3>เก็บสเปกเครื่องไว้กับบัญชีคุณ</h3><p>สามารถคำนวณสเปกเครื่องในแบบที่ต้องการคร่าวๆ และบันทึกเก็บไว้ได้</p><button class="btn btn-ghost" onclick="window.routeForUI('calculator')">เปิดเครื่องคำนวณ</button></div>
    </div>`;
  }
}

function metricCard(label,value,icon,tone){
  return `<div class="bento-card metric ${tone}">
    <div class="metric-icon">
      <i class="fa-solid ${icon}"></i>
    </div>
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  </div>`;
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
              รายละเอียดอาการ / สิ่งที่ต้องการ **กรุณาใส่เบอร์โทรศัพท์ต่อท้าย เพื่อให้การติดต่อง่ายขึ้น**
              <input
                id="booking-note"
                placeholder="เช่น มีเสียงดังตอนเร่ง" **กรุณาใส่เบอร์โทรศัพท์ต่อท้าย เพื่อให้การติดต่อง่ายขึ้น**
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

      const bookingRef = await addDoc(
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

      await addDoc(
  collection(db, "notifications"),
  {
    audience: "staff",
    type: "new_booking",

    title: "มีนัดหมายใหม่",

    message:
      `${bike.brand} ${bike.model} ` +
      `วันที่ ${$("#booking-date").value} ` +
      `เวลา ${$("#booking-time").value}`,

    relatedType: "booking",

    relatedId: bookingRef.id,

    createdBy: state.user.uid,

    read: false,

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


          await addDoc(collection(db,"notifications"), { recipientId: booking.customerId, type: "job_accepted", title: "ช่างรับงานแล้ว", message: `${booking.motorcycleModel || "รถของคุณ"} ได้รับการรับงานจากช่างแล้ว`, relatedType: "booking", relatedId: booking.id, createdBy: state.user.uid, read:false, createdAt:serverTimestamp() });

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
  const role = state.profile.role;

  let jobs =
    role === "mechanic"
      ? await fetchCollection(
          "repairs",
          [["mechanicId", "==", state.user.uid]]
        )
      : role === "customer"
        ? await fetchCollection(
            "repairs",
            [["customerId", "==", state.user.uid]]
          )
        : await fetchCollection("repairs");

  // เรียงงานซ่อมจาก "เพิ่มล่าสุด → เก่าสุด"
  jobs.sort((a, b) => {

    const timeA =
      a.createdAt?.toMillis
        ? a.createdAt.toMillis()
        : a.createdAt
          ? new Date(a.createdAt).getTime()
          : 0;

    const timeB =
      b.createdAt?.toMillis
        ? b.createdAt.toMillis()
        : b.createdAt
          ? new Date(b.createdAt).getTime()
          : 0;

    return timeB - timeA;
  });
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
  if (!job) return;

  const role = state.profile.role;
  const isOwner = role === "owner";
  const isMechanic = role === "mechanic";

  // งานที่เสร็จสิ้นแล้ว
  const isCompleted = job.status === "เสร็จสิ้น";

  // ช่างแก้ได้เฉพาะงานที่ยังไม่เสร็จ
  const canEdit = isOwner || (isMechanic && !isCompleted);

  const modal = document.createElement("div");

  modal.className = "modal-backdrop";

  modal.innerHTML = `
    <div class="modal">

      <button class="modal-close">×</button>

      <span class="eyebrow">
        WORK ORDER
      </span>

      <h3>
        ${escapeHtml(
          job.motorcycleModel || "งานซ่อม"
        )}
      </h3>


      <div class="detail-grid">

        <div>
          <span>ทะเบียน</span>
          <b>
            ${escapeHtml(job.plate || "-")}
          </b>
        </div>


        <div>
          <span>อาการ</span>
          <b>
            ${escapeHtml(job.problem || "-")}
          </b>
        </div>


        <div>
          <span>ช่าง</span>
          <b>
            ${escapeHtml(job.mechanicName || "-")}
          </b>
        </div>


        <div>
          <span>สถานะปัจจุบัน</span>
          <b>
            ${statusPill(job.status)}
          </b>
        </div>

      </div>


      ${
        canEdit
          ? `
            <div class="job-edit-box">

              <label>
                สถานะงาน

                <select id="edit-status">

                  <option value="รอตรวจ"
                    ${job.status === "รอตรวจ" ? "selected" : ""}>
                    รอตรวจ
                  </option>

                  <option value="กำลังซ่อม"
                    ${job.status === "กำลังซ่อม" ? "selected" : ""}>
                    กำลังซ่อม
                  </option>

                  <option value="รออนุมัติ"
                    ${job.status === "รออนุมัติ" ? "selected" : ""}>
                    รออนุมัติ
                  </option>

                  <option value="เสร็จสิ้น"
                    ${job.status === "เสร็จสิ้น" ? "selected" : ""}>
                    เสร็จสิ้น
                  </option>

                </select>

              </label>


              <label>
                ค่าใช้จ่ายรวม (บาท)

                <input
                  id="edit-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value="${Number(job.totalCost || 0)}"
                  placeholder="0"
                >

              </label>
              <label>
  หมายเหตุถึงลูกค้า

  <textarea
    id="edit-note-customer"
    rows="4"
    placeholder="เช่น พบว่าผ้าเบรกสึก ควรเปลี่ยนภายในระยะถัดไป"
  >${escapeHtml(
    job.noteToCustomer || ""
  )}</textarea>

</label>


<label>
  หมายเหตุถึงเจ้าของร้าน

  <textarea
    id="edit-note-owner"
    rows="4"
    placeholder="เช่น ต้องสั่งอะไหล่เพิ่ม หรือพบปัญหาเพิ่มเติม"
  >${escapeHtml(
    job.noteToOwner || ""
  )}</textarea>

</label>


              ${
                isOwner
                  ? `
                    <div class="edit-note owner-note">
                      <i class="fa-solid fa-crown"></i>
                      เจ้าของร้านสามารถแก้ไขงานที่เสร็จสิ้นแล้วได้
                    </div>
                  `
                  : `
                    <div class="edit-note">
                      <i class="fa-solid fa-circle-info"></i>
                      ช่างสามารถแก้ไขงานได้จนกว่าจะบันทึกเป็น "เสร็จสิ้น"
                    </div>
                  `
              }


              <div class="modal-actions">

                <button
                  class="btn btn-primary"
                  id="save-job"
                >
                  <i class="fa-solid fa-floppy-disk"></i>
                  บันทึกการเปลี่ยนแปลง
                </button>

              </div>

            </div>
          `
          : `
            <div class="job-locked-box">

              <i class="fa-solid fa-lock"></i>

              <strong>
                งานนี้ปิดแล้ว
              </strong>

              <span>
                งานที่บันทึกเป็น "เสร็จสิ้น"
                ไม่สามารถแก้ไขโดยช่างได้
              </span>

              <small>
                หากต้องการแก้ไข ให้เจ้าของร้านเป็นผู้ดำเนินการ
              </small>

            </div>
          `
      }


      <div class="cost-summary">

        <span>
          ค่าใช้จ่ายปัจจุบัน
        </span>

        <strong>
          ฿${Number(job.totalCost || 0).toLocaleString()}
        </strong>

      </div>

    </div>
  `;


  $("#modal-root").appendChild(modal);


  // ปุ่มปิด
  modal.querySelector(".modal-close").onclick = () => {
    modal.remove();
  };


  // คลิกพื้นที่ด้านนอกเพื่อปิด
  modal.addEventListener("click", (e) => {

    if (e.target === modal) {
      modal.remove();
    }

  });


  // ไม่มีสิทธิ์แก้ไข
  if (!canEdit) {
    return;
  }


  // ปุ่มบันทึก
  modal
    .querySelector("#save-job")
    ?.addEventListener("click", async () => {

      try {

        const newStatus =
          modal.querySelector("#edit-status").value;

        const newCost =
          Number(
            modal.querySelector("#edit-cost").value
          ) || 0;

        const noteToCustomer =
  modal
    .querySelector("#edit-note-customer")
    ?.value
    .trim() || "";

const noteToOwner =
  modal
    .querySelector("#edit-note-owner")
    ?.value
    .trim() || "";


        // ถ้าเป็นช่าง ห้ามแก้งานที่เสร็จสิ้น
        if (isMechanic && job.status === "เสร็จสิ้น") {

          toast(
            "งานนี้เสร็จสิ้นแล้ว ต้องให้เจ้าของร้านแก้ไข",
            "error"
          );

          modal.remove();

          return;
        }


        await updateDoc(
          doc(db,"repairs",job.id),
          { status:newStatus, totalCost:newCost, noteToCustomer, noteToOwner, updatedAt:serverTimestamp(), updatedBy:state.user.uid }
        );

        if(newStatus!==job.status && job.customerId){
          await addDoc(collection(db,"notifications"), { recipientId:job.customerId, type:"status_change", title:"สถานะงานซ่อมเปลี่ยนแล้ว", message:`งาน ${job.motorcycleModel || "ของคุณ"} เปลี่ยนเป็น "${newStatus}"`, relatedType:"repair", relatedId:job.id, createdBy:state.user.uid, read:false, createdAt:serverTimestamp() });
        }

        if (
  isMechanic &&
  noteToCustomer &&
  job.customerId
) {

  await addDoc(
    collection(db, "notifications"),
    {
      recipientId:
        job.customerId,

      type:
        "repair_note",

      title:
        "มีข้อความจากช่าง",

      message:
        noteToCustomer,

      relatedType:
        "repair",

      relatedId:
        job.id,

      createdBy:
        state.user.uid,

      read:
        false,

      createdAt:
        serverTimestamp()
          });

}
        if (
  isMechanic &&
  noteToOwner
) {

  await addDoc(
    collection(db, "notifications"),
    {
      audience:
        "owner",

      type:
        "mechanic_note",

      title:
        "มีหมายเหตุจากช่าง",

      message:
        noteToOwner,

      relatedType:
        "repair",

      relatedId:
        job.id,

      createdBy:
        state.user.uid,

      read:
        false,

      createdAt:
        serverTimestamp()
          });

}


        modal.remove();

        toast(
          "บันทึกข้อมูลการซ่อมแล้ว",
          "success"
        );


        route(state.route);

      } catch (err) {

        console.error(err);

        toast(
          "บันทึกไม่สำเร็จ: " + err.message,
          "error"
        );

      }

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

      <section id="calc-summary" class="calc-panel"><div class="calc-header row-between"><div><span class="eyebrow">08 / SUMMARY</span><h3>Engine Build Sheet</h3></div><div class="action-cluster"><button class="btn btn-ghost" id="save-calc"><i class="fa-solid fa-cloud-arrow-up"></i> บันทึกการคำนวณ</button><button class="btn btn-primary" id="capture-calc"><i class="fa-solid fa-camera"></i> บันทึกภาพ</button></div></div>
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
    rodLength:val("rod-length"), rodRatio:$("#res-rod-ratio-display").textContent, mps:Number($("#res-mps-val").textContent)||0,
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
