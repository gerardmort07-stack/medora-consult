const { db } = require("../config/firebaseAdmin");

// Pre-seeded default services. Prices are starting points in kobo/pesewas
// (smallest currency unit) — every value is fully editable by an admin
// afterward via PATCH /api/services/:id.
const DEFAULT_SERVICES = [
  { name: "General Consultation", description: "Speak to a doctor about everyday health concerns.", priceKobo: 10000 },
  { name: "Obstetrics and Gynaecology", description: "Women's reproductive and maternal health consultations.", priceKobo: 15000 },
  { name: "Fertility", description: "Fertility assessment and family planning guidance.", priceKobo: 18000 },
  { name: "Pediatrics", description: "Child health consultations for infants through teens.", priceKobo: 12000 },
  { name: "Lab Result Interpretation", description: "A doctor reviews and explains your lab results.", priceKobo: 8000 },
];

/**
 * Called once on server boot. Seeds the default services list ONLY if the
 * "services" collection is currently empty, so it never overwrites admin
 * edits on subsequent restarts.
 */
async function seedDefaultServices() {
  try {
    const snap = await db.collection("services").limit(1).get();
    if (!snap.empty) {
      console.log("[seedDefaultServices] Services already exist — skipping seed.");
      return;
    }

    const batch = db.batch();
    DEFAULT_SERVICES.forEach((service) => {
      const ref = db.collection("services").doc();
      batch.set(ref, {
        id: ref.id,
        name: service.name,
        description: service.description,
        priceKobo: service.priceKobo,
        isActive: true,
        createdAt: new Date().toISOString(),
      });
    });
    await batch.commit();
    console.log(`[seedDefaultServices] Seeded ${DEFAULT_SERVICES.length} default services.`);
  } catch (err) {
    console.error("[seedDefaultServices] Failed to seed default services:", err.message);
  }
}

/**
 * GET /api/services
 * Active services only — this is what patients see when booking.
 */
async function listActiveServices(req, res) {
  try {
    const snap = await db.collection("services").where("isActive", "==", true).get();
    const services = snap.docs.map((d) => d.data()).sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ success: true, services });
  } catch (err) {
    console.error("[listActiveServices] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load services." });
  }
}

/**
 * GET /api/services/all (admin only)
 * Every service, active or disabled, for the admin management table.
 */
async function listAllServices(req, res) {
  try {
    const snap = await db.collection("services").get();
    const services = snap.docs.map((d) => d.data()).sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ success: true, services });
  } catch (err) {
    console.error("[listAllServices] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not load services." });
  }
}

/**
 * POST /api/services (admin only)
 */
async function createService(req, res) {
  const { name, description, priceKobo } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, message: "Service name is required." });
  }
  const parsedPrice = parseInt(priceKobo, 10);
  if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
    return res.status(400).json({ success: false, message: "A valid priceKobo (positive integer) is required." });
  }

  try {
    const ref = db.collection("services").doc();
    const service = {
      id: ref.id,
      name: name.trim(),
      description: (description || "").trim(),
      priceKobo: parsedPrice,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await ref.set(service);
    return res.status(201).json({ success: true, service });
  } catch (err) {
    console.error("[createService] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not create service." });
  }
}

/**
 * PATCH /api/services/:id (admin only)
 * Partial update — name, description, priceKobo, and/or isActive
 * (this is also how a service is disabled/re-enabled).
 */
async function updateService(req, res) {
  const { id } = req.params;
  const { name, description, priceKobo, isActive } = req.body;

  const updates = { updatedAt: new Date().toISOString() };

  if (name !== undefined) {
    if (!name.trim()) {
      return res.status(400).json({ success: false, message: "Service name cannot be empty." });
    }
    updates.name = name.trim();
  }
  if (description !== undefined) {
    updates.description = description.trim();
  }
  if (priceKobo !== undefined) {
    const parsedPrice = parseInt(priceKobo, 10);
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      return res.status(400).json({ success: false, message: "priceKobo must be a positive integer." });
    }
    updates.priceKobo = parsedPrice;
  }
  if (isActive !== undefined) {
    updates.isActive = Boolean(isActive);
  }

  try {
    const ref = db.collection("services").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Service not found." });
    }
    await ref.update(updates);
    const updated = await ref.get();
    return res.json({ success: true, service: updated.data() });
  } catch (err) {
    console.error("[updateService] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not update service." });
  }
}

/**
 * DELETE /api/services/:id (admin only)
 * Hard delete. Blocked if any appointment already references this service,
 * so historical bookings never end up pointing at a missing service —
 * admins should disable (PATCH isActive:false) instead in that case.
 */
async function deleteService(req, res) {
  const { id } = req.params;

  try {
    const ref = db.collection("services").doc(id);
    const doc = await ref.get();
    if (!doc.exists) {
      return res.status(404).json({ success: false, message: "Service not found." });
    }

    const inUseSnap = await db.collection("appointments").where("serviceId", "==", id).limit(1).get();
    if (!inUseSnap.empty) {
      return res.status(409).json({
        success: false,
        message: "This service has existing appointments and cannot be deleted. Disable it instead.",
      });
    }

    await ref.delete();
    return res.json({ success: true, message: "Service deleted." });
  } catch (err) {
    console.error("[deleteService] Failed:", err.message);
    return res.status(500).json({ success: false, message: "Could not delete service." });
  }
}

module.exports = {
  seedDefaultServices,
  listActiveServices,
  listAllServices,
  createService,
  updateService,
  deleteService,
};
