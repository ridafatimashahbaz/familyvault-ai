import type { NavIconKey } from "@/lib/nav";

/**
 * All user-facing copy for the two supported languages.
 *
 * There is no i18n library on purpose: the app ships a fixed set of screens in
 * English and Urdu, and a hand-written typed dictionary catches a missing
 * translation at compile time (`const ur: Dictionary`) and in
 * `tests/unit/i18n.test.ts` (key + `{placeholder}` parity).
 *
 * Only the screens a non-technical reader needs are translated; the settings,
 * family and documents-list screens stay English by decision.
 */

export type Locale = "en" | "ur";
export type Direction = "ltr" | "rtl";

type Pair = { title: string; body: string };

export type Dictionary = {
  meta: { dir: Direction; htmlLang: string; label: string; nativeLabel: string };
  common: {
    skipToContent: string;
    openMenu: string;
    closeMenu: string;
    menu: string;
    sidebar: string;
    mainNav: string;
    footerSecure: string;
    systemStatus: string;
    search: string;
    searchPlaceholder: string;
    upload: string;
    add: string;
    home: string;
    language: string;
    theme: string;
    light: string;
    dark: string;
    system: string;
    backHome: string;
    viewAll: string;
    manage: string;
    all: string;
    done: string;
    valid: string;
    renewSoon: string;
    expired: string;
  };
  nav: Record<NavIconKey, string>;
  landing: {
    badge: string;
    rtlNote: string;
    h1: string;
    lead: string;
    ctaStart: string;
    ctaDashboard: string;
    ctaDemo: string;
    trustEncrypted: string;
    trustEncryptionReady: string;
    trustOcr: string;
    trustNoKey: string;
    featuresTitle: string;
    featuresLead: string;
    features: Pair[];
    howTitle: string;
    steps: Pair[];
    trustTitle: string;
    trustLead: string;
    security: Pair[];
    finalTitleReady: string;
    finalTitleSetup: string;
    finalLeadReady: string;
    finalLeadSetup: string;
    finalCtaDashboard: string;
    finalCtaCreate: string;
    footerLeft: string;
    footerRight: string;
    installCta: string;
    previewTitle: string;
    previewQ: string;
    previewA: string;
  };
  auth: {
    shellH2: string;
    shellFooter: string;
    points: Pair[];
    home: string;
    backHome: string;
    loginTitle: string;
    loginSubtitle: string;
    emailLabel: string;
    emailPlaceholder: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    showPassword: string;
    hidePassword: string;
    signingIn: string;
    signIn: string;
    noAccount: string;
    createOne: string;
    registerTitle: string;
    registerSubtitle: string;
    nameLabel: string;
    namePlaceholder: string;
    nameHint: string;
    passwordHint: string;
    confirmLabel: string;
    confirmPlaceholder: string;
    ruleLength: string;
    ruleLetter: string;
    ruleNumber: string;
    ruleMatch: string;
    creatingVault: string;
    createAccount: string;
    haveAccount: string;
    noticeRegistered: string;
    noticeSignedOut: string;
    noticeError: string;
  };
  dashboard: {
    welcome: string;
    leadEmpty: string;
    lead: string;
    securityLine: string;
    uploadCta: string;
    askCta: string;
    statDocuments: string;
    statDocumentsHint: string;
    statExpiring: string;
    statExpired: string;
    statStorage: string;
    statExpiringHint: string;
    statExpiredHint: string;
    statStorageHint: string;
    statNeedsRenewing: string;
    statNothingOverdue: string;
    failedTitle: string;
    failedBody: string;
    review: string;
    processingTitle: string;
    processingBody: string;
    recentTitle: string;
    recentLead: string;
    setupTitle: string;
    setupLead: string;
    stepFamily: string;
    stepFamilyBody: string;
    stepUpload: string;
    stepUploadBody: string;
    stepReview: string;
    stepReviewBody: string;
    uploadFirst: string;
    byCategory: string;
    byCategoryLead: string;
    remindersTitle: string;
    remindersNone: string;
    remindersSome: string;
    remindersEmpty: string;
    familyTitle: string;
    familyNone: string;
    familySome: string;
    familyEmpty: string;
    addSomeone: string;
    assistantTitle: string;
    assistantLead: string;
  };
  reminders: {
    title: string;
    description: string;
    windowDays: string;
    statExpiredHintRenew: string;
    statExpiredHintOk: string;
    statUpcoming: string;
    statUpcomingHint: string;
    statUntracked: string;
    statUntrackedHint: string;
    emptyTitle: string;
    emptyBody: string;
    browseAll: string;
    showingExpired: string;
    showAll: string;
    expiredCard: string;
    expiringWithin: string;
    upcomingCard: string;
    untrackedNote: string;
    reviewThem: string;
  };
  calendar: {
    title: string;
    description: string;
    viewReminders: string;
    exportIcs: string;
    prevMonth: string;
    nextMonth: string;
    today: string;
    eventsCount: string;
    dayEmpty: string;
    legendExpired: string;
    legendSoon: string;
    legendValid: string;
    addToGoogle: string;
    openDocument: string;
    emptyTitle: string;
    emptyBody: string;
  };
  assistant: {
    title: string;
    description: string;
    placeholder: string;
    send: string;
    ask: string;
    thinking: string;
    focusTitle: string;
    focusBody: string;
    openDocument: string;
    howTitle: string;
    how1Title: string;
    how1Body: string;
    how2Title: string;
    how2Body: string;
    how3Title: string;
    how3Local: string;
    how4Title: string;
    how4Body: string;
    examplesTitle: string;
    examples: string[];
    chatTitle: string;
    noDocs: string;
    searchedSummary: string;
    searchingSummary: string;
    clearConversation: string;
    cleared: string;
    emptyTitle: string;
    emptyNoDocs: string;
    emptyBody: string;
    reading: string;
    inputNoDocs: string;
    inputLabel: string;
    hintLine: string;
    fromCount: string;
  };
  voice: {
    listen: string;
    listening: string;
    readAloud: string;
    stop: string;
    speakLanguage: string;
    privacyNote: string;
    unsupported: string;
    preparing: string;
    requesting: string;
    transcriptReady: string;
    voiceUnavailable: string;
    downloadingModel: string;
    onDeviceBadge: string;
    modeNote: string;
    micDenied: string;
    modelFailed: string;
    helpTitle: string;
    helpBody: string;
    helpPrivacy: string;
    retry: string;
  };
  offline: {
    bannerOffline: string;
    cardTitle: string;
    cardDescription: string;
    enable: string;
    disable: string;
    enabledLabel: string;
    disabledLabel: string;
    saving: string;
    refreshing: string;
    updated: string;
    never: string;
    saveFailed: string;
    unavailable: string;
    viewSnapshot: string;
    pageTitle: string;
    pageDescription: string;
    empty: string;
    expiredLabel: string;
    upcomingLabel: string;
    nextLabel: string;
    openApp: string;
    privacyLine: string;
  };
};

const en: Dictionary = {
  meta: { dir: "ltr", htmlLang: "en", label: "English", nativeLabel: "English" },
  common: {
    skipToContent: "Skip to content",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    menu: "Menu",
    sidebar: "Sidebar",
    mainNav: "Main",
    footerSecure:
      "FamilyVault AI — documents are encrypted at rest and never leave this server.",
    systemStatus: "System status",
    search: "Search documents",
    searchPlaceholder: "Search documents…",
    upload: "Upload",
    add: "Add",
    home: "Home",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    system: "System",
    backHome: "Back to the FamilyVault AI home page",
    viewAll: "View all",
    manage: "Manage",
    all: "All",
    done: "Done",
    valid: "Valid",
    renewSoon: "Renew soon",
    expired: "Expired",
  },
  nav: {
    dashboard: "Dashboard",
    documents: "Documents",
    upload: "Upload",
    family: "Family",
    reminders: "Reminders",
    calendar: "Calendar",
    assistant: "Assistant",
    vault: "Private vault",
    settings: "Settings",
  },
  landing: {
    badge: "One vault for the whole household",
    rtlNote: "اردو کے لیے دستاویزات کی عبارت بائیں سے دائیں رہتی ہے",
    h1: "Every family document, read, filed and never out of date.",
    lead: "Upload a CNIC, passport, birth certificate or electricity bill. FamilyVault AI works out what it is, reads the text, pulls out the numbers and dates, writes a plain-language summary, and warns you before anything expires.",
    ctaStart: "Start free",
    ctaDashboard: "Go to dashboard",
    ctaDemo: "Explore a live demo",
    trustEncrypted: "Encrypted before it is ever saved",
    trustEncryptionReady: "Encryption ready to enable",
    trustOcr: "Reads your documents on your own server",
    trustNoKey: "Understands your documents out of the box",
    featuresTitle: "What it does with each document",
    featuresLead:
      "Everything between dropping a file in and seeing it filed in your vault happens automatically.",
    features: [
      {
        title: "Upload a photo or a scan",
        body: "JPG, PNG, WEBP, GIF, BMP, TIFF, HEIC or PDF. Files are checked by what they actually are, never by a name that could be faked.",
      },
      {
        title: "Classified automatically",
        body: "Around thirty document types across identity, civil, education, medical, property, financial and legal — each with a confidence score and the evidence behind it.",
      },
      {
        title: "Text read on your own server",
        body: "Text is read locally on your own server. A PDF that already contains digital text is read directly, which is faster and more accurate.",
      },
      {
        title: "A summary you can read",
        body: "Every document gets a plain-language summary plus the fields that matter — names, numbers, dates — pulled out of the raw text.",
      },
      {
        title: "Expiry dates detected",
        body: "Passport expiry, licence validity, lease end date, insurance maturity. A date is only recorded when the document itself labels it.",
      },
      {
        title: "Reminders before it lapses",
        body: "A configurable warning window shows what has already expired and what is coming up, filtered by family member if you want.",
      },
      {
        title: "Filed by family member",
        body: "One household login with a profile per person. Documents sit under a member, a category, and any tags you add.",
      },
      {
        title: "Ask your documents",
        body: "The assistant answers from your own vault and cites what it used. It will not invent a CNIC number or a document you do not have.",
      },
      {
        title: "Search across everything",
        body: "Titles, OCR text, summaries, extracted fields, notes, tags and family members — filtered by category, type, member or expiry state.",
      },
    ],
    howTitle: "How it works",
    steps: [
      {
        title: "Add the people first",
        body: "Create a profile for each family member — yourself, spouse, children, parents. Documents are filed under them.",
      },
      {
        title: "Upload in bulk",
        body: "Drag a stack of scans in. Each file is validated, encrypted, stored, OCR'd, classified, summarised and dated.",
      },
      {
        title: "Correct what the OCR got wrong",
        body: "Every field is editable, the document type can be overridden, and expiry dates can be set or cleared by hand.",
      },
    ],
    trustTitle: "Built to be trusted with identity documents",
    trustLead:
      "A vault holding CNIC numbers and passports should not depend on someone else's server. Everything here can run entirely on your own machine.",
    security: [
      {
        title: "Encrypted before it is stored",
        body: "Your documents are locked with strong encryption the moment they are saved, so they never sit on disk as an open file.",
      },
      {
        title: "A private vault for files you keep to yourself",
        body: "Files added to the private vault are locked inside your own browser before they are stored, using a passphrase the server never sees. The app cannot read their names or their contents — only you, with that passphrase, can open them.",
      },
      {
        title: "Never exposed as an open file",
        body: "Stored documents can only be opened through your own signed-in account — there is no public link anyone could find.",
      },
      {
        title: "Accounts are protected",
        body: "Passwords are protected with a one-way hash, and repeated sign-in attempts are slowed down to stop guessing.",
      },
      {
        title: "Unsafe files are refused",
        body: "Files that could hide harmful code are rejected, so only genuine photos, scans and PDFs are accepted.",
      },
      {
        title: "Private by default, no tracking",
        body: "Reading, sorting, summaries and the assistant all run on your own server. Nothing is sold, and no usage tracking is collected.",
      },
    ],
    finalTitleReady: "Your vault is ready.",
    finalTitleSetup: "Set up your family vault.",
    finalLeadReady: "Pick up where you left off.",
    finalLeadSetup: "One account for the household, with a profile for each family member.",
    finalCtaDashboard: "Open dashboard",
    finalCtaCreate: "Create your account",
    footerLeft: "FamilyVault AI — self-hosted family document management.",
    footerRight: "Every document stays private and on your own server.",
    installCta: "Install the app",
    previewTitle: "Reminders",
    previewQ: "When does Dad's passport expire?",
    previewA: "14 Mar 2029 — in about two and a half years. Source: Ahmed Khan · Passport.",
  },
  auth: {
    shellH2: "One place for every certificate, bill and identity document your family owns.",
    shellFooter: "Your files are encrypted and never leave this server.",
    points: [
      {
        title: "Read automatically",
        body: "OCR runs on your own server, then the document is classified, summarised and its key fields extracted.",
      },
      {
        title: "Filed by person and category",
        body: "A profile for each family member, and every document searchable across its text, fields, tags and notes.",
      },
      {
        title: "Warned before anything lapses",
        body: "Passports, licences, leases and policies all carry expiry dates. You get told before they run out.",
      },
    ],
    home: "Home",
    backHome: "Back to the FamilyVault AI home page",
    loginTitle: "Welcome back",
    loginSubtitle: "Sign in to your household vault.",
    emailLabel: "Email address",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "Your password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    signingIn: "Signing in…",
    signIn: "Sign in",
    noAccount: "No account yet?",
    createOne: "Create one",
    registerTitle: "Create your vault",
    registerSubtitle: "One account for the whole household.",
    nameLabel: "Your name",
    namePlaceholder: "Ahmed Khan",
    nameHint: "Used to greet you and to label the household vault.",
    passwordHint: "Choose a strong password",
    confirmLabel: "Confirm password",
    confirmPlaceholder: "Type it once more",
    ruleLength: "At least 8 characters",
    ruleLetter: "Contains a letter",
    ruleNumber: "Contains a number",
    ruleMatch: "Both passwords match",
    creatingVault: "Creating your vault…",
    createAccount: "Create account",
    haveAccount: "Already registered?",
    noticeRegistered: "Your vault is created. Sign in to open it.",
    noticeSignedOut: "You are signed out.",
    noticeError: "That sign-in attempt did not work. Please try again.",
  },
  dashboard: {
    welcome: "Welcome back, {name}",
    leadEmpty:
      "Your vault is empty. Upload a document and FamilyVault will read, classify and summarise it for you.",
    lead: "Here is what your household vault looks like today.",
    securityLine: "Your security is our first priority. Every document is encrypted and stays on your own server.",
    uploadCta: "Upload",
    askCta: "Ask the assistant",
    statDocuments: "Documents",
    statDocumentsHint:
      "{members} {members, plural, one {family profile} other {family profiles}} · {categories} {categories, plural, one {category} other {categories}}",
    statExpiring: "Expiring soon",
    statExpired: "Expired",
    statStorage: "Storage used",
    statExpiringHint: "Within the next {days} days",
    statExpiredHint: "Needs renewing",
    statStorageHint: "Across every document in the vault",
    statNeedsRenewing: "Needs renewing",
    statNothingOverdue: "Nothing overdue",
    failedTitle: "{count} {count, plural, one {document} other {documents}} need attention",
    failedBody:
      "Analysis failed on these uploads. The files themselves are stored safely and can be reprocessed from the document page.",
    review: "Review",
    processingTitle: "{count} still processing",
    processingBody:
      "OCR and classification can take a moment on large scans. Reload this page to see the result.",
    recentTitle: "Recent documents",
    recentLead: "The six most recently added",
    setupTitle: "Set up your vault",
    setupLead: "Three steps to a searchable, expiry-tracked family archive.",
    stepFamily: "Add your family",
    stepFamilyBody: "Create a profile per person so documents can be filed by name.",
    stepUpload: "Upload a document",
    stepUploadBody: "A photo or scan of a CNIC, passport, certificate or bill works well.",
    stepReview: "Check what was extracted",
    stepReviewBody: "Review the fields, summary and expiry date, then correct anything wrong.",
    uploadFirst: "Upload your first document",
    byCategory: "By category",
    byCategoryLead: "How the vault is distributed",
    remindersTitle: "Expiry reminders",
    remindersNone: "Nothing due in the next {days} days",
    remindersSome: "{count} needing action, closest first",
    remindersEmpty:
      "Expiry dates are read from your documents automatically. Anything that expires within {days} days will appear here.",
    familyTitle: "Family",
    familyNone: "No profiles yet",
    familySome: "{count} {count, plural, one {profile} other {profiles}}",
    familyEmpty:
      "Add a profile for each person and every document you upload can be filed under their name.",
    addSomeone: "Add someone",
    assistantTitle: "Ask the assistant",
    assistantLead: "Our AI answers from your own documents",
  },
  reminders: {
    title: "Reminders",
    description: "Documents that have already expired or will do within the next {days} days.",
    windowDays: "{days} days",
    statExpiredHintRenew: "Renew these now",
    statExpiredHintOk: "Nothing overdue",
    statUpcoming: "Next {days} days",
    statUpcomingHint: "Sorted by closest first",
    statUntracked: "No expiry tracked",
    statUntrackedHint: "Marked as never expiring",
    emptyTitle: "Nothing needs your attention",
    emptyBody:
      "No document in your vault expires within {days} days. Anything that does will show up here automatically as soon as it is read from an upload.",
    browseAll: "Browse all documents",
    showingExpired: "Showing expired documents only",
    showAll: "Show all reminders",
    expiredCard: "{count} {count, plural, one {document has} other {documents have}} run out",
    expiringWithin: "Expiring within {days} days",
    upcomingCard: "{count} to plan for",
    untrackedNote:
      "{count} {count, plural, one {document is} other {documents are}} marked as never expiring and are left out of these lists.",
    reviewThem: "Review them",
  },
  calendar: {
    title: "Expiry calendar",
    description: "Every expiry date on one calendar, so you can see what is running out and when.",
    viewReminders: "Reminders",
    exportIcs: "Export .ics",
    prevMonth: "Previous month",
    nextMonth: "Next month",
    today: "Today",
    eventsCount: "{count} {count, plural, one {expiry} other {expiries}}",
    dayEmpty: "Nothing expires on this day.",
    legendExpired: "Expired",
    legendSoon: "Expiring soon",
    legendValid: "Valid",
    addToGoogle: "Add to Google Calendar",
    openDocument: "Open document",
    emptyTitle: "No expiry dates yet",
    emptyBody:
      "Upload a document and, when it prints an expiry date, that date appears here automatically.",
  },
  assistant: {
    title: "Assistant",
    description: "Our AI reads your documents and answers your questions — expiry dates, people, categories or a plain-language summary.",
    placeholder: "Ask about your documents…",
    send: "Send",
    ask: "Ask",
    thinking: "Thinking…",
    focusTitle: "Looking at “{title}”",
    focusBody:
      "The assistant still searches the whole vault, so it can cross-check this document against the rest.",
    openDocument: "Open the document",
    howTitle: "How answers are produced",
    how1Title: "1. Your question is understood.",
    how1Body: "Names, document types, dates and categories are pulled out of it.",
    how2Title: "2. The vault is searched.",
    how2Body:
      "Titles, summaries, extracted fields and recognised text are scored against the question — no other account is ever touched.",
    how3Title: "3. An answer is written.",
    how3Local: "The best matches are combined locally, on your own server.",
    how4Title: "4. Sources are listed.",
    how4Body: "Every answer names the documents behind it so you can open them and check.",
    examplesTitle: "Things worth asking",
    examples: [
      "What is expiring in the next three months?",
      "Do we have a birth certificate for each child?",
      "Which property documents mention a lease?",
      "List every document for a single family member.",
      "What did the last blood test show?",
      "Are any documents missing an expiry date that should have one?",
    ],
    chatTitle: "Document assistant",
    noDocs: "No documents to search yet",
    searchedSummary: "Searched {found} of {total} documents",
    searchingSummary: "Searching {count} {count, plural, one {document} other {documents}}",
    clearConversation: "Clear conversation",
    cleared: "Conversation cleared",
    emptyTitle: "Ask a question about your documents",
    emptyNoDocs:
      "Upload something first — the assistant answers from what is actually in your vault, so it needs documents to read.",
    emptyBody:
      "Answers are built from your own files and always list what they came from. Nothing leaves your server.",
    reading: "Reading your documents…",
    inputNoDocs: "Upload a document first…",
    inputLabel: "Ask about anything in your vault",
    hintLine:
      "Enter to send, Shift + Enter for a new line. Answers quote your documents — always check the sources before acting on a number or a date.",
    fromCount: "From {count} {count, plural, one {document} other {documents}}",
  },
  voice: {
    listen: "Speak",
    listening: "Listening…",
    readAloud: "Read aloud",
    stop: "Stop",
    speakLanguage: "Voice language",
    privacyNote: "Speech is processed on this device. Audio is never uploaded.",
    unsupported: "Voice input is not available in this browser.",
    preparing: "Preparing…",
    requesting: "Requesting microphone…",
    transcriptReady: "Transcript ready: “{text}”",
    voiceUnavailable: "No voice for this language is installed on this device.",
    downloadingModel: "Downloading the speech model… {percent}%",
    onDeviceBadge: "On-device",
    modeNote: "Runs entirely on this device. Your voice is never uploaded.",
    micDenied: "Microphone access was blocked. Allow it in your browser and try again.",
    modelFailed: "The voice model could not load. Check your connection and try again.",
    helpTitle: "Voice",
    helpBody:
      "Tap the microphone and speak in English, Urdu or Punjabi. Read-aloud speaks the answer back to you.",
    helpPrivacy: "Your voice is understood on this device and never uploaded.",
    retry: "Try again",
  },
  offline: {
    bannerOffline: "You are offline — showing the important information saved on this device.",
    cardTitle: "Offline important information",
    cardDescription:
      "Keep your upcoming expiry dates on this device so they are still there with no internet. Encrypted with a key this browser never lets out, and only dates and titles — never your files.",
    enable: "Save for offline",
    disable: "Remove from this device",
    enabledLabel: "Saved on this device",
    disabledLabel: "Not saved on this device",
    saving: "Saving…",
    refreshing: "Refreshing…",
    updated: "Saved {when}",
    never: "Not saved yet",
    saveFailed: "Could not save on this device.",
    unavailable: "This browser cannot store encrypted offline information.",
    viewSnapshot: "View offline information",
    pageTitle: "Important information",
    pageDescription: "Saved on this device, encrypted. Shown because you are offline.",
    empty:
      "Nothing has been saved for offline use yet. Open the app while online and turn on offline important information in Settings.",
    expiredLabel: "Expired",
    upcomingLabel: "Upcoming",
    nextLabel: "Next",
    openApp: "Open the app",
    privacyLine: "Stored as ciphertext on this device only. Your documents never leave the server.",
  },
};

const ur: Dictionary = {
  meta: { dir: "rtl", htmlLang: "ur", label: "Urdu", nativeLabel: "اردو" },
  common: {
    skipToContent: "مواد پر جائیں",
    openMenu: "مینو کھولیں",
    closeMenu: "مینو بند کریں",
    menu: "مینو",
    sidebar: "سائیڈ بار",
    mainNav: "مرکزی",
    footerSecure:
      "فیملی والٹ AI — دستاویزات محفوظ انکرپشن کے ساتھ رکھی جاتی ہیں اور اس سرور سے کبھی باہر نہیں جاتیں۔",
    systemStatus: "سسٹم کی حالت",
    search: "دستاویزات تلاش کریں",
    searchPlaceholder: "دستاویزات تلاش کریں…",
    upload: "اپلوڈ",
    add: "شامل کریں",
    home: "ہوم",
    language: "زبان",
    theme: "تھیم",
    light: "روشن",
    dark: "گہرا",
    system: "سسٹم",
    backHome: "فیملی والٹ AI کے مرکزی صفحے پر واپس جائیں",
    viewAll: "سب دیکھیں",
    manage: "انتظام کریں",
    all: "سب",
    done: "مکمل",
    valid: "درست",
    renewSoon: "جلد تجدید کریں",
    expired: "میعاد ختم",
  },
  nav: {
    dashboard: "ڈیش بورڈ",
    documents: "دستاویزات",
    upload: "اپلوڈ",
    family: "خاندان",
    reminders: "یاد دہانیاں",
    calendar: "کیلنڈر",
    assistant: "اسسٹنٹ",
    vault: "نجی والٹ",
    settings: "ترتیبات",
  },
  landing: {
    badge: "پورے گھر کے لیے ایک ہی والٹ",
    rtlNote: "دستاویزات کی عبارت ہمیشہ بائیں سے دائیں پڑھی جاتی ہے",
    h1: "خاندان کی ہر دستاویز — پڑھی گئی، محفوظ، اور کبھی میعاد سے باہر نہیں۔",
    lead: "شناختی کارڈ، پاسپورٹ، پیدائشی سرٹیفکیٹ یا بجلی کا بل اپلوڈ کریں۔ فیملی والٹ AI خود پہچان لیتا ہے کہ یہ کیا ہے، عبارت پڑھتا ہے، نمبر اور تاریخیں نکالتا ہے، آسان زبان میں خلاصہ لکھتا ہے، اور میعاد ختم ہونے سے پہلے آپ کو بتا دیتا ہے۔",
    ctaStart: "مفت شروع کریں",
    ctaDashboard: "ڈیش بورڈ پر جائیں",
    ctaDemo: "لائیو ڈیمو دیکھیں",
    trustEncrypted: "محفوظ کرنے سے پہلے انکرپٹ",
    trustEncryptionReady: "انکرپشن فعال کرنے کے لیے تیار",
    trustOcr: "آپ کی دستاویزات آپ کے اپنے سرور پر پڑھی جاتی ہیں",
    trustNoKey: "آپ کی دستاویزات کو خود سمجھتا ہے",
    featuresTitle: "ہر دستاویز کے ساتھ یہ کیا کرتا ہے",
    featuresLead:
      "فائل ڈالنے سے لے کر والٹ میں محفوظ ہونے تک سب کچھ خودکار طور پر ہوتا ہے۔",
    features: [
      {
        title: "تصویر یا اسکین اپلوڈ کریں",
        body: "JPG، PNG، WEBP، GIF، BMP، TIFF، HEIC یا PDF۔ فائل کو اس کے اصل مواد سے جانچا جاتا ہے، کسی ایسے نام سے نہیں جسے جعلی بنایا جا سکے۔",
      },
      {
        title: "خودکار درجہ بندی",
        body: "شناخت، شہری، تعلیم، طبی، جائیداد، مالی اور قانونی — تقریباً تیس اقسام، ہر ایک کے ساتھ اعتماد کا درجہ اور اس کی وجہ۔",
      },
      {
        title: "متن آپ کے اپنے سرور پر پڑھا جاتا ہے",
        body: "عبارت آپ کے اپنے سرور پر مقامی طور پر پڑھی جاتی ہے۔ جس PDF میں پہلے سے ڈیجیٹل متن موجود ہو، وہ براہِ راست پڑھا جاتا ہے — جو تیز اور زیادہ درست ہے۔",
      },
      {
        title: "پڑھنے کے قابل خلاصہ",
        body: "ہر دستاویز کا آسان زبان میں خلاصہ اور اہم خانے — نام، نمبر، تاریخیں — خام متن سے نکال کر دیے جاتے ہیں۔",
      },
      {
        title: "میعاد کی تاریخیں خود پکڑتا ہے",
        body: "پاسپورٹ کی میعاد، لائسنس کی مدت، کرایہ داری کا اختتام، انشورنس کی پختگی۔ تاریخ صرف اسی وقت محفوظ ہوتی ہے جب دستاویز خود اسے ظاہر کرے۔",
      },
      {
        title: "میعاد سے پہلے یاد دہانی",
        body: "ایک قابلِ ترتیب مدت کے اندر آنے والی دستاویزات اور جو میعاد گزر چکی ہیں، دکھائی جاتی ہیں — چاہیں تو خاندان کے فرد کے حساب سے چھانٹ لیں۔",
      },
      {
        title: "ہر فرد کے نام پر محفوظ",
        body: "پورے گھر کے لیے ایک لاگ اِن اور ہر فرد کا الگ پروفائل۔ دستاویز ایک فرد، ایک قسم اور آپ کے لگائے ٹیگز کے تحت رکھی جاتی ہے۔",
      },
      {
        title: "اپنی دستاویزات سے پوچھیں",
        body: "اسسٹنٹ صرف آپ کے والٹ سے جواب دیتا ہے اور حوالہ بھی بتاتا ہے۔ یہ کوئی جعلی شناختی نمبر یا ایسی دستاویز نہیں گھڑتا جو آپ کے پاس نہ ہو۔",
      },
      {
        title: "ہر چیز میں تلاش",
        body: "عنوانات، OCR متن، خلاصے، نکالے گئے خانے، نوٹس، ٹیگز اور افراد — اور قسم، نوع یا میعاد کے حساب سے فلٹر۔",
      },
    ],
    howTitle: "یہ کیسے کام کرتا ہے",
    steps: [
      {
        title: "پہلے افراد شامل کریں",
        body: "ہر فرد — اپنا، شریکِ حیات، بچوں، والدین — کا پروفائل بنائیں۔ دستاویزات اُنہی کے تحت محفوظ ہوں گی۔",
      },
      {
        title: "ایک ساتھ کئی اپلوڈ کریں",
        body: "کئی اسکین ایک ساتھ ڈالیں۔ ہر فائل جانچی، انکرپٹ، محفوظ، پڑھی، درجہ بند، خلاصہ اور تاریخ شدہ جاتی ہے۔",
      },
      {
        title: "OCR کی غلطی درست کریں",
        body: "ہر خانہ قابلِ ترمیم ہے، قسم تبدیل کی جا سکتی ہے، اور میعاد کی تاریخ خود سے لگائی یا ہٹائی جا سکتی ہے۔",
      },
    ],
    trustTitle: "شناختی دستاویزات کے لیے بنایا گیا، قابلِ اعتماد",
    trustLead:
      "شناختی نمبر اور پاسپورٹ رکھنے والا والٹ کسی اور کے سرور پر منحصر نہیں ہونا چاہیے۔ یہ سب کچھ مکمل طور پر آپ کے اپنے کمپیوٹر پر چل سکتا ہے۔",
    security: [
      {
        title: "محفوظ کرنے سے پہلے انکرپٹ",
        body: "آپ کی دستاویزات محفوظ ہوتے ہی مضبوط انکرپشن سے بند کر دی جاتی ہیں، تاکہ ڈسک پر کھلی فائل کے طور پر نہ رہیں۔",
      },
      {
        title: "نجی والٹ — وہ فائلیں جو صرف آپ کے لیے ہیں",
        body: "نجی والٹ میں رکھی جانے والی فائلیں محفوظ کرنے سے پہلے آپ کے اپنے براؤزر میں ہی مقفل ہو جاتی ہیں، ایک ایسے پاس فریز سے جو سرور کبھی نہیں دیکھتا۔ ایپ ان کا نام بھی مواد بھی نہیں پڑھ سکتی — صرف آپ وہ پاس فریز دے کر انہیں کھول سکتے ہیں۔",
      },
      {
        title: "کبھی کھلی فائل کے طور پر ظاہر نہیں",
        body: "محفوظ شدہ دستاویزات صرف آپ کے اپنے سائن اِن اکاؤنٹ سے کھل سکتی ہیں — کوئی عوامی لنک نہیں جسے کوئی ڈھونڈ سکے۔",
      },
      {
        title: "اکاؤنٹس محفوظ رہتے ہیں",
        body: "پاس ورڈ ایک طرفہ ہیش سے محفوظ کیے جاتے ہیں، اور بار بار لاگ اِن کی کوششیں سست کر دی جاتی ہیں تاکہ اندازہ لگانا رک جائے۔",
      },
      {
        title: "غیر محفوظ فائلیں مسترد",
        body: "ایسی فائلیں مسترد کر دی جاتی ہیں جن میں نقصان دہ کوڈ چھپا ہو، لہٰذا صرف اصل تصویریں، اسکین اور PDF قبول کیے جاتے ہیں۔",
      },
      {
        title: "بشکلِ ڈیفالٹ نجی، کوئی ٹریکنگ نہیں",
        body: "پڑھنا، ترتیب دینا، خلاصے اور اسسٹنٹ سب آپ کے اپنے سرور پر چلتے ہیں۔ کچھ بیچا نہیں جاتا اور کوئی استعمال کی ٹریکنگ جمع نہیں کی جاتی۔",
      },
    ],
    finalTitleReady: "آپ کا والٹ تیار ہے۔",
    finalTitleSetup: "اپنے خاندان کا والٹ بنائیں۔",
    finalLeadReady: "وہیں سے جاری رکھیں جہاں آپ نے چھوڑا تھا۔",
    finalLeadSetup: "پورے گھر کے لیے ایک اکاؤنٹ، اور ہر فرد کے لیے الگ پروفائل۔",
    finalCtaDashboard: "ڈیش بورڈ کھولیں",
    finalCtaCreate: "اپنا اکاؤنٹ بنائیں",
    footerLeft: "فیملی والٹ AI — اپنے سروس پر چلنے والا خاندانی دستاویزات کا نظام۔",
    footerRight: "ہر دستاویز نجی رہتی ہے اور آپ کے اپنے سرور پر۔",
    installCta: "ایپ انسٹال کریں",
    previewTitle: "یاد دہانیاں",
    previewQ: "والد صاحب کا پاسپورٹ کب میعاد ختم ہو رہا ہے؟",
    previewA: "14 مارچ 2029 — تقریباً ڈھائی سال بعد۔ حوالہ: احمد خان · پاسپورٹ۔",
  },
  auth: {
    shellH2: "آپ کے خاندان کے ہر سرٹیفکیٹ، بل اور شناختی دستاویز کے لیے ایک ہی جگہ۔",
    shellFooter: "آپ کی فائلیں انکرپٹ ہیں اور اس سرور سے کبھی باہر نہیں جاتیں۔",
    points: [
      {
        title: "خودکار طور پر پڑھی جاتی ہے",
        body: "OCR آپ کے اپنے سرور پر چلتا ہے، پھر دستاویز کی درجہ بندی، خلاصہ اور اہم خانے نکالے جاتے ہیں۔",
      },
      {
        title: "فرد اور قسم کے حساب سے محفوظ",
        body: "ہر فرد کا الگ پروفائل، اور ہر دستاویز اس کے متن، خانوں، ٹیگز اور نوٹس میں تلاش کے قابل۔",
      },
      {
        title: "میعاد سے پہلے اطلاع",
        body: "پاسپورٹ، لائسنس، کرایہ داری اور پالیسیوں کی میعاد ہوتی ہے۔ ختم ہونے سے پہلے آپ کو بتا دیا جاتا ہے۔",
      },
    ],
    home: "ہوم",
    backHome: "فیملی والٹ AI کے مرکزی صفحے پر واپس جائیں",
    loginTitle: "خوش آمدید",
    loginSubtitle: "اپنے خاندانی والٹ میں سائن اِن کریں۔",
    emailLabel: "ای میل پتہ",
    emailPlaceholder: "you@example.com",
    passwordLabel: "پاس ورڈ",
    passwordPlaceholder: "آپ کا پاس ورڈ",
    showPassword: "پاس ورڈ دکھائیں",
    hidePassword: "پاس ورڈ چھپائیں",
    signingIn: "سائن اِن ہو رہا ہے…",
    signIn: "سائن اِن",
    noAccount: "اکاؤنٹ نہیں ہے؟",
    createOne: "بنائیں",
    registerTitle: "اپنا والٹ بنائیں",
    registerSubtitle: "پورے گھر کے لیے ایک اکاؤنٹ۔",
    nameLabel: "آپ کا نام",
    namePlaceholder: "احمد خان",
    nameHint: "آپ کو سلام کرنے اور والٹ کے نام کے لیے استعمال ہوتا ہے۔",
    passwordHint: "ایک مضبوط پاس ورڈ منتخب کریں",
    confirmLabel: "پاس ورڈ دوبارہ لکھیں",
    confirmPlaceholder: "ایک بار پھر لکھیں",
    ruleLength: "کم از کم 8 حروف",
    ruleLetter: "ایک حرف موجود ہو",
    ruleNumber: "ایک ہندسہ موجود ہو",
    ruleMatch: "دونوں پاس ورڈ یکساں ہوں",
    creatingVault: "آپ کا والٹ بنایا جا رہا ہے…",
    createAccount: "اکاؤنٹ بنائیں",
    haveAccount: "پہلے سے رجسٹرڈ ہیں؟",
    noticeRegistered: "آپ کا والٹ بن گیا ہے۔ کھولنے کے لیے سائن اِن کریں۔",
    noticeSignedOut: "آپ سائن آؤٹ ہو گئے ہیں۔",
    noticeError: "یہ سائن اِن کوشش کامیاب نہیں ہوئی۔ دوبارہ کوشش کریں۔",
  },
  dashboard: {
    welcome: "خوش آمدید، {name}",
    leadEmpty:
      "آپ کا والٹ خالی ہے۔ کوئی دستاویز اپلوڈ کریں اور فیملی والٹ اسے پڑھ، درجہ بند اور خلاصہ کر دے گا۔",
    lead: "آج آپ کے خاندانی والٹ کی یہ حالت ہے۔",
    securityLine: "آپ کی حفاظت ہماری اولین ترجیح ہے۔ ہر دستاویز انکرپٹ رہتی ہے اور آپ کے اپنے سرور پر محفوظ رہتی ہے۔",
    uploadCta: "اپلوڈ",
    askCta: "اسسٹنٹ سے پوچھیں",
    statDocuments: "دستاویزات",
    statDocumentsHint:
      "{members} {members, plural, one {خاندانی پروفائل} other {خاندانی پروفائل}} · {categories} {categories, plural, one {قسم} other {اقسام}}",
    statExpiring: "جلد میعاد ختم",
    statExpired: "میعاد ختم",
    statStorage: "استعمال شدہ جگہ",
    statExpiringHint: "اگلے {days} دنوں میں",
    statExpiredHint: "تجدید درکار",
    statStorageHint: "والٹ کی تمام دستاویزات میں",
    statNeedsRenewing: "تجدید درکار",
    statNothingOverdue: "کچھ باقی نہیں",
    failedTitle: "{count} دستاویزات پر توجہ درکار",
    failedBody:
      "ان اپلوڈز کا تجزیہ ناکام رہا۔ فائلیں خود محفوظ ہیں اور دستاویز کے صفحے سے دوبارہ پراسیس کی جا سکتی ہیں۔",
    review: "جائزہ لیں",
    processingTitle: "{count} ابھی پراسیس ہو رہی ہیں",
    processingBody:
      "بڑے اسکین پر OCR اور درجہ بندی میں کچھ وقت لگ سکتا ہے۔ نتیجہ دیکھنے کے لیے صفحہ دوبارہ کھولیں۔",
    recentTitle: "حالیہ دستاویزات",
    recentLead: "حال ہی میں شامل کی گئی چھ دستاویزات",
    setupTitle: "اپنا والٹ ترتیب دیں",
    setupLead: "قابلِ تلاش اور میعاد کی نگرانی والا خاندانی آرکائیو، تین قدموں میں۔",
    stepFamily: "اپنے خاندان کو شامل کریں",
    stepFamilyBody: "ہر فرد کا پروفائل بنائیں تاکہ دستاویزات نام کے حساب سے محفوظ ہوں۔",
    stepUpload: "ایک دستاویز اپلوڈ کریں",
    stepUploadBody: "شناختی کارڈ، پاسپورٹ، سرٹیفکیٹ یا بل کی تصویر یا اسکین مناسب رہتا ہے۔",
    stepReview: "دیکھیں کیا نکالا گیا",
    stepReviewBody: "خانے، خلاصہ اور میعاد کی تاریخ دیکھیں، پھر غلطی درست کریں۔",
    uploadFirst: "اپنی پہلی دستاویز اپلوڈ کریں",
    byCategory: "قسم کے حساب سے",
    byCategoryLead: "والٹ کی تقسیم",
    remindersTitle: "میعاد کی یاد دہانیاں",
    remindersNone: "اگلے {days} دنوں میں کچھ نہیں",
    remindersSome: "{count} پر کارروائی درکار، قریب ترین پہلے",
    remindersEmpty:
      "میعاد کی تاریخیں آپ کی دستاویزات سے خودکار طور پر پڑھی جاتی ہیں۔ جو بھی {days} دنوں میں ختم ہو، یہاں دکھے گا۔",
    familyTitle: "خاندان",
    familyNone: "ابھی کوئی پروفائل نہیں",
    familySome: "{count} پروفائل",
    familyEmpty:
      "ہر فرد کا پروفائل شامل کریں اور آپ کی اپلوڈ کردہ ہر دستاویز اُن کے نام پر محفوظ ہو سکے گی۔",
    addSomeone: "کسی کو شامل کریں",
    assistantTitle: "اسسٹنٹ سے پوچھیں",
    assistantLead: "ہمارا AI آپ کی اپنی دستاویزات سے جواب دیتا ہے",
  },
  reminders: {
    title: "یاد دہانیاں",
    description: "وہ دستاویزات جو میعاد ختم ہو چکی ہیں یا اگلے {days} دنوں میں ہو جائیں گی۔",
    windowDays: "{days} دن",
    statExpiredHintRenew: "انہیں ابھی تجدید کریں",
    statExpiredHintOk: "کچھ باقی نہیں",
    statUpcoming: "اگلے {days} دن",
    statUpcomingHint: "قریب ترین پہلے ترتیب دیے گئے",
    statUntracked: "میعاد ریکارڈ نہیں",
    statUntrackedHint: "کبھی میعاد ختم نہ ہونے کے طور پر نشان زد",
    emptyTitle: "کسی چیز پر توجہ درکار نہیں",
    emptyBody:
      "آپ کے والٹ میں کوئی دستاویز اگلے {days} دنوں میں میعاد ختم نہیں ہو رہی۔ جو بھی ہو گی، اپلوڈ سے پڑھتے ہی خودکار طور پر یہاں دکھے گی۔",
    browseAll: "تمام دستاویزات دیکھیں",
    showingExpired: "صرف میعاد ختم شدہ دستاویزات دکھائی جا رہی ہیں",
    showAll: "تمام یاد دہانیاں دکھائیں",
    expiredCard: "{count} دستاویزات کی میعاد ختم ہو چکی ہے",
    expiringWithin: "اگلے {days} دنوں میں ختم ہونے والی",
    upcomingCard: "{count} کی منصوبہ بندی کریں",
    untrackedNote:
      "{count} دستاویزات کبھی میعاد ختم نہ ہونے کے طور پر نشان زد ہیں اور ان فہرستوں میں شامل نہیں۔",
    reviewThem: "ان کا جائزہ لیں",
  },
  calendar: {
    title: "میعاد کا کیلنڈر",
    description: "ہر میعاد کی تاریخ ایک ہی کیلنڈر پر، تاکہ دیکھ سکیں کہ کیا اور کب ختم ہو رہا ہے۔",
    viewReminders: "یاد دہانیاں",
    exportIcs: ".ics ایکسپورٹ کریں",
    prevMonth: "پچھلا مہینہ",
    nextMonth: "اگلا مہینہ",
    today: "آج",
    eventsCount: "{count} میعادیں",
    dayEmpty: "اس دن کوئی میعاد ختم نہیں ہوتی۔",
    legendExpired: "میعاد ختم",
    legendSoon: "جلد ختم ہونے والی",
    legendValid: "درست",
    addToGoogle: "گوگل کیلنڈر میں شامل کریں",
    openDocument: "دستاویز کھولیں",
    emptyTitle: "ابھی کوئی میعاد کی تاریخ نہیں",
    emptyBody:
      "ایک دستاویز اپلوڈ کریں اور جب اُس پر میعاد کی تاریخ درج ہو، وہ خودکار طور پر یہاں آ جائے گی۔",
  },
  assistant: {
    title: "اسسٹنٹ",
    description: "ہمارا AI آپ کی دستاویزات پڑھ کر آپ کے سوالوں کے جواب دیتا ہے — میعاد، افراد، اقسام یا آسان خلاصہ۔",
    placeholder: "اپنی دستاویزات کے بارے میں پوچھیں…",
    send: "بھیجیں",
    ask: "پوچھیں",
    thinking: "سوچ رہا ہے…",
    focusTitle: "“{title}” پر نظر",
    focusBody:
      "اسسٹنٹ پھر بھی پورے والٹ میں تلاش کرتا ہے، تاکہ اس دستاویز کو باقی کے ساتھ ملا کر جانچ سکے۔",
    openDocument: "دستاویز کھولیں",
    howTitle: "جواب کیسے تیار ہوتے ہیں",
    how1Title: "1. آپ کا سوال سمجھا جاتا ہے۔",
    how1Body: "اس سے نام، دستاویز کی اقسام، تاریخیں اور زمرے نکالے جاتے ہیں۔",
    how2Title: "2. والٹ میں تلاش ہوتی ہے۔",
    how2Body:
      "عنوانات، خلاصے، نکالے گئے خانے اور پڑھا گیا متن سوال کے مطابق جانچے جاتے ہیں — کسی دوسرے اکاؤنٹ کو چھوا نہیں جاتا۔",
    how3Title: "3. جواب لکھا جاتا ہے۔",
    how3Local: "بہترین نتائج آپ کے اپنے سرور پر مقامی طور پر ترکیب کیے جاتے ہیں۔",
    how4Title: "4. حوالہ جات درج کیے جاتے ہیں۔",
    how4Body: "ہر جواب اُن دستاویزات کے نام بتاتا ہے جن سے بنا، تاکہ آپ کھول کر جانچ سکیں۔",
    examplesTitle: "پوچھنے کے قابل باتیں",
    examples: [
      "اگلے تین مہینوں میں کیا میعاد ختم ہو رہا ہے؟",
      "کیا ہر بچے کا پیدائشی سرٹیفکیٹ موجود ہے؟",
      "کون سی جائیداد کی دستاویزات میں کرایہ داری کا ذکر ہے؟",
      "کسی ایک فرد کی تمام دستاویزات کی فہرست دیں۔",
      "آخری خون کے ٹیسٹ میں کیا آیا تھا؟",
      "کیا کوئی دستاویز ایسی ہے جس کی میعاد کی تاریخ درج ہونی چاہیے تھی مگر نہیں ہے؟",
    ],
    chatTitle: "دستاویزات کا اسسٹنٹ",
    noDocs: "ابھی تلاش کے لیے کوئی دستاویز نہیں",
    searchedSummary: "{total} میں سے {found} دستاویزات تلاش کی گئیں",
    searchingSummary: "{count} دستاویزات تلاش کی جا رہی ہیں",
    clearConversation: "گفتگو صاف کریں",
    cleared: "گفتگو صاف ہو گئی",
    emptyTitle: "اپنی دستاویزات کے بارے میں سوال پوچھیں",
    emptyNoDocs:
      "پہلے کچھ اپلوڈ کریں — اسسٹنٹ صرف اُسی سے جواب دیتا ہے جو آپ کے والٹ میں واقعی موجود ہو، اس لیے پڑھنے کے لیے دستاویزات درکار ہیں۔",
    emptyBody:
      "جواب آپ کی اپنی فائلوں سے بنتے ہیں اور ہمیشہ بتاتے ہیں کہ وہ کہاں سے آئے۔ کچھ بھی آپ کے سرور سے باہر نہیں جاتا۔",
    reading: "آپ کی دستاویزات پڑھی جا رہی ہیں…",
    inputNoDocs: "پہلے کوئی دستاویز اپلوڈ کریں…",
    inputLabel: "اپنے والٹ میں موجود کسی بھی چیز کے بارے میں پوچھیں",
    hintLine:
      "بھیجنے کے لیے Enter، نئی سطر کے لیے Shift + Enter۔ جواب آپ کی دستاویزات سے نقل کرتے ہیں — کسی نمبر یا تاریخ پر عمل کرنے سے پہلے حوالہ جات ضرور دیکھیں۔",
    fromCount: "{count} دستاویزات سے",
  },
  voice: {
    listen: "بولیں",
    listening: "سن رہا ہے…",
    readAloud: "بلند آواز میں پڑھیں",
    stop: "رکیں",
    speakLanguage: "آواز کی زبان",
    privacyNote: "آواز اسی ڈیوائس پر پراسیس ہوتی ہے۔ آڈیو کبھی اپلوڈ نہیں ہوتا۔",
    unsupported: "اس براؤزر میں آواز سے لکھنا دستیاب نہیں۔",
    preparing: "تیاری ہو رہی ہے…",
    requesting: "مائیکروفون کی اجازت مانگی جا رہی ہے…",
    transcriptReady: "تحریر تیار ہے: “{text}”",
    voiceUnavailable: "اِس زبان کی آواز اِس ڈیوائس پر انسٹال نہیں۔",
    downloadingModel: "تقریر کا ماڈل ڈاؤن لوڈ ہو رہا ہے… {percent}%",
    onDeviceBadge: "اسی ڈیوائس پر",
    modeNote: "مکمل طور پر اسی ڈیوائس پر چلتا ہے۔ آپ کی آواز کبھی اپلوڈ نہیں ہوتی۔",
    micDenied: "مائیکروفون کی اجازت مسدود کر دی گئی۔ براؤزر میں اجازت دیں اور دوبارہ کوشش کریں۔",
    modelFailed: "آواز کا ماڈل لوڈ نہیں ہو سکا۔ اپنا کنیکشن چیک کریں اور دوبارہ کوشش کریں۔",
    helpTitle: "آواز",
    helpBody:
      "مائیکروفون دبائیں اور انگریزی، اردو یا پنجابی میں بولیں۔ بلند آواز میں پڑھیں آپ کو جواب سناتا ہے۔",
    helpPrivacy: "آپ کی آواز اسی ڈیوائس پر سمجھی جاتی ہے اور کبھی اپلوڈ نہیں ہوتی۔",
    retry: "دوبارہ کوشش کریں",
  },
  offline: {
    bannerOffline: "آپ آف لائن ہیں — اِس ڈیوائس پر محفوظ اہم معلومات دکھائی جا رہی ہیں۔",
    cardTitle: "آف لائن اہم معلومات",
    cardDescription:
      "اپنی آنے والی میعاد کی تاریخیں اِسی ڈیوائس پر محفوظ رکھیں تاکہ انٹرنیٹ کے بغیر بھی موجود رہیں۔ ایک ایسی چابی سے انکرپٹ جو یہ براؤزر کبھی باہر نہیں بھیجتا، اور صرف تاریخیں اور عنوانات — آپ کی فائلیں ہرگز نہیں۔",
    enable: "آف لائن کے لیے محفوظ کریں",
    disable: "اِس ڈیوائس سے ہٹائیں",
    enabledLabel: "اِس ڈیوائس پر محفوظ",
    disabledLabel: "اِس ڈیوائس پر محفوظ نہیں",
    saving: "محفوظ ہو رہا ہے…",
    refreshing: "تازہ کیا جا رہا ہے…",
    updated: "محفوظ شدہ {when}",
    never: "ابھی محفوظ نہیں",
    saveFailed: "اِس ڈیوائس پر محفوظ نہیں ہو سکا۔",
    unavailable: "یہ براؤزر انکرپٹ شدہ آف لائن معلومات محفوظ نہیں کر سکتا۔",
    viewSnapshot: "آف لائن معلومات دیکھیں",
    pageTitle: "اہم معلومات",
    pageDescription: "اِس ڈیوائس پر محفوظ، انکرپٹ۔ آپ آف لائن ہیں اِس لیے دکھائی جا رہی ہیں۔",
    empty:
      "ابھی آف لائن استعمال کے لیے کچھ محفوظ نہیں۔ آن لائن ہو کر ایپ کھولیں اور سیٹنگز میں آف لائن اہم معلومات کو آن کریں۔",
    expiredLabel: "میعاد ختم",
    upcomingLabel: "آنے والی",
    nextLabel: "اگلی",
    openApp: "ایپ کھولیں",
    privacyLine: "صرف اِسی ڈیوائس پر سائفر ٹیکسٹ کے طور پر محفوظ۔ آپ کی دستاویزات سرور سے کبھی باہر نہیں جاتیں۔",
  },
};

export const DICTIONARIES: Record<Locale, Dictionary> = { en, ur };

export function isLocale(value: unknown): value is Locale {
  return value === "en" || value === "ur";
}

export function parseLocale(value: string | null | undefined): Locale {
  return isLocale(value) ? value : "en";
}

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
