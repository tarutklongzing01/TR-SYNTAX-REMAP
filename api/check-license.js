const admin = require("firebase-admin");
const crypto = require("crypto");

function normalize(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9._:-]/g, "");
}

function hashHwid(value) {
  return crypto.createHash("sha256").update(normalize(value)).digest("hex");
}

function fingerprint(value) {
  return hashHwid(value).slice(0, 16);
}

function json(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function parseServiceAccount() {
  const base64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (base64) {
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  }

  const jsonText = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (jsonText) {
    return JSON.parse(jsonText);
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  if (projectId && clientEmail && privateKey) {
    return {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, "\n")
    };
  }

  return null;
}

function getDb() {
  if (!admin.apps.length) {
    const serviceAccount = parseServiceAccount();
    if (serviceAccount) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      admin.initializeApp({
        projectId: process.env.FIREBASE_PROJECT_ID || "tr-syntax-remap"
      });
    }
  }

  return admin.firestore();
}

function readFields(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const raw = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body || "");
  if (!raw) {
    return {};
  }

  const contentType = String(req.headers["content-type"] || "");
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(raw);
    } catch (error) {
      return {};
    }
  }

  return Object.fromEntries(new URLSearchParams(raw));
}

function getField(fields, name) {
  return typeof fields[name] === "string" ? fields[name] : "";
}

function isExpired(expiresAt) {
  if (!expiresAt) {
    return false;
  }

  const date = typeof expiresAt.toDate === "function" ? expiresAt.toDate() : new Date(expiresAt);
  return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
}

function getLicenseKeyFromDoc(license) {
  return normalize(String(license.licenseKey || license.license_key || license.key || ""));
}

async function findLicense(transaction, licenses, licenseKey, hwid) {
  let licenseRef = licenses.doc(licenseKey);
  let snap = await transaction.get(licenseRef);

  if (snap.exists) {
    return { licenseRef, snap };
  }

  const licenseKeyQuery = licenses.where("licenseKey", "==", licenseKey).limit(1);
  const licenseKeySnap = await transaction.get(licenseKeyQuery);
  if (!licenseKeySnap.empty) {
    snap = licenseKeySnap.docs[0];
    return { licenseRef: snap.ref, snap };
  }

  const hwidRef = licenses.doc(hwid);
  const hwidSnap = await transaction.get(hwidRef);
  if (hwidSnap.exists && getLicenseKeyFromDoc(hwidSnap.data() || {}) === licenseKey) {
    return { licenseRef: hwidRef, snap: hwidSnap };
  }

  return { licenseRef: null, snap: null };
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    json(res, 405, { ok: false, status: "method_not_allowed", message: "POST only" });
    return;
  }

  const fields = readFields(req);
  const licenseKey = normalize(getField(fields, "license_key"));
  const hwid = normalize(getField(fields, "hwid"));
  const appName = String(getField(fields, "app_name") || "").trim();
  const version = String(getField(fields, "version") || "").trim();
  const machineName = String(getField(fields, "machine_name") || "").trim();

  if (!licenseKey || !hwid) {
    json(res, 400, {
      ok: false,
      status: "bad_request",
      message: "license_key and hwid are required"
    });
    return;
  }

  try {
    const db = getDb();
    const licenses = db.collection("hwidLicenses");

    const result = await db.runTransaction(async (transaction) => {
      const found = await findLicense(transaction, licenses, licenseKey, hwid);
      const { licenseRef, snap } = found;

      if (!snap || !snap.exists) {
        return { code: 404, body: { ok: false, status: "not_found", message: "License key not found" } };
      }

      const license = snap.data() || {};
      const licenseAppName = String(license.appName || "");
      const status = String(license.status || "active");
      const expiresAt = license.expiresAt || "";
      const currentHash = String(license.hwidHash || "");
      const manualHwid = normalize(String(license.manualHwid || ""));
      const incomingHash = hashHwid(hwid);
      const incomingFingerprint = fingerprint(hwid);

      if (appName && licenseAppName && licenseAppName.toLowerCase() !== appName.toLowerCase()) {
        return { code: 403, body: { ok: false, status: "app_mismatch", message: "License is not valid for this app" } };
      }

      if (status !== "active") {
        return { code: 403, body: { ok: false, status, message: "License is not active" } };
      }

      if (isExpired(expiresAt)) {
        transaction.update(licenseRef, {
          status: "expired",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        return { code: 403, body: { ok: false, status: "expired", message: "License has expired" } };
      }

      if (manualHwid) {
        const manualHash = hashHwid(manualHwid);
        if (manualHash !== incomingHash && manualHwid !== hwid) {
          return { code: 403, body: { ok: false, status: "hwid_mismatch", message: "This license is locked to another machine" } };
        }
      }

      if (!currentHash) {
        transaction.update(licenseRef, {
          hwidHash: incomingHash,
          hwidFingerprint: incomingFingerprint,
          machineName: machineName.slice(0, 120) || null,
          lastVersion: version.slice(0, 60) || null,
          lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
          activatedAt: admin.firestore.FieldValue.serverTimestamp(),
          activationCount: admin.firestore.FieldValue.increment(1),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
          code: 200,
          body: {
            ok: true,
            status: "activated",
            message: "License activated on this machine",
            app_name: licenseAppName,
            expires_at: expiresAt || null
          }
        };
      }

      if (currentHash !== incomingHash) {
        return { code: 403, body: { ok: false, status: "hwid_mismatch", message: "This license is locked to another machine" } };
      }

      transaction.update(licenseRef, {
        machineName: machineName.slice(0, 120) || null,
        lastVersion: version.slice(0, 60) || null,
        lastSeenAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        code: 200,
        body: {
          ok: true,
          status: "valid",
          message: "License valid",
          app_name: licenseAppName,
          expires_at: expiresAt || null
        }
      };
    });

    json(res, result.code, result.body);
  } catch (error) {
    console.error(error);
    json(res, 500, {
      ok: false,
      status: "server_error",
      message: "License check failed"
    });
  }
};
