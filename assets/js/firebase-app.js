import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const config = window.TR_FIREBASE_CONFIG || {};
const isConfigured = config.apiKey && !String(config.apiKey).startsWith("YOUR_");
const money = new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 });
const fallback = window.TR_SYNTAX_DATA || { products: [], packages: [] };

let app;
let auth;
let db;
let storage;

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const h = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#039;"
}[char]));
const statusText = {
  pending: "รอตรวจสอบ",
  approved: "อนุมัติแล้ว",
  rejected: "ปฏิเสธ",
  completed: "เสร็จสิ้น",
  active: "เปิดใช้งาน",
  disabled: "ปิดใช้งาน",
  expired: "หมดอายุ"
};

function formatDateTime(value) {
  if (!value) return "";
  if (typeof value === "string") {
    return value.replace("T", " ");
  }
  if (value.seconds) {
    return new Date(value.seconds * 1000).toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleString("th-TH", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }
  return String(value);
}

function notice(message, type = "success") {
  const main = $("main") || document.body;
  const alert = document.createElement("div");
  alert.className = `alert ${type}`;
  alert.textContent = message;
  main.prepend(alert);
  setTimeout(() => alert.remove(), 5200);
}

function requireFirebase() {
  if (isConfigured) {
    return true;
  }
  notice("ยังไม่ได้ตั้งค่า firebase-config.js กรุณาใส่ config จาก Firebase Console ก่อนใช้งานจริง", "error");
  return false;
}

function getErrorMessage(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
  if (code.includes("email-already-in-use")) return "อีเมลนี้ถูกใช้งานแล้ว";
  if (code.includes("weak-password")) return "รหัสผ่านต้องแข็งแรงกว่านี้";
  if (code.includes("permission-denied")) return "ไม่มีสิทธิ์ทำรายการนี้ กรุณาตรวจ Firestore Rules หรือสิทธิ์แอดมิน";
  return error?.message || "ทำรายการไม่สำเร็จ";
}

async function isAdmin(uid) {
  if (!uid) return false;
  const adminSnap = await getDoc(doc(db, "admins", uid));
  return adminSnap.exists();
}

function setHwidStats(total = 0, active = 0, bound = 0, disabled = 0) {
  const totalNode = $("[data-hwid-total]");
  const activeNode = $("[data-hwid-active]");
  const boundNode = $("[data-hwid-bound]");
  const disabledNode = $("[data-hwid-disabled]");
  if (totalNode) totalNode.textContent = String(total);
  if (activeNode) activeNode.textContent = String(active);
  if (boundNode) boundNode.textContent = String(bound);
  if (disabledNode) disabledNode.textContent = String(disabled);
}

function setHwidTableMessage(message, type = "muted") {
  const hwidRows = $("[data-admin-hwid-list]");
  if (!hwidRows) return;
  hwidRows.innerHTML = `<tr><td colspan="5" class="${h(type)}">${h(message)}</td></tr>`;
}

function generateLicenseKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `TRSYN-${chars.slice(0, 4).join("")}-${chars.slice(4, 8).join("")}-${chars.slice(8, 12).join("")}`;
}

async function loadCollection(name, fallbackItems = []) {
  if (!isConfigured) return fallbackItems;
  const snap = await getDocs(collection(db, name));
  if (snap.empty) return fallbackItems;
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function findCatalogItem(type, id) {
  const localItems = type === "product" ? fallback.products : fallback.packages;
  const local = localItems.find((item) => String(item.id) === String(id));
  if (!isConfigured) return local;
  const collectionName = type === "product" ? "products" : "packages";
  const direct = await getDoc(doc(db, collectionName, String(id)));
  if (direct.exists()) return { id: direct.id, ...direct.data() };
  const idQuery = query(collection(db, collectionName), where("legacyId", "==", Number(id)), limit(1));
  const snap = await getDocs(idQuery);
  return snap.empty ? local : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

function productCard(product) {
  const id = product.legacyId || product.id;
  return `
    <article class="product-card" data-product-card data-brand="${h(product.brand)}" data-model="${h(product.model)}" data-ecu="${h(product.ecu || product.ecuType)}">
      <div class="chip">${h(product.brand || "-")} / ${h(product.ecu || product.ecuType || "-")}</div>
      <h3>${h(product.title || "-")}</h3>
      <p><b>รุ่น:</b> ${h(product.model || "-")}</p>
      <p>${h(product.description || "")}</p>
      <div class="card-foot">
        <strong>${money.format(Number(product.price || 0))}</strong>
        <a class="btn small primary" href="checkout.html?product_id=${id}">ซื้อไฟล์</a>
      </div>
    </article>
  `;
}

function packageCard(pack) {
  const id = pack.legacyId || pack.id;
  const featureList = Array.isArray(pack.features)
    ? pack.features
    : String(pack.features || "").split("\n").map((feature) => feature.trim()).filter(Boolean);
  const features = featureList.map((feature) => `<li>${h(feature)}</li>`).join("");
  return `
    <article class="price-card">
      <h3>${h(pack.title || "-")}</h3>
      <p>${h(pack.description || "")}</p>
      <ul class="feature-list">${features}</ul>
      <div class="price">${money.format(Number(pack.price || 0))}</div>
      <a class="btn primary full" href="checkout.html?package_id=${id}">สั่งซื้อแพ็กเกจ</a>
    </article>
  `;
}

async function initCatalog() {
  const productList = $("[data-products-list]");
  const packageList = $("[data-packages-list]");
  if (productList) {
    const products = await loadCollection("products", fallback.products);
    productList.innerHTML = products.filter((item) => item.isActive !== false).map(productCard).join("") + '<p class="muted" data-shop-empty hidden>ไม่พบไฟล์ที่ตรงกับเงื่อนไข</p>';
    document.dispatchEvent(new Event("tr:products-rendered"));
  }
  if (packageList) {
    const packages = await loadCollection("packages", fallback.packages);
    packageList.innerHTML = packages.filter((item) => item.isActive !== false).map(packageCard).join("");
  }
}

function initAuthForms() {
  const login = $("[data-firebase-login]");
  if (login) {
    login.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(login);
      try {
        const credential = await signInWithEmailAndPassword(auth, String(form.get("email")), String(form.get("password")));
        window.location.href = await isAdmin(credential.user.uid) ? "admin/index.html" : "dashboard.html";
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }

  const adminLogin = $("[data-firebase-admin-login]");
  if (adminLogin) {
    adminLogin.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(adminLogin);
      try {
        const credential = await signInWithEmailAndPassword(auth, String(form.get("email")), String(form.get("password")));
        if (!(await isAdmin(credential.user.uid))) {
          const uid = credential.user.uid;
          await signOut(auth);
          notice(`บัญชีนี้ยังไม่ได้รับสิทธิ์แอดมินใน collection admins: ให้สร้าง document ID เป็น ${uid}`, "error");
          return;
        }
        window.location.href = "index.html";
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }

  const register = $("[data-firebase-register]");
  if (register) {
    register.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(register);
      const password = String(form.get("password"));
      if (password !== String(form.get("confirm_password"))) {
        notice("ยืนยันรหัสผ่านไม่ตรงกัน", "error");
        return;
      }
      try {
        const credential = await createUserWithEmailAndPassword(auth, String(form.get("email")), password);
        await updateProfile(credential.user, { displayName: String(form.get("username")) });
        await setDoc(doc(db, "users", credential.user.uid), {
          username: String(form.get("username")),
          email: String(form.get("email")).toLowerCase(),
          role: "user",
          createdAt: serverTimestamp()
        });
        window.location.href = "dashboard.html";
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }

  $$("[data-firebase-logout]").forEach((link) => {
    link.addEventListener("click", async (event) => {
      event.preventDefault();
      if (isConfigured) await signOut(auth);
      window.location.href = link.getAttribute("href") || "login.html";
    });
  });
}

async function initCheckout() {
  const checkout = $("[data-static-checkout]");
  if (!checkout) return;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get("product_id");
  const packageId = params.get("package_id");
  const type = productId ? "product" : "package";
  const item = await findCatalogItem(type, productId || packageId);
  if (!item) return;

  $("[data-checkout-title]", checkout).textContent = item.title || "-";
  $("[data-checkout-description]", checkout).textContent = item.description || "";
  $("[data-checkout-price]", checkout).textContent = money.format(Number(item.price || 0));
  $("[data-product-id]", checkout).value = productId || "";
  $("[data-package-id]", checkout).value = packageId || "";

  const form = $("[data-checkout-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!confirm("ยืนยันการส่งออเดอร์และแนบสลิปนี้?")) return;
    if (!requireFirebase()) return;
    const user = auth.currentUser;
    if (!user) {
      window.location.href = "login.html";
      return;
    }

    const formData = new FormData(form);
    const slip = formData.get("slip");
    if (!slip || !slip.name) {
      notice("กรุณาแนบสลิปโอนเงิน", "error");
      return;
    }

    try {
      const slipRef = ref(storage, `slips/${user.uid}/${Date.now()}-${slip.name}`);
      await uploadBytes(slipRef, slip);
      const slipUrl = await getDownloadURL(slipRef);
      await addDoc(collection(db, "orders"), {
        userId: user.uid,
        userEmail: user.email,
        itemId: item.id,
        legacyItemId: Number.isFinite(Number(productId || packageId)) ? Number(productId || packageId) : null,
        orderType: type,
        title: item.title,
        totalPrice: Number(item.price || 0),
        anydeskId: String(formData.get("anydesk_id") || ""),
        phone: String(formData.get("phone") || ""),
        note: String(formData.get("note") || ""),
        slipUrl,
        status: "pending",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      window.location.href = "order_history.html";
    } catch (error) {
      notice(getErrorMessage(error), "error");
    }
  });
}

async function initUserPages() {
  const dashboardRows = $("[data-dashboard-orders]");
  const historyList = $("[data-order-history]");
  if (!isConfigured || (!dashboardRows && !historyList)) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const profile = $("[data-user-profile]");
    if (profile) {
      profile.innerHTML = `<p><b>ชื่อผู้ใช้:</b> ${h(user.displayName || "-")}</p><p><b>อีเมล:</b> ${h(user.email || "-")}</p>`;
    }
    const ordersQuery = query(collection(db, "orders"), where("userId", "==", user.uid));
    const snap = await getDocs(ordersQuery);
    const orders = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (dashboardRows) {
      dashboardRows.innerHTML = orders.map((order) => `<tr><td>${h(order.title)}</td><td>${order.orderType === "product" ? "ไฟล์รีแมพ" : "แพ็กเกจ"}</td><td><span class="status ${h(order.status)}">${h(statusText[order.status] || order.status)}</span></td><td>${order.fileUrl ? `<a class="link" href="${h(order.fileUrl)}" target="_blank">ดาวน์โหลด</a>` : "<span class=\"muted\">-</span>"}</td></tr>`).join("") || "<tr><td colspan=\"4\">ยังไม่มีคำสั่งซื้อ</td></tr>";
    }
    if (historyList) {
      historyList.innerHTML = orders.map((order) => `<article class="panel order-card"><div><span class="chip">#${h(order.id.slice(0, 8))} ${order.orderType === "product" ? "ไฟล์รีแมพ" : "แพ็กเกจ"}</span><h2>${h(order.title)}</h2><p>ยอดชำระ: <b>${money.format(Number(order.totalPrice || 0))}</b></p><p>สถานะ: <span class="status ${h(order.status)}">${h(statusText[order.status] || order.status)}</span></p><p>AnyDesk: ${h(order.anydeskId || "-")} | โทร: ${h(order.phone || "-")}</p></div>${order.slipUrl ? `<a href="${h(order.slipUrl)}" target="_blank"><img class="slip-thumb" src="${h(order.slipUrl)}" alt="สลิปออเดอร์"></a>` : ""}</article>`).join("") || "<div class=\"panel\">ยังไม่มีประวัติการสั่งซื้อ</div>";
    }
  });
}

function initAdminForms() {
  const productForm = $("[data-admin-product-form]");
  if (productForm) {
    productForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(productForm);
      try {
        await addDoc(collection(db, "products"), {
          title: String(form.get("title") || ""),
          brand: String(form.get("brand") || ""),
          model: String(form.get("model") || ""),
          ecu: String(form.get("ecu_type") || ""),
          description: String(form.get("description") || ""),
          price: Number(form.get("price") || 0),
          file: String(form.get("file_path") || ""),
          isActive: form.has("is_active"),
          createdAt: serverTimestamp()
        });
        notice("บันทึกสินค้าเข้า Firestore แล้ว");
        productForm.reset();
        await renderAdminViews();
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }

  const packageForm = $("[data-admin-package-form]");
  if (packageForm) {
    packageForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(packageForm);
      try {
        await addDoc(collection(db, "packages"), {
          title: String(form.get("title") || ""),
          description: String(form.get("description") || ""),
          features: String(form.get("features") || "").split("\n").map((item) => item.trim()).filter(Boolean),
          price: Number(form.get("price") || 0),
          isActive: form.has("is_active"),
          createdAt: serverTimestamp()
        });
        notice("บันทึกแพ็กเกจเข้า Firestore แล้ว");
        packageForm.reset();
        await renderAdminViews();
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }

  const hwidForm = $("[data-admin-hwid-form]");
  if (hwidForm) {
    const licenseInput = $("[data-license-key-input]", hwidForm);
    const generateButton = $("[data-generate-license-key]", hwidForm);
    const copyButton = $("[data-copy-generated-license]", hwidForm);
    const previewNode = $("[data-license-preview]");
    const resultPanel = $("[data-license-result]");
    const createdKeyNode = $("[data-created-license-key]");
    const copyCreatedButton = $("[data-copy-created-license]");

    const setLicenseKey = (key) => {
      const safeKey = String(key || "").trim().toUpperCase();
      if (licenseInput) {
        licenseInput.value = safeKey;
      }
      if (previewNode) {
        previewNode.textContent = safeKey || "TRSYN-XXXX-XXXX-XXXX";
      }
      return safeKey;
    };

    generateButton?.addEventListener("click", () => {
      if (!licenseInput) return;
      setLicenseKey(generateLicenseKey());
      licenseInput.focus();
      licenseInput.select();
      notice("สร้าง License Key แล้ว");
    });

    licenseInput?.addEventListener("input", () => {
      setLicenseKey(licenseInput.value);
    });

    copyButton?.addEventListener("click", async () => {
      if (!licenseInput) return;
      if (!licenseInput.value.trim()) {
        setLicenseKey(generateLicenseKey());
      }
      await navigator.clipboard.writeText(licenseInput.value.trim());
      notice("คัดลอก License Key แล้ว");
    });

    copyCreatedButton?.addEventListener("click", async () => {
      const key = createdKeyNode?.textContent?.trim() || "";
      if (!key) return;
      await navigator.clipboard.writeText(key);
      notice("คัดลอก License Key แล้ว");
    });

    hwidForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!requireFirebase()) return;
      const form = new FormData(hwidForm);
      const key = String(form.get("license_key") || generateLicenseKey()).trim().toUpperCase();
      try {
        await setDoc(doc(db, "hwidLicenses", key), {
          licenseKey: key,
          customerName: String(form.get("customer_name") || ""),
          customerEmail: String(form.get("customer_email") || ""),
          appName: String(form.get("app_name") || "TR-SYNTAX Tool"),
          status: String(form.get("status") || "active"),
          expiresAt: String(form.get("expires_at") || ""),
          manualHwid: String(form.get("manual_hwid") || ""),
          notes: String(form.get("notes") || ""),
          createdAt: serverTimestamp()
        });
        notice("บันทึกไลเซนส์ HWID เข้า Firestore แล้ว");
        if (createdKeyNode) {
          createdKeyNode.textContent = key;
        }
        if (resultPanel) {
          resultPanel.hidden = false;
        }
        hwidForm.reset();
        setLicenseKey("");
        await renderAdminViews();
      } catch (error) {
        notice(getErrorMessage(error), "error");
      }
    });
  }
}

async function renderAdminViews() {
  const productRows = $("[data-admin-products-list]");
  if (productRows) {
    const products = await loadCollection("products", fallback.products);
    productRows.innerHTML = products.map((product) => `<tr><td>${h(product.title)}<br><span class="muted">${h(product.brand)} / ${h(product.ecu || product.ecuType)}</span></td><td>${h(product.model)}</td><td>${money.format(Number(product.price || 0))}</td><td>${product.isActive === false ? "ปิด" : "เปิดขาย"}</td><td class="actions"><span class="muted">Firestore</span></td></tr>`).join("") || "<tr><td colspan=\"5\">ยังไม่มีสินค้า</td></tr>";
  }

  const packageRows = $("[data-admin-packages-list]");
  if (packageRows) {
    const packages = await loadCollection("packages", fallback.packages);
    packageRows.innerHTML = packages.map((pack) => `<tr><td>${h(pack.title)}</td><td>${money.format(Number(pack.price || 0))}</td><td>${pack.isActive === false ? "ปิด" : "เปิดขาย"}</td><td class="actions"><span class="muted">Firestore</span></td></tr>`).join("") || "<tr><td colspan=\"4\">ยังไม่มีแพ็กเกจ</td></tr>";
  }

  const orderList = $("[data-admin-orders]");
  if (orderList) {
    const snap = await getDocs(collection(db, "orders"));
    const orders = snap.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    orderList.innerHTML = orders.map((order) => `
      <article class="panel order-card admin-order">
        <div>
          <span class="chip">#${h(order.id.slice(0, 8))} ${order.orderType === "product" ? "ไฟล์รีแมพ" : "แพ็กเกจ"}</span>
          <h2>${h(order.title)}</h2>
          <p>ลูกค้า: ${h(order.userEmail || order.userId || "-")}</p>
          <p>ยอด: <b>${money.format(Number(order.totalPrice || 0))}</b> | สถานะ: <span class="status ${h(order.status)}">${h(statusText[order.status] || order.status)}</span></p>
          <p>AnyDesk: ${h(order.anydeskId || "-")} | โทร: ${h(order.phone || "-")}</p>
          <p>หมายเหตุลูกค้า: ${h(order.note || "-")}</p>
          <form class="status-form" data-admin-order-status data-order-id="${h(order.id)}">
            <select name="status">
              ${["pending", "approved", "rejected", "completed"].map((status) => `<option value="${status}" ${order.status === status ? "selected" : ""}>${statusText[status]}</option>`).join("")}
            </select>
            <input type="text" name="admin_note" value="${h(order.adminNote || "")}" placeholder="หมายเหตุแอดมิน">
            <button class="btn small primary" type="submit">บันทึก</button>
          </form>
        </div>
        ${order.slipUrl ? `<a href="${h(order.slipUrl)}" target="_blank"><img class="slip-thumb" src="${h(order.slipUrl)}" alt="สลิปออเดอร์"></a>` : ""}
      </article>
    `).join("") || "<div class=\"panel\">ยังไม่มีออเดอร์</div>";

    $$("[data-admin-order-status]", orderList).forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(form);
        try {
          await updateDoc(doc(db, "orders", form.dataset.orderId), {
            status: String(data.get("status")),
            adminNote: String(data.get("admin_note") || ""),
            updatedAt: serverTimestamp()
          });
          notice("อัปเดตสถานะออเดอร์แล้ว");
          await renderAdminViews();
        } catch (error) {
          notice(getErrorMessage(error), "error");
        }
      });
    });
  }

  const hwidRows = $("[data-admin-hwid-list]");
  if (hwidRows) {
    let snap;
    try {
      snap = await getDocs(collection(db, "hwidLicenses"));
    } catch (error) {
      console.error("Failed to load hwidLicenses", error);
      setHwidStats();
      setHwidTableMessage(getErrorMessage(error), "muted");
      notice(getErrorMessage(error), "error");
      return;
    }
    const licenses = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
    const active = licenses.filter((license) => (license.status || "active") === "active").length;
    const bound = licenses.filter((license) => license.manualHwid || license.hwidFingerprint || license.hwidHash).length;
    const disabled = licenses.filter((license) => ["disabled", "expired"].includes(license.status)).length;
    setHwidStats(licenses.length, active, bound, disabled);

    hwidRows.innerHTML = licenses.map((license) => {
      const key = license.licenseKey || license.id;
      const status = license.status || "active";
      const hwid = license.manualHwid || license.hwidFingerprint || "";
      return `<tr>
        <td>
          <code class="license-code">${h(key)}</code>
          <div class="license-meta"><span class="chip">${h(license.appName || "TR-SYNTAX Tool")}</span></div>
        </td>
        <td>
          <div class="hwid-customer">
            <strong>${h(license.customerName || "-")}</strong>
            <span class="muted">${h(license.customerEmail || "")}</span>
          </div>
        </td>
        <td>${hwid ? `<span class="chip">${h(hwid)}</span>` : "<span class=\"muted\">ยังไม่ผูกเครื่อง</span>"}</td>
        <td>
          <div class="hwid-status-cell">
            <span class="status ${h(status)}">${h(statusText[status] || status)}</span>
            ${license.expiresAt ? `<span class="hwid-expiry">หมดอายุ: ${h(formatDateTime(license.expiresAt))}</span>` : "<span class=\"hwid-expiry\">ไม่กำหนดวันหมดอายุ</span>"}
          </div>
        </td>
        <td class="actions hwid-actions">
          <button class="btn small ghost" type="button" data-copy-license="${h(key)}">คัดลอก</button>
          <button class="btn small outline" type="button" data-reset-hwid="${h(license.id)}">รีเซ็ต HWID</button>
          <button class="btn small danger" type="button" data-delete-hwid="${h(license.id)}">ลบ</button>
        </td>
      </tr>`;
    }).join("") || "<tr><td colspan=\"5\" class=\"muted\">ยังไม่มีไลเซนส์ HWID</td></tr>";

    $$("[data-copy-license]", hwidRows).forEach((button) => {
      button.addEventListener("click", async () => {
        await navigator.clipboard.writeText(button.dataset.copyLicense || "");
        notice("คัดลอก License Key แล้ว");
      });
    });

    $$("[data-reset-hwid]", hwidRows).forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("รีเซ็ต HWID ของไลเซนส์นี้?")) return;
        try {
          await updateDoc(doc(db, "hwidLicenses", button.dataset.resetHwid), {
            manualHwid: "",
            hwidFingerprint: "",
            hwidHash: "",
            updatedAt: serverTimestamp()
          });
          notice("รีเซ็ต HWID แล้ว");
          await renderAdminViews();
        } catch (error) {
          notice(getErrorMessage(error), "error");
        }
      });
    });

    $$("[data-delete-hwid]", hwidRows).forEach((button) => {
      button.addEventListener("click", async () => {
        if (!confirm("ลบไลเซนส์นี้ออกจาก Firestore?")) return;
        try {
          await deleteDoc(doc(db, "hwidLicenses", button.dataset.deleteHwid));
          notice("ลบไลเซนส์แล้ว");
          await renderAdminViews();
        } catch (error) {
          notice(getErrorMessage(error), "error");
        }
      });
    });
  }
}

function initAdminGuard() {
  const isAdminPage = window.location.pathname.includes("/admin/") && !window.location.pathname.endsWith("/admin/login.html") && !window.location.pathname.endsWith("/admin/login");
  if (!isConfigured || !isAdminPage) return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    let hasAdminAccess = false;
    try {
      hasAdminAccess = await isAdmin(user.uid);
    } catch (error) {
      console.error("Failed to check admin access", error);
      setHwidStats();
      setHwidTableMessage(getErrorMessage(error), "muted");
      notice(getErrorMessage(error), "error");
      return;
    }
    if (!hasAdminAccess) {
      setHwidStats();
      setHwidTableMessage(`บัญชีนี้ยังไม่ได้รับสิทธิ์แอดมิน ให้สร้าง document ใน collection admins ด้วย ID: ${user.uid}`, "muted");
      notice("บัญชีนี้ยังไม่ได้รับสิทธิ์แอดมิน", "error");
      return;
    }
    try {
      await renderAdminViews();
    } catch (error) {
      console.error("Failed to render admin views", error);
      setHwidTableMessage(getErrorMessage(error), "muted");
      notice(getErrorMessage(error), "error");
    }
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  if (isConfigured) {
    app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
  }

  initAuthForms();
  await initCatalog();
  await initCheckout();
  await initUserPages();
  initAdminForms();
  initAdminGuard();
});
