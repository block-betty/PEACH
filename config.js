window.APP_CONFIG = {
  appTitle: "PEACH",
  appKicker: "Protected Equipment Access Control Hub",
  appSubtitle:
    "Track active and completed lock events with auditable logs. Red locks indicate Life on the Line; green locks indicate Configuration Control.",
  quickNotes:
    "Use the left toolbar to manage equipment, check out physical locks to users, and maintain the user index. Locks with past expected removal dates are automatically flagged.",
  storageKey: "peachTrackerStateV1",
  // SHA-256 of the application password. Default = "PeachAdmin6773000".
  // To rotate: compute SHA-256 of the new password (e.g. `printf '%s' 'newpw' | shasum -a 256`)
  // and replace the hash below. NOTE: client-side gate only — not real authentication.
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
  userTypes: [
    { id: "authorized", label: "Authorized User" },
    { id: "affected", label: "Affected User" },
    { id: "controller", label: "Equipment Controller" }
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
  removeVerificationLabel:
    "I verify equipment is safe and no life is on the line.",
  removeConfirmationTitle: "Safety Verification Required Before Lock Removal"
};
