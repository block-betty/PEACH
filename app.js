(function () {
  const config = normalizeConfig(window.APP_CONFIG || {});
  const STORAGE_KEY = config.storageKey;
  const SESSION_KEY = config.sessionKey;

  const state = loadState();
  let pendingRemovalId = null;

  const els = {
    appTitle: document.getElementById("appTitle"),
    appKicker: document.getElementById("appKicker"),
    appSubtitle: document.getElementById("appSubtitle"),
    appLogo: document.getElementById("appLogo"),
    sidebarLogo: document.getElementById("sidebarLogo"),
    sidebarTagline: document.getElementById("sidebarTagline"),
    quickNotesText: document.getElementById("quickNotesText"),
    removeTitle: document.getElementById("removeTitle"),
    removeWarningText: document.getElementById("removeWarningText"),
    statsGrid: document.getElementById("statsGrid"),
    lockTypeOptions: document.getElementById("lockTypeOptions"),
    applySafetyChecks: document.getElementById("applySafetyChecks"),
    removeSafetyChecks: document.getElementById("removeSafetyChecks"),
    equipmentForm: document.getElementById("equipmentForm"),
    eqBuilding: document.getElementById("eqBuilding"),
    eqClass: document.getElementById("eqClass"),
    equipmentFilter: document.getElementById("equipmentFilter"),
    uploadEquipmentExcel: document.getElementById("uploadEquipmentExcel"),
    equipmentExcelFile: document.getElementById("equipmentExcelFile"),
    lockForm: document.getElementById("lockForm"),
    equipmentTableBody: document.getElementById("equipmentTableBody"),
    lockEquipment: document.getElementById("lockEquipment"),
    activeCards: document.getElementById("activeCards"),
    historyTableBody: document.getElementById("historyTableBody"),
    auditTableBody: document.getElementById("auditTableBody"),
    removeModal: document.getElementById("removeModal"),
    removeForm: document.getElementById("removeForm"),
    cancelRemove: document.getElementById("cancelRemove"),
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
    // Dashboard
    locksByBuilding: document.getElementById("locksByBuilding"),
    locksByDepartmentBody: document.getElementById("locksByDepartmentBody"),
    // Reports
    reportTrainingBody: document.getElementById("reportTrainingBody"),
    reportAgedBody: document.getElementById("reportAgedBody"),
    reportExcessiveBody: document.getElementById("reportExcessiveBody"),
    reportConfigBody: document.getElementById("reportConfigBody"),
    reportCollectorBody: document.getElementById("reportCollectorBody")
  };

  initAuthGate();
  applyTheme(config.theme);
  applyConfigText();
  renderBuildingInputOptions();
  renderEquipmentClassOptions();
  renderBuildingFilterOptions();
  renderLockTypeOptions();
  renderLockColorOptions();
  renderDepartmentOptions();
  renderSafetyChecks();
  setDefaultTimes();
  bindModalControls();
  renderAll();

  els.equipmentForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const building = document.getElementById("eqBuilding").value.trim();
    const equipmentClass = document.getElementById("eqClass").value.trim();
    const name = document.getElementById("eqName").value.trim();
    const description = document.getElementById("eqDescription").value.trim();
    const assetNumber = document.getElementById("eqAsset").value.trim();

    if (!building || !equipmentClass || !name || !description || !assetNumber) {
      alert("Building, Class, Name, Description, and Asset Number are required.");
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
      equipmentClass,
      name,
      description,
      assetNumber,
      createdAt: new Date().toISOString()
    };

    state.equipment.push(equipment);
    addAudit("EQUIPMENT_ADDED", "System", `${equipment.assetNumber} | ${equipment.name}`);
    saveAndRender();
    event.target.reset();
  });

  els.equipmentFilter.addEventListener("change", () => {
    renderEquipment();
  });

  els.uploadEquipmentExcel.addEventListener("click", () => {
    els.equipmentExcelFile.click();
  });

  els.equipmentExcelFile.addEventListener("change", async (event) => {
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
        "System",
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

    if (!state.equipment.length) {
      alert("Add equipment to the master list before creating a lock event.");
      return;
    }

    const equipmentId = document.getElementById("lockEquipment").value;
    const lockedBy = document.getElementById("lockBy").value.trim();
    const lockedWhenLocal = document.getElementById("lockWhen").value;
    const expectedRemovalLocal = document.getElementById("lockExpectedRemoval").value;
    const reason = document.getElementById("lockReason").value.trim();
    const lockType = (document.querySelector("input[name='lockType']:checked") || {}).value;

    if (!isKnownLockType(lockType)) {
      alert("Select a valid lock type.");
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

    const safetyChecklist = {};
    const checks = els.applySafetyChecks.querySelectorAll("input[data-role='apply-check']");
    checks.forEach((input) => {
      safetyChecklist[input.dataset.key] = input.checked;
    });

    const lockEvent = {
      id: makeId("LOCK"),
      equipmentId,
      equipmentName: equipment.name,
      equipmentBuilding: getEquipmentBuilding(equipment),
      equipmentClass: getEquipmentClass(equipment),
      assetNumber: equipment.assetNumber,
      lockType,
      lockedBy,
      lockedAt: toIso(lockedWhenLocal),
      expectedRemovalAt: toIso(expectedRemovalLocal),
      reason,
      createdAt: new Date().toISOString(),
      safetyChecklist
    };

    state.activeLocks.push(lockEvent);
    addAudit(
      "LOCK_APPLIED",
      lockedBy,
      `${lockEvent.id} | ${equipment.assetNumber} | ${lockType.toUpperCase()} | Expected: ${lockEvent.expectedRemovalAt}`
    );

    saveAndRender();
    event.target.reset();
    setDefaultTimes();
    setDefaultLockType();
    els.applySafetyChecks
      .querySelectorAll("input[data-role='apply-check']")
      .forEach((check) => {
        check.checked = false;
      });
  });

  els.activeCards.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-remove-id]");
    if (!button) {
      return;
    }
    openRemoval(button.dataset.removeId);
  });

  els.cancelRemove.addEventListener("click", closeModal);

  els.removeForm.addEventListener("submit", (event) => {
    event.preventDefault();

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
    addAudit("LOCK_REMOVED", removeBy, `${completedEvent.id} | ${completedEvent.assetNumber}`);
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
      "Administrator",
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
    const button = event.target.closest("button[data-return-id]");
    if (!button) {
      return;
    }
    returnCheckedOutLock(button.dataset.returnId);
  });

  // ----- Manage Users -----
  els.userForm.addEventListener("submit", (event) => {
    event.preventDefault();

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
      "Administrator",
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
    deleteUser(button.dataset.deleteUser);
  });

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
    const overlay = document.getElementById("loginOverlay");
    const form = document.getElementById("loginForm");
    const input = document.getElementById("loginPassword");
    const errorEl = document.getElementById("loginError");
    const lockBtn = document.getElementById("lockAppBtn");

    if (!overlay || !form || !input) {
      return;
    }

    if (isUnlocked()) {
      hideOverlay();
    } else {
      showOverlay();
    }

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const attempt = input.value;
      const hash = await sha256Hex(attempt);
      if (hash === config.passwordHash) {
        sessionStorage.setItem(SESSION_KEY, "1");
        errorEl.hidden = true;
        input.value = "";
        addAudit("ADMIN_LOGIN", "Administrator", "Application unlocked");
        saveState();
        renderAudit();
        hideOverlay();
      } else {
        errorEl.hidden = false;
        input.select();
      }
    });

    if (lockBtn) {
      lockBtn.addEventListener("click", () => {
        sessionStorage.removeItem(SESSION_KEY);
        addAudit("ADMIN_LOGOUT", "Administrator", "Application locked");
        saveState();
        renderAudit();
        showOverlay();
      });
    }

    function showOverlay() {
      overlay.classList.remove("hidden");
      input.focus();
    }

    function hideOverlay() {
      overlay.classList.add("hidden");
    }
  }

  function isUnlocked() {
    return sessionStorage.getItem(SESSION_KEY) === "1";
  }

  async function sha256Hex(value) {
    const buffer = new TextEncoder().encode(String(value));
    const digest = await window.crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function bindModalControls() {
    document.querySelectorAll("[data-open-modal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        openManagedModal(btn.dataset.openModal);
      });
    });

    const dashboardBtn = document.getElementById("peachDashboardBtn");
    if (dashboardBtn) {
      dashboardBtn.addEventListener("click", () => {
        ["lockEventModal", "equipmentModal", "checkoutModal", "usersModal", "reportsModal"].forEach((id) => {
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

    ["lockEventModal", "equipmentModal", "checkoutModal", "usersModal", "reportsModal"].forEach((id) => {
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
        ["lockEventModal", "equipmentModal", "checkoutModal", "usersModal", "reportsModal"].forEach((id) => {
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
    if (id === "checkoutModal") {
      setDefaultCheckoutDate();
    }
    if (id === "reportsModal") {
      renderReports();
    }
    modal.classList.add("open");
  }

  function closeManagedModal(id) {
    const modal = document.getElementById(id);
    if (!modal) {
      return;
    }
    modal.classList.remove("open");
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
    const options = [
      '<option value="">Select Building</option>',
      ...config.buildingFilters.map(
        (value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`
      )
    ];
    els.eqBuilding.innerHTML = options.join("");

    const stillExists = config.buildingFilters.some((item) => item === currentValue);
    els.eqBuilding.value = stillExists ? currentValue : "";
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
    if (!els.checkoutUser) {
      return;
    }
    if (!state.users.length) {
      els.checkoutUser.innerHTML = '<option value="">Add a user first</option>';
      return;
    }
    const options = [
      '<option value="">Select User</option>',
      ...[...state.users]
        .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`))
        .map(
          (u) =>
            `<option value="${escapeHtml(u.id)}">${escapeHtml(u.lastName)}, ${escapeHtml(u.firstName)} (${escapeHtml(u.callSign)}) - ${escapeHtml(getUserTypeLabel(u.type))}</option>`
        )
    ];
    els.checkoutUser.innerHTML = options.join("");
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
      els.equipmentTableBody.innerHTML = '<tr><td colspan="5">No equipment added yet.</td></tr>';
      els.lockEquipment.innerHTML = '<option value="">Add equipment first</option>';
      return;
    }

    const selectedFilter = els.equipmentFilter.value;
    const filteredEquipment = getFilteredEquipment(selectedFilter);

    if (!filteredEquipment.length) {
      els.equipmentTableBody.innerHTML = '<tr><td colspan="5">No equipment matches the selected building filter.</td></tr>';
    } else {
      els.equipmentTableBody.innerHTML = filteredEquipment
        .map(
          (eq) => `
            <tr>
              <td>${escapeHtml(eq.assetNumber)}</td>
              <td>${escapeHtml(getEquipmentClass(eq))}</td>
              <td>${escapeHtml(eq.name)}</td>
              <td>${escapeHtml(getEquipmentBuilding(eq))}</td>
              <td>${escapeHtml(eq.description)}</td>
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
            ${escapeHtml(eq.assetNumber)} | ${escapeHtml(getEquipmentClass(eq))} | ${escapeHtml(eq.name)} (${escapeHtml(getEquipmentBuilding(eq))})
          </option>
        `
      )
      .join("");

    els.lockEquipment.innerHTML = options;
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
            <p class="lock-meta"><strong>Class:</strong> ${escapeHtml(lock.equipmentClass || "Unclassified")}</p>
            <p class="lock-meta"><strong>Building:</strong> ${escapeHtml(lock.equipmentBuilding || lock.equipmentLocation || "")}</p>
            <p class="lock-meta"><strong>Locked By:</strong> ${escapeHtml(lock.lockedBy)}</p>
            <p class="lock-meta"><strong>Locked At:</strong> ${formatUtc(lock.lockedAt)}</p>
            <p class="lock-meta ${overdue ? "overdue-text" : ""}"><strong>Expected Removal:</strong> ${formatUtc(lock.expectedRemovalAt)}${overdue ? " (PAST DUE)" : ""}</p>
            <div class="lock-reason">${escapeHtml(lock.reason)}</div>
            <div class="btn-row" style="margin-top:0.65rem;">
              <button type="button" class="btn-danger" data-remove-id="${escapeHtml(lock.id)}">Remove Lock</button>
            </div>
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
            <td>${escapeHtml(item.assetNumber)} | ${escapeHtml(item.equipmentClass || "Unclassified")} | ${escapeHtml(item.equipmentName)}</td>
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
              <button type="button" class="btn-danger btn-small" data-delete-user="${escapeHtml(u.id)}">Remove</button>
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
              <button type="button" class="btn-secondary btn-small" data-return-id="${escapeHtml(entry.id)}">Return</button>
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
      "Administrator",
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
      "Administrator",
      `${getUserTypeLabel(user.type)} | ${user.firstName} ${user.lastName} | ${user.callSign}`
    );
    saveAndRender();
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
            <td>${escapeHtml(lock.assetNumber)} | ${escapeHtml(lock.equipmentName)}</td>
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

      if (["location", "building", "bldg", "area", "equipmentlocation"].includes(key)) {
        output.building = value;
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

    if (output.equipmentClass) {
      const normalizedClass = normalizeText(output.equipmentClass);
      const matched = config.equipmentClasses.find(
        (item) => normalizeText(item) === normalizedClass
      );
      output.equipmentClass = matched || "";
    }

    return output;
  }

  function loadState() {
    const empty = {
      equipment: [],
      activeLocks: [],
      lockHistory: [],
      audit: [],
      users: [],
      lockCheckouts: []
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return empty;
      }

      const parsed = JSON.parse(raw);
      return {
        equipment: Array.isArray(parsed.equipment)
          ? parsed.equipment.map((item) => normalizeEquipmentRecord(item))
          : [],
        activeLocks: Array.isArray(parsed.activeLocks) ? parsed.activeLocks : [],
        lockHistory: Array.isArray(parsed.lockHistory) ? parsed.lockHistory : [],
        audit: Array.isArray(parsed.audit) ? parsed.audit : [],
        users: Array.isArray(parsed.users) ? parsed.users : [],
        lockCheckouts: Array.isArray(parsed.lockCheckouts) ? parsed.lockCheckouts : []
      };
    } catch {
      return empty;
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function saveAndRender() {
    saveState();
    renderAll();
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

  function getEquipmentClass(record) {
    return String(record?.equipmentClass || record?.class || "Unclassified").trim();
  }

  function normalizeEquipmentRecord(item) {
    return {
      ...item,
      building: getEquipmentBuilding(item),
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
      passwordHash: "24bc02a4c164394781b3e89f20844846d3ed2b56d34e90442cdbc1113fbbdc7b",
      sessionKey: "peachAuthSessionV1",
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
        primary: "#24307f",
        secondary: "#111a52",
        gold: "#d8b53d",
        red: "#c83b3f",
        green: "#198b44",
        bgStart: "#edf1ff",
        bgEnd: "#f5f1e2",
        text: "#161f3f"
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

    return {
      appTitle: String(input.appTitle || fallback.appTitle),
      appKicker: String(input.appKicker || fallback.appKicker),
      appSubtitle: String(input.appSubtitle || fallback.appSubtitle),
      quickNotes: String(input.quickNotes || fallback.quickNotes),
      storageKey: String(input.storageKey || fallback.storageKey),
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
