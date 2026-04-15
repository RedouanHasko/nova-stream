import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type SupportedLanguage = "EN" | "FR" | "AR";

interface I18nContextType {
  language: SupportedLanguage;
  locale: string;
  dir: "ltr" | "rtl";
  setLanguage: (language: SupportedLanguage) => void;
  t: (key: string) => string;
}

const STORAGE_KEY = "nova_landing_language";

const LOCALE_MAP: Record<SupportedLanguage, string> = {
  EN: "en-US",
  FR: "fr-FR",
  AR: "ar-MA",
};

const translations: Record<
  Exclude<SupportedLanguage, "EN">,
  Record<string, string>
> = {
  FR: {
    HOME: "ACCUEIL",
    DOWNLOADS: "TELECHARGEMENTS",
    "ACTIVATE DEVICE": "ACTIVER L'APPAREIL",
    "MANAGE PLAYLISTS": "GERER LES PLAYLISTS",
    "HOW TO TUTORIALS": "GUIDES D'UTILISATION",
    SUPPORT: "ASSISTANCE",
    CONTACT: "CONTACT",
    "I'M RESELLER": "JE SUIS REVENDEUR",
    Language: "Langue",
    English: "Anglais",
    French: "Francais",
    Arabic: "Arabe",
    "The most advanced and user-friendly media player for your favorite content. Fast, secure, and supports all major formats.":
      "Le lecteur multimedia le plus avance et simple pour votre contenu prefere. Rapide, securise, et compatible avec les principaux formats.",
    "Quick Links": "Liens rapides",
    Home: "Accueil",
    Features: "Fonctionnalites",
    Pricing: "Tarifs",
    Devices: "Appareils",
    "Download App": "Telecharger l'application",
    "Help Center": "Centre d'aide",
    "Terms of Service": "Conditions d'utilisation",
    "Privacy Policy": "Politique de confidentialite",
    "Refund Policy": "Politique de remboursement",
    "Contact Us": "Contactez-nous",
    "Support contact form": "Formulaire de contact support",
    "All rights reserved.": "Tous droits reserves.",
    "Expert Support": "Support expert",
    "Facing technical challenges or have questions about activation? Our elite support team is standing by 24/7 to ensure your experience is flawless.":
      "Vous rencontrez un probleme technique ou une question sur l'activation ? Notre equipe de support est disponible 24h/24 et 7j/7 pour garantir une experience parfaite.",
    "Email Support": "Support e-mail",
    "Open support guidance and setup help":
      "Ouvrir l'aide support et la configuration",
    "Full Name": "Nom complet",
    "Email Address": "Adresse e-mail",
    Subject: "Sujet",
    Message: "Message",
    "Send Message": "Envoyer le message",
    "Support request": "Demande de support",
    "How can we help?": "Comment pouvons-nous vous aider ?",
    "Your message here...": "Votre message ici...",
    "Partner Ecosystem": "Ecosysteme partenaires",
    "Meet Our": "Decouvrez nos",
    Partner: "Partenaires",
    Applications: "Applications",
    "Trusted apps and player integrations powering smooth playback across the NOVA ecosystem.":
      "Des applications et integrations fiables pour une lecture fluide dans tout l'ecosysteme NOVA.",
    "Applications Catalog": "Catalogue des applications",
    "Explore Our": "Decouvrez",
    Our: "nos",
    "Our Applications": "applications",
    "Applications available directly from our system, ready for activation across the NOVA experience.":
      "Des applications disponibles directement depuis notre systeme, prêtes pour l'activation dans l'experience NOVA.",
    "Loading applications from the system...":
      "Chargement des applications depuis le systeme...",
    "No active applications published yet.":
      "Aucune application active n'a encore ete publiee.",
    "Coming Soon": "Bientot disponible",
    "More applications will appear here as they are published in the system.":
      "D'autres applications apparaitront ici lorsqu'elles seront publiees dans le systeme.",
    "Family Safety": "Securite familiale",
    "Guardians of Content:": "Gardiens du contenu :",
    "Unveiling Media Player's": "La puissance parentale de",
    "Parental Power": "NOVA Player",
    "Take full control of what your family watches. Our advanced parental control features allow you to lock specific channels, categories, or content types with a secure PIN, ensuring a safe and age-appropriate viewing experience for your children.":
      "Gardez le controle total de ce que votre famille regarde. Verrouillez chaines et categories avec un code PIN pour une experience adaptee aux enfants.",
    "PIN Lock": "Verrou PIN",
    "Category Filters": "Filtres de categories",
    "Instant Restriction": "Restriction instantanee",
    "Family Protection": "Protection familiale",
    "Every Screen": "Tous les ecrans",
    "Seamless Streaming": "Streaming fluide",
    "Across Every Screen": "sur tous les ecrans",
    "From your TV to your tablet or smartphone, our platform ensures a consistent and immersive viewing experience.":
      "De votre TV a votre tablette ou smartphone, notre plateforme garantit une experience immersive et coherente.",
    "Watch On The Go": "Regardez ou que vous soyez",
    "Mobile Ready": "Pret pour mobile",
    "Stream live TV, movies and series anywhere on your phone.":
      "Regardez la TV, films et series partout sur votre telephone.",
    "Subtitle Settings": "Parametres des sous-titres",
    "Subtitle Support": "Sous-titres",
    "Customize subtitles in size, color and background to suit your preference.":
      "Personnalisez la taille, la couleur et le fond des sous-titres.",
    "Rich Content Library": "Bibliotheque de contenu",
    "Browse thousands of movies and series in stunning 4K quality.":
      "Parcourez des milliers de films et series en qualite 4K.",
    "Smart Navigation": "Navigation intuitive",
    "Intuitive tablet and TV remote interface for effortless control.":
      "Interface tablette et telecommande TV pour un controle facile.",
    "Watch Now": "Regarder",
    Replay: "Replay",
    "Core Advantages": "Avantages principaux",
    "Engineered for": "Concu pour",
    "Pure Performance.": "la pure performance.",
    "Discover why NOVA PLAYER is the preferred choice for millions of users worldwide.":
      "Decouvrez pourquoi NOVA PLAYER est le choix prefere de millions d'utilisateurs.",
    "High Performance": "Haute performance",
    "Optimized for speed and smooth playback even on low-end devices.":
      "Optimise pour une lecture fluide meme sur des appareils modestes.",
    "Secure & Private": "Securise et prive",
    "Your data and playlists are encrypted and never shared with third parties.":
      "Vos donnees et playlists sont chiffrees et jamais partagees avec des tiers.",
    "User Friendly": "Simple a utiliser",
    "Intuitive interface designed for the best user experience on all screens.":
      "Interface intuitive pour la meilleure experience sur tous les ecrans.",
    "Multi-Device": "Multi-appareils",
    "Available on Android, iOS, Smart TVs, Firestick, and Web Browsers.":
      "Disponible sur Android, iOS, Smart TV, Firestick et navigateurs web.",
    "Advanced Settings": "Parametres avances",
    "Customize your player with parental control, EPG, and subtitles support.":
      "Personnalisez votre lecteur avec controle parental, EPG et sous-titres.",
    "Favorites List": "Liste des favoris",
    "Save your favorite channels and movies for quick and easy access.":
      "Enregistrez vos chaines et films preferes pour un acces rapide.",
    "Pricing Plans": "Plans tarifaires",
    "Premium Access.": "Acces premium.",
    "Unbeatable Value.": "Valeur imbattable.",
    "Choose the perfect plan to unlock the full potential of your media experience.":
      "Choisissez le plan ideal pour liberer tout le potentiel de votre experience media.",
    "Most Popular": "Le plus populaire",
    "Secure Payment": "Paiement securise",
    "Device Ecosystem": "Ecosysteme d'appareils",
    "Seamlessly Connected.": "Connexion transparente.",
    "Everywhere.": "Partout.",
    "NOVA Player is optimized for all your favorite platforms. One account, unlimited possibilities.":
      "NOVA Player est optimise pour toutes vos plateformes preferees. Un compte, possibilites illimitees.",
    "Watch NOVA Player with these compatible streaming devices":
      "Regardez NOVA Player sur ces appareils compatibles",
    "Smart TV": "Smart TV",
    "Samsung, LG, Sony, Android TV": "Samsung, LG, Sony, Android TV",
    "Android & iOS": "Android et iOS",
    "Phones and Tablets": "Telephones et tablettes",
    Firestick: "Firestick",
    "Amazon Fire TV Stick": "Amazon Fire TV Stick",
    "Windows & Mac": "Windows et Mac",
    "Desktop Applications": "Applications bureau",
    "Web Player": "Lecteur Web",
    "All Modern Browsers": "Tous les navigateurs modernes",
    "Apple TV": "Apple TV",
    "tvOS Support": "Support tvOS",
    "Frequently Asked": "Questions frequentes",
    Questions: "Questions",
    "Everything you need to know about NOVA Player and its features.":
      "Tout ce que vous devez savoir sur NOVA Player et ses fonctionnalites.",
    "See it in action": "Voyez-le en action",
    "Crisp 4K streaming · EPG guide · Thousands of channels":
      "Streaming 4K net · Guide EPG · Des milliers de chaines",
    "DOWNLOAD APP": "TELECHARGER L'APP",
    "Playback Engine": "Moteur de lecture",
    "Ultra-smooth adaptive streaming": "Streaming adaptatif ultra fluide",
    "Active users": "Utilisateurs actifs",
    Uptime: "Disponibilite",
    "Next Generation Media Player": "Lecteur multimedia nouvelle generation",
    "Redefining the": "Redefinir",
    "Future of Playback.": "l'avenir de la lecture.",
    "Step into the next era of media innovation. NOVA PLAYER is a high-performance masterpiece, engineered for those who demand pixel-perfect quality and lightning-fast streaming. Your content, your way, in stunning 4K clarity.":
      "Entrez dans une nouvelle ere multimedia avec NOVA PLAYER. Performance, fluidite et clarte 4K pour votre contenu, a votre facon.",
    "1.2M+ Active Users": "1,2M+ utilisateurs actifs",
    "Secured Activation": "Activation securisee",
    "NOVA Assistant": "Assistant NOVA",
    Online: "En ligne",
    "Type your message...": "Tapez votre message...",
    "Legal Disclaimer": "Avertissement legal",
    "NOVA PLAYER does not sell playlists or subscriptions. It is a video media player and does not offer channels or include any content. Clients must acquire content externally from our website. Please note, NOVA PLAYER is not responsible for the content utilized within our app. The app offers a 7-day trial period for testing purposes. After this period, a license must be purchased to continue using the app. Please be advised that there are no refunds after purchase.":
      "NOVA PLAYER ne vend pas de playlists ni d'abonnements. C'est un lecteur video sans contenu inclus. Une licence est necessaire apres 7 jours d'essai et les achats ne sont pas remboursables.",
    Manage: "Gerer",
    Playlists: "Playlists",
    Device: "Appareil",
    Activation: "Activation",
    "Manage your device, check expiration date and upload your playlists.":
      "Gerez votre appareil, verifiez la date d'expiration et telechargez vos playlists.",
    "Please verify that you are not a robot.":
      "Veuillez verifier que vous n'etes pas un robot.",
    "I'm not a robot": "Je ne suis pas un robot",
    "Login to Device": "Connexion a l'appareil",
    "Forgot Key?": "Cle oubliee ?",
    "Important Information": "Informations importantes",
    "How it works?": "Comment ca marche ?",
    "By logging in, you agree to our": "En vous connectant, vous acceptez nos",
    and: "et",
    "SSL Secure": "SSL securise",
    "Instant Access": "Acces instantane",
  },
  AR: {
    HOME: "الرئيسية",
    DOWNLOADS: "التنزيلات",
    "ACTIVATE DEVICE": "تفعيل الجهاز",
    "MANAGE PLAYLISTS": "إدارة القوائم",
    "HOW TO TUTORIALS": "دروس الاستخدام",
    SUPPORT: "الدعم",
    CONTACT: "اتصل بنا",
    "I'M RESELLER": "أنا موزع",
    Language: "اللغة",
    English: "الإنجليزية",
    French: "الفرنسية",
    Arabic: "العربية",
    "The most advanced and user-friendly media player for your favorite content. Fast, secure, and supports all major formats.":
      "أكثر مشغل وسائط تطورا وسهولة لمحتواك المفضل. سريع وآمن ويدعم معظم الصيغ.",
    "Quick Links": "روابط سريعة",
    Home: "الرئيسية",
    Features: "المميزات",
    Pricing: "الأسعار",
    Devices: "الأجهزة",
    "Download App": "تنزيل التطبيق",
    "Help Center": "مركز المساعدة",
    "Terms of Service": "شروط الخدمة",
    "Privacy Policy": "سياسة الخصوصية",
    "Refund Policy": "سياسة الاسترجاع",
    "Contact Us": "اتصل بنا",
    "Support contact form": "نموذج تواصل الدعم",
    "All rights reserved.": "جميع الحقوق محفوظة.",
    "Expert Support": "دعم احترافي",
    "Facing technical challenges or have questions about activation? Our elite support team is standing by 24/7 to ensure your experience is flawless.":
      "هل تواجه مشكلة تقنية أو لديك سؤال حول التفعيل؟ فريق الدعم متاح على مدار الساعة لضمان أفضل تجربة.",
    "Email Support": "الدعم عبر البريد",
    "Open support guidance and setup help":
      "افتح إرشادات الدعم والمساعدة في الإعداد",
    "Full Name": "الاسم الكامل",
    "Email Address": "البريد الإلكتروني",
    Subject: "الموضوع",
    Message: "الرسالة",
    "Send Message": "إرسال الرسالة",
    "Support request": "طلب دعم",
    "How can we help?": "كيف يمكننا مساعدتك؟",
    "Your message here...": "اكتب رسالتك هنا...",
    "Partner Ecosystem": "منظومة الشركاء",
    "Meet Our": "تعرّف على",
    Partner: "شركائنا",
    Applications: "وتطبيقاتهم",
    "Trusted apps and player integrations powering smooth playback across the NOVA ecosystem.":
      "تطبيقات وتكاملات موثوقة توفر تشغيلًا سلسًا ضمن منظومة NOVA.",
    "Applications Catalog": "كتالوج التطبيقات",
    "Explore Our": "استكشف",
    Our: "تطبيقاتنا",
    "Our Applications": "تطبيقاتنا",
    "Applications available directly from our system, ready for activation across the NOVA experience.":
      "تطبيقات متاحة مباشرة من نظامنا وجاهزة للتفعيل ضمن تجربة NOVA.",
    "Loading applications from the system...":
      "جار تحميل التطبيقات من النظام...",
    "No active applications published yet.": "لا توجد تطبيقات نشطة منشورة بعد.",
    "Coming Soon": "قريباً",
    "More applications will appear here as they are published in the system.":
      "ستظهر المزيد من التطبيقات هنا عند نشرها في النظام.",
    "Family Safety": "أمان العائلة",
    "Guardians of Content:": "حراس المحتوى:",
    "Unveiling Media Player's": "قوة التحكم الأبوي في",
    "Parental Power": "NOVA Player",
    "Take full control of what your family watches. Our advanced parental control features allow you to lock specific channels, categories, or content types with a secure PIN, ensuring a safe and age-appropriate viewing experience for your children.":
      "تحكم بالكامل فيما تشاهده عائلتك عبر قفل القنوات والتصنيفات برمز PIN لتجربة آمنة ومناسبة للأطفال.",
    "PIN Lock": "قفل PIN",
    "Category Filters": "فلاتر التصنيفات",
    "Instant Restriction": "تقييد فوري",
    "Family Protection": "حماية العائلة",
    "Every Screen": "كل شاشة",
    "Seamless Streaming": "بث سلس",
    "Across Every Screen": "عبر كل شاشة",
    "From your TV to your tablet or smartphone, our platform ensures a consistent and immersive viewing experience.":
      "من تلفازك إلى جهازك اللوحي أو هاتفك، تضمن منصتنا تجربة مشاهدة متسقة وغامرة.",
    "Watch On The Go": "شاهد في أي مكان",
    "Mobile Ready": "جاهز للجوال",
    "Stream live TV, movies and series anywhere on your phone.":
      "شاهد التلفاز والأفلام والمسلسلات في أي مكان على هاتفك.",
    "Subtitle Settings": "إعدادات الترجمة",
    "Subtitle Support": "دعم الترجمة",
    "Customize subtitles in size, color and background to suit your preference.":
      "خصص حجم الترجمة ولونها وخلفيتها حسب تفضيلك.",
    "Rich Content Library": "مكتبة محتوى غنية",
    "Browse thousands of movies and series in stunning 4K quality.":
      "تصفح آلاف الأفلام والمسلسلات بجودة 4K مذهلة.",
    "Smart Navigation": "تصفح ذكي",
    "Intuitive tablet and TV remote interface for effortless control.":
      "واجهة جهاز لوحي وتحكم تلفاز بديهية للتحكم السهل.",
    "Watch Now": "شاهد الآن",
    Replay: "إعادة",
    "Core Advantages": "المزايا الأساسية",
    "Engineered for": "مصمم من أجل",
    "Pure Performance.": "أداء خالص.",
    "Discover why NOVA PLAYER is the preferred choice for millions of users worldwide.":
      "اكتشف لماذا NOVA PLAYER هو الخيار المفضل لملايين المستخدمين.",
    "High Performance": "أداء عالٍ",
    "Optimized for speed and smooth playback even on low-end devices.":
      "محسّن للسرعة والتشغيل السلس حتى على الأجهزة الضعيفة.",
    "Secure & Private": "آمن وخاص",
    "Your data and playlists are encrypted and never shared with third parties.":
      "بياناتك وقوائمك مشفرة ولا تتم مشاركتها مع أي طرف ثالث.",
    "User Friendly": "سهل الاستخدام",
    "Intuitive interface designed for the best user experience on all screens.":
      "واجهة بديهية لتجربة ممتازة على جميع الشاشات.",
    "Multi-Device": "متعدد الأجهزة",
    "Available on Android, iOS, Smart TVs, Firestick, and Web Browsers.":
      "متاح على Android وiOS وSmart TV وFirestick ومتصفحات الويب.",
    "Advanced Settings": "إعدادات متقدمة",
    "Customize your player with parental control, EPG, and subtitles support.":
      "خصص المشغل مع التحكم الأبوي ودعم EPG والترجمة.",
    "Favorites List": "قائمة المفضلة",
    "Save your favorite channels and movies for quick and easy access.":
      "احفظ قنواتك وأفلامك المفضلة للوصول السريع.",
    "Pricing Plans": "خطط الأسعار",
    "Premium Access.": "وصول مميز.",
    "Unbeatable Value.": "قيمة لا تضاهى.",
    "Choose the perfect plan to unlock the full potential of your media experience.":
      "اختر الخطة المناسبة لفتح كامل إمكانيات تجربتك.",
    "Most Popular": "الأكثر شيوعًا",
    "Secure Payment": "دفع آمن",
    "Device Ecosystem": "منظومة الأجهزة",
    "Seamlessly Connected.": "اتصال سلس.",
    "Everywhere.": "في كل مكان.",
    "NOVA Player is optimized for all your favorite platforms. One account, unlimited possibilities.":
      "NOVA Player مُحسّن لجميع منصاتك المفضلة. حساب واحد وإمكانيات غير محدودة.",
    "Watch NOVA Player with these compatible streaming devices":
      "شاهد NOVA Player على هذه الأجهزة المتوافقة",
    "Smart TV": "تلفاز ذكي",
    "Samsung, LG, Sony, Android TV": "Samsung وLG وSony وAndroid TV",
    "Android & iOS": "Android وiOS",
    "Phones and Tablets": "هواتف وأجهزة لوحية",
    Firestick: "Firestick",
    "Amazon Fire TV Stick": "Amazon Fire TV Stick",
    "Windows & Mac": "Windows وMac",
    "Desktop Applications": "تطبيقات سطح المكتب",
    "Web Player": "مشغل الويب",
    "All Modern Browsers": "جميع المتصفحات الحديثة",
    "Apple TV": "Apple TV",
    "tvOS Support": "دعم tvOS",
    "Frequently Asked": "الأسئلة الشائعة",
    Questions: "الأسئلة",
    "Everything you need to know about NOVA Player and its features.":
      "كل ما تحتاج معرفته عن NOVA Player وميزاته.",
    "See it in action": "شاهده أثناء العمل",
    "Crisp 4K streaming · EPG guide · Thousands of channels":
      "بث 4K واضح · دليل EPG · آلاف القنوات",
    "DOWNLOAD APP": "تنزيل التطبيق",
    "Playback Engine": "محرك التشغيل",
    "Ultra-smooth adaptive streaming": "بث تكيفي فائق السلاسة",
    "Active users": "مستخدمون نشطون",
    Uptime: "جاهزية",
    "Next Generation Media Player": "مشغل وسائط من الجيل القادم",
    "Redefining the": "إعادة تعريف",
    "Future of Playback.": "مستقبل التشغيل.",
    "Step into the next era of media innovation. NOVA PLAYER is a high-performance masterpiece, engineered for those who demand pixel-perfect quality and lightning-fast streaming. Your content, your way, in stunning 4K clarity.":
      "ادخل عصرًا جديدًا من الابتكار مع NOVA PLAYER: أداء قوي وجودة دقيقة وبث سريع ومحتواك بطريقتك بدقة 4K.",
    "1.2M+ Active Users": "+1.2 مليون مستخدم نشط",
    "Secured Activation": "تفعيل آمن",
    "NOVA Assistant": "مساعد NOVA",
    Online: "متصل",
    "Type your message...": "اكتب رسالتك...",
    "Legal Disclaimer": "إخلاء مسؤولية قانوني",
    "NOVA PLAYER does not sell playlists or subscriptions. It is a video media player and does not offer channels or include any content. Clients must acquire content externally from our website. Please note, NOVA PLAYER is not responsible for the content utilized within our app. The app offers a 7-day trial period for testing purposes. After this period, a license must be purchased to continue using the app. Please be advised that there are no refunds after purchase.":
      "لا يبيع NOVA PLAYER قوائم تشغيل أو اشتراكات. هو مشغل وسائط فقط ولا يقدم محتوى. توجد فترة تجريبية 7 أيام وبعدها يلزم شراء ترخيص. لا يوجد استرداد بعد الشراء.",
    Manage: "إدارة",
    Playlists: "القوائم",
    Device: "الجهاز",
    Activation: "التفعيل",
    "Manage your device, check expiration date and upload your playlists.":
      "أدر جهازك وتحقق من تاريخ الانتهاء وارفع قوائم التشغيل.",
    "Please verify that you are not a robot.": "يرجى التحقق أنك لست روبوتًا.",
    "I'm not a robot": "أنا لست روبوتًا",
    "Login to Device": "تسجيل الدخول للجهاز",
    "Forgot Key?": "نسيت المفتاح؟",
    "Important Information": "معلومات مهمة",
    "How it works?": "كيف يعمل؟",
    "By logging in, you agree to our": "بتسجيل الدخول فإنك توافق على",
    and: "و",
    "SSL Secure": "SSL آمن",
    "Instant Access": "وصول فوري",
  },
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function isSupportedLanguage(value: string | null): value is SupportedLanguage {
  return value === "EN" || value === "FR" || value === "AR";
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const stored =
      typeof window !== "undefined"
        ? window.localStorage.getItem(STORAGE_KEY)
        : null;
    return isSupportedLanguage(stored) ? stored : "EN";
  });

  const locale = LOCALE_MAP[language];
  const dir: "ltr" = "ltr";

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, language);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [language, locale, dir]);

  const t = useMemo(() => {
    return (key: string) => {
      if (language === "EN") {
        return key;
      }
      return translations[language][key] || key;
    };
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      locale,
      dir,
      setLanguage: setLanguageState,
      t,
    }),
    [language, locale, dir, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
