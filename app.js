(function () {
  const config = normalizeConfig(window.APP_CONFIG || {});
  const STORAGE_KEY = config.storageKey;
  const SESSION_KEY = config.sessionKey;
  const SESSION_USER_KEY = `${SESSION_KEY}:user`;
  const API_BASE_PATH = config.apiBasePath;
  const SYNC_POLL_MS = config.syncPollMs;
  const DEFAULT_ROLE = config.defaultRole;
  const REQUIRE_VERIFIED_EMAIL = config.requireEmailVerification;
  const FIREBASE_ENABLED = Boolean(config.firebase?.enabled);
  const LOCAL_AUTH_ENABLED = !FIREBASE_ENABLED && Boolean(API_BASE_PATH);
  const ROLE_LABELS = Object.fromEntries(config.authRoles.map((role) => [role.id, role.label]));
  const ROLE_PERMISSIONS = {
    super_admin: [
      "view_dashboard",
      "create_lock_event",
      "edit_lock_event",
      "delete_lock_event",
      "manage_equipment_create",
      "manage_equipment_edit",
      "manage_lock_master_create",
      "manage_lock_master_edit",
      "manage_lock_master_delete",
      "manage_location_create",
      "manage_location_edit",
      "manage_location_delete",
      "checkout_lock",
      "search_records",
      "manage_users_add",
      "manage_users_delete",
      "view_reports",
      "request_help"
    ],
    supervisor: [
      "view_dashboard",
      "create_lock_event",
      "checkout_lock",
      "search_records",
      "manage_users_add",
      "view_reports",
      "request_help"
    ],
    controlling_org: [
      "view_dashboard",
      "create_lock_event",
      "edit_lock_event",
      "manage_equipment_create",
      "manage_equipment_edit",
      "manage_lock_master_create",
      "manage_lock_master_edit",
      "manage_location_create",
      "manage_location_edit",
      "checkout_lock",
      "search_records",
      "manage_users_add",
      "view_reports",
      "request_help"
    ],
    authorized_user: [
      "view_dashboard",
      "create_lock_event",
      "checkout_lock",
      "search_records",
      "view_reports",
      "request_help"
    ]
  };

  const state = loadState();
  const firebaseCtx = initFirebaseContext();
  let serverVersion = null;
  let saveInFlight = false;
  let saveQueued = false;
  let syncTimer = null;
  let firebaseStateRef = null;
  let firebaseStateListener = null;
  let currentAuthUser = null;
  let currentAuthRole = "";
  let authReadyForData = false;
  let lastSignedInUid = "";
  let editingEquipmentId = null;
  let editingLockMasterId = null;
  let editingLocationId = null;
  let editingLockEventId = null;
  let pendingRemovalId = null;

  const els = {
    appTitle: document.getElementById("appTitle"),
    appKicker: document.getElementById("appKicker"),
    appSubtitle: document.getElementById("appSubtitle"),
    appLogo: document.getElementById("appLogo"),
    sidebarLogo: document.getElementById("sidebarLogo"),
    sidebarTagline: document.getElementById("sidebarTagline"),
    currentUserLabel: document.getElementById("currentUserLabel"),
    quickNotesText: document.getElementById("quickNotesText"),
    removeTitle: document.getElementById("removeTitle"),
    removeWarningText: document.getElementById("removeWarningText"),
    statsGrid: document.getElementById("statsGrid"),
    lockTypeOptions: document.getElementById("lockTypeOptions"),
    applySafetyChecks: document.getElementById("applySafetyChecks"),
    removeSafetyChecks: document.getElementById("removeSafetyChecks"),
    equipmentForm: document.getElementById("equipmentForm"),
    eqBuilding: document.getElementById("eqBuilding"),
    eqLocation: document.getElementById("eqLocation"),
    eqRoom: document.getElementById("eqRoom"),
    eqClass: document.getElementById("eqClass"),
    equipmentSubmitBtn: document.getElementById("equipmentSubmitBtn"),
    equipmentCancelEditBtn: document.getElementById("equipmentCancelEditBtn"),
    equipmentFilter: document.getElementById("equipmentFilter"),
    uploadEquipmentExcel: document.getElementById("uploadEquipmentExcel"),
    equipmentExcelFile: document.getElementById("equipmentExcelFile"),
    lockForm: document.getElementById("lockForm"),
    lockSubmitBtn: document.querySelector("#lockForm button[type='submit']"),
    equipmentTableBody: document.getElementById("equipmentTableBody"),
    lockEquipment: document.getElementById("lockEquipment"),
    lockNumber: document.getElementById("lockNumber"),
    lockEventLockId: document.getElementById("lockEventLockId"),
    lockLocationId: document.getElementById("lockLocationId"),
    lockKeyLocation: document.getElementById("lockKeyLocation"),
    activeCards: document.getElementById("activeCards"),
    historyTableBody: document.getElementById("historyTableBody"),
    auditTableBody: document.getElementById("auditTableBody"),
    removeModal: document.getElementById("removeModal"),
    removeForm: document.getElementById("removeForm"),
    cancelRemove: document.getElementById("cancelRemove"),
    lockBy: document.getElementById("lockBy"),
    lockWhen: document.getElementById("lockWhen"),
    lockExpectedRemoval: document.getElementById("lockExpectedRemoval"),
    removeWhen: document.getElementById("removeWhen"),
    // Check Out Lock
    checkoutForm: document.getElementById("checkoutForm"),
    checkoutColorOptions: document.getElementById("checkoutColorOptions"),
    checkoutNumber: document.getElementById("checkoutNumber"),
    checkoutUser: document.getElementById("checkoutUser"),
    checkoutDate: document.getElementById("checkoutDate"),
    userAssignmentBody: document.getElementById("userAssignmentBody"),
    checkedOutLocksBody: document.getElementById("checkedOutLocksBody"),
    checkoutHistoryBody: document.getElementById("checkoutHistoryBody"),
    // Manage Users
    userForm: document.getElementById("userForm"),
    userType: document.getElementById("userType"),
    userFirstName: document.getElementById("userFirstName"),
    userLastName: document.getElementById("userLastName"),
    userDepartment: document.getElementById("userDepartment"),
    userSupervisor: document.getElementById("userSupervisor"),
    userPhone: document.getElementById("userPhone"),
    userCellPhone: document.getElementById("userCellPhone"),
    userCallSign: document.getElementById("userCallSign"),
    userTrainingDate: document.getElementById("userTrainingDate"),
    usersTableBody: document.getElementById("usersTableBody"),
    // Lock Master
    lockMasterForm: document.getElementById("lockMasterForm"),
    masterLockNumber: document.getElementById("masterLockNumber"),
    masterLockColor: document.getElementById("masterLockColor"),
    masterLockBuilding: document.getElementById("masterLockBuilding"),
    masterLockLocation: document.getElementById("masterLockLocation"),
    masterLockRoom: document.getElementById("masterLockRoom"),
    masterLockKeyLocation: document.getElementById("masterLockKeyLocation"),
    masterLockNotes: document.getElementById("masterLockNotes"),
    lockMasterTableBody: document.getElementById("lockMasterTableBody"),
    lockMasterSubmitBtn: document.getElementById("lockMasterSubmitBtn"),
    lockMasterCancelEditBtn: document.getElementById("lockMasterCancelEditBtn"),
    // Location Master
    locationForm: document.getElementById("locationForm"),
    locationBuilding: document.getElementById("locationBuilding"),
    locationRoom: document.getElementById("locationRoom"),
    locationDescription: document.getElementById("locationDescription"),
    locationTableBody: document.getElementById("locationTableBody"),
    locationSubmitBtn: document.getElementById("locationSubmitBtn"),
    locationCancelEditBtn: document.getElementById("locationCancelEditBtn"),
    // Search
    searchForm: document.getElementById("searchForm"),
    searchQuery: document.getElementById("searchQuery"),
    searchResultsBody: document.getElementById("searchResultsBody"),
    // Dashboard
    locksByBuilding: document.getElementById("locksByBuilding"),
    locksByDepartmentBody: document.getElementById("locksByDepartmentBody"),
    // Reports
    reportTrainingBody: document.getElementById("reportTrainingBody"),
    reportAgedBody: document.getElementById("reportAgedBody"),
    reportExcessiveBody: document.getElementById("reportExcessiveBody"),
    reportConfigBody: document.getElementById("reportConfigBody"),
    reportCollectorBody: document.getElementById("reportCollectorBody"),
    // Help
    helpForm: document.getElementById("helpForm"),
    helpCategory: document.getElementById("helpCategory"),
    helpSubject: document.getElementById("helpSubject"),
    helpDetails: document.getElementById("helpDetails"),
    // Auth
    loginOverlay: document.getElementById("loginOverlay"),
    loginForm: document.getElementById("loginForm"),
    signupForm: document.getElementById("signupForm"),
    loginEmail: document.getElementById("loginEmail"),
    loginPassword: document.getElementById("loginPassword"),
    signupName: document.getElementById("signupName"),
    signupEmail: document.getElementById("signupEmail"),
    signupPassword: document.getElementById("signupPassword"),
    signupConfirmPassword: document.getElementById("signupConfirmPassword"),
    signupRole: document.getElementById("signupRole"),
    authModeSignIn: document.getElementById("authModeSignIn"),
    authModeSignUp: document.getElementById("authModeSignUp"),
    loginError: document.getElementById("loginError"),
    loginInfo: document.getElementById("loginInfo"),
    resendVerifyBtn: document.getElementById("resendVerifyBtn"),
    lockAppBtn: document.getElementById("lockAppBtn")
  };

  applyTheme(config.theme);
  applyConfigText();
  renderSignupRoleOptions();
  initAuthGate();
  renderBuildingInputOptions();
  renderEquipmentClassOptions();
  renderBuildingFilterOptions();
  renderLockTypeOptions();
  renderLockColorOptions();
  renderLockMasterColorOptions();
  renderLockLocationOptions();
  renderDepartmentOptions();
  renderSafetyChecks();
  setDefaultTimes();
  updateLockKeyLocationRequirement();
  bindModalControls();
  renderAll();
  initializeCentralSync();

  els.equipmentForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      editingEquipmentId &&
      !guardCapability("manage_equipment_edit", "You do not have permission to edit equipment.")
    ) {
      return;
    }
    if (
      !editingEquipmentId &&
      !guardCapability("manage_equipment_create", "You do not have permission to add equipment.")
    ) {
      return;
    }

    const building = els.eqBuilding.value.trim();
    const location = els.eqLocation.value.trim();
    const roomNumber = els.eqRoom.value.trim();
    const equipmentClass = document.getElementById("eqClass").value.trim();
    const name = document.getElementById("eqName").value.trim();
    const description = document.getElementById("eqDescription").value.trim();
    const assetNumber = document.getElementById("eqAsset").value.trim();

    if (!building || !location || !roomNumber || !equipmentClass || !name || !description || !assetNumber) {
      alert("Building, Location, Room, Class, Name, Description, and Asset Number are required.");
      return;
    }

    if (editingEquipmentId) {
      const existing = state.equipment.find((item) => item.id === editingEquipmentId);
      if (!existing) {
        resetEquipmentFormMode();
        alert("Equipment record no longer exists.");
        return;
      }

      const duplicateOther = state.equipment.some(
        (eq) =>
          eq.id !== editingEquipmentId &&
          eq.assetNumber.toLowerCase() === assetNumber.toLowerCase()
      );
      if (duplicateOther) {
        alert("Another equipment record already uses this asset number.");
        return;
      }

      const actor = promptForActor("Enter your username for equipment edits:");
      if (!actor) {
        return;
      }

      const before = `${existing.assetNumber} | ${existing.name} | ${getEquipmentBuilding(existing)} | ${existing.locationDetail || ""} | ${existing.roomNumber || ""}`;
      Object.assign(existing, {
        building,
        locationDetail: location,
        roomNumber,
        equipmentClass,
        name,
        description,
        assetNumber,
        updatedAt: new Date().toISOString()
      });
      addAudit(
        "EQUIPMENT_EDITED",
        actor,
        `${before} -> ${existing.assetNumber} | ${existing.name} | ${getEquipmentBuilding(existing)} | ${existing.locationDetail || ""} | ${existing.roomNumber || ""}`
      );
      saveAndRender();
      event.target.reset();
      resetEquipmentFormMode();
      return;
    }

    const duplicateAsset = state.equipment.some(
      (eq) => eq.assetNumber.toLowerCase() === assetNumber.toLowerCase()
    );

    if (duplicateAsset) {
      alert("Asset number already exists. Use mass upload to update existing records.");
      return;
    }

    const equipment = {
      id: makeId("EQ"),
      building,
      locationDetail: location,
      roomNumber,
      equipmentClass,
      name,
      description,
      assetNumber,
      createdAt: new Date().toISOString()
    };

    state.equipment.push(equipment);
    addAudit("EQUIPMENT_ADDED", getCurrentActorName("System"), `${equipment.assetNumber} | ${equipment.name}`);
    saveAndRender();
    event.target.reset();
    resetEquipmentFormMode();
  });

  els.equipmentFilter.addEventListener("change", () => {
    renderEquipment();
  });

  els.equipmentTableBody.addEventListener("click", (event) => {
    const editBtn = event.target.closest("button[data-edit-equipment]");
    if (editBtn) {
      if (!guardCapability("manage_equipment_edit", "You do not have permission to edit equipment.")) {
        return;
      }
      beginEquipmentEdit(editBtn.dataset.editEquipment);
      return;
    }
  });

  if (els.equipmentCancelEditBtn) {
    els.equipmentCancelEditBtn.addEventListener("click", () => {
      resetEquipmentFormMode();
      els.equipmentForm.reset();
    });
  }

  els.uploadEquipmentExcel.addEventListener("click", () => {
    if (!guardCapability("manage_equipment_edit", "You do not have permission to upload equipment.")) {
      return;
    }
    els.equipmentExcelFile.click();
  });

  els.equipmentExcelFile.addEventListener("change", async (event) => {
    if (!guardCapability("manage_equipment_edit", "You do not have permission to upload equipment.")) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (typeof XLSX === "undefined") {
      alert("Excel parser is unavailable. Reload the page and try again.");
      event.target.value = "";
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];

      if (!firstSheetName) {
        alert("Excel file contains no worksheet.");
        event.target.value = "";
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (!rows.length) {
        alert("No equipment rows found in the Excel worksheet.");
        event.target.value = "";
        return;
      }

      const result = upsertEquipmentFromRows(rows);
      addAudit(
        "EQUIPMENT_BULK_UPLOAD",
        getCurrentActorName("System"),
        `${file.name} | Added: ${result.added}, Updated: ${result.updated}, Skipped: ${result.skipped}`
      );
      saveAndRender();

      alert(
        `Equipment upload complete. Added: ${result.added}, Updated: ${result.updated}, Skipped: ${result.skipped}`
      );
    } catch {
      alert("Unable to process the Excel file. Verify it is a valid .xlsx or .xls document.");
    } finally {
      event.target.value = "";
    }
  });

  els.lockForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (
      editingLockEventId &&
      !guardCapability("edit_lock_event", "You do not have permission to edit lock events.")
    ) {
      return;
    }
    if (
      !editingLockEventId &&
      !guardCapability("create_lock_event", "You do not have permission to create lock events.")
    ) {
      return;
    }

    if (!state.equipment.length) {
      alert("Add equipment to the master list before creating a lock event.");
      return;
    }

    const equipmentId = els.lockEquipment.value;
    const lockedBy = els.lockBy.value.trim();
    const lockNumber = els.lockNumber.value.trim();
    const lockEventLockId = (els.lockEventLockId.value || "").trim();
    const lockLocationId = (els.lockLocationId?.value || "").trim();
    const lockKeyLocation = els.lockKeyLocation.value.trim();
    const lockedWhenLocal = els.lockWhen.value;
    const expectedRemovalLocal = els.lockExpectedRemoval.value;
    const reason = document.getElementById("lockReason").value.trim();
    const lockType = (document.querySelector("input[name='lockType']:checked") || {}).value;

    if (!lockNumber) {
      alert("Lock number is required.");
      return;
    }

    if (!isKnownLockType(lockType)) {
      alert("Select a valid lock type.");
      return;
    }

    if (lockType === "green" && !lockKeyLocation) {
      alert("Key location is required for green lock events.");
      return;
    }

    if (!expectedRemovalLocal) {
      alert("Expected removal date is required.");
      return;
    }

    const lockedAtDate = new Date(lockedWhenLocal);
    const expectedRemovalDate = new Date(expectedRemovalLocal);
    if (expectedRemovalDate.getTime() < lockedAtDate.getTime()) {
      alert("Expected removal date cannot be earlier than lock timestamp.");
      return;
    }

    const equipment = state.equipment.find((item) => item.id === equipmentId);
    if (!equipment) {
      alert("Selected equipment is not available.");
      return;
    }

    let linkedMasterLock = null;
    if (lockEventLockId) {
      linkedMasterLock = state.lockMaster.find((item) => item.id === lockEventLockId) || null;
      if (!linkedMasterLock) {
        alert("Selected lock master record no longer exists.");
        return;
      }
    }

    let selectedLocation = null;
    if (lockLocationId) {
      selectedLocation = state.locations.find((item) => item.id === lockLocationId) || null;
      if (!selectedLocation) {
        alert("Selected lock location no longer exists.");
        return;
      }
    }

    const safetyChecklist = {};
    const checks = els.applySafetyChecks.querySelectorAll("input[data-role='apply-check']");
    checks.forEach((input) => {
      safetyChecklist[input.dataset.key] = input.checked;
    });

    if (editingLockEventId) {
      const existing = state.activeLocks.find((item) => item.id === editingLockEventId);
      if (!existing) {
        resetLockFormMode();
        alert("Lock event no longer exists.");
        return;
      }
      const actor = promptForActor("Enter your username for lock event edits:");
      if (!actor) {
        return;
      }
      const before = `${existing.id} | ${existing.assetNumber} | Lock# ${existing.lockNumber || ""}`;
      Object.assign(existing, {
        equipmentId,
        equipmentName: equipment.name,
        equipmentBuilding: getEquipmentBuilding(equipment),
        equipmentLocationDetail: getEquipmentLocationDetail(equipment),
        equipmentRoomNumber: getEquipmentRoomNumber(equipment),
        equipmentClass: getEquipmentClass(equipment),
        assetNumber: equipment.assetNumber,
        lockType,
        lockNumber,
        lockMasterId: linkedMasterLock ? linkedMasterLock.id : "",
        lockMasterColor: linkedMasterLock ? linkedMasterLock.colorLabel : "",
        lockLocationId: selectedLocation ? selectedLocation.id : "",
        lockLocationBuilding: selectedLocation ? selectedLocation.building : "",
        lockLocationRoom: selectedLocation ? selectedLocation.room : "",
        lockLocationDescription: selectedLocation ? selectedLocation.description : "",
        lockedBy,
        lockedAt: toIso(lockedWhenLocal),
        expectedRemovalAt: toIso(expectedRemovalLocal),
        reason,
        keyLocation: lockType === "green" ? lockKeyLocation : "",
        editedAt: new Date().toISOString(),
        editedBy: actor,
        safetyChecklist
      });
      addAudit(
        "LOCK_EVENT_EDITED",
        actor,
        `${before} -> ${existing.id} | ${existing.assetNumber} | Lock# ${existing.lockNumber || ""}`
      );
      saveAndRender();
      event.target.reset();
      setDefaultTimes();
      setDefaultLockType();
      resetLockFormMode();
      els.applySafetyChecks
        .querySelectorAll("input[data-role='apply-check']")
        .forEach((check) => {
          check.checked = false;
        });
      return;
    }

    const lockEvent = {
      id: makeId("LOCK"),
      equipmentId,
      equipmentName: equipment.name,
      equipmentBuilding: getEquipmentBuilding(equipment),
      equipmentLocationDetail: getEquipmentLocationDetail(equipment),
      equipmentRoomNumber: getEquipmentRoomNumber(equipment),
      equipmentClass: getEquipmentClass(equipment),
      assetNumber: equipment.assetNumber,
      lockType,
      lockNumber,
      lockMasterId: linkedMasterLock ? linkedMasterLock.id : "",
      lockMasterColor: linkedMasterLock ? linkedMasterLock.colorLabel : "",
      lockLocationId: selectedLocation ? selectedLocation.id : "",
      lockLocationBuilding: selectedLocation ? selectedLocation.building : "",
      lockLocationRoom: selectedLocation ? selectedLocation.room : "",
      lockLocationDescription: selectedLocation ? selectedLocation.description : "",
      lockedBy,
      lockedAt: toIso(lockedWhenLocal),
      expectedRemovalAt: toIso(expectedRemovalLocal),
      reason,
      keyLocation: lockType === "green" ? lockKeyLocation : "",
      createdAt: new Date().toISOString(),
      safetyChecklist
    };

    state.activeLocks.push(lockEvent);
    addAudit(
      "LOCK_APPLIED",
      getCurrentActorName(lockedBy),
      `${lockEvent.id} | ${equipment.assetNumber} | ${lockType.toUpperCase()} | Locked By: ${lockedBy} | Expected: ${lockEvent.expectedRemovalAt}`
    );

    saveAndRender();
    event.target.reset();
    setDefaultTimes();
    setDefaultLockType();
    resetLockFormMode();
    els.applySafetyChecks
      .querySelectorAll("input[data-role='apply-check']")
      .forEach((check) => {
        check.checked = false;
      });
  });

  els.activeCards.addEventListener("click", (event) => {
    const editBtn = event.target.closest("button[data-edit-lock]");
    if (editBtn) {
      if (!guardCapability("edit_lock_event", "You do not have permission to edit lock events.")) {
        return;
      }
      beginLockEventEdit(editBtn.dataset.editLock);
      return;
    }
    const button = event.target.closest("button[data-remove-id]");
    if (!button) {
      return;
    }
    if (!guardCapability("delete_lock_event", "You do not have permission to remove lock events.")) {
      return;
    }
    openRemoval(button.dataset.removeId);
  });

  if (els.lockEventLockId) {
    els.lockEventLockId.addEventListener("change", () => {
      const selected = state.lockMaster.find((item) => item.id === els.lockEventLockId.value);
      if (!selected) {
        return;
      }
      if (!els.lockNumber.value.trim()) {
        els.lockNumber.value = selected.number;
      }
      if (!els.lockKeyLocation.value.trim() && selected.keyLocation) {
        els.lockKeyLocation.value = selected.keyLocation;
      }
    });
  }

  if (els.lockTypeOptions) {
    els.lockTypeOptions.addEventListener("change", () => {
      updateLockKeyLocationRequirement();
    });
  }

  els.cancelRemove.addEventListener("click", closeModal);

  els.removeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!guardCapability("delete_lock_event", "You do not have permission to remove lock events.")) {
      return;
    }

    if (!pendingRemovalId) {
      return;
    }

    const removeBy = document.getElementById("removeBy").value.trim();
    const removeWhen = document.getElementById("removeWhen").value;
    const removeNotes = document.getElementById("removeNotes").value.trim();
    const safeCheck = Boolean(document.getElementById("removeSafeCheck")?.checked);

    if (!safeCheck) {
      alert("Safety verification is required before lock removal.");
      return;
    }

    const index = state.activeLocks.findIndex((item) => item.id === pendingRemovalId);
    if (index === -1) {
      closeModal();
      return;
    }

    const [lockEvent] = state.activeLocks.splice(index, 1);
    const completedEvent = {
      ...lockEvent,
      removedBy: removeBy,
      removedAt: toIso(removeWhen),
      removalNotes: removeNotes,
      removalSafetyVerified: true
    };

    state.lockHistory.unshift(completedEvent);
    addAudit(
      "LOCK_REMOVED",
      getCurrentActorName(removeBy),
      `${completedEvent.id} | ${completedEvent.assetNumber} | Removed By: ${removeBy}`
    );
    saveAndRender();
    closeModal();
  });

  window.addEventListener("click", (event) => {
    if (event.target === els.removeModal) {
      closeModal();
    }
  });

  // ----- Check Out Lock -----
  els.checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!guardCapability("checkout_lock", "You do not have permission to check out locks.")) {
      return;
    }

    const colorRadio = document.querySelector("input[name='checkoutColor']:checked");
    const colorId = colorRadio ? colorRadio.value : "";
    const number = els.checkoutNumber.value.trim();
    const userId = els.checkoutUser.value;
    const issuedLocal = els.checkoutDate.value;

    if (!colorId || !number || !userId || !issuedLocal) {
      alert("Lock color, lock number, user, and date of issue are required.");
      return;
    }

    const user = state.users.find((u) => u.id === userId);
    if (!user) {
      alert("Selected user is no longer in the user index.");
      return;
    }

    const color = config.lockColors.find((c) => c.id === colorId);
    if (!color) {
      alert("Invalid lock color.");
      return;
    }

    const alreadyOut = state.lockCheckouts.some(
      (entry) =>
        !entry.returnedAt &&
        entry.colorId === colorId &&
        entry.number.toLowerCase() === number.toLowerCase()
    );
    if (alreadyOut) {
      alert(`Lock ${color.label} #${number} is already checked out. Return it before re-issuing.`);
      return;
    }

    const checkout = {
      id: makeId("CHK"),
      colorId,
      colorLabel: color.label,
      number,
      userId,
      userName: `${user.firstName} ${user.lastName}`,
      issuedAt: toIso(issuedLocal),
      returnedAt: null
    };

    state.lockCheckouts.push(checkout);
    addAudit(
      "LOCK_CHECKED_OUT",
      getCurrentActorName("Administrator"),
      `${color.label} #${number} -> ${checkout.userName} (${user.callSign})`
    );
    saveAndRender();
    event.target.reset();
    setDefaultCheckoutDate();
    setDefaultCheckoutColor();
  });

  function setDefaultCheckoutColor() {
    if (!els.checkoutColorOptions) {
      return;
    }
    const first = config.lockColors[0];
    if (!first) {
      return;
    }
    const radio = els.checkoutColorOptions.querySelector(`input[value="${first.id}"]`);
    if (radio) {
      radio.checked = true;
    }
    els.checkoutColorOptions.querySelectorAll(".color-radio").forEach((node) => {
      node.classList.toggle("selected", node.dataset.colorId === first.id);
    });
  }

  els.checkedOutLocksBody.addEventListener("click", (event) => {
    if (!guardCapability("checkout_lock", "You do not have permission to return locks.")) {
      return;
    }
    const button = event.target.closest("button[data-return-id]");
    if (!button) {
      return;
    }
    returnCheckedOutLock(button.dataset.returnId);
  });

  // ----- Manage Users -----
  els.userForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!guardCapability("manage_users_add", "You do not have permission to add users.")) {
      return;
    }

    const type = els.userType.value;
    const firstName = els.userFirstName.value.trim();
    const lastName = els.userLastName.value.trim();
    const department = els.userDepartment.value.trim();
    const supervisor = els.userSupervisor.value.trim();
    const phone = els.userPhone.value.trim();
    const cellPhone = els.userCellPhone.value.trim();
    const callSign = els.userCallSign.value.trim();
    const trainingDate = els.userTrainingDate.value;

    if (!type || !firstName || !lastName || !department || !supervisor || !phone || !cellPhone || !callSign || !trainingDate) {
      alert("All user fields are required.");
      return;
    }

    if (!config.userTypes.some((t) => t.id === type)) {
      alert("Select a valid user type.");
      return;
    }

    if (!config.departments.includes(department)) {
      alert("Select a valid department.");
      return;
    }

    const duplicateCallSign = state.users.some(
      (u) => u.callSign.toLowerCase() === callSign.toLowerCase()
    );
    if (duplicateCallSign) {
      alert("Call sign already exists in the user index.");
      return;
    }

    const user = {
      id: makeId("USR"),
      type,
      firstName,
      lastName,
      department,
      supervisor,
      phone,
      cellPhone,
      callSign,
      trainingDate,
      createdAt: new Date().toISOString()
    };

    state.users.push(user);
    addAudit(
      "USER_ADDED",
      getCurrentActorName("Administrator"),
      `${getUserTypeLabel(type)} | ${firstName} ${lastName} | ${callSign}`
    );
    saveAndRender();
    event.target.reset();
  });

  els.usersTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-delete-user]");
    if (!button) {
      return;
    }
    if (!guardCapability("manage_users_delete", "You do not have permission to remove users.")) {
      return;
    }
    deleteUser(button.dataset.deleteUser);
  });

  // ----- Lock Master -----
  if (els.lockMasterForm) {
    els.lockMasterForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (
        editingLockMasterId &&
        !guardCapability("manage_lock_master_edit", "You do not have permission to edit lock master records.")
      ) {
        return;
      }
      if (
        !editingLockMasterId &&
        !guardCapability("manage_lock_master_create", "You do not have permission to add lock master records.")
      ) {
        return;
      }
      const number = els.masterLockNumber.value.trim();
      const colorId = els.masterLockColor.value;
      const building = els.masterLockBuilding.value.trim();
      const location = els.masterLockLocation.value.trim();
      const roomNumber = els.masterLockRoom.value.trim();
      const keyLocation = els.masterLockKeyLocation.value.trim();
      const notes = els.masterLockNotes.value.trim();

      if (!number || !colorId || !building || !location || !roomNumber) {
        alert("Lock number, color, building, location, and room are required.");
        return;
      }

      if (colorId === "green" && !keyLocation) {
        alert("Key location is required for green lock entries.");
        return;
      }

      const color = config.lockColors.find((item) => item.id === colorId);
      if (!color) {
        alert("Invalid lock color selected.");
        return;
      }

      if (editingLockMasterId) {
        const existing = state.lockMaster.find((item) => item.id === editingLockMasterId);
        if (!existing) {
          resetLockMasterFormMode();
          alert("Lock master record no longer exists.");
          return;
        }

        const duplicateOther = state.lockMaster.some(
          (item) =>
            item.id !== editingLockMasterId &&
            normalizeText(item.number) === normalizeText(number)
        );
        if (duplicateOther) {
          alert("Another lock master entry already uses this lock number.");
          return;
        }

        const actor = promptForActor("Enter your username for lock master edits:");
        if (!actor) {
          return;
        }

        const before = `${existing.number} | ${existing.colorLabel} | ${existing.building}`;
        Object.assign(existing, {
          number,
          colorId,
          colorLabel: color.label,
          building,
          locationDetail: location,
          roomNumber,
          keyLocation,
          notes,
          updatedAt: new Date().toISOString(),
          updatedBy: actor
        });
        addAudit(
          "LOCK_MASTER_EDITED",
          actor,
          `${before} -> ${existing.number} | ${existing.colorLabel} | ${existing.building}`
        );
        saveAndRender();
        event.target.reset();
        resetLockMasterFormMode();
        return;
      }

      const duplicateNumber = state.lockMaster.some(
        (item) => normalizeText(item.number) === normalizeText(number)
      );
      if (duplicateNumber) {
        alert("Lock number already exists in the lock master list.");
        return;
      }

      const record = {
        id: makeId("LCK"),
        number,
        colorId,
        colorLabel: color.label,
        building,
        locationDetail: location,
        roomNumber,
        keyLocation,
        notes,
        createdAt: new Date().toISOString()
      };
      state.lockMaster.push(record);
      addAudit(
        "LOCK_MASTER_ADDED",
        getCurrentActorName("System"),
        `${record.number} | ${record.colorLabel} | ${record.building}`
      );
      saveAndRender();
      event.target.reset();
      resetLockMasterFormMode();
    });
  }

  if (els.lockMasterTableBody) {
    els.lockMasterTableBody.addEventListener("click", (event) => {
      const editBtn = event.target.closest("button[data-edit-master-lock]");
      if (editBtn) {
        if (!guardCapability("manage_lock_master_edit", "You do not have permission to edit lock master records.")) {
          return;
        }
        beginLockMasterEdit(editBtn.dataset.editMasterLock);
        return;
      }
      const removeBtn = event.target.closest("button[data-delete-master-lock]");
      if (removeBtn) {
        if (!guardCapability("manage_lock_master_delete", "You do not have permission to remove lock master records.")) {
          return;
        }
        deleteLockMasterRecord(removeBtn.dataset.deleteMasterLock);
      }
    });
  }

  if (els.lockMasterCancelEditBtn) {
    els.lockMasterCancelEditBtn.addEventListener("click", () => {
      resetLockMasterFormMode();
      els.lockMasterForm.reset();
    });
  }

  // ----- Manage Locations -----
  if (els.locationForm) {
    els.locationForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (
        editingLocationId &&
        !guardCapability("manage_location_edit", "You do not have permission to edit locations.")
      ) {
        return;
      }
      if (
        !editingLocationId &&
        !guardCapability("manage_location_create", "You do not have permission to add locations.")
      ) {
        return;
      }

      const building = String(els.locationBuilding?.value || "").trim();
      const room = String(els.locationRoom?.value || "").trim();
      const description = String(els.locationDescription?.value || "").trim();

      if (!building || !room || !description) {
        alert("Building, room, and description are required.");
        return;
      }

      const candidateKey = locationKey({ building, room, description });
      if (editingLocationId) {
        const existing = state.locations.find((item) => item.id === editingLocationId);
        if (!existing) {
          resetLocationFormMode();
          alert("Location record no longer exists.");
          return;
        }

        const duplicateOther = state.locations.some(
          (item) => item.id !== editingLocationId && locationKey(item) === candidateKey
        );
        if (duplicateOther) {
          alert("Another location record already uses the same building, room, and description.");
          return;
        }

        const actor = getCurrentActorName("System");
        const before = locationSummary(existing);
        Object.assign(existing, {
          building,
          room,
          description,
          updatedAt: new Date().toISOString(),
          updatedBy: actor
        });
        addAudit("LOCATION_EDITED", actor, `${before} -> ${locationSummary(existing)}`);
        saveAndRender();
        event.target.reset();
        resetLocationFormMode();
        return;
      }

      const duplicate = state.locations.some((item) => locationKey(item) === candidateKey);
      if (duplicate) {
        alert("Location already exists in the location list.");
        return;
      }

      const record = {
        id: makeId("LOC"),
        building,
        room,
        description,
        createdAt: new Date().toISOString()
      };
      state.locations.push(record);
      addAudit("LOCATION_ADDED", getCurrentActorName("System"), locationSummary(record));
      saveAndRender();
      event.target.reset();
      resetLocationFormMode();
    });
  }

  if (els.locationTableBody) {
    els.locationTableBody.addEventListener("click", (event) => {
      const editBtn = event.target.closest("button[data-edit-location]");
      if (editBtn) {
        if (!guardCapability("manage_location_edit", "You do not have permission to edit locations.")) {
          return;
        }
        beginLocationEdit(editBtn.dataset.editLocation);
        return;
      }

      const deleteBtn = event.target.closest("button[data-delete-location]");
      if (deleteBtn) {
        if (!guardCapability("manage_location_delete", "You do not have permission to delete locations.")) {
          return;
        }
        deleteLocationRecord(deleteBtn.dataset.deleteLocation);
      }
    });
  }

  if (els.locationCancelEditBtn) {
    els.locationCancelEditBtn.addEventListener("click", () => {
      resetLocationFormMode();
      els.locationForm.reset();
    });
  }

  // ----- Search -----
  if (els.searchForm) {
    els.searchForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!guardCapability("search_records", "You do not have permission to search records.")) {
        return;
      }
      runSearch(els.searchQuery.value);
    });
  }

  // ----- Help Request -----
  if (els.helpForm) {
    els.helpForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!guardCapability("request_help", "You do not have permission to send help requests.")) {
        return;
      }

      const category = String(els.helpCategory?.value || "Help Request").trim();
      const subject = String(els.helpSubject?.value || "").trim();
      const details = String(els.helpDetails?.value || "").trim();
      if (!subject || !details) {
        alert("Subject and details are required.");
        return;
      }

      const requester = getCurrentActorName("Unknown User");
      const roleLabel = ROLE_LABELS[currentAuthRole] || currentAuthRole || "Unknown Role";
      const body = [
        `Request Type: ${category}`,
        `Requested By: ${requester}`,
        `Role: ${roleLabel}`,
        "",
        "Details:",
        details
      ].join("\n");
      const mailto = `mailto:blazer.walker@protonmail.com?subject=${encodeURIComponent(`[PEACH] ${category}: ${subject}`)}&body=${encodeURIComponent(body)}`;
      window.location.href = mailto;
      addAudit("HELP_REQUEST_INITIATED", requester, `${category} | ${subject}`);
      saveState();
      closeManagedModal("helpModal");
      els.helpForm.reset();
    });
  }

  function applyConfigText() {
    document.title = config.appTitle;
    els.appTitle.textContent = config.appTitle;
    els.appKicker.textContent = config.appKicker;
    els.appSubtitle.textContent = config.appSubtitle;
    els.quickNotesText.textContent = config.quickNotes;
    els.removeTitle.textContent = config.removeConfirmationTitle;
    els.removeWarningText.textContent = config.removeWarningText;
    els.appLogo.src = config.theme.logoPath;
    if (els.sidebarLogo) {
      els.sidebarLogo.src = config.theme.logoPath;
    }
    if (els.sidebarTagline) {
      els.sidebarTagline.textContent = config.appKicker;
    }
  }

  function initAuthGate() {
    if (!els.loginOverlay || !els.loginForm || !els.lockAppBtn) {
      return;
    }

    bindAuthModeButtons();
    applyRolePermissions("");
    updateCurrentUserLabel("Not signed in", "");
    showOverlay();

    if (FIREBASE_ENABLED) {
      if (firebaseCtx.auth && firebaseCtx.db) {
        initFirebaseAuthGate();
        return;
      }
      showAuthConfigError(
        "Firebase authentication is enabled but not configured. Update config.js with valid Firebase keys."
      );
      return;
    }

    if (LOCAL_AUTH_ENABLED) {
      initLocalAuthGate();
      return;
    }

    initLegacyAuthGate();
  }

  function showAuthConfigError(message) {
    if (els.loginForm) {
      els.loginForm.hidden = true;
    }
    if (els.signupForm) {
      els.signupForm.hidden = true;
    }
    if (els.authModeSignIn) {
      els.authModeSignIn.disabled = true;
    }
    if (els.authModeSignUp) {
      els.authModeSignUp.disabled = true;
    }
    setAuthError(message);
  }

  function initLegacyAuthGate() {
    if (els.authModeSignUp) {
      els.authModeSignUp.disabled = true;
      els.authModeSignUp.hidden = true;
    }
    if (els.signupForm) {
      els.signupForm.hidden = true;
    }
    showAuthMode("signin");

    if (sessionStorage.getItem(SESSION_KEY) === "1") {
      currentAuthRole = "super_admin";
      authReadyForData = true;
      applyRolePermissions(currentAuthRole);
      updateCurrentUserLabel("Administrator", currentAuthRole);
      hideOverlay();
    }

    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessages();
      const attempt = String(els.loginPassword?.value || "");
      const hash = await sha256Hex(attempt);
      if (hash !== config.passwordHash) {
        setAuthError("Incorrect credentials.");
        return;
      }

      sessionStorage.setItem(SESSION_KEY, "1");
      currentAuthRole = "super_admin";
      authReadyForData = true;
      applyRolePermissions(currentAuthRole);
      updateCurrentUserLabel("Administrator", currentAuthRole);
      hideOverlay();
      addAudit("ADMIN_LOGIN", "Administrator", "Application unlocked (legacy mode)");
      saveState();
      renderAudit();
      if (els.loginPassword) {
        els.loginPassword.value = "";
      }
    });

    els.lockAppBtn.addEventListener("click", () => {
      sessionStorage.removeItem(SESSION_KEY);
      authReadyForData = false;
      currentAuthRole = "";
      currentAuthUser = null;
      applyRolePermissions("");
      updateCurrentUserLabel("Not signed in", "");
      addAudit("ADMIN_LOGOUT", "Administrator", "Application locked (legacy mode)");
      saveState();
      renderAudit();
      showOverlay();
    });
  }

  function initLocalAuthGate() {
    if (els.authModeSignUp) {
      els.authModeSignUp.disabled = false;
      els.authModeSignUp.hidden = false;
    }
    if (els.resendVerifyBtn) {
      els.resendVerifyBtn.hidden = true;
    }
    showAuthMode("signin");

    const rawSession = sessionStorage.getItem(SESSION_USER_KEY);
    if (rawSession) {
      try {
        const parsed = JSON.parse(rawSession);
        applyAuthenticatedUser(parsed, false);
        hideOverlay();
      } catch {
        sessionStorage.removeItem(SESSION_USER_KEY);
      }
    }

    bindLocalAuthFormActions();
  }

  function bindLocalAuthFormActions() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessages();

      const email = String(els.loginEmail?.value || "").trim();
      const password = String(els.loginPassword?.value || "");
      if (!email || !password) {
        setAuthError("Email/Admin and password are required.");
        return;
      }

      try {
        const payload = await localAuthRequest("/auth/login", { email, password });
        applyAuthenticatedUser(payload.user, true);
        hideOverlay();
      } catch (error) {
        setAuthError(formatLocalAuthError(error));
      }
    });

    if (els.signupForm) {
      els.signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAuthMessages();

        const displayName = String(els.signupName?.value || "").trim();
        const email = String(els.signupEmail?.value || "").trim().toLowerCase();
        const password = String(els.signupPassword?.value || "");
        const confirmPassword = String(els.signupConfirmPassword?.value || "");
        const requestedRole = normalizeRole(els.signupRole?.value || DEFAULT_ROLE);

        if (!displayName || !email || !password || !confirmPassword) {
          setAuthError("All signup fields are required.");
          return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setAuthError("Enter a valid email address.");
          return;
        }

        if (requestedRole === "super_admin") {
          setAuthError("Super Admin cannot be requested from self-service signup.");
          return;
        }

        if (password !== confirmPassword) {
          setAuthError("Passwords do not match.");
          return;
        }

        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
          setAuthError(passwordError);
          return;
        }

        try {
          await localAuthRequest("/auth/signup", {
            displayName,
            email,
            password,
            requestedRole
          });
          showAuthMode("signin");
          if (els.loginEmail) {
            els.loginEmail.value = email;
          }
          if (els.loginPassword) {
            els.loginPassword.value = "";
          }
          setAuthInfo("Account created. Sign in with your new credentials.");
          els.signupForm.reset();
          renderSignupRoleOptions();
        } catch (error) {
          setAuthError(formatLocalAuthError(error));
        }
      });
    }

    els.lockAppBtn.addEventListener("click", async () => {
      clearAuthMessages();
      const actor = currentAuthUser?.email || currentAuthUser?.displayName || "Unknown";
      if (authReadyForData) {
        addAudit("AUTH_LOGOUT", actor, "Application locked");
        saveState();
      }
      authReadyForData = false;
      currentAuthRole = "";
      currentAuthUser = null;
      applyRolePermissions("");
      updateCurrentUserLabel("Not signed in", "");
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(SESSION_USER_KEY);
      stopFirebaseStateSync();
      showOverlay();
    });
  }

  function initFirebaseAuthGate() {
    showAuthMode("signin");
    bindFirebaseAuthFormActions();

    firebaseCtx.auth.onAuthStateChanged(async (user) => {
      clearAuthMessages();

      if (!user) {
        authReadyForData = false;
        currentAuthUser = null;
        currentAuthRole = "";
        lastSignedInUid = "";
        applyRolePermissions("");
        updateCurrentUserLabel("Not signed in", "");
        stopFirebaseStateSync();
        showOverlay();
        return;
      }

      await user.reload();

      if (REQUIRE_VERIFIED_EMAIL && !user.emailVerified) {
        currentAuthUser = user;
        authReadyForData = false;
        currentAuthRole = "";
        applyRolePermissions("");
        updateCurrentUserLabel(user.email || "Unverified", "");
        if (els.resendVerifyBtn) {
          els.resendVerifyBtn.hidden = false;
        }
        setAuthInfo("Email verification required. Check your inbox, then sign in again.");
        showOverlay();
        return;
      }

      if (els.resendVerifyBtn) {
        els.resendVerifyBtn.hidden = true;
      }

      let profile = null;
      try {
        profile = await ensureFirebaseUserRecord(user);
      } catch (error) {
        setAuthError(`Unable to load user profile: ${formatFirebaseAuthError(error)}`);
        await firebaseCtx.auth.signOut();
        return;
      }
      currentAuthUser = user;
      currentAuthRole = normalizeRole(profile.role || DEFAULT_ROLE);
      authReadyForData = true;
      sessionStorage.setItem(SESSION_KEY, "1");
      applyRolePermissions(currentAuthRole);
      updateCurrentUserLabel(profile.displayName || user.email || "Signed in", currentAuthRole);
      hideOverlay();

      if (lastSignedInUid !== user.uid) {
        lastSignedInUid = user.uid;
        addAudit("AUTH_LOGIN", user.email || "Unknown", `Role: ${currentAuthRole}`);
        saveState();
      }

      initializeCentralSync();
    });
  }

  function bindFirebaseAuthFormActions() {
    els.loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      clearAuthMessages();

      const email = String(els.loginEmail?.value || "").trim().toLowerCase();
      const password = String(els.loginPassword?.value || "");
      if (!email || !password) {
        setAuthError("Email and password are required.");
        return;
      }

      try {
        await firebaseCtx.auth.signInWithEmailAndPassword(email, password);
      } catch (error) {
        setAuthError(formatFirebaseAuthError(error));
      }
    });

    if (els.signupForm) {
      els.signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        clearAuthMessages();

        const displayName = String(els.signupName?.value || "").trim();
        const email = String(els.signupEmail?.value || "").trim().toLowerCase();
        const password = String(els.signupPassword?.value || "");
        const confirmPassword = String(els.signupConfirmPassword?.value || "");
        const requestedRole = normalizeRole(els.signupRole?.value || DEFAULT_ROLE);

        if (!displayName || !email || !password || !confirmPassword) {
          setAuthError("All signup fields are required.");
          return;
        }

        if (password !== confirmPassword) {
          setAuthError("Passwords do not match.");
          return;
        }

        const passwordError = validatePasswordStrength(password);
        if (passwordError) {
          setAuthError(passwordError);
          return;
        }

        try {
          const credential = await firebaseCtx.auth.createUserWithEmailAndPassword(email, password);
          if (credential.user) {
            const signupSuccessMessage =
              "Account created. Verify your email before access is granted.";
            await credential.user.updateProfile({ displayName });
            await ensureFirebaseUserRecord(credential.user, requestedRole, displayName);
            await credential.user.sendEmailVerification();
            await firebaseCtx.auth.signOut();
            showAuthMode("signin");
            if (els.loginEmail) {
              els.loginEmail.value = email;
            }
            setAuthInfo(signupSuccessMessage);
          }
        } catch (error) {
          setAuthError(formatFirebaseAuthError(error));
        }
      });
    }

    if (els.resendVerifyBtn) {
      els.resendVerifyBtn.addEventListener("click", async () => {
        if (!currentAuthUser) {
          return;
        }
        try {
          await currentAuthUser.sendEmailVerification();
          setAuthInfo("Verification email sent.");
        } catch (error) {
          setAuthError(formatFirebaseAuthError(error));
        }
      });
    }

    els.lockAppBtn.addEventListener("click", async () => {
      clearAuthMessages();
      if (FIREBASE_ENABLED && firebaseCtx.auth) {
        const actor = currentAuthUser?.email || "Unknown";
        if (currentAuthUser) {
          addAudit("AUTH_LOGOUT", actor, "Application locked");
          saveState();
        }
        await firebaseCtx.auth.signOut();
      } else {
        sessionStorage.removeItem(SESSION_KEY);
        showOverlay();
      }
    });
  }

  function bindAuthModeButtons() {
    if (els.authModeSignIn) {
      els.authModeSignIn.addEventListener("click", () => {
        showAuthMode("signin");
      });
    }
    if (els.authModeSignUp) {
      els.authModeSignUp.addEventListener("click", () => {
        showAuthMode("signup");
      });
    }
  }

  function showAuthMode(mode) {
    const isSignup = mode === "signup";
    if (els.loginForm) {
      els.loginForm.hidden = isSignup;
    }
    if (els.signupForm) {
      els.signupForm.hidden = !isSignup;
    }
    if (els.authModeSignIn) {
      els.authModeSignIn.classList.toggle("active", !isSignup);
      els.authModeSignIn.setAttribute("aria-selected", String(!isSignup));
    }
    if (els.authModeSignUp) {
      els.authModeSignUp.classList.toggle("active", isSignup);
      els.authModeSignUp.setAttribute("aria-selected", String(isSignup));
    }
    clearAuthMessages();
  }

  function showOverlay() {
    if (!els.loginOverlay) {
      return;
    }
    els.loginOverlay.classList.remove("hidden");
    if (els.loginEmail && !els.loginForm.hidden) {
      els.loginEmail.focus();
    } else if (els.signupName && !els.signupForm.hidden) {
      els.signupName.focus();
    }
  }

  function hideOverlay() {
    if (!els.loginOverlay) {
      return;
    }
    els.loginOverlay.classList.add("hidden");
  }

  function setAuthError(message) {
    if (!els.loginError) {
      return;
    }
    els.loginError.textContent = String(message || "");
    els.loginError.hidden = !message;
    if (message && els.loginInfo) {
      els.loginInfo.hidden = true;
    }
  }

  function setAuthInfo(message) {
    if (!els.loginInfo) {
      return;
    }
    els.loginInfo.textContent = String(message || "");
    els.loginInfo.hidden = !message;
  }

  function clearAuthMessages() {
    if (els.loginError) {
      els.loginError.hidden = true;
    }
    if (els.loginInfo) {
      els.loginInfo.hidden = true;
    }
  }

  function renderSignupRoleOptions() {
    if (!els.signupRole) {
      return;
    }
    const signupRoles = config.authRoles.filter((role) => role.id !== "super_admin");
    els.signupRole.innerHTML = signupRoles
      .map((role) => `<option value="${escapeHtml(role.id)}">${escapeHtml(role.label)}</option>`)
      .join("");
    const fallbackRole = signupRoles.find((role) => role.id === DEFAULT_ROLE)
      ? DEFAULT_ROLE
      : (signupRoles[0]?.id || "");
    els.signupRole.value = fallbackRole;
  }

  function normalizeRole(roleValue) {
    const clean = String(roleValue || "").toLowerCase().trim();
    const known = config.authRoles.find((role) => role.id === clean);
    return known ? known.id : DEFAULT_ROLE;
  }

  function applyRolePermissions(roleId) {
    const allowed = new Set(ROLE_PERMISSIONS[roleId] || []);
    document.querySelectorAll("[data-capability]").forEach((node) => {
      const capability = node.dataset.capability;
      const canUse = allowed.has(capability);
      node.classList.toggle("disabled", !canUse);
      if (!canUse) {
        node.setAttribute("aria-disabled", "true");
      } else {
        node.removeAttribute("aria-disabled");
      }
    });
  }

  function hasCapability(capability, roleId) {
    const role = roleId || currentAuthRole;
    const allowed = ROLE_PERMISSIONS[role] || [];
    return allowed.includes(capability);
  }

  function guardCapability(capability, deniedMessage) {
    if (!authReadyForData) {
      showOverlay();
      return false;
    }
    if (hasCapability(capability, currentAuthRole)) {
      return true;
    }
    if (deniedMessage) {
      alert(deniedMessage);
    }
    return false;
  }

  function capabilityForModal(modalId) {
    const map = {
      lockEventModal: "create_lock_event",
      equipmentModal: "manage_equipment_create",
      lockMasterModal: "manage_lock_master_create",
      locationModal: "manage_location_create",
      checkoutModal: "checkout_lock",
      searchModal: "search_records",
      usersModal: "manage_users_add",
      reportsModal: "view_reports",
      helpModal: "request_help"
    };
    return map[modalId] || "";
  }

  function updateCurrentUserLabel(name, roleId) {
    if (!els.currentUserLabel) {
      return;
    }
    const roleLabel = roleId ? ROLE_LABELS[roleId] || roleId : "";
    els.currentUserLabel.textContent = roleLabel ? `${name} (${roleLabel})` : name;
  }

  function validatePasswordStrength(password) {
    const value = String(password || "");
    if (value.length < 12) {
      return "Password must be at least 12 characters.";
    }
    if (!/[a-z]/.test(value) || !/[A-Z]/.test(value)) {
      return "Password must include upper and lower case letters.";
    }
    if (!/[0-9]/.test(value)) {
      return "Password must include at least one number.";
    }
    if (!/[^A-Za-z0-9]/.test(value)) {
      return "Password must include at least one symbol.";
    }
    return "";
  }

  function formatFirebaseAuthError(error) {
    const code = String(error?.code || "");
    if (code.includes("email-already-in-use")) return "Email already registered.";
    if (code.includes("invalid-email")) return "Email format is invalid.";
    if (code.includes("weak-password")) return "Password does not meet security requirements.";
    if (code.includes("wrong-password") || code.includes("invalid-credential")) return "Incorrect email or password.";
    if (code.includes("user-not-found")) return "User account not found.";
    if (code.includes("too-many-requests")) return "Too many attempts. Please wait and try again.";
    return String(error?.message || "Authentication error.");
  }

  async function localAuthRequest(path, body) {
    if (!API_BASE_PATH) {
      throw new Error("Local auth API is unavailable.");
    }
    let response;
    try {
      response = await fetch(`${API_BASE_PATH}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body || {})
      });
    } catch {
      throw new Error("Unable to reach local authentication service.");
    }

    let payload = {};
    try {
      payload = await response.json();
    } catch {
      payload = {};
    }
    if (!response.ok) {
      throw new Error(String(payload.error || "Authentication request failed."));
    }
    return payload;
  }

  function formatLocalAuthError(error) {
    return String(error?.message || "Authentication request failed.");
  }

  function applyAuthenticatedUser(userProfile, logAudit) {
    const normalized = {
      id: String(userProfile?.id || ""),
      email: String(userProfile?.email || ""),
      displayName: String(userProfile?.displayName || userProfile?.email || ""),
      role: normalizeRole(userProfile?.role || DEFAULT_ROLE)
    };
    currentAuthUser = {
      uid: normalized.id,
      email: normalized.email,
      displayName: normalized.displayName
    };
    currentAuthRole = normalized.role;
    authReadyForData = true;
    sessionStorage.setItem(SESSION_KEY, "1");
    sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(normalized));
    applyRolePermissions(currentAuthRole);
    updateCurrentUserLabel(normalized.displayName || normalized.email || "Signed in", currentAuthRole);
    if (logAudit) {
      addAudit("AUTH_LOGIN", normalized.email || normalized.displayName || "Unknown", `Role: ${currentAuthRole}`);
      saveState();
    }
    initializeCentralSync();
  }

  async function sha256Hex(value) {
    const buffer = new TextEncoder().encode(String(value));
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function bindModalControls() {
    const managedModalIds = [
      "lockEventModal",
      "equipmentModal",
      "lockMasterModal",
      "locationModal",
      "checkoutModal",
      "searchModal",
      "usersModal",
      "reportsModal",
      "helpModal"
    ];

    document.querySelectorAll("[data-open-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openManagedModal(btn.dataset.openModal);
      });
    });

    const dashboardBtn = document.getElementById("peachDashboardBtn");
    if (dashboardBtn) {
      dashboardBtn.addEventListener("click", () => {
        if (!guardCapability("view_dashboard", "Your role does not have access to the dashboard.")) {
          return;
        }
        managedModalIds.forEach((id) => {
          closeManagedModal(id);
        });
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    }

    document.querySelectorAll("[data-close-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        closeManagedModal(btn.dataset.closeModal);
      });
    });

    managedModalIds.forEach((id) => {
      const modal = document.getElementById(id);
      if (!modal) {
        return;
      }
      modal.addEventListener("click", (event) => {
        if (event.target === modal) {
          closeManagedModal(id);
        }
      });
    });

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        managedModalIds.forEach((id) => {
          const modal = document.getElementById(id);
          if (modal && modal.classList.contains("open")) {
            closeManagedModal(id);
          }
        });
      }
    });
  }

  function openManagedModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      return;
    }
    const requiredCapability = capabilityForModal(id);
    if (requiredCapability && !guardCapability(requiredCapability, "Your role does not have access to this section.")) {
      return;
    }
    if (id === "checkoutModal") {
      setDefaultCheckoutDate();
    }
    if (id === "reportsModal") {
      renderReports();
    }
    if (id === "lockEventModal") {
      updateLockKeyLocationRequirement();
    }
    modal.classList.add("open");
  }

  function closeManagedModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      return;
    }
    modal.classList.remove("open");
    if (id === "equipmentModal") {
      resetEquipmentFormMode();
      if (els.equipmentForm) {
        els.equipmentForm.reset();
      }
    }
    if (id === "lockEventModal") {
      resetLockFormMode();
      if (els.lockForm) {
        els.lockForm.reset();
      }
      setDefaultTimes();
      setDefaultLockType();
    }
    if (id === "lockMasterModal") {
      resetLockMasterFormMode();
      if (els.lockMasterForm) {
        els.lockMasterForm.reset();
      }
    }
    if (id === "locationModal") {
      resetLocationFormMode();
      if (els.locationForm) {
        els.locationForm.reset();
      }
    }
    if (id === "helpModal" && els.helpForm) {
      els.helpForm.reset();
    }
  }

  function setDefaultCheckoutDate() {
    if (els.checkoutDate && !els.checkoutDate.value) {
      els.checkoutDate.value = localDateTimeValue(new Date());
    }
  }

  function applyTheme(theme) {
    document.documentElement.style.setProperty("--bg-1", theme.bgStart);
    document.documentElement.style.setProperty("--bg-2", theme.bgEnd);
    document.documentElement.style.setProperty("--text", theme.text);
    document.documentElement.style.setProperty("--accent", theme.primary);
    document.documentElement.style.setProperty("--accent-2", theme.secondary);
    document.documentElement.style.setProperty("--gold", theme.gold);
    document.documentElement.style.setProperty("--red", theme.red);
    document.documentElement.style.setProperty("--green", theme.green);
  }

  function renderBuildingInputOptions() {
    const currentValue = els.eqBuilding.value || "";
    const currentMasterValue = els.masterLockBuilding ? els.masterLockBuilding.value || "" : "";
    const currentLocationValue = els.locationBuilding ? els.locationBuilding.value || "" : "";
    const options = [
      '<option value="">Select Building</option>',
      ...config.buildingFilters.map(
        (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    ];
    els.eqBuilding.innerHTML = options.join("");
    if (els.masterLockBuilding) {
      els.masterLockBuilding.innerHTML = options.join("");
    }
    if (els.locationBuilding) {
      els.locationBuilding.innerHTML = options.join("");
    }

    const stillExists = config.buildingFilters.some((item) => item === currentValue);
    els.eqBuilding.value = stillExists ? currentValue : "";
    if (els.masterLockBuilding) {
      const masterStillExists = config.buildingFilters.some((item) => item === currentMasterValue);
      els.masterLockBuilding.value = masterStillExists ? currentMasterValue : "";
    }
    if (els.locationBuilding) {
      const locationStillExists = config.buildingFilters.some((item) => item === currentLocationValue);
      els.locationBuilding.value = locationStillExists ? currentLocationValue : "";
    }
  }

  function renderEquipmentClassOptions() {
    const currentValue = els.eqClass.value || "";
    const options = [
      '<option value="">Select Class</option>',
      ...config.equipmentClasses.map(
        (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    ];
    els.eqClass.innerHTML = options.join("");

    const stillExists = config.equipmentClasses.some((item) => item === currentValue);
    els.eqClass.value = stillExists ? currentValue : "";
  }

  function renderBuildingFilterOptions() {
    const currentValue = els.equipmentFilter.value || "all";
    const options = [
      '<option value="all">All Buildings</option>',
      ...config.buildingFilters.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    ];
    els.equipmentFilter.innerHTML = options.join("");

    const stillExists = ["all", ...config.buildingFilters].some((item) => item === currentValue);
    els.equipmentFilter.value = stillExists ? currentValue : "all";
  }

  function renderLockColorOptions() {
    if (!els.checkoutColorOptions) {
      return;
    }
    els.checkoutColorOptions.innerHTML = config.lockColors
      .map(
        (color, index) => `
          <label class="color-radio ${index === 0 ? "selected" : ""}" data-color-id="${escapeHtml(color.id)}">
            <input type="radio" name="checkoutColor" value="${escapeHtml(color.id)}" ${index === 0 ? "checked" : ""}>
            ${padlockIcon(color.hex)}
            <span>${escapeHtml(color.label)}</span>
          </label>
        `
      )
      .join("");

    els.checkoutColorOptions.addEventListener("change", (event) => {
      const target = event.target;
      if (!target || target.name !== "checkoutColor") {
        return;
      }
      els.checkoutColorOptions.querySelectorAll(".color-radio").forEach((node) => {
        node.classList.toggle("selected", node.dataset.colorId === target.value);
      });
    });
  }

  function renderLockMasterColorOptions() {
    if (!els.masterLockColor) {
      return;
    }
    const currentValue = els.masterLockColor.value || "";
    const options = [
      '<option value="">Select Lock Color</option>',
      ...config.lockColors.map(
        (color) => `<option value="${escapeHtml(color.id)}">${escapeHtml(color.label)}</option>`
      )
    ];
    els.masterLockColor.innerHTML = options.join("");
    const stillExists = config.lockColors.some((item) => item.id === currentValue);
    els.masterLockColor.value = stillExists ? currentValue : "";
  }

  function renderDepartmentOptions() {
    if (!els.userDepartment) {
      return;
    }
    els.userDepartment.innerHTML = [
      '<option value="">Select Department</option>',
      ...config.departments.map(
        (d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`
      )
    ].join("");
  }

  function padlockIcon(colorHex) {
    return `<svg class="padlock-icon" viewBox="0 0 24 24" width="14" height="16" aria-hidden="true"><path fill="${escapeHtml(colorHex)}" stroke="rgba(0,0,0,0.35)" stroke-width="0.6" d="M7 10V8a5 5 0 0 1 10 0v2h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h6V8a3 3 0 0 0-6 0v2z"/></svg>`;
  }

  function colorHexFor(colorId) {
    const color = config.lockColors.find((c) => c.id === colorId);
    if (color) {
      return color.hex;
    }
    if (colorId === "red") return config.theme.red;
    if (colorId === "green") return config.theme.green;
    return config.theme.primary;
  }

  function renderUserSelectOptions() {
    const sortedUsers = [...state.users].sort((a, b) =>
      `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`)
    );

    if (els.checkoutUser) {
      if (!state.users.length) {
        els.checkoutUser.innerHTML = '<option value="">Add a user first</option>';
      } else {
        const options = [
          '<option value="">Select User</option>',
          ...sortedUsers.map(
            (u) =>
              `<option value="${escapeHtml(u.id)}">${escapeHtml(u.lastName)}, ${escapeHtml(u.firstName)} (${escapeHtml(u.callSign)}) - ${escapeHtml(getUserTypeLabel(u.type))}</option>`
          )
        ];
        els.checkoutUser.innerHTML = options.join("");
      }
    }

    if (els.lockBy) {
      if (!state.users.length) {
        els.lockBy.innerHTML = '<option value="">Add a user first</option>';
      } else {
        const options = [
          '<option value="">Select User</option>',
          ...sortedUsers.map(
            (u) =>
              `<option value="${escapeHtml(`${u.firstName} ${u.lastName}`)}">${escapeHtml(u.lastName)}, ${escapeHtml(u.firstName)} (${escapeHtml(u.callSign)}) - ${escapeHtml(getUserTypeLabel(u.type))}</option>`
          )
        ];
        els.lockBy.innerHTML = options.join("");
      }
    }
  }

  function renderLockMasterSelectOptions() {
    if (!els.lockEventLockId) {
      return;
    }
    const selectedValue = els.lockEventLockId.value || "";
    if (!state.lockMaster.length) {
      els.lockEventLockId.innerHTML = '<option value="">No lock master records yet</option>';
      return;
    }

    const options = [
      '<option value="">Optional: Select lock from master list</option>',
      ...[...state.lockMaster]
        .sort((a, b) => a.number.localeCompare(b.number))
        .map(
          (item) => `
            <option value="${escapeHtml(item.id)}" ${selectedValue === item.id ? "selected" : ""}>
              ${escapeHtml(item.number)} | ${escapeHtml(item.colorLabel)} | ${escapeHtml(item.building)} / ${escapeHtml(item.locationDetail || "")} / ${escapeHtml(item.roomNumber || "")}
            </option>
          `
        )
    ];
    els.lockEventLockId.innerHTML = options.join("");
  }

  function renderLockLocationOptions() {
    if (!els.lockLocationId) {
      return;
    }
    const selectedValue = els.lockLocationId.value || "";
    if (!state.locations.length) {
      els.lockLocationId.innerHTML = '<option value="">No managed locations yet</option>';
      return;
    }

    const options = [
      '<option value="">Optional: Select lock location</option>',
      ...[...state.locations]
        .sort((a, b) => locationSummary(a).localeCompare(locationSummary(b)))
        .map(
          (item) => `<option value="${escapeHtml(item.id)}" ${selectedValue === item.id ? "selected" : ""}>${escapeHtml(locationSummary(item))}</option>`
        )
    ];
    els.lockLocationId.innerHTML = options.join("");
  }

  function renderLockTypeOptions() {
    els.lockTypeOptions.innerHTML = config.lockTypes
      .map(
        (type, index) => `
          <label class="lock-type-radio">
            <input type="radio" name="lockType" value="${escapeHtml(type.id)}" ${index === 0 ? "checked" : ""}>
            ${padlockIcon(colorHexFor(type.id))}
            ${escapeHtml(type.label)}
          </label>
        `
      )
      .join("");
  }

  function renderSafetyChecks() {
    els.applySafetyChecks.innerHTML = config.applySafetyChecks
      .map((label, index) => {
        const key = makeSafetyKey(label, index);
        return `
          <label>
            <input type="checkbox" data-role="apply-check" data-key="${escapeHtml(key)}" required>
            ${escapeHtml(label)}
          </label>
        `;
      })
      .join("");

    els.removeSafetyChecks.innerHTML = `
      <label>
        <input id="removeSafeCheck" type="checkbox" required>
        ${escapeHtml(config.removeVerificationLabel)}
      </label>
    `;
  }

  function renderAll() {
    renderStats();
    renderEquipment();
    renderLockMaster();
    renderLocationMaster();
    renderLockMasterSelectOptions();
    renderLockLocationOptions();
    renderActiveLocks();
    renderHistory();
    renderAudit();
    renderUsers();
    renderUserSelectOptions();
    renderUserAssignments();
    renderCheckedOutLocks();
    renderCheckoutHistory();
    renderLocksByBuilding();
    renderLocksByDepartment();
  }

  function renderStats() {
    const overdueCount = state.activeLocks.filter((lock) => isOverdue(lock.expectedRemovalAt)).length;
    const checkedOutCount = state.lockCheckouts.filter((entry) => !entry.returnedAt).length;
    const statRows = [
      { label: "Active Locks", value: state.activeLocks.length },
      ...config.lockTypes.map((type) => ({
        label: type.summaryLabel,
        value: state.activeLocks.filter((lock) => lock.lockType === type.id).length
      })),
      { label: "Overdue Locks", value: overdueCount },
      { label: "Master Equipment", value: state.equipment.length },
      { label: "Master Locks", value: state.lockMaster.length },
      { label: "Master Locations", value: state.locations.length },
      { label: "Locks Checked Out", value: checkedOutCount },
      { label: "Indexed Users", value: state.users.length }
    ];

    els.statsGrid.innerHTML = statRows
      .map(
        (stat) => `
          <article class="stat">
            <span class="stat-label">${escapeHtml(stat.label)}</span>
            <div class="stat-value">${escapeHtml(String(stat.value))}</div>
          </article>
        `
      )
      .join("");
  }

  function renderEquipment() {
    if (!state.equipment.length) {
      els.equipmentTableBody.innerHTML = '<tr><td colspan="8">No equipment added yet.</td></tr>';
      els.lockEquipment.innerHTML = '<option value="">Add equipment first</option>';
      return;
    }

    const selectedFilter = els.equipmentFilter.value;
    const filteredEquipment = getFilteredEquipment(selectedFilter);

    if (!filteredEquipment.length) {
      els.equipmentTableBody.innerHTML = '<tr><td colspan="8">No equipment matches the selected building filter.</td></tr>';
    } else {
      els.equipmentTableBody.innerHTML = filteredEquipment
        .map(
          (eq) => `
            <tr>
              <td>${escapeHtml(eq.assetNumber)}</td>
              <td>${escapeHtml(getEquipmentClass(eq))}</td>
              <td>${escapeHtml(eq.name)}</td>
              <td>${escapeHtml(getEquipmentBuilding(eq))}</td>
              <td>${escapeHtml(getEquipmentLocationDetail(eq))}</td>
              <td>${escapeHtml(getEquipmentRoomNumber(eq))}</td>
              <td>${escapeHtml(eq.description)}</td>
              <td>
                ${
                  hasCapability("manage_equipment_edit")
                    ? `<button type="button" class="btn-secondary btn-small" data-edit-equipment="${escapeHtml(eq.id)}">Edit</button>`
                    : "<span class=\"empty\">No edit access</span>"
                }
              </td>
            </tr>
          `
        )
        .join("");
    }

    const selectedEquipment = els.lockEquipment.value;
    const options = [...state.equipment]
      .sort((a, b) => a.assetNumber.localeCompare(b.assetNumber))
      .map(
        (eq) => `
          <option value="${escapeHtml(eq.id)}" ${selectedEquipment === eq.id ? "selected" : ""}>
            ${escapeHtml(eq.assetNumber)} | ${escapeHtml(getEquipmentClass(eq))} | ${escapeHtml(eq.name)} (${escapeHtml(getEquipmentBuilding(eq))} / ${escapeHtml(getEquipmentLocationDetail(eq))} / ${escapeHtml(getEquipmentRoomNumber(eq))})
          </option>
        `
      )
      .join("");

    els.lockEquipment.innerHTML = options;
  }

  function renderLockMaster() {
    if (!els.lockMasterTableBody) {
      return;
    }
    if (!state.lockMaster.length) {
      els.lockMasterTableBody.innerHTML = '<tr><td colspan="8" class="empty">No lock master records added yet.</td></tr>';
      return;
    }

    els.lockMasterTableBody.innerHTML = [...state.lockMaster]
      .sort((a, b) => a.number.localeCompare(b.number))
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.number)}</td>
            <td>${escapeHtml(item.colorLabel)}</td>
            <td>${escapeHtml(item.building)}</td>
            <td>${escapeHtml(item.locationDetail || "")}</td>
            <td>${escapeHtml(item.roomNumber || "")}</td>
            <td>${escapeHtml(item.keyLocation || "")}</td>
            <td>${escapeHtml(item.notes || "")}</td>
            <td>
              ${
                hasCapability("manage_lock_master_edit")
                  ? `<button type="button" class="btn-secondary btn-small" data-edit-master-lock="${escapeHtml(item.id)}">Edit</button>`
                  : ""
              }
              ${
                hasCapability("manage_lock_master_delete")
                  ? `<button type="button" class="btn-danger btn-small" data-delete-master-lock="${escapeHtml(item.id)}">Delete</button>`
                  : ""
              }
              ${
                !hasCapability("manage_lock_master_edit") && !hasCapability("manage_lock_master_delete")
                  ? "<span class=\"empty\">No edit/delete access</span>"
                  : ""
              }
            </td>
          </tr>
        `
      )
      .join("");
  }

  function renderLocationMaster() {
    if (!els.locationTableBody) {
      return;
    }
    if (!state.locations.length) {
      els.locationTableBody.innerHTML = '<tr><td colspan="4" class="empty">No location records added yet.</td></tr>';
      return;
    }

    els.locationTableBody.innerHTML = [...state.locations]
      .sort((a, b) => locationSummary(a).localeCompare(locationSummary(b)))
      .map(
        (item) => `
          <tr>
            <td>${escapeHtml(item.building || "")}</td>
            <td>${escapeHtml(item.room || "")}</td>
            <td>${escapeHtml(item.description || "")}</td>
            <td>
              ${
                hasCapability("manage_location_edit")
                  ? `<button type="button" class="btn-secondary btn-small" data-edit-location="${escapeHtml(item.id)}">Edit</button>`
                  : ""
              }
              ${
                hasCapability("manage_location_delete")
                  ? `<button type="button" class="btn-danger btn-small" data-delete-location="${escapeHtml(item.id)}">Delete</button>`
                  : ""
              }
              ${
                !hasCapability("manage_location_edit") && !hasCapability("manage_location_delete")
                  ? "<span class=\"empty\">No edit/delete access</span>"
                  : ""
              }
            </td>
          </tr>
        `
      )
      .join("");
  }

  function renderActiveLocks() {
    if (!state.activeLocks.length) {
      els.activeCards.innerHTML = '<p class="empty">No active locks.</p>';
      return;
    }

    const sorted = [...state.activeLocks].sort((a, b) => new Date(b.lockedAt) - new Date(a.lockedAt));

    els.activeCards.innerHTML = sorted
      .map((lock) => {
        const lockType = getLockType(lock.lockType);
        const lockColor = resolveLockColor(lockType.id, lockType.color);
        const cardStyle = `--lock-type-color:${lockColor};`;
        const pillStyle =
          `background:${toRgba(lockColor, 0.15)};` +
          `color:${lockColor};` +
          `border:1px solid ${toRgba(lockColor, 0.35)};`;
        const overdue = isOverdue(lock.expectedRemovalAt);

        return `
          <article class="lock-card ${overdue ? "overdue" : ""}" style="${escapeHtml(cardStyle)}">
            <div class="card-head">
              <h4>${escapeHtml(lock.equipmentName)}</h4>
              <div class="card-tags">
                <span class="pill" style="${escapeHtml(pillStyle)}">${escapeHtml(lockType.badgeLabel)}</span>
                ${overdue ? '<span class="pill overdue-pill">Overdue</span>' : ""}
              </div>
            </div>
            <p class="lock-meta"><strong>Asset:</strong> ${escapeHtml(lock.assetNumber)}</p>
            <p class="lock-meta"><strong>Lock #:</strong> ${escapeHtml(lock.lockNumber || "Not set")}${lock.lockMasterColor ? ` (${escapeHtml(lock.lockMasterColor)})` : ""}</p>
            <p class="lock-meta"><strong>Class:</strong> ${escapeHtml(lock.equipmentClass || "Unclassified")}</p>
            <p class="lock-meta"><strong>Building:</strong> ${escapeHtml(lock.equipmentBuilding || lock.equipmentLocation || "")}</p>
            <p class="lock-meta"><strong>Location:</strong> ${escapeHtml(lock.equipmentLocationDetail || "")} ${lock.equipmentRoomNumber ? `| Room ${escapeHtml(lock.equipmentRoomNumber)}` : ""}</p>
            ${lock.lockLocationId ? `<p class="lock-meta"><strong>Lock Location:</strong> ${escapeHtml(locationSummary(lock))}</p>` : ""}
            <p class="lock-meta"><strong>Locked By:</strong> ${escapeHtml(lock.lockedBy)}</p>
            <p class="lock-meta"><strong>Locked At:</strong> ${formatUtc(lock.lockedAt)}</p>
            <p class="lock-meta ${overdue ? "overdue-text" : ""}"><strong>Expected Removal:</strong> ${formatUtc(lock.expectedRemovalAt)}${overdue ? " (PAST DUE)" : ""}</p>
            ${lock.keyLocation ? `<p class="lock-meta"><strong>Key Location:</strong> ${escapeHtml(lock.keyLocation)}</p>` : ""}
            ${lock.editedBy ? `<p class="lock-meta"><strong>Last Edited:</strong> ${escapeHtml(lock.editedBy)} @ ${formatUtc(lock.editedAt)}</p>` : ""}
            <div class="lock-reason">${escapeHtml(lock.reason)}</div>
            ${
              hasCapability("edit_lock_event") || hasCapability("delete_lock_event")
                ? `<div class="btn-row" style="margin-top:0.65rem;">
                     ${
                       hasCapability("edit_lock_event")
                         ? `<button type="button" class="btn-secondary" data-edit-lock="${escapeHtml(lock.id)}">Edit</button>`
                         : ""
                     }
                     ${
                       hasCapability("delete_lock_event")
                         ? `<button type="button" class="btn-danger" data-remove-id="${escapeHtml(lock.id)}">Remove Lock</button>`
                         : ""
                     }
                   </div>`
                : ""
            }
          </article>
        `;
      })
      .join("");
  }

  function renderHistory() {
    if (!state.lockHistory.length) {
      els.historyTableBody.innerHTML = '<tr><td colspan="5">No completed lock events.</td></tr>';
      return;
    }

    els.historyTableBody.innerHTML = state.lockHistory
      .map((item) => {
        const lockType = getLockType(item.lockType);
        const lockColor = resolveLockColor(lockType.id, lockType.color);
        const pillStyle =
          `background:${toRgba(lockColor, 0.15)};` +
          `color:${lockColor};` +
          `border:1px solid ${toRgba(lockColor, 0.35)};`;

        return `
          <tr>
            <td>${escapeHtml(item.id)}</td>
            <td>${escapeHtml(item.assetNumber)} | ${escapeHtml(item.equipmentClass || "Unclassified")} | ${escapeHtml(item.equipmentName)}<br>Lock # ${escapeHtml(item.lockNumber || "N/A")} ${item.lockLocationId ? `| ${escapeHtml(locationSummary(item))}` : ""} ${item.keyLocation ? `| Key: ${escapeHtml(item.keyLocation)}` : ""}</td>
            <td><span class="pill" style="${escapeHtml(pillStyle)}">${escapeHtml(lockType.badgeLabel)}</span></td>
            <td>
              ${escapeHtml(item.lockedBy)}<br>
              ${formatUtc(item.lockedAt)}<br>
              Expected: ${formatUtc(item.expectedRemovalAt)}
            </td>
            <td>${escapeHtml(item.removedBy || "")}<br>${formatUtc(item.removedAt)}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderAudit() {
    if (!state.audit.length) {
      els.auditTableBody.innerHTML = '<tr><td colspan="4">No audit entries.</td></tr>';
      return;
    }

    els.auditTableBody.innerHTML = [...state.audit]
      .reverse()
      .map(
        (entry) => `
          <tr>
            <td>${formatUtc(entry.timestamp)}</td>
            <td>${escapeHtml(entry.action)}</td>
            <td>${escapeHtml(entry.actor)}</td>
            <td>${escapeHtml(entry.details)}</td>
          </tr>
        `
      )
      .join("");
  }

  function renderUsers() {
    if (!state.users.length) {
      els.usersTableBody.innerHTML =
        '<tr><td colspan="9" class="empty">No users in the index. Add Authorized, Affected, or Equipment Controller users above.</td></tr>';
      return;
    }

    els.usersTableBody.innerHTML = [...state.users]
      .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
      .map(
        (u) => `
          <tr>
            <td><span class="user-type-pill ${escapeHtml(u.type)}">${escapeHtml(getUserTypeLabel(u.type))}</span></td>
            <td>${escapeHtml(u.lastName)}, ${escapeHtml(u.firstName)}</td>
            <td>${escapeHtml(u.callSign)}</td>
            <td>${escapeHtml(u.department)}</td>
            <td>${escapeHtml(u.supervisor)}</td>
            <td>${escapeHtml(u.phone)}</td>
            <td>${escapeHtml(u.cellPhone || "")}</td>
            <td>${trainingPill(u.trainingDate)}</td>
            <td>
              ${
                hasCapability("manage_users_delete")
                  ? `<button type="button" class="btn-danger btn-small" data-delete-user="${escapeHtml(u.id)}">Remove</button>`
                  : "<span class=\"empty\">No delete access</span>"
              }
            </td>
          </tr>
        `
      )
      .join("");
  }

  function renderUserAssignments() {
    if (!state.users.length) {
      els.userAssignmentBody.innerHTML =
        '<tr><td colspan="3" class="empty">No users in the index.</td></tr>';
      return;
    }

    const counts = {};
    state.lockCheckouts.forEach((entry) => {
      if (!entry.returnedAt) {
        counts[entry.userId] = (counts[entry.userId] || 0) + 1;
      }
    });

    els.userAssignmentBody.innerHTML = [...state.users]
      .sort((a, b) => (counts[b.id] || 0) - (counts[a.id] || 0))
      .map(
        (u) => `
          <tr>
            <td>${escapeHtml(u.lastName)}, ${escapeHtml(u.firstName)} (${escapeHtml(u.callSign)})</td>
            <td><span class="user-type-pill ${escapeHtml(u.type)}">${escapeHtml(getUserTypeLabel(u.type))}</span></td>
            <td>${counts[u.id] || 0}</td>
          </tr>
        `
      )
      .join("");
  }

  function renderCheckedOutLocks() {
    const open = state.lockCheckouts.filter((entry) => !entry.returnedAt);
    if (!open.length) {
      els.checkedOutLocksBody.innerHTML =
        '<tr><td colspan="5" class="empty">No locks currently checked out.</td></tr>';
      return;
    }

    els.checkedOutLocksBody.innerHTML = [...open]
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))
      .map((entry) => {
        const color = config.lockColors.find((c) => c.id === entry.colorId);
        const swatchColor = color ? color.hex : "#888";
        return `
          <tr>
            <td><span class="color-swatch" style="background:${escapeHtml(swatchColor)};"></span>${escapeHtml(entry.colorLabel)}</td>
            <td>${escapeHtml(entry.number)}</td>
            <td>${escapeHtml(entry.userName)}</td>
            <td>${formatUtc(entry.issuedAt)}</td>
            <td>
              ${
                hasCapability("checkout_lock")
                  ? `<button type="button" class="btn-secondary btn-small" data-return-id="${escapeHtml(entry.id)}">Return</button>`
                  : "<span class=\"empty\">No return access</span>"
              }
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function renderCheckoutHistory() {
    if (!state.lockCheckouts.length) {
      els.checkoutHistoryBody.innerHTML =
        '<tr><td colspan="5" class="empty">No check-out history yet.</td></tr>';
      return;
    }

    els.checkoutHistoryBody.innerHTML = [...state.lockCheckouts]
      .sort((a, b) => new Date(b.issuedAt) - new Date(a.issuedAt))
      .map((entry) => {
        const color = config.lockColors.find((c) => c.id === entry.colorId);
        const swatchColor = color ? color.hex : "#888";
        return `
          <tr>
            <td><span class="color-swatch" style="background:${escapeHtml(swatchColor)};"></span>${escapeHtml(entry.colorLabel)}</td>
            <td>${escapeHtml(entry.number)}</td>
            <td>${escapeHtml(entry.userName)}</td>
            <td>${formatUtc(entry.issuedAt)}</td>
            <td>${entry.returnedAt ? formatUtc(entry.returnedAt) : '<em>Open</em>'}</td>
          </tr>
        `;
      })
      .join("");
  }

  function returnCheckedOutLock(checkoutId) {
    const entry = state.lockCheckouts.find((c) => c.id === checkoutId);
    if (!entry || entry.returnedAt) {
      return;
    }
    entry.returnedAt = new Date().toISOString();
    addAudit(
      "LOCK_RETURNED",
      getCurrentActorName("Administrator"),
      `${entry.colorLabel} #${entry.number} <- ${entry.userName}`
    );
    saveAndRender();
  }

  function deleteUser(userId) {
    const user = state.users.find((u) => u.id === userId);
    if (!user) {
      return;
    }
    const hasOpenCheckouts = state.lockCheckouts.some(
      (entry) => entry.userId === userId && !entry.returnedAt
    );
    if (hasOpenCheckouts) {
      alert(`Cannot remove ${user.firstName} ${user.lastName} — return their checked-out locks first.`);
      return;
    }
    if (!confirm(`Remove ${user.firstName} ${user.lastName} from the user index?`)) {
      return;
    }
    state.users = state.users.filter((u) => u.id !== userId);
    addAudit(
      "USER_REMOVED",
      getCurrentActorName("Administrator"),
      `${getUserTypeLabel(user.type)} | ${user.firstName} ${user.lastName} | ${user.callSign}`
    );
    saveAndRender();
  }

  function getCurrentActorName(fallbackLabel) {
    const directName = String(
      currentAuthUser?.email ||
      currentAuthUser?.displayName ||
      fallbackLabel ||
      ""
    ).trim();
    if (directName) {
      return directName;
    }
    if (authReadyForData && currentAuthRole) {
      return ROLE_LABELS[currentAuthRole] || currentAuthRole;
    }
    return "Unknown";
  }

  function promptForActor(message) {
    if (currentAuthUser?.email || currentAuthUser?.displayName) {
      return getCurrentActorName("Unknown");
    }

    const lastActor = sessionStorage.getItem("peachLastActor") || "";
    const entered = window.prompt(message, lastActor);
    if (entered === null) {
      return "";
    }
    const actor = entered.trim();
    if (!actor) {
      alert("Username is required for this edit.");
      return "";
    }
    sessionStorage.setItem("peachLastActor", actor);
    return actor;
  }

  function beginEquipmentEdit(equipmentId) {
    const equipment = state.equipment.find((item) => item.id === equipmentId);
    if (!equipment) {
      return;
    }
    editingEquipmentId = equipmentId;
    els.eqBuilding.value = getEquipmentBuilding(equipment);
    els.eqLocation.value = getEquipmentLocationDetail(equipment);
    els.eqRoom.value = getEquipmentRoomNumber(equipment);
    els.eqClass.value = getEquipmentClass(equipment);
    document.getElementById("eqName").value = equipment.name || "";
    document.getElementById("eqDescription").value = equipment.description || "";
    document.getElementById("eqAsset").value = equipment.assetNumber || "";
    if (els.equipmentSubmitBtn) {
      els.equipmentSubmitBtn.textContent = "Save Equipment Changes";
    }
    if (els.equipmentCancelEditBtn) {
      els.equipmentCancelEditBtn.hidden = false;
    }
    openManagedModal("equipmentModal");
  }

  function resetEquipmentFormMode() {
    editingEquipmentId = null;
    if (els.equipmentSubmitBtn) {
      els.equipmentSubmitBtn.textContent = "Add Equipment";
    }
    if (els.equipmentCancelEditBtn) {
      els.equipmentCancelEditBtn.hidden = true;
    }
  }

  function beginLockEventEdit(lockId) {
    const lock = state.activeLocks.find((item) => item.id === lockId);
    if (!lock) {
      return;
    }
    editingLockEventId = lockId;
    if (els.lockEquipment) {
      els.lockEquipment.value = lock.equipmentId || "";
    }
    if (els.lockBy) {
      els.lockBy.value = lock.lockedBy || "";
    }
    if (els.lockNumber) {
      els.lockNumber.value = lock.lockNumber || "";
    }
    if (els.lockEventLockId) {
      els.lockEventLockId.value = lock.lockMasterId || "";
    }
    if (els.lockLocationId) {
      els.lockLocationId.value = lock.lockLocationId || "";
    }
    if (els.lockKeyLocation) {
      els.lockKeyLocation.value = lock.keyLocation || "";
    }
    if (els.lockWhen && lock.lockedAt) {
      els.lockWhen.value = localDateTimeValue(new Date(lock.lockedAt));
    }
    if (els.lockExpectedRemoval && lock.expectedRemovalAt) {
      els.lockExpectedRemoval.value = localDateTimeValue(new Date(lock.expectedRemovalAt));
    }
    const reasonInput = document.getElementById("lockReason");
    if (reasonInput) {
      reasonInput.value = lock.reason || "";
    }
    const typeInput = document.querySelector(`input[name='lockType'][value='${lock.lockType}']`);
    if (typeInput) {
      typeInput.checked = true;
    }
    const checks = els.applySafetyChecks.querySelectorAll("input[data-role='apply-check']");
    checks.forEach((check) => {
      check.checked = Boolean(lock.safetyChecklist?.[check.dataset.key]);
    });
    if (els.lockSubmitBtn) {
      els.lockSubmitBtn.textContent = "Save Lock Event Changes";
    }
    openManagedModal("lockEventModal");
  }

  function resetLockFormMode() {
    editingLockEventId = null;
    if (els.lockSubmitBtn) {
      els.lockSubmitBtn.textContent = "Apply Lock";
    }
  }

  function beginLockMasterEdit(lockMasterId) {
    const record = state.lockMaster.find((item) => item.id === lockMasterId);
    if (!record) {
      return;
    }
    editingLockMasterId = lockMasterId;
    els.masterLockNumber.value = record.number || "";
    els.masterLockColor.value = record.colorId || "";
    els.masterLockBuilding.value = record.building || "";
    els.masterLockLocation.value = record.locationDetail || "";
    els.masterLockRoom.value = record.roomNumber || "";
    els.masterLockKeyLocation.value = record.keyLocation || "";
    els.masterLockNotes.value = record.notes || "";
    if (els.lockMasterSubmitBtn) {
      els.lockMasterSubmitBtn.textContent = "Save Lock Changes";
    }
    if (els.lockMasterCancelEditBtn) {
      els.lockMasterCancelEditBtn.hidden = false;
    }
    openManagedModal("lockMasterModal");
  }

  function resetLockMasterFormMode() {
    editingLockMasterId = null;
    if (els.lockMasterSubmitBtn) {
      els.lockMasterSubmitBtn.textContent = "Add Lock to Master List";
    }
    if (els.lockMasterCancelEditBtn) {
      els.lockMasterCancelEditBtn.hidden = true;
    }
  }

  function beginLocationEdit(locationId) {
    const record = state.locations.find((item) => item.id === locationId);
    if (!record || !els.locationForm) {
      return;
    }
    editingLocationId = locationId;
    if (els.locationBuilding) {
      els.locationBuilding.value = record.building || "";
    }
    if (els.locationRoom) {
      els.locationRoom.value = record.room || "";
    }
    if (els.locationDescription) {
      els.locationDescription.value = record.description || "";
    }
    if (els.locationSubmitBtn) {
      els.locationSubmitBtn.textContent = "Save Location Changes";
    }
    if (els.locationCancelEditBtn) {
      els.locationCancelEditBtn.hidden = false;
    }
    openManagedModal("locationModal");
  }

  function resetLocationFormMode() {
    editingLocationId = null;
    if (els.locationSubmitBtn) {
      els.locationSubmitBtn.textContent = "Add Location";
    }
    if (els.locationCancelEditBtn) {
      els.locationCancelEditBtn.hidden = true;
    }
  }

  function deleteLocationRecord(locationId) {
    if (!guardCapability("manage_location_delete", "You do not have permission to delete locations.")) {
      return;
    }
    const record = state.locations.find((item) => item.id === locationId);
    if (!record) {
      return;
    }
    const inUse = state.activeLocks.some((item) => item.lockLocationId === locationId);
    if (inUse) {
      alert("Cannot delete a location currently linked to an active lock event.");
      return;
    }
    if (!confirm(`Delete location ${locationSummary(record)}?`)) {
      return;
    }
    state.locations = state.locations.filter((item) => item.id !== locationId);
    addAudit("LOCATION_REMOVED", getCurrentActorName("System"), locationSummary(record));
    saveAndRender();
  }

  function deleteLockMasterRecord(lockMasterId) {
    if (!guardCapability("manage_lock_master_delete", "You do not have permission to remove lock master records.")) {
      return;
    }
    const record = state.lockMaster.find((item) => item.id === lockMasterId);
    if (!record) {
      return;
    }
    const referenced = state.activeLocks.some((item) => item.lockMasterId === lockMasterId);
    if (referenced) {
      alert("Cannot delete a lock master record currently referenced by an active lock event.");
      return;
    }
    if (!confirm(`Delete lock master record ${record.number}?`)) {
      return;
    }
    const actor = promptForActor("Enter your username for lock master deletion:");
    if (!actor) {
      return;
    }
    state.lockMaster = state.lockMaster.filter((item) => item.id !== lockMasterId);
    addAudit("LOCK_MASTER_REMOVED", actor, `${record.number} | ${record.colorLabel}`);
    saveAndRender();
  }

  function runSearch(rawQuery) {
    if (!els.searchResultsBody) {
      return;
    }
    const query = String(rawQuery || "").trim();
    const normalized = normalizeText(query);
    if (!normalized) {
      els.searchResultsBody.innerHTML = '<tr><td colspan="3" class="empty">Enter a search term.</td></tr>';
      return;
    }

    const rows = [];

    state.equipment.forEach((equipment) => {
      const haystack = normalizeText(
        `${equipment.assetNumber} ${equipment.name} ${getEquipmentBuilding(equipment)} ${getEquipmentLocationDetail(equipment)} ${getEquipmentRoomNumber(equipment)} ${getEquipmentClass(equipment)}`
      );
      if (!haystack.includes(normalized)) {
        return;
      }
      rows.push({
        type: "Equipment",
        primary: `${equipment.assetNumber} | ${equipment.name}`,
        details: `${getEquipmentClass(equipment)} | ${getEquipmentBuilding(equipment)} / ${getEquipmentLocationDetail(equipment)} / ${getEquipmentRoomNumber(equipment)}`
      });
    });

    state.activeLocks.forEach((lock) => {
      const haystack = normalizeText(
        `${lock.lockNumber || ""} ${lock.assetNumber} ${lock.equipmentName} ${lock.lockedBy} ${lock.equipmentBuilding || ""} ${lock.equipmentLocationDetail || ""} ${lock.equipmentRoomNumber || ""} ${lock.lockLocationBuilding || ""} ${lock.lockLocationRoom || ""} ${lock.lockLocationDescription || ""} ${lock.keyLocation || ""}`
      );
      if (!haystack.includes(normalized)) {
        return;
      }
      rows.push({
        type: "Active Lock Event",
        primary: `${lock.id} | Lock #${lock.lockNumber || "N/A"}`,
        details: `${lock.assetNumber} | ${lock.equipmentName} | ${lock.lockedBy}${lock.lockLocationId ? ` | ${locationSummary(lock)}` : ""}${lock.keyLocation ? ` | Key: ${lock.keyLocation}` : ""}`
      });
    });

    state.lockMaster.forEach((lock) => {
      const haystack = normalizeText(
        `${lock.number} ${lock.colorLabel} ${lock.building} ${lock.locationDetail || ""} ${lock.roomNumber || ""} ${lock.keyLocation || ""}`
      );
      if (!haystack.includes(normalized)) {
        return;
      }
      rows.push({
        type: "Lock Master",
        primary: `${lock.number} (${lock.colorLabel})`,
        details: `${lock.building} / ${lock.locationDetail || ""} / ${lock.roomNumber || ""}${lock.keyLocation ? ` | Key: ${lock.keyLocation}` : ""}`
      });
    });

    state.locations.forEach((location) => {
      const summary = locationSummary(location);
      const haystack = normalizeText(summary);
      if (!haystack.includes(normalized)) {
        return;
      }
      rows.push({
        type: "Location Master",
        primary: summary,
        details: `${location.building || ""} / ${location.room || ""} / ${location.description || ""}`
      });
    });

    state.lockCheckouts.forEach((checkout) => {
      const haystack = normalizeText(
        `${checkout.number} ${checkout.colorLabel} ${checkout.userName}`
      );
      if (!haystack.includes(normalized)) {
        return;
      }
      rows.push({
        type: "Checked-Out Lock",
        primary: `${checkout.colorLabel} #${checkout.number}`,
        details: `${checkout.userName} | Issued: ${formatUtc(checkout.issuedAt)} ${checkout.returnedAt ? `| Returned: ${formatUtc(checkout.returnedAt)}` : "| Open"}`
      });
    });

    if (!rows.length) {
      els.searchResultsBody.innerHTML = '<tr><td colspan="3" class="empty">No matches found.</td></tr>';
      return;
    }

    els.searchResultsBody.innerHTML = rows
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.type)}</td>
            <td>${escapeHtml(row.primary)}</td>
            <td>${escapeHtml(row.details)}</td>
          </tr>
        `
      )
      .join("");
  }

  function getUserTypeLabel(typeId) {
    const found = config.userTypes.find((t) => t.id === typeId);
    return found ? found.label : typeId;
  }

  function findUserByName(rawName) {
    if (!rawName) {
      return null;
    }
    const norm = String(rawName).toLowerCase().trim().replace(/\s+/g, " ");
    return (
      state.users.find((u) => {
        const fl = `${u.firstName} ${u.lastName}`.toLowerCase().trim().replace(/\s+/g, " ");
        const lf = `${u.lastName}, ${u.firstName}`.toLowerCase().trim().replace(/\s+/g, " ");
        return norm === fl || norm === lf;
      }) || null
    );
  }

  function daysBetween(laterMs, earlierMs) {
    return Math.floor((laterMs - earlierMs) / (24 * 60 * 60 * 1000));
  }

  function trainingPill(trainingDate) {
    if (!trainingDate) {
      return '<span class="training-pill missing">Missing</span>';
    }
    const ageDays = daysBetween(Date.now(), new Date(trainingDate).getTime());
    if (ageDays > 365) {
      return `<span class="training-pill overdue">${escapeHtml(trainingDate)} (overdue)</span>`;
    }
    return `<span class="training-pill ok">${escapeHtml(trainingDate)}</span>`;
  }

  function renderLocksByBuilding() {
    if (!els.locksByBuilding) {
      return;
    }
    if (!state.activeLocks.length) {
      els.locksByBuilding.innerHTML = '<p class="empty">No active locks.</p>';
      return;
    }

    const grouped = {};
    state.activeLocks.forEach((lock) => {
      const building = lock.equipmentBuilding || lock.equipmentLocation || "Unspecified";
      if (!grouped[building]) {
        grouped[building] = {};
      }
      grouped[building][lock.lockType] = (grouped[building][lock.lockType] || 0) + 1;
    });

    const sortedBuildings = Object.keys(grouped).sort();
    els.locksByBuilding.innerHTML = sortedBuildings
      .map((building) => {
        const counts = grouped[building];
        const colorRows = config.lockTypes
          .filter((type) => (counts[type.id] || 0) > 0)
          .map((type) => {
            const hex = colorHexFor(type.id);
            return `<span class="color-count">${padlockIcon(hex)}<strong>${counts[type.id]}</strong> ${escapeHtml(type.summaryLabel)}</span>`;
          })
          .join("");
        return `
          <div class="building-block">
            <div class="building-name">${escapeHtml(building)}</div>
            <div class="color-count-row">${colorRows}</div>
          </div>
        `;
      })
      .join("");
  }

  function renderLocksByDepartment() {
    if (!els.locksByDepartmentBody) {
      return;
    }
    if (!state.activeLocks.length) {
      els.locksByDepartmentBody.innerHTML = '<tr><td colspan="2" class="empty">No active locks.</td></tr>';
      return;
    }

    const counts = {};
    state.activeLocks.forEach((lock) => {
      const user = findUserByName(lock.lockedBy);
      const dept = user ? user.department : "Unassigned";
      counts[dept] = (counts[dept] || 0) + 1;
    });

    const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    els.locksByDepartmentBody.innerHTML = rows
      .map(([dept, count]) => `<tr><td>${escapeHtml(dept)}</td><td>${count}</td></tr>`)
      .join("");
  }

  function renderReports() {
    renderReportTraining();
    renderReportAged();
    renderReportExcessive();
    renderReportConfig();
    renderReportCollector();
  }

  function renderReportTraining() {
    if (!els.reportTrainingBody) {
      return;
    }
    const now = Date.now();
    const flagged = state.users
      .map((u) => {
        if (!u.trainingDate) {
          return { user: u, lastTraining: "Missing", overdueDays: "—", sortKey: Number.MAX_SAFE_INTEGER };
        }
        const age = daysBetween(now, new Date(u.trainingDate).getTime());
        if (age > 365) {
          return { user: u, lastTraining: u.trainingDate, overdueDays: age - 365, sortKey: age };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.sortKey - a.sortKey);

    if (!flagged.length) {
      els.reportTrainingBody.innerHTML = '<tr><td colspan="5" class="empty">All users current on LOTO training.</td></tr>';
      return;
    }
    els.reportTrainingBody.innerHTML = flagged
      .map(
        (row) => `
          <tr>
            <td>${escapeHtml(row.user.lastName)}, ${escapeHtml(row.user.firstName)}</td>
            <td>${escapeHtml(row.user.callSign)}</td>
            <td>${escapeHtml(row.user.department)}</td>
            <td>${escapeHtml(row.lastTraining)}</td>
            <td>${escapeHtml(String(row.overdueDays))}</td>
          </tr>
        `
      )
      .join("");
  }

  function renderReportAged() {
    if (!els.reportAgedBody) {
      return;
    }
    const now = Date.now();
    const flagged = state.activeLocks
      .map((lock) => ({ lock, ageDays: daysBetween(now, new Date(lock.lockedAt).getTime()) }))
      .filter((item) => item.ageDays > 30)
      .sort((a, b) => b.ageDays - a.ageDays);

    if (!flagged.length) {
      els.reportAgedBody.innerHTML = '<tr><td colspan="6" class="empty">No active locks older than 30 days.</td></tr>';
      return;
    }
    els.reportAgedBody.innerHTML = flagged
      .map(({ lock, ageDays }) => {
        const lockType = getLockType(lock.lockType);
        return `
          <tr>
            <td>${escapeHtml(lock.id)}</td>
            <td>${escapeHtml(lock.assetNumber)} | ${escapeHtml(lock.equipmentName)} | Lock #${escapeHtml(lock.lockNumber || "N/A")}${lock.lockLocationId ? ` | ${escapeHtml(locationSummary(lock))}` : ""}</td>
            <td>${escapeHtml(lockType.badgeLabel)}</td>
            <td>${escapeHtml(lock.lockedBy)}</td>
            <td>${formatUtc(lock.lockedAt)}</td>
            <td>${ageDays}</td>
          </tr>
        `;
      })
      .join("");
  }

  function renderReportExcessive() {
    if (!els.reportExcessiveBody) {
      return;
    }
    const counts = {};
    state.activeLocks.forEach((lock) => {
      const user = findUserByName(lock.lockedBy);
      if (!user) {
        return;
      }
      counts[user.id] = (counts[user.id] || 0) + 1;
    });

    const flagged = Object.entries(counts)
      .filter(([, count]) => count > 5)
      .map(([userId, count]) => ({ user: state.users.find((u) => u.id === userId), count }))
      .filter((row) => row.user)
      .sort((a, b) => b.count - a.count);

    if (!flagged.length) {
      els.reportExcessiveBody.innerHTML = '<tr><td colspan="3" class="empty">No users with more than five active lock events.</td></tr>';
      return;
    }
    els.reportExcessiveBody.innerHTML = flagged
      .map(
        ({ user, count }) => `
          <tr>
            <td>${escapeHtml(user.lastName)}, ${escapeHtml(user.firstName)} (${escapeHtml(user.callSign)})</td>
            <td>${escapeHtml(user.department)}</td>
            <td>${count}</td>
          </tr>
        `
      )
      .join("");
  }

  function renderReportConfig() {
    if (!els.reportConfigBody) {
      return;
    }
    const counts = {};
    state.activeLocks.forEach((lock) => {
      const building = lock.equipmentBuilding || lock.equipmentLocation || "Unspecified";
      counts[building] = (counts[building] || 0) + 1;
    });
    const flagged = Object.entries(counts)
      .filter(([, count]) => count > 10)
      .sort((a, b) => b[1] - a[1]);

    if (!flagged.length) {
      els.reportConfigBody.innerHTML = '<tr><td colspan="2" class="empty">No buildings exceed ten active lock events.</td></tr>';
      return;
    }
    els.reportConfigBody.innerHTML = flagged
      .map(([building, count]) => `<tr><td>${escapeHtml(building)}</td><td>${count}</td></tr>`)
      .join("");
  }

  function renderReportCollector() {
    if (!els.reportCollectorBody) {
      return;
    }
    const now = Date.now();
    const usersWithActiveLocks = new Set();
    state.activeLocks.forEach((lock) => {
      const user = findUserByName(lock.lockedBy);
      if (user) {
        usersWithActiveLocks.add(user.id);
      }
    });

    const flagged = state.lockCheckouts
      .filter((entry) => !entry.returnedAt && entry.colorId === "green")
      .map((entry) => ({
        entry,
        ageDays: daysBetween(now, new Date(entry.issuedAt).getTime()),
        user: state.users.find((u) => u.id === entry.userId)
      }))
      .filter((row) => row.ageDays > 3 && row.user && !usersWithActiveLocks.has(row.user.id))
      .sort((a, b) => b.ageDays - a.ageDays);

    if (!flagged.length) {
      els.reportCollectorBody.innerHTML = '<tr><td colspan="5" class="empty">No lock collectors detected.</td></tr>';
      return;
    }
    els.reportCollectorBody.innerHTML = flagged
      .map(({ entry, ageDays, user }) => `
          <tr>
            <td>${escapeHtml(user.lastName)}, ${escapeHtml(user.firstName)} (${escapeHtml(user.callSign)})</td>
            <td>${escapeHtml(user.department)}</td>
            <td>${escapeHtml(entry.number)}</td>
            <td>${formatUtc(entry.issuedAt)}</td>
            <td>${ageDays}</td>
          </tr>
        `)
      .join("");
  }

  function getFilteredEquipment(filterValue) {
    const allEquipment = [...state.equipment].sort((a, b) => {
      const byBuilding = getEquipmentBuilding(a).localeCompare(getEquipmentBuilding(b));
      if (byBuilding !== 0) {
        return byBuilding;
      }
      const byLocation = getEquipmentLocationDetail(a).localeCompare(getEquipmentLocationDetail(b));
      if (byLocation !== 0) {
        return byLocation;
      }
      return a.name.localeCompare(b.name);
    });

    if (!filterValue || filterValue === "all") {
      return allEquipment;
    }

    const normalizedFilter = normalizeText(filterValue);
    return allEquipment.filter((eq) => {
      return normalizeText(getEquipmentBuilding(eq)) === normalizedFilter;
    });
  }

  function upsertEquipmentFromRows(rows) {
    let added = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const equipment = parseEquipmentRow(row);

      if (!equipment.assetNumber || !equipment.name || !equipment.building || !equipment.equipmentClass) {
        skipped += 1;
        continue;
      }

      const existingIndex = state.equipment.findIndex(
        (item) => item.assetNumber.toLowerCase() === equipment.assetNumber.toLowerCase()
      );

      if (existingIndex >= 0) {
        state.equipment[existingIndex] = {
          ...state.equipment[existingIndex],
          building: equipment.building,
          locationDetail: equipment.locationDetail || equipment.building,
          roomNumber: equipment.roomNumber || "Unspecified",
          equipmentClass: equipment.equipmentClass,
          location: equipment.building,
          name: equipment.name,
          description: equipment.description,
          updatedAt: new Date().toISOString()
        };
        updated += 1;
      } else {
        state.equipment.push({
          id: makeId("EQ"),
          building: equipment.building,
          locationDetail: equipment.locationDetail || equipment.building,
          roomNumber: equipment.roomNumber || "Unspecified",
          equipmentClass: equipment.equipmentClass,
          location: equipment.building,
          name: equipment.name,
          description: equipment.description,
          assetNumber: equipment.assetNumber,
          createdAt: new Date().toISOString()
        });
        added += 1;
      }
    }

    return { added, updated, skipped };
  }

  function parseEquipmentRow(row) {
    const output = {
      building: "",
      locationDetail: "",
      roomNumber: "",
      equipmentClass: "",
      name: "",
      description: "",
      assetNumber: ""
    };

    for (const [rawKey, rawValue] of Object.entries(row)) {
      const key = normalizeText(rawKey);
      const value = String(rawValue ?? "").trim();
      if (!value) {
        continue;
      }

      if (["building", "bldg", "bldg#", "facility"].includes(key)) {
        output.building = value;
        continue;
      }

      if (["location", "area", "equipmentlocation", "site"].includes(key)) {
        output.locationDetail = value;
        continue;
      }

      if (["room", "roomnumber", "roomno", "rm", "room#"].includes(key)) {
        output.roomNumber = value;
        continue;
      }

      if (["class", "equipmentclass", "eqclass", "equipmenttype", "type"].includes(key)) {
        output.equipmentClass = value;
        continue;
      }

      if (["name", "equipmentname", "equipment"].includes(key)) {
        output.name = value;
        continue;
      }

      if (["description", "desc", "details"].includes(key)) {
        output.description = value;
        continue;
      }

      if (["assetnumber", "asset", "assetno", "assetid", "asset#", "assetnum"].includes(key)) {
        output.assetNumber = value;
      }
    }

    if (!output.description) {
      output.description = "No description provided";
    }

    if (!output.building && output.locationDetail) {
      output.building = output.locationDetail;
    }

    if (!output.locationDetail) {
      output.locationDetail = output.building;
    }
    if (!output.roomNumber) {
      output.roomNumber = "Unspecified";
    }

    if (output.equipmentClass) {
      const normalizedClass = normalizeText(output.equipmentClass);
      const matched = config.equipmentClasses.find(
        (item) => normalizeText(item) === normalizedClass
      );
      output.equipmentClass = matched || "";
    }

    return output;
  }

  function createEmptyState() {
    return {
      equipment: [],
      activeLocks: [],
      lockHistory: [],
      audit: [],
      users: [],
      lockCheckouts: [],
      lockMaster: [],
      locations: []
    };
  }

  function normalizeStateBlob(parsed) {
    return {
      equipment: Array.isArray(parsed.equipment)
        ? parsed.equipment.map((item) => normalizeEquipmentRecord(item))
        : [],
      activeLocks: Array.isArray(parsed.activeLocks) ? parsed.activeLocks : [],
      lockHistory: Array.isArray(parsed.lockHistory) ? parsed.lockHistory : [],
      audit: Array.isArray(parsed.audit) ? parsed.audit : [],
      users: Array.isArray(parsed.users) ? parsed.users : [],
      lockCheckouts: Array.isArray(parsed.lockCheckouts) ? parsed.lockCheckouts : [],
      lockMaster: Array.isArray(parsed.lockMaster) ? parsed.lockMaster : [],
      locations: Array.isArray(parsed.locations) ? parsed.locations : []
    };
  }

  function replaceState(nextState) {
    const normalized = normalizeStateBlob(nextState || {});
    state.equipment = normalized.equipment;
    state.activeLocks = normalized.activeLocks;
    state.lockHistory = normalized.lockHistory;
    state.audit = normalized.audit;
    state.users = normalized.users;
    state.lockCheckouts = normalized.lockCheckouts;
    state.lockMaster = normalized.lockMaster;
    state.locations = normalized.locations;
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return createEmptyState();
      }

      const parsed = JSON.parse(raw);
      return normalizeStateBlob(parsed || {});
    } catch {
      return createEmptyState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    if (FIREBASE_ENABLED && firebaseCtx.db) {
      queueFirebaseSave();
    } else {
      queueCentralSave();
    }
  }

  function saveAndRender() {
    saveState();
    renderAll();
  }

  function initializeCentralSync() {
    if (FIREBASE_ENABLED && firebaseCtx.db) {
      if (!authReadyForData) {
        return;
      }
      startFirebaseStateSync();
      return;
    }
    if (!API_BASE_PATH) {
      return;
    }
    void (async () => {
      const remote = await fetchCentralState();
      if (remote) {
        serverVersion = remote.version;
        replaceState(remote.state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
      }
      startCentralPolling();
    })();
  }

  function startCentralPolling() {
    if (!API_BASE_PATH) {
      return;
    }
    if (syncTimer) {
      clearInterval(syncTimer);
    }
    syncTimer = setInterval(async () => {
      if (saveInFlight) {
        return;
      }
      const remote = await fetchCentralState();
      if (!remote) {
        return;
      }
      if (serverVersion === null || remote.version !== serverVersion) {
        serverVersion = remote.version;
        replaceState(remote.state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        renderAll();
      }
    }, Math.max(5000, Number(SYNC_POLL_MS) || 15000));
  }

  function startFirebaseStateSync() {
    if (!firebaseCtx.db || !authReadyForData) {
      return;
    }
    const path = config.firebase.statePath || "peach/state";
    if (firebaseStateRef && firebaseStateListener) {
      firebaseStateRef.off("value", firebaseStateListener);
    }
    firebaseStateRef = firebaseCtx.db.ref(path);
    firebaseStateListener = (snapshot) => {
      const remote = snapshot.val();
      if (!remote) {
        if (hasAnyStateData(state)) {
          queueFirebaseSave();
        }
        return;
      }
      replaceState(remote);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      renderAll();
    };
    firebaseStateRef.on("value", firebaseStateListener);
  }

  function stopFirebaseStateSync() {
    if (firebaseStateRef && firebaseStateListener) {
      firebaseStateRef.off("value", firebaseStateListener);
    }
    firebaseStateRef = null;
    firebaseStateListener = null;
  }

  async function fetchCentralState() {
    try {
      const response = await fetch(`${API_BASE_PATH}/state`, { cache: "no-store" });
      if (!response.ok) {
        return null;
      }
      const payload = await response.json();
      if (!payload || typeof payload !== "object" || typeof payload.version !== "number") {
        return null;
      }
      return {
        version: payload.version,
        state: normalizeStateBlob(payload.state || {})
      };
    } catch {
      return null;
    }
  }

  function queueCentralSave() {
    if (!API_BASE_PATH) {
      return;
    }
    if (saveInFlight) {
      saveQueued = true;
      return;
    }
    const actor = state.audit.length ? String(state.audit[state.audit.length - 1].actor || "System") : "System";
    void pushCentralState(actor);
  }

  function queueFirebaseSave() {
    if (!firebaseCtx.db || !authReadyForData) {
      return;
    }
    if (saveInFlight) {
      saveQueued = true;
      return;
    }

    const path = config.firebase.statePath || "peach/state";
    saveInFlight = true;
    firebaseCtx.db.ref(path)
      .set(state)
      .then(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      })
      .catch(() => {
        // Keep local cache if cloud write fails.
      })
      .finally(() => {
        saveInFlight = false;
        if (saveQueued) {
          saveQueued = false;
          queueFirebaseSave();
        }
      });
  }

  async function pushCentralState(actor) {
    saveInFlight = true;
    try {
      const response = await fetch(`${API_BASE_PATH}/state`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          expectedVersion: serverVersion,
          actor,
          state
        })
      });

      if (response.status === 409) {
        const payload = await response.json();
        const current = payload?.current;
        if (current && typeof current.version === "number") {
          const merged = mergeStateSnapshots(current.state || {}, state);
          replaceState(merged);
          serverVersion = current.version;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          renderAll();
          saveQueued = true;
        }
        return;
      }

      if (!response.ok) {
        return;
      }

      const saved = await response.json();
      if (saved && typeof saved.version === "number") {
        serverVersion = saved.version;
      }
      if (saved && saved.state && typeof saved.state === "object") {
        replaceState(saved.state);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      }
    } catch {
      // local storage remains the fallback if central API is temporarily unreachable.
    } finally {
      saveInFlight = false;
      if (saveQueued) {
        saveQueued = false;
        const actorName = state.audit.length ? String(state.audit[state.audit.length - 1].actor || "System") : "System";
        void pushCentralState(actorName);
      }
    }
  }

  function mergeStateSnapshots(remoteState, localState) {
    const remote = normalizeStateBlob(remoteState || {});
    const local = normalizeStateBlob(localState || {});
    return {
      equipment: mergeById(remote.equipment, local.equipment),
      activeLocks: mergeById(remote.activeLocks, local.activeLocks),
      lockHistory: mergeById(remote.lockHistory, local.lockHistory),
      audit: mergeById(remote.audit, local.audit),
      users: mergeById(remote.users, local.users),
      lockCheckouts: mergeById(remote.lockCheckouts, local.lockCheckouts),
      lockMaster: mergeById(remote.lockMaster, local.lockMaster),
      locations: mergeById(remote.locations, local.locations)
    };
  }

  function mergeById(remoteRows, localRows) {
    const merged = new Map();
    remoteRows.forEach((item) => {
      merged.set(String(item.id || makeId("TMP")), item);
    });
    localRows.forEach((item) => {
      const key = String(item.id || makeId("TMP"));
      if (merged.has(key)) {
        merged.set(key, { ...merged.get(key), ...item });
      } else {
        merged.set(key, item);
      }
    });
    return Array.from(merged.values());
  }

  async function ensureFirebaseUserRecord(user, requestedRole, requestedName) {
    if (!firebaseCtx.db || !user) {
      return { role: DEFAULT_ROLE, displayName: requestedName || user?.displayName || user?.email || "" };
    }

    const usersPath = `${config.firebase.usersPath || "peach/auth/users"}/${user.uid}`;
    const requested = normalizeRole(requestedRole || DEFAULT_ROLE);
    const now = new Date().toISOString();
    const snap = await firebaseCtx.db.ref(usersPath).once("value");
    const existing = snap.val();

    if (existing && typeof existing === "object") {
      const resolvedRole = isBootstrapSuperAdmin(user.email)
        ? "super_admin"
        : normalizeRole(existing.role || DEFAULT_ROLE);
      await firebaseCtx.db.ref(usersPath).update({
        email: user.email || existing.email || "",
        displayName: requestedName || user.displayName || existing.displayName || "",
        role: resolvedRole,
        requestedRole: existing.requestedRole || requested,
        approvalStatus: isBootstrapSuperAdmin(user.email)
          ? "approved"
          : existing.approvalStatus || "approved",
        updatedAt: now,
        lastLoginAt: now
      });
      return {
        ...existing,
        role: resolvedRole,
        displayName: requestedName || user.displayName || existing.displayName || "",
        approvalStatus: isBootstrapSuperAdmin(user.email)
          ? "approved"
          : existing.approvalStatus || "approved"
      };
    }

    const bootstrapAdmin = isBootstrapSuperAdmin(user.email);
    const assignedRole = bootstrapAdmin ? "super_admin" : DEFAULT_ROLE;
    const record = {
      uid: user.uid,
      email: user.email || "",
      displayName: requestedName || user.displayName || "",
      role: assignedRole,
      requestedRole: requested,
      approvalStatus:
        bootstrapAdmin || requested === DEFAULT_ROLE ? "approved" : "pending_approval",
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now
    };
    await firebaseCtx.db.ref(usersPath).set(record);

    if (requested !== DEFAULT_ROLE) {
      const requestPath = `${config.firebase.signupRequestPath || "peach/auth/signupRequests"}/${user.uid}`;
      await firebaseCtx.db.ref(requestPath).set({
        uid: user.uid,
        email: user.email || "",
        displayName: requestedName || user.displayName || "",
        requestedRole: requested,
        createdAt: now
      });
    }

    return record;
  }

  function isBootstrapSuperAdmin(email) {
    const candidate = String(email || "").trim().toLowerCase();
    if (!candidate || !Array.isArray(config.bootstrapSuperAdmins)) {
      return false;
    }
    return config.bootstrapSuperAdmins.some(
      (item) => String(item || "").trim().toLowerCase() === candidate
    );
  }

  function hasAnyStateData(inputState) {
    return Boolean(
      inputState.equipment.length ||
      inputState.activeLocks.length ||
      inputState.lockHistory.length ||
      inputState.audit.length ||
      inputState.users.length ||
      inputState.lockCheckouts.length ||
      inputState.lockMaster.length ||
      inputState.locations.length
    );
  }

  function initFirebaseContext() {
    if (!FIREBASE_ENABLED) {
      return { app: null, auth: null, db: null };
    }
    if (!window.firebase || !window.firebase.initializeApp) {
      return { app: null, auth: null, db: null };
    }
    const firebaseConfig = config.firebase || {};
    if (!firebaseConfig.apiKey || !firebaseConfig.authDomain || !firebaseConfig.databaseURL || !firebaseConfig.projectId) {
      return { app: null, auth: null, db: null };
    }

    try {
      const existing = window.firebase.apps && window.firebase.apps.length
        ? window.firebase.apps[0]
        : window.firebase.initializeApp({
            apiKey: firebaseConfig.apiKey,
            authDomain: firebaseConfig.authDomain,
            databaseURL: firebaseConfig.databaseURL,
            projectId: firebaseConfig.projectId,
            appId: firebaseConfig.appId || undefined
          });
      return {
        app: existing,
        auth: existing.auth(),
        db: existing.database()
      };
    } catch {
      return { app: null, auth: null, db: null };
    }
  }

  function addAudit(action, actor, details) {
    state.audit.push({
      id: makeId("AUD"),
      timestamp: new Date().toISOString(),
      action,
      actor,
      details
    });
  }

  function makeId(prefix) {
    const stamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).slice(2, 7).toUpperCase();
    return `${prefix}-${stamp}-${random}`;
  }

  function openRemoval(lockId) {
    pendingRemovalId = lockId;
    els.removeForm.reset();
    if (document.getElementById("removeBy")) {
      document.getElementById("removeBy").value = getCurrentActorName("");
    }
    els.removeWhen.value = localDateTimeValue(new Date());
    els.removeModal.classList.add("open");
  }

  function closeModal() {
    pendingRemovalId = null;
    els.removeModal.classList.remove("open");
  }

  function setDefaultTimes() {
    const now = new Date();
    const expected = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    els.lockWhen.value = localDateTimeValue(now);
    els.lockExpectedRemoval.value = localDateTimeValue(expected);
    els.removeWhen.value = localDateTimeValue(now);
  }

  function setDefaultLockType() {
    const firstType = config.lockTypes[0];
    if (!firstType) {
      return;
    }
    const input = document.querySelector(`input[name='lockType'][value='${firstType.id}']`);
    if (input) {
      input.checked = true;
    }
    updateLockKeyLocationRequirement();
  }

  function updateLockKeyLocationRequirement() {
    if (!els.lockKeyLocation) {
      return;
    }
    const selectedType = (document.querySelector("input[name='lockType']:checked") || {}).value;
    els.lockKeyLocation.required = selectedType === "green";
  }

  function isOverdue(expectedRemovalAt) {
    if (!expectedRemovalAt) {
      return false;
    }
    return Date.now() > new Date(expectedRemovalAt).getTime();
  }

  function formatUtc(isoValue) {
    if (!isoValue) {
      return "";
    }

    const date = new Date(isoValue);
    return (
      date.toLocaleString(undefined, {
        timeZone: "UTC",
        year: "numeric",
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      }) + " UTC"
    );
  }

  function toIso(localValue) {
    return new Date(localValue).toISOString();
  }

  function localDateTimeValue(date) {
    const offset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - offset);
    return local.toISOString().slice(0, 16);
  }

  function makeSafetyKey(label, index) {
    return `${index + 1}_${String(label).toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
  }

  function isKnownLockType(id) {
    return config.lockTypes.some((type) => type.id === id);
  }

  function getEquipmentBuilding(record) {
    return String(record?.building || record?.location || "").trim();
  }

  function getEquipmentLocationDetail(record) {
    return String(record?.locationDetail || record?.area || record?.location || getEquipmentBuilding(record)).trim();
  }

  function getEquipmentRoomNumber(record) {
    return String(record?.roomNumber || record?.room || "Unspecified").trim();
  }

  function getEquipmentClass(record) {
    return String(record?.equipmentClass || record?.class || "Unclassified").trim();
  }

  function getLocationBuilding(record) {
    return String(record?.building || record?.lockLocationBuilding || "").trim();
  }

  function getLocationRoom(record) {
    return String(record?.room || record?.lockLocationRoom || "").trim();
  }

  function getLocationDescription(record) {
    return String(record?.description || record?.lockLocationDescription || record?.locationDetail || "").trim();
  }

  function locationKey(record) {
    return [
      normalizeText(getLocationBuilding(record)),
      normalizeText(getLocationRoom(record)),
      normalizeText(getLocationDescription(record))
    ].join("|");
  }

  function locationSummary(record) {
    const building = getLocationBuilding(record);
    const room = getLocationRoom(record);
    const description = getLocationDescription(record);
    const parts = [building];
    if (room) {
      parts.push(`Room ${room}`);
    }
    if (description) {
      parts.push(description);
    }
    return parts.filter(Boolean).join(" | ");
  }

  function normalizeEquipmentRecord(item) {
    return {
      ...item,
      building: getEquipmentBuilding(item),
      locationDetail: getEquipmentLocationDetail(item),
      roomNumber: getEquipmentRoomNumber(item),
      equipmentClass: getEquipmentClass(item),
      location: getEquipmentBuilding(item)
    };
  }

  function getLockType(id) {
    return config.lockTypes.find((type) => type.id === id) || {
      id,
      label: id,
      badgeLabel: id,
      summaryLabel: id,
      color: ""
    };
  }

  function resolveLockColor(lockTypeId, configuredColor) {
    if (configuredColor) {
      return configuredColor;
    }
    if (lockTypeId === "red") {
      return config.theme.red;
    }
    if (lockTypeId === "green") {
      return config.theme.green;
    }
    return config.theme.primary;
  }

  function toRgba(hex, alpha) {
    const rgb = hexToRgb(hex);
    if (!rgb) {
      return `rgba(36, 48, 127, ${alpha})`;
    }
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }

  function hexToRgb(hex) {
    const normalized = normalizeHex(hex);
    if (!normalized) {
      return null;
    }
    return {
      r: parseInt(normalized.slice(1, 3), 16),
      g: parseInt(normalized.slice(3, 5), 16),
      b: parseInt(normalized.slice(5, 7), 16)
    };
  }

  function normalizeHex(value) {
    if (!value) {
      return "";
    }
    const trimmed = String(value).trim();
    return /^#([0-9a-fA-F]{6})$/.test(trimmed) ? trimmed : "";
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeConfig(input) {
    const fallback = {
      appTitle: "PEACH",
      appKicker: "Protected Equipment Access Control Hub",
      appSubtitle: "Track lock events and equipment status.",
      quickNotes:
        "Use master list tools to filter by building and mass upload equipment from Excel.",
      storageKey: "peachTrackerStateV1",
      apiBasePath: "/api",
      syncPollMs: 15000,
      passwordHash: "24bc02a4c164394781b3e89f20844846d3ed2b56d34e90442cdbc1113fbbdc7b",
      sessionKey: "peachAuthSessionV1",
      firebase: {
        enabled: false,
        apiKey: "",
        authDomain: "",
        databaseURL: "",
        projectId: "",
        appId: "",
        statePath: "peach/state",
        usersPath: "peach/auth/users",
        signupRequestPath: "peach/auth/signupRequests"
      },
      authRoles: [
        { id: "super_admin", label: "Super Admin" },
        { id: "supervisor", label: "Supervisor" },
        { id: "controlling_org", label: "Controlling Organization" },
        { id: "authorized_user", label: "Authorized User" }
      ],
      defaultRole: "authorized_user",
      requireEmailVerification: true,
      bootstrapSuperAdmins: [],
      buildingFilters: [
        "Bldg A",
        "Bldg, B",
        "Bldg C",
        "Bldg D",
        "Bldg E",
        "494",
        "495",
        "460",
        "465",
        "Outdoor",
        "RT"
      ],
      equipmentClasses: [
        "Breaker",
        "CRAC",
        "AHU",
        "Generator",
        "Pump",
        "Valve",
        "Chiller",
        "MAU",
        "Boiler",
        "Furnace",
        "Panel"
      ],
      lockColors: [
        { id: "red", label: "Red", hex: "#c83b3f" },
        { id: "green", label: "Green", hex: "#198b44" },
        { id: "blue", label: "Blue", hex: "#1f5fb6" },
        { id: "silver", label: "Silver", hex: "#b8bcc4" }
      ],
      userTypes: [
        { id: "authorized", label: "Authorized User" },
        { id: "affected", label: "Affected User" },
        { id: "controller", label: "Equipment Controller" }
      ],
      departments: [
        "HVAC",
        "Critical Systems",
        "Engineering",
        "Electrical",
        "Controls",
        "Operations",
        "Safety",
        "Projects",
        "MAC Team",
        "IT",
        "Critical Infrastructure"
      ],
      theme: {
        logoPath: "assets/peach-logo.png",
        primary: "#2e3da5",
        secondary: "#1a2470",
        gold: "#e6c252",
        red: "#ec5d61",
        green: "#3bce74",
        bgStart: "#060c22",
        bgEnd: "#14110a",
        text: "#e8edff"
      },
      lockTypes: [
        {
          id: "red",
          label: "Red (Life on the Line)",
          badgeLabel: "Red - Life",
          summaryLabel: "Red Locks"
        },
        {
          id: "green",
          label: "Green (Configuration Control)",
          badgeLabel: "Green - Config",
          summaryLabel: "Green Locks"
        }
      ],
      applySafetyChecks: [
        "Energy sources isolated",
        "Zero-energy state verified",
        "Affected workers notified"
      ],
      removeWarningText:
        "Please verify equipment is in a safe condition and no life is on the line before removing this lock.",
      removeVerificationLabel: "I verify equipment is safe and no life is on the line.",
      removeConfirmationTitle: "Safety Verification Required Before Lock Removal"
    };

    const themeInput = { ...fallback.theme, ...(input.theme || {}) };
    const lockTypes = Array.isArray(input.lockTypes) && input.lockTypes.length
      ? input.lockTypes
      : fallback.lockTypes;
    const authRolesInput = Array.isArray(input.authRoles) && input.authRoles.length
      ? input.authRoles
      : fallback.authRoles;
    const authRoles = authRolesInput.map((role, index) => ({
      id: String(role.id || `role_${index + 1}`).toLowerCase().trim().replace(/[^a-z0-9_-]/g, "_"),
      label: String(role.label || role.id || `Role ${index + 1}`)
    }));
    const authRoleIds = new Set(authRoles.map((role) => role.id));
    const defaultRoleRaw = String(
      input.defaultRole === undefined || input.defaultRole === null
        ? fallback.defaultRole
        : input.defaultRole
    ).toLowerCase().trim();
    const defaultRole = authRoleIds.has(defaultRoleRaw) ? defaultRoleRaw : fallback.defaultRole;
    const firebaseInput = { ...fallback.firebase, ...(input.firebase || {}) };
    const bootstrapSuperAdmins =
      Array.isArray(input.bootstrapSuperAdmins) && input.bootstrapSuperAdmins.length
        ? input.bootstrapSuperAdmins.map((email) => String(email || "").trim().toLowerCase()).filter(Boolean)
        : fallback.bootstrapSuperAdmins;

    return {
      appTitle: String(input.appTitle || fallback.appTitle),
      appKicker: String(input.appKicker || fallback.appKicker),
      appSubtitle: String(input.appSubtitle || fallback.appSubtitle),
      quickNotes: String(input.quickNotes || fallback.quickNotes),
      storageKey: String(input.storageKey || fallback.storageKey),
      apiBasePath:
        input.apiBasePath === undefined || input.apiBasePath === null
          ? fallback.apiBasePath
          : String(input.apiBasePath).trim(),
      syncPollMs:
        Number.isFinite(Number(input.syncPollMs)) && Number(input.syncPollMs) >= 1000
          ? Number(input.syncPollMs)
          : fallback.syncPollMs,
      firebase: {
        enabled: Boolean(firebaseInput.enabled),
        apiKey: String(firebaseInput.apiKey || "").trim(),
        authDomain: String(firebaseInput.authDomain || "").trim(),
        databaseURL: String(firebaseInput.databaseURL || "").trim(),
        projectId: String(firebaseInput.projectId || "").trim(),
        appId: String(firebaseInput.appId || "").trim(),
        statePath: String(firebaseInput.statePath || fallback.firebase.statePath).trim(),
        usersPath: String(firebaseInput.usersPath || fallback.firebase.usersPath).trim(),
        signupRequestPath: String(
          firebaseInput.signupRequestPath || fallback.firebase.signupRequestPath
        ).trim()
      },
      authRoles,
      defaultRole,
      requireEmailVerification:
        input.requireEmailVerification === undefined
          ? fallback.requireEmailVerification
          : Boolean(input.requireEmailVerification),
      bootstrapSuperAdmins,
      passwordHash: String(input.passwordHash || fallback.passwordHash).toLowerCase().trim(),
      sessionKey: String(input.sessionKey || fallback.sessionKey),
      buildingFilters:
        Array.isArray(input.buildingFilters) && input.buildingFilters.length
          ? input.buildingFilters.map((item) => String(item))
          : fallback.buildingFilters,
      equipmentClasses:
        Array.isArray(input.equipmentClasses) && input.equipmentClasses.length
          ? input.equipmentClasses.map((item) => String(item))
          : fallback.equipmentClasses,
      lockColors:
        Array.isArray(input.lockColors) && input.lockColors.length
          ? input.lockColors.map((color, index) => ({
              id: String(color.id || `color_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
              label: String(color.label || color.id || `Color ${index + 1}`),
              hex: normalizeHex(color.hex) || "#888888"
            }))
          : fallback.lockColors,
      userTypes:
        Array.isArray(input.userTypes) && input.userTypes.length
          ? input.userTypes.map((type, index) => ({
              id: String(type.id || `type_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, "-"),
              label: String(type.label || type.id || `Type ${index + 1}`)
            }))
          : fallback.userTypes,
      departments:
        Array.isArray(input.departments) && input.departments.length
          ? input.departments.map((d) => String(d))
          : fallback.departments,
      theme: {
        logoPath: String(themeInput.logoPath || fallback.theme.logoPath),
        primary: normalizeHex(themeInput.primary) || fallback.theme.primary,
        secondary: normalizeHex(themeInput.secondary) || fallback.theme.secondary,
        gold: normalizeHex(themeInput.gold) || fallback.theme.gold,
        red: normalizeHex(themeInput.red) || fallback.theme.red,
        green: normalizeHex(themeInput.green) || fallback.theme.green,
        bgStart: normalizeHex(themeInput.bgStart) || fallback.theme.bgStart,
        bgEnd: normalizeHex(themeInput.bgEnd) || fallback.theme.bgEnd,
        text: normalizeHex(themeInput.text) || fallback.theme.text
      },
      lockTypes: lockTypes.map((type, index) => {
        const id = String(type.id || `type_${index + 1}`).toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        return {
          id,
          label: String(type.label || id),
          badgeLabel: String(type.badgeLabel || type.label || id),
          summaryLabel: String(type.summaryLabel || `${type.label || id} Locks`),
          color: normalizeHex(type.color)
        };
      }),
      applySafetyChecks:
        Array.isArray(input.applySafetyChecks) && input.applySafetyChecks.length
          ? input.applySafetyChecks.map((text) => String(text))
          : fallback.applySafetyChecks,
      removeWarningText: String(input.removeWarningText || fallback.removeWarningText),
      removeVerificationLabel: String(
        input.removeVerificationLabel || fallback.removeVerificationLabel
      ),
      removeConfirmationTitle: String(
        input.removeConfirmationTitle || fallback.removeConfirmationTitle
      )
    };
  }
})();
