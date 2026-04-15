import React, {
  createContext,
  useCallback,
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
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LANGUAGE_STORAGE_KEY = "stream_panel_language";

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
    "Search...": "Rechercher...",
    "Select language": "Choisir la langue",
    Language: "Langue",
    "Choose your panel language": "Choisissez la langue du panneau",
    "Toggle theme": "Changer le thème",
    Notifications: "Notifications",
    "You're all caught up": "Tout est à jour",
    "1 unread update": "1 mise à jour non lue",
    "{{count}} unread updates": "{{count}} mises à jour non lues",
    "Mark all read": "Tout marquer comme lu",
    "Loading notifications...": "Chargement des notifications...",
    "No notifications yet.": "Aucune notification pour le moment.",
    "Show all": "Voir tout",
    Account: "Compte",
    "System Settings": "Paramètres système",
    Logout: "Déconnexion",
    Credits: "Crédits",
    Dashboard: "Tableau de bord",
    "Device Management": "Gestion des appareils",
    "Playlist Checker/Converter": "Vérificateur/Convertisseur de playlist",
    Reseller: "Revendeur",
    "Apps Management": "Gestion des applications",
    Settings: "Paramètres",
    Pages: "Pages",
    "Super Admin": "Super administrateur",
    "Sub-Reseller": "Sous-revendeur",
    "Sign in to your account": "Connectez-vous à votre compte",
    "Secure access for admins, resellers, and sub-resellers.":
      "Accès sécurisé pour les administrateurs, revendeurs et sous-revendeurs.",
    "Need help signing in?": "Besoin d’aide pour vous connecter ?",
    "Use the language and theme controls above to personalize your login experience.":
      "Utilisez les contrôles de langue et de thème ci-dessus pour personnaliser votre expérience de connexion.",
    "Forgot password?": "Mot de passe oublié ?",
    "Show password": "Afficher le mot de passe",
    "Hide password": "Masquer le mot de passe",
    "Phone number is required for password recovery and notifications.":
      "Le numéro de téléphone est requis pour la récupération du mot de passe et les notifications.",
    "Make sure this phone number is correct. It may be needed to recover the account if the user loses their credentials.":
      "Assurez-vous que ce numéro de téléphone est correct. Il pourra être nécessaire pour récupérer le compte si l’utilisateur perd ses identifiants.",
    "If you want a login account, please provide both email and password.":
      "Si vous souhaitez un compte de connexion, veuillez fournir à la fois l’e-mail et le mot de passe.",
    "Please provide the sub-reseller name, email, phone number, and password before creating the account.":
      "Veuillez renseigner le nom, l’e-mail, le numéro de téléphone et le mot de passe du sous-revendeur avant de créer le compte.",
    "Please enter the account email first.":
      "Veuillez d’abord saisir l’e-mail du compte.",
    "Please provide the registered phone number.":
      "Veuillez saisir le numéro de téléphone enregistré.",
    "Please enter a new password with at least 8 characters.":
      "Veuillez saisir un nouveau mot de passe d’au moins 8 caractères.",
    "The new passwords do not match.":
      "Les nouveaux mots de passe ne correspondent pas.",
    "Registered phone number": "Numéro de téléphone enregistré",
    "Verification code": "Code de vérification",
    "New password": "Nouveau mot de passe",
    "Confirm new password": "Confirmer le nouveau mot de passe",
    "Reset password": "Réinitialiser le mot de passe",
    "Send code": "Envoyer le code",
    "Sending...": "Envoi en cours...",
    "Development code": "Code de développement",
    "Please enter the verification code sent by SMS.":
      "Veuillez saisir le code de vérification envoyé par SMS.",
    "Please enter the verification code sent to your phone.":
      "Veuillez saisir le code de vérification envoyé sur votre téléphone.",
    "Verification code sent to your phone.":
      "Un code de vérification a été envoyé à votre téléphone.",
    "Unable to send the verification code right now.":
      "Impossible d’envoyer le code de vérification pour le moment.",
    "Confirm your account with the registered phone number, request an SMS code, then choose a new password.":
      "Confirmez votre compte avec le numéro de téléphone enregistré, demandez un code SMS, puis choisissez un nouveau mot de passe.",
    "Confirm your account with the registered phone number, request a verification code, then choose a new password.":
      "Confirmez votre compte avec le numéro de téléphone enregistré, demandez un code de vérification, puis choisissez un nouveau mot de passe.",
    "Password reset successful. You can now sign in with your new password.":
      "Le mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec le nouveau mot de passe.",
    "Unable to reset the password right now.":
      "Impossible de réinitialiser le mot de passe pour le moment.",
    "Invalid email or password": "E-mail ou mot de passe invalide",
    "Email address": "Adresse e-mail",
    Password: "Mot de passe",
    "Password reset isn't automated yet. Please contact your administrator or support team to restore access.":
      "La réinitialisation du mot de passe n’est pas encore automatisée. Veuillez contacter votre administrateur ou l’équipe d’assistance pour récupérer l’accès.",
    "Password reset isn't automated yet. Please contact your administrator and mention {{email}}.":
      "La réinitialisation du mot de passe n’est pas encore automatisée. Veuillez contacter votre administrateur et mentionner {{email}}.",
    "Signing in...": "Connexion en cours...",
    "Sign in": "Se connecter",
    "Check MAC": "Vérifier la MAC",
    "Switch MAC": "Changer la MAC",
    "Multi Apps Activation": "Activation multi-apps",
    "Activated Apps List": "Liste des apps activées",
    "Direct Subscriptions": "Abonnements directs",
    "Add Playlist": "Ajouter une playlist",
    "Reset Playlist": "Réinitialiser la playlist",
    "Change Domain Url": "Changer l'URL du domaine",
    "You do not have access to any features in this section.":
      "Vous n'avez accès à aucune fonctionnalité dans cette section.",
    "Manage device activations, switch MAC addresses, and configure playlists.":
      "Gérez les activations des appareils, changez les adresses MAC et configurez les playlists.",
    "Profile Settings": "Paramètres du profil",
    "Security & Password": "Sécurité et mot de passe",
    "Reseller Branding": "Image de marque du revendeur",
    "Security Policies": "Politiques de sécurité",
    "API & Integrations": "API et intégrations",
    "Pricing Plans": "Plans tarifaires",
    "Global App Settings": "Paramètres globaux des applications",
    "Account Settings": "Paramètres du compte",
    "Manage global system configurations, security policies, and administrative tools.":
      "Gérez les configurations globales du système, les politiques de sécurité et les outils administratifs.",
    "Manage your personal account settings, branding, and notification preferences.":
      "Gérez vos paramètres personnels, votre image de marque et vos préférences de notification.",
    General: "Général",
    Business: "Activité",
    Administration: "Administration",
    "Available Plans": "Plans disponibles",
    "Plans Management": "Gestion des plans",
    "Credit Point Share Logs": "Journaux de partage de crédits",
    "Withdraw Point Share Logs": "Journaux des retraits de crédits",
    "My Requests": "Mes demandes",
    "Request Credits": "Demander des crédits",
    "Return Credits": "Retourner des crédits",
    "Pending Requests": "Demandes en attente",
    "Credit Management": "Gestion des crédits",
    "Manage pricing plans, monitor reseller credit activity, and review all system credit movements.":
      "Gérez les plans tarifaires, surveillez l'activité des crédits revendeur et consultez tous les mouvements de crédits.",
    "My Credits & Plans": "Mes crédits et plans",
    "Review available recharge plans, purchase credits, and manage transfers with your sub-resellers.":
      "Consultez les plans de recharge, achetez des crédits et gérez les transferts avec vos sous-revendeurs.",
    "My Credits": "Mes crédits",
    "Request or return credits and track your own credit activity in one place.":
      "Demandez ou retournez des crédits et suivez votre activité depuis un seul endroit.",
    "Manual Credit Action": "Action manuelle sur les crédits",
    "Transfer Credits": "Transférer des crédits",
    "Manage Plans": "Gérer les plans",
    "View & Purchase Plans": "Voir et acheter des plans",
    "System Credit Balance": "Solde global des crédits",
    "Available Balance": "Solde disponible",
    "Credits Issued (30d)": "Crédits émis (30 j)",
    "Credits Received (30d)": "Crédits reçus (30 j)",
    "Credits Revoked (30d)": "Crédits révoqués (30 j)",
    "Credits Spent (30d)": "Crédits dépensés (30 j)",
    Unlimited: "Illimité",
    "Dashboard Overview": "Vue d'ensemble",
    "Download Report": "Télécharger le rapport",
    "Activate Device": "Activer un appareil",
    "Total Active Devices": "Total des appareils actifs",
    "Total Resellers": "Total des revendeurs",
    "Monthly Revenue": "Revenu mensuel",
    "My Active Devices": "Mes appareils actifs",
    "My Sub-Resellers": "Mes sous-revendeurs",
    "Available Credits": "Crédits disponibles",
    "Activations & Revenue": "Activations et revenus",
    "My Activations": "Mes activations",
    "Last 6 Months": "6 derniers mois",
    "System Status": "État du système",
    "API Servers": "Serveurs API",
    Operational: "Opérationnel",
    Database: "Base de données",
    "Auth Service": "Service d'authentification",
    "Account Status": "État du compte",
    Active: "Actif",
    "Credit Limit": "Limite de crédit",
    "Quick Links": "Liens rapides",
    "Add Reseller": "Ajouter un revendeur",
    "Manage Credits": "Gérer les crédits",
    "View Logs": "Voir les journaux",
    "Recent Transactions": "Transactions récentes",
    "Search transactions...": "Rechercher des transactions...",
    All: "Tous",
    "Transaction ID": "ID de transaction",
    User: "Utilisateur",
    Type: "Type",
    Amount: "Montant",
    "Notes / Details": "Notes / Détails",
    Date: "Date",
    Status: "Statut",
    ACTIVE: "ACTIF",
    INACTIVE: "INACTIF",
    EXPIRED: "EXPIRÉ",
    BLOCKED: "BLOQUÉ",
    "Welcome to NOVA Panel — manage your workspace with ease. If you face any issue, please report it through the support link we will provide here soon.":
      "Bienvenue sur NOVA Panel — gérez votre espace de travail facilement. Si vous rencontrez un problème, veuillez le signaler via le lien d'assistance qui sera ajouté bientôt.",
    "No transactions found matching your filters.":
      "Aucune transaction ne correspond à vos filtres.",
    Tabs: "Onglets",
    "Loading...": "Chargement...",
    "Show data as table": "Afficher les données en tableau",
    "Table view": "Vue tableau",
    Table: "Tableau",
    "Show data as cards": "Afficher les données en cartes",
    "Card view": "Vue cartes",
    Cards: "Cartes",
    "Close confirmation modal": "Fermer la fenêtre de confirmation",
    "Tools for checking, converting, and managing IPTV playlists.":
      "Outils pour vérifier, convertir et gérer les playlists IPTV.",
    "Playlist Checker": "Vérificateur de playlist",
    "Playlist Converter": "Convertisseur de playlist",
    "Free IPTV Status Checker": "Vérificateur d’état IPTV gratuit",
    "Check your IPTV account status, expiration date, and connection limits in seconds. Secure, fast, and completely free IPTV verification tool.":
      "Vérifiez en quelques secondes l’état de votre compte IPTV, sa date d’expiration et ses limites de connexion. Outil de vérification IPTV sécurisé, rapide et totalement gratuit.",
    "IPTV URL": "URL IPTV",
    "Enter your IPTV URL with username and password parameters":
      "Entrez votre URL IPTV avec les paramètres nom d’utilisateur et mot de passe",
    "Check Status": "Vérifier l’état",
    About: "À propos",
    "Frequently Asked Questions": "Questions fréquentes",
    "Is my IPTV URL safe?": "Mon URL IPTV est-elle sécurisée ?",
    "Yes, your IPTV URL is processed securely and is never stored on our servers or shared with third parties.":
      "Oui, votre URL IPTV est traitée de manière sécurisée et n’est jamais stockée sur nos serveurs ni partagée avec des tiers.",
    "What information can I check?": "Quelles informations puis-je vérifier ?",
    "You can check your account status, subscription expiration date, connection limits, and server information.":
      "Vous pouvez vérifier l’état de votre compte, la date d’expiration de l’abonnement, les limites de connexion et les informations du serveur.",
    "Why is my check failing?": "Pourquoi ma vérification échoue-t-elle ?",
    "Make sure your IPTV URL is correct and includes the username and password parameters. The server must also be online and accessible.":
      "Assurez-vous que votre URL IPTV est correcte et inclut les paramètres de nom d’utilisateur et mot de passe. Le serveur doit également être en ligne et accessible.",
    "How often can I check my status?":
      "À quelle fréquence puis-je vérifier mon statut ?",
    "You can check your IPTV status as often as needed. There are no limits on the number of checks you can perform.":
      "Vous pouvez vérifier votre statut IPTV aussi souvent que nécessaire. Il n’y a aucune limite au nombre de vérifications.",
    "M3U URL Converter": "Convertisseur d’URL M3U",
    "Convert your IPTV credentials to M3U playlist URLs or parse existing URLs":
      "Convertissez vos identifiants IPTV en URL de playlist M3U ou analysez des URL existantes",
    "Create URL": "Créer une URL",
    "Parse URL": "Analyser l’URL",
    "Hostname *": "Nom d’hôte *",
    "Include http:// prefix": "Inclure le préfixe http://",
    Username: "Nom d’utilisateur",
    "Paste M3U URL": "Coller l’URL M3U",
    "Your Hostname": "Votre nom d’hôte",
    "Your username": "Votre nom d’utilisateur",
    "Your password": "Votre mot de passe",
    "Paste your M3U URL here...": "Collez votre URL M3U ici...",
    Clear: "Effacer",
    "Convert to M3U URL": "Convertir en URL M3U",
    "How to Create M3U URLs": "Comment créer des URL M3U",
    "Enter Your IPTV Server Details:":
      "Entrez les détails de votre serveur IPTV :",
    "Input your IPTV provider's hostname. Make sure to include the protocol (http://).":
      "Saisissez le nom d’hôte de votre fournisseur IPTV. Assurez-vous d’inclure le protocole (http://).",
    "Add Authentication Credentials:":
      "Ajouter les identifiants d’authentification :",
    "Enter your username and password.":
      "Entrez votre nom d’utilisateur et votre mot de passe.",
    "Generate Your M3U URL:": "Générez votre URL M3U :",
    'Click "Convert to M3U URL" to generate your playlist URL.':
      'Cliquez sur "Convertir en URL M3U" pour générer l’URL de votre playlist.',
    "How to Parse Existing M3U URLs": "Comment analyser des URL M3U existantes",
    "Paste Your M3U URL:": "Collez votre URL M3U :",
    "Copy and paste any M3U playlist URL into the text area.":
      "Copiez et collez n’importe quelle URL de playlist M3U dans la zone de texte.",
    "Extract Information:": "Extraire les informations :",
    'Click "Parse URL" to automatically extract the components.':
      'Cliquez sur "Analyser l’URL" pour extraire automatiquement les composants.',
    "Copy Individual Components:": "Copier les composants individuellement :",
    "Each extracted component can be copied individually.":
      "Chaque composant extrait peut être copié individuellement.",
    "What is M3U and Why Use This Tool?":
      "Qu’est-ce que le M3U et pourquoi utiliser cet outil ?",
    "Understanding M3U Format": "Comprendre le format M3U",
    "M3U is a computer file format for a multimedia playlist. Originally developed for audio files, M3U is now widely used for IPTV streaming.":
      "M3U est un format de fichier informatique pour les playlists multimédias. Initialement développé pour l’audio, il est désormais largement utilisé pour le streaming IPTV.",
    "Benefits of Our M3U Tool": "Avantages de notre outil M3U",
    "Instant Conversion": "Conversion instantanée",
    "Reverse Engineering": "Ingénierie inverse",
    "No Registration Required": "Aucune inscription requise",
    "Privacy Focused": "Axé sur la confidentialité",
    "M3U Plus": "M3U Plus",
    "Extended M3U format with metadata support.":
      "Format M3U étendu avec prise en charge des métadonnées.",
    "Transport Stream": "Flux de transport",
    "Optimized for streaming with TS output.":
      "Optimisé pour le streaming avec sortie TS.",
    "Fast & Reliable": "Rapide et fiable",
    "Quick URL generation and parsing.":
      "Génération et analyse rapides des URL.",
    "Check Device Activation": "Vérifier l’activation de l’appareil",
    "Verify activation using the device MAC address and player-generated key.":
      "Vérifiez l’activation à l’aide de l’adresse MAC de l’appareil et de la clé générée par le lecteur.",
    "Select Module": "Sélectionner le module",
    "All Modules": "Tous les modules",
    "MAC Address": "Adresse MAC",
    "Format: 12 hexadecimal digits separated by colons.":
      "Format : 12 chiffres hexadécimaux séparés par des deux-points.",
    "Device Key": "Clé de l’appareil",
    "Enter the player-generated key": "Entrez la clé générée par le lecteur",
    "Player-generated device key": "Clé d’appareil générée par le lecteur",
    "Use the same key shown inside the IPTV player application on the device.":
      "Utilisez la même clé affichée dans l’application IPTV sur l’appareil.",
    "Enter a valid MAC address (12 hex digits)":
      "Entrez une adresse MAC valide (12 caractères hexadécimaux)",
    "Enter the player device key": "Entrez la clé de l’appareil du lecteur",
    "Failed to check device": "Échec de la vérification de l’appareil",
    "Checking...": "Vérification...",
    "Check Device": "Vérifier l’appareil",
    "Device Found": "Appareil trouvé",
    "Device Not Found": "Appareil introuvable",
    Verification: "Vérification",
    "Key mismatch": "Clé non correspondante",
    Verified: "Vérifié",
    Expired: "Expiré",
    "No active apps": "Aucune application active",
    Unknown: "Inconnu",
    "Owner Reseller ID": "ID du revendeur propriétaire",
    Registered: "Enregistré",
    "The provided device key does not match the key saved for this MAC address.":
      "La clé fournie ne correspond pas à celle enregistrée pour cette adresse MAC.",
    "This device has expired activations. Renew the app activation or reactivate it from the panel to restore access.":
      "Les activations de cet appareil ont expiré. Renouvelez l’activation de l’application ou réactivez-la depuis le panneau pour rétablir l’accès.",
    "Applications Found": "Applications trouvées",
    Activated: "Activé",
    Expires: "Expire le",
    "No expiry set": "Aucune expiration définie",
    "Linked Playlists": "Playlists liées",
    "Target app: {{app}}": "Application cible : {{app}}",
    "Target app ID: {{id}}": "ID de l’application cible : {{id}}",
    "Available to this device": "Disponible pour cet appareil",
    "No device with MAC address": "Aucun appareil avec l’adresse MAC",
    "was found in the system.": "n’a été trouvé dans le système.",
    "Switch MAC Address": "Changer l’adresse MAC",
    "Transfer an active subscription from an old device to a new one.":
      "Transférez un abonnement actif d’un ancien appareil vers un nouveau.",
    "Select a module": "Sélectionnez un module",
    "Old MAC Address": "Ancienne adresse MAC",
    "New MAC Address": "Nouvelle adresse MAC",
    "Enter both MAC addresses": "Entrez les deux adresses MAC",
    "Transfer successful": "Transfert réussi",
    "Transfer failed": "Échec du transfert",
    "Transferring...": "Transfert en cours...",
    "Transfer Subscription": "Transférer l’abonnement",
    "Enter a MAC address": "Entrez une adresse MAC",
    "Select at least one app": "Sélectionnez au moins une application",
    "Activation successful": "Activation réussie",
    "Activation failed": "Échec de l’activation",
    "Please note that each App should be installed before activating!":
      "Veuillez noter que chaque application doit être installée avant l’activation !",
    "You can select up to 4 Apps Max, for 1 year 1-credit & for Lifetime 2-credits will be debited from your account":
      "Vous pouvez sélectionner jusqu’à 4 applications maximum ; 1 crédit sera débité pour 1 an et 2 crédits pour l’accès à vie.",
    "Select Applications": "Sélectionner des applications",
    "Fetching App Catalog...": "Récupération du catalogue d’applications...",
    "No applications available in the catalog.":
      "Aucune application n’est disponible dans le catalogue.",
    "Select Duration": "Sélectionner la durée",
    "1-Year Activation": "Activation d’un an",
    "Standard 1 Credit activation": "Activation standard à 1 crédit",
    "Lifetime Activation": "Activation à vie",
    "Unlimited access for 2 Credits": "Accès illimité pour 2 crédits",
    "Device Settings": "Paramètres de l’appareil",
    "Use the unique key shown inside the IPTV player app on this device.":
      "Utilisez la clé unique affichée dans l’application IPTV sur cet appareil.",
    "Remarks (Optional)": "Remarques (facultatif)",
    "Note about this activation...": "Note sur cette activation...",
    "Total Cost": "Coût total",
    "Activating...": "Activation...",
    "Activate Now": "Activer maintenant",
    "Check app details before activation":
      "Vérifiez les détails de l’application avant l’activation",
    "Make sure you select the correct app and version before continuing.":
      "Assurez-vous de sélectionner la bonne application et la bonne version avant de continuer.",
    "Failed to load activated apps.":
      "Échec du chargement des applications activées.",
    "This row is missing a valid device record.":
      "Cette ligne ne contient pas d’enregistrement d’appareil valide.",
    "Enter a valid MAC address before saving.":
      "Entrez une adresse MAC valide avant d’enregistrer.",
    "Device {{mac}} has been blocked.": "L’appareil {{mac}} a été bloqué.",
    "Device {{mac}} was updated successfully.":
      "L’appareil {{mac}} a été mis à jour avec succès.",
    "Failed to update this device.": "Échec de la mise à jour de cet appareil.",
    "The device and its linked activations were deleted.":
      "L’appareil et ses activations liées ont été supprimés.",
    "Failed to delete this device.": "Échec de la suppression de cet appareil.",
    "View and filter the active and expired app activations under your account.":
      "Affichez et filtrez les activations d’applications actives et expirées de votre compte.",
    "Search MAC, key, or app...":
      "Rechercher une MAC, une clé ou une application...",
    "Hide Filters": "Masquer les filtres",
    "Filter activated apps by application":
      "Filtrer les applications activées par application",
    "All Applications": "Toutes les applications",
    Application: "Application",
    "Activation Date": "Date d’activation",
    "Expiry Date": "Date d’expiration",
    Actions: "Actions",
    "Manage Device": "Gérer l’appareil",
    "No activated apps found matching your filters.":
      "Aucune application activée ne correspond à vos filtres.",
    "Showing all": "Affichage de",
    results: "résultats",
    "Update the device info, block access, or delete the device.":
      "Mettez à jour les informations de l’appareil, bloquez l’accès ou supprimez l’appareil.",
    "Close device management dialog":
      "Fermer la fenêtre de gestion de l’appareil",
    "Device Status": "Statut de l’appareil",
    Inactive: "Inactif",
    Blocked: "Bloqué",
    "Activation Status": "Statut d’activation",
    "Unblock Device": "Débloquer l’appareil",
    "Block Device": "Bloquer l’appareil",
    "Delete Device": "Supprimer l’appareil",
    "Saving...": "Enregistrement...",
    "Save Changes": "Enregistrer les modifications",
    "Delete this device?": "Supprimer cet appareil ?",
    "This will remove the device and its linked activations from the panel. This action cannot be undone.":
      "Cela supprimera l’appareil et ses activations liées du panneau. Cette action est irréversible.",
    "Deleting...": "Suppression...",
    "MAC and playlist name are required":
      "L’adresse MAC et le nom de la playlist sont requis",
    "Choose which app should receive this playlist":
      "Choisissez l’application qui doit recevoir cette playlist",
    "Enter a valid M3U URL": "Entrez une URL M3U valide",
    "Enter the Xtream host, username, and password":
      "Entrez l’hôte Xtream, le nom d’utilisateur et le mot de passe",
    "Playlist assigned successfully": "Playlist attribuée avec succès",
    "Failed to assign playlist": "Échec de l’attribution de la playlist",
    "Upload M3U URLs or Xtream Codes credentials to a specific MAC address.":
      "Ajoutez des URL M3U ou des identifiants Xtream Codes à une adresse MAC spécifique.",
    "Target Application": "Application cible",
    "Loading apps...": "Chargement des applications...",
    "Select the app to update": "Sélectionnez l’application à mettre à jour",
    "The playlist will be linked to this app for the selected MAC address.":
      "La playlist sera liée à cette application pour l’adresse MAC sélectionnée.",
    "Playlist Name": "Nom de la playlist",
    "e.g., Premium Sports, Movies List": "ex. Sports Premium, Liste Films",
    "Playlist Type": "Type de playlist",
    "M3U Link": "Lien M3U",
    "Xtream Codes": "Codes Xtream",
    "Host URL / Portal": "URL de l’hôte / Portail",
    "Save Playlist": "Enregistrer la playlist",
    "Clear all playlists associated with a specific MAC address. This action cannot be undone.":
      "Effacez toutes les playlists associées à une adresse MAC spécifique. Cette action est irréversible.",
    Attention: "Attention",
    "Resetting the playlist will permanently delete all M3U links and Xtream Codes credentials associated with the provided MAC address. The user will need to re-enter their playlist information.":
      "La réinitialisation de la playlist supprimera définitivement tous les liens M3U et les identifiants Xtream Codes associés à l’adresse MAC fournie. L’utilisateur devra saisir à nouveau ses informations de playlist.",
    "MAC Address to Reset": "Adresse MAC à réinitialiser",
    "Playlists reset successfully": "Playlists réinitialisées avec succès",
    "Reset failed": "Échec de la réinitialisation",
    "Resetting...": "Réinitialisation...",
    "Reset Playlists Now": "Réinitialiser les playlists maintenant",
    "Reset playlists?": "Réinitialiser les playlists ?",
    "This will delete all playlists for the selected MAC address. This action cannot be undone.":
      "Cela supprimera toutes les playlists pour l’adresse MAC sélectionnée. Cette action est irréversible.",
    "Reset now": "Réinitialiser maintenant",
    "MAC and New Domain required":
      "L’adresse MAC et le nouveau domaine sont requis",
    "Domain updated successfully": "Domaine mis à jour avec succès",
    "Update failed": "Échec de la mise à jour",
    "Update the portal or domain URL for specific devices.":
      "Mettez à jour l’URL du portail ou du domaine pour des appareils spécifiques.",
    "Old Domain URL": "Ancienne URL du domaine",
    "New Domain URL": "Nouvelle URL du domaine",
    "Updating...": "Mise à jour...",
    "Update Domain": "Mettre à jour le domaine",
    "Direct Individual Subscriptions": "Abonnements individuels directs",
    "View subscriptions purchased directly by individuals via the landing page.":
      "Consultez les abonnements achetés directement par des particuliers via la page publique.",
    "Search MAC or Key...": "Rechercher une MAC ou une clé...",
    "Filter direct subscriptions by application":
      "Filtrer les abonnements directs par application",
    "Subscription Key": "Clé d’abonnement",
    Price: "Prix",
    "No direct subscriptions found.": "Aucun abonnement direct trouvé.",
    Filter: "Filtrer",
    Edit: "Modifier",
    Delete: "Supprimer",
    Save: "Enregistrer",
    Confirm: "Confirmer",
    Enable: "Activer",
    Approve: "Approuver",
    Reject: "Rejeter",
    Request: "Demande",
    Details: "Détails",
    Note: "Note",
    Log: "Journal",
    Transaction: "Transaction",
    Balance: "Solde",
    "All Types": "Tous les types",
    "All Status": "Tous les statuts",
    "All Statuses": "Tous les statuts",
    "Date & Time": "Date et heure",
    "Requester / Recipient": "Demandeur / Destinataire",
    "No note provided.": "Aucune note fournie.",
    "Dismiss notification": "Fermer la notification",
    "Reseller Management": "Gestion des revendeurs",
    "Subreseller Management": "Gestion des sous-revendeurs",
    "Reseller List": "Liste des revendeurs",
    "Subreseller List": "Liste des sous-revendeurs",
    "Add Subreseller": "Ajouter un sous-revendeur",
    "Change Reseller": "Changer de revendeur",
    "Parent Change Requests": "Demandes de changement de parent",
    "Manage your resellers, sub-resellers, and handle credit requests.":
      "Gérez vos revendeurs, sous-revendeurs et les demandes de crédits.",
    "Manage your sub-resellers under your reseller account.":
      "Gérez vos sous-revendeurs sous votre compte revendeur.",
    "Account Type": "Type de compte",
    "All Accounts": "Tous les comptes",
    "Main Resellers": "Revendeurs principaux",
    "Join Date": "Date d’inscription",
    Available: "Disponible",
    Warning: "Avertissement",
    Suspended: "Suspendu",
    Showing: "Affichage",
    "No {{type}} found.": "Aucun {{type}} trouvé.",
    resellers: "revendeurs",
    "sub-resellers": "sous-revendeurs",
    "Edit reseller": "Modifier le revendeur",
    Name: "Nom",
    Email: "E-mail",
    "Save reseller changes?": "Enregistrer les modifications du revendeur ?",
    "Are you sure you want to update {{name}}?":
      "Voulez-vous vraiment mettre à jour {{name}} ?",
    "Delete {{name}}?": "Supprimer {{name}} ?",
    "The reseller": "Le revendeur",
    "Reseller updated": "Revendeur mis à jour",
    "Reseller deleted": "Revendeur supprimé",
    "Failed to update reseller.": "Échec de la mise à jour du revendeur.",
    "Failed to delete reseller.": "Échec de la suppression du revendeur.",
    "Missing information": "Informations manquantes",
    "Please provide the reseller full name before creating the account.":
      "Veuillez fournir le nom complet du revendeur avant de créer le compte.",
    "Reseller created": "Revendeur créé",
    "{{name}} has been created successfully{{code}} and is now available in reseller management.":
      "{{name}} a été créé avec succès{{code}} et est maintenant disponible dans la gestion des revendeurs.",
    "with code": "avec le code",
    "Unable to create reseller": "Impossible de créer le revendeur",
    "Something went wrong while creating the reseller.":
      "Une erreur s’est produite lors de la création du revendeur.",
    "Add New Reseller": "Ajouter un nouveau revendeur",
    "Create a new reseller account and allocate initial credits.":
      "Créez un nouveau compte revendeur et attribuez des crédits initiaux.",
    "Full Name": "Nom complet",
    "Email Address": "Adresse e-mail",
    "Phone Number": "Numéro de téléphone",
    "Email and password are required so the reseller can access their profile.":
      "L'e-mail et le mot de passe sont obligatoires pour que le revendeur puisse acceder a son profil.",
    "Password must be at least 8 characters long.":
      "Le mot de passe doit contenir au moins 8 caracteres.",
    "Initial Credits": "Crédits initiaux",
    "Creating…": "Création…",
    "Create Reseller": "Créer le revendeur",
    "Please provide the sub-reseller full name before creating the account.":
      "Veuillez fournir le nom complet du sous-revendeur avant de créer le compte.",
    "Sub-reseller created": "Sous-revendeur créé",
    "{{name}}{{email}} has been created successfully{{code}} and is now available in the reseller list.":
      "{{name}}{{email}} a été créé avec succès{{code}} et est maintenant disponible dans la liste des revendeurs.",
    "Unable to create sub-reseller": "Impossible de créer le sous-revendeur",
    "Something went wrong while creating the sub-reseller.":
      "Une erreur s’est produite lors de la création du sous-revendeur.",
    "Create a sub-reseller account under an existing reseller.":
      "Créez un compte sous-revendeur sous un revendeur existant.",
    "Create a new sub-reseller account under your management.":
      "Créez un nouveau compte sous-revendeur sous votre gestion.",
    "Parent Reseller": "Revendeur parent",
    "Select a parent reseller...": "Sélectionnez un revendeur parent...",
    You: "Vous",
    "Sub Reseller Full Name": "Nom complet du sous-revendeur",
    "Sub-Reseller Permissions": "Autorisations du sous-revendeur",
    "Activate Devices (MAC)": "Activer les appareils (MAC)",
    "Activate devices permission": "Autorisation d’activer les appareils",
    "View Credit Balance": "Voir le solde des crédits",
    "View credit balance permission":
      "Autorisation de voir le solde des crédits",
    "View Credit Logs": "Voir les journaux de crédits",
    "View credit logs permission":
      "Autorisation de voir les journaux de crédits",
    "Request Credits from Parent": "Demander des crédits au parent",
    "Request credits from parent permission":
      "Autorisation de demander des crédits au parent",
    "Manage Playlists": "Gérer les playlists",
    "Manage playlists permission": "Autorisation de gérer les playlists",
    "Create Sub Reseller": "Créer le sous-revendeur",
    "Filter resellers by status": "Filtrer les revendeurs par statut",
    "Filter resellers by account type":
      "Filtrer les revendeurs par type de compte",
    "Missing selection": "Sélection manquante",
    "Select both the sub-reseller and the new parent reseller.":
      "Sélectionnez à la fois le sous-revendeur et le nouveau revendeur parent.",
    "Parent updated": "Parent mis à jour",
    "The reseller parent was updated successfully.":
      "Le parent du revendeur a été mis à jour avec succès.",
    "Move failed": "Échec du déplacement",
    "Failed to move reseller.": "Échec du déplacement du revendeur.",
    "Change Reseller Parent": "Changer le parent du revendeur",
    "Move a sub-reseller to a different parent reseller.":
      "Déplacez un sous-revendeur vers un autre revendeur parent.",
    "Select Sub Reseller": "Sélectionner un sous-revendeur",
    "Select a sub reseller...": "Sélectionnez un sous-revendeur...",
    "New Parent Reseller": "Nouveau revendeur parent",
    "Select a new parent...": "Sélectionnez un nouveau parent...",
    "Moving…": "Déplacement…",
    "Move Reseller": "Déplacer le revendeur",
    "Approval failed": "Échec de l’approbation",
    "Failed to approve request.": "Échec de l’approbation de la demande.",
    "Rejection failed": "Échec du rejet",
    "Failed to reject request.": "Échec du rejet de la demande.",
    "Review and approve requests from sub-resellers to change their parent reseller.":
      "Examinez et approuvez les demandes des sous-revendeurs pour changer de revendeur parent.",
    "Sub Reseller": "Sous-revendeur",
    "Current Parent": "Parent actuel",
    "Requested Parent": "Parent demandé",
    "No pending requests.": "Aucune demande en attente.",
    "Name is required": "Le nom est requis",
    "Failed to save profile": "Échec de l’enregistrement du profil",
    "Profile Information": "Informations du profil",
    "Update your account details and public profile.":
      "Mettez à jour les détails de votre compte et votre profil public.",
    "Update your administrator account details.":
      "Mettez à jour les détails de votre compte administrateur.",
    "First name": "Prénom",
    "Last name": "Nom",
    "Account role": "Rôle du compte",
    Administrator: "Administrateur",
    "Company / Reseller Name": "Entreprise / Nom du revendeur",
    "Enter your company name": "Entrez le nom de votre entreprise",
    "This is your administrator account profile.":
      "Ceci est le profil de votre compte administrateur.",
    "This reseller name is managed from the reseller records.":
      "Ce nom de revendeur est géré depuis les fiches revendeur.",
    "Profile updated successfully!": "Profil mis à jour avec succès !",
    "Change Password": "Changer le mot de passe",
    "Ensure your account is using a long, random password to stay secure.":
      "Assurez-vous que votre compte utilise un mot de passe long et aléatoire pour rester sécurisé.",
    "Current Password": "Mot de passe actuel",
    "New Password": "Nouveau mot de passe",
    "Confirm New Password": "Confirmer le nouveau mot de passe",
    "Update Password": "Mettre à jour le mot de passe",
    "Two-Factor Authentication": "Authentification à deux facteurs",
    "Add an extra layer of security to your account by enabling 2FA.":
      "Ajoutez une couche de sécurité supplémentaire à votre compte en activant la 2FA.",
    "Authenticator App": "Application d’authentification",
    "Use an app like Google Authenticator or Authy.":
      "Utilisez une application comme Google Authenticator ou Authy.",
    "Notification Preferences": "Préférences de notification",
    "Choose how you want to be notified about important events.":
      "Choisissez comment vous souhaitez être informé des événements importants.",
    "Email Notifications": "Notifications par e-mail",
    "Account Activity": "Activité du compte",
    "Get notified about logins and security changes.":
      "Recevez des notifications sur les connexions et les changements de sécurité.",
    "Low Credit Alert": "Alerte de crédit faible",
    "Get notified when your credit balance is low.":
      "Recevez une notification lorsque votre solde de crédits est faible.",
    "Push Notifications": "Notifications push",
    "New Device Activation": "Nouvelle activation d’appareil",
    "Get notified when a new device is activated.":
      "Recevez une notification lorsqu’un nouvel appareil est activé.",
    "Save Preferences": "Enregistrer les préférences",
    "Failed to save webhook": "Échec de l’enregistrement du webhook",
    "Loading integrations...": "Chargement des intégrations...",
    "API Keys": "Clés API",
    "Use these keys to integrate with your own applications.":
      "Utilisez ces clés pour intégrer vos propres applications.",
    "No API integrations configured yet.":
      "Aucune intégration API n’est encore configurée.",
    "API Key": "Clé API",
    "No key set": "Aucune clé définie",
    "Copy API Key": "Copier la clé API",
    Regenerate: "Régénérer",
    "Webhook Settings": "Paramètres du webhook",
    "Receive real-time notifications about events in your account.":
      "Recevez des notifications en temps réel sur les événements de votre compte.",
    "Webhook URL": "URL du webhook",
    "Webhook saved successfully!": "Webhook enregistré avec succès !",
    "Save Webhook": "Enregistrer le webhook",
    "Missing plan name": "Nom du plan manquant",
    "Please enter a plan name before saving.":
      "Veuillez saisir un nom de plan avant d’enregistrer.",
    "Invalid credits": "Crédits invalides",
    "Reseller credit plans must include credits greater than zero.":
      "Les plans de crédits revendeur doivent inclure un nombre de crédits supérieur à zéro.",
    "Invalid price": "Prix invalide",
    "Price cannot be negative.": "Le prix ne peut pas être négatif.",
    "Missing activation duration": "Durée d’activation manquante",
    "Direct activation plans must be either One Year or Lifetime.":
      "Les plans d’activation directe doivent être d’un an ou à vie.",
    "Edit Pricing Plan": "Modifier le plan tarifaire",
    "Add Pricing Plan": "Ajouter un plan tarifaire",
    "Plan Name": "Nom du plan",
    "Plan Type": "Type de plan",
    "Example: Lifetime Activation": "Exemple : Activation à vie",
    "Reseller Credit Plan": "Plan de crédits revendeur",
    "Direct Client Activation": "Activation directe client",
    "Direct plans appear on the external client website. Credit plans stay inside the reseller panel for buying coins/credits.":
      "Les plans directs apparaissent sur le site client externe. Les plans de crédits restent dans le panneau revendeur pour l’achat de pièces/crédits.",
    "Activation Length": "Durée d’activation",
    "One Year": "Un an",
    Lifetime: "À vie",
    "Enter credits": "Saisir les crédits",
    "Enter price": "Saisir le prix",
    Currency: "Devise",
    "Features (optional)": "Fonctionnalités (facultatif)",
    "Update pricing plan?": "Mettre à jour le plan tarifaire ?",
    "Create pricing plan?": "Créer le plan tarifaire ?",
    "Are you sure you want to save these pricing plan changes?":
      "Voulez-vous vraiment enregistrer ces modifications du plan tarifaire ?",
    "Are you sure you want to create this pricing plan?":
      "Voulez-vous vraiment créer ce plan tarifaire ?",
    "Create plan": "Créer le plan",
    "Plan updated": "Plan mis à jour",
    "{{name}} was updated for direct client activations.":
      "{{name}} a été mis à jour pour les activations directes des clients.",
    "{{name}} was updated for reseller credit purchases.":
      "{{name}} a été mis à jour pour les achats de crédits revendeur.",
    "Update issue": "Problème de mise à jour",
    "The server update failed, so the plan was only updated locally.":
      "La mise à jour du serveur a échoué, donc le plan n’a été mis à jour que localement.",
    "Plan created": "Plan créé",
    "{{name}} is now available on the direct activation website.":
      "{{name}} est maintenant disponible sur le site d’activation directe.",
    "{{name}} is now available for reseller credit purchases.":
      "{{name}} est maintenant disponible pour les achats de crédits revendeur.",
    "Create issue": "Problème de création",
    "The server create failed, so the plan was only saved locally.":
      "La création côté serveur a échoué, donc le plan n’a été enregistré que localement.",
    "Plan deleted": "Plan supprimé",
    "Delete issue": "Problème de suppression",
    "The server delete failed, so the plan was only removed locally.":
      "La suppression côté serveur a échoué, donc le plan n’a été retiré que localement.",
    "Keep direct client activation plans separate from reseller credit recharge plans.":
      "Gardez les plans d’activation directe séparés des plans de recharge de crédits revendeur.",
    "Add Plan": "Ajouter un plan",
    "Loading pricing plans...": "Chargement des plans tarifaires...",
    "Direct Activation Plans": "Plans d’activation directe",
    "These appear on the external website for normal clients and should be used only for One Year or Lifetime activations.":
      "Ces plans apparaissent sur le site externe pour les clients normaux et ne doivent être utilisés que pour des activations d’un an ou à vie.",
    "No direct activation plans yet. Add One Year and Lifetime plans here for the public website.":
      "Aucun plan d’activation directe pour le moment. Ajoutez ici les plans d’un an et à vie pour le site public.",
    "Visible on the normal-client activation website.":
      "Visible sur le site d’activation destiné aux clients normaux.",
    "One-time activation payment": "Paiement d’activation unique",
    "These are only for reseller coin/credit purchases inside the panel.":
      "Ces plans sont réservés aux achats de pièces/crédits revendeur dans le panneau.",
    "Used only for reseller wallet/coin recharge.":
      "Utilisé uniquement pour recharger le portefeuille/les pièces du revendeur.",
    "One-time payment": "Paiement unique",
    "Delete pricing plan?": "Supprimer ce plan tarifaire ?",
    "Are you sure you want to delete {{name}}? This action cannot be undone.":
      "Voulez-vous vraiment supprimer {{name}} ? Cette action est irréversible.",
    "Delete plan": "Supprimer le plan",
    "Development Payment Gateway": "Passerelle de paiement de développement",
    "Simulate a successful payment to auto-recharge credits during development.":
      "Simulez un paiement réussi pour recharger automatiquement les crédits pendant le développement.",
    "Close payment modal": "Fermer la fenêtre de paiement",
    credits: "crédits",
    "Simulated payment": "Paiement simulé",
    "Payment method": "Méthode de paiement",
    "Bank Card": "Carte bancaire",
    "Bank Transfer": "Virement bancaire",
    "Payer name": "Nom du payeur",
    "Payer email": "E-mail du payeur",
    "Payment reference": "Référence du paiement",
    "Confirming…": "Confirmation…",
    "Simulate successful payment": "Simuler un paiement réussi",
    "Recharge completed": "Recharge terminée",
    "{{count}} credits were added automatically after simulated payment confirmation. New balance: {{balance}}.":
      "{{count}} crédits ont été ajoutés automatiquement après confirmation du paiement simulé. Nouveau solde : {{balance}}.",
    "Purchase not completed": "Achat non terminé",
    "The payment was not confirmed, so no credits were added.":
      "Le paiement n’a pas été confirmé, donc aucun crédit n’a été ajouté.",
    "Purchase failed": "Échec de l’achat",
    "Failed to complete purchase.": "Échec de la finalisation de l’achat.",
    "Only resellers can purchase recharge plans directly. Sub-resellers should request credits from their reseller.":
      "Seuls les revendeurs peuvent acheter directement des plans de recharge. Les sous-revendeurs doivent demander des crédits à leur revendeur.",
    "Available Credit Plans": "Plans de crédits disponibles",
    "Credit Recharge Plans": "Plans de recharge de crédits",
    "Pick a plan and, once payment is confirmed, the credits are added to your balance automatically.":
      "Choisissez un plan et, une fois le paiement confirmé, les crédits seront ajoutés automatiquement à votre solde.",
    "No reseller credit plans were found in the backend.":
      "Aucun plan de crédits revendeur n’a été trouvé dans le backend.",
    Points: "Points",
    "Purchase credits to unlock features.":
      "Achetez des crédits pour débloquer des fonctionnalités.",
    "Automatic recharge after payment confirmation":
      "Recharge automatique après confirmation du paiement",
    "Pay & Recharge": "Payer et recharger",
    "Enter 4-digit PIN": "Entrez le code PIN à 4 chiffres",
    "Recipient and amount are required before continuing.":
      "Le destinataire et le montant sont requis avant de continuer.",
    "Credits updated": "Crédits mis à jour",
    "The credit operation completed successfully.":
      "L’opération sur les crédits s’est terminée avec succès.",
    "Close transfer modal": "Fermer la fenêtre de transfert",
    "Action Type": "Type d’action",
    "Add Credits": "Ajouter des crédits",
    "Revoke Credits": "Retirer des crédits",
    "Recipient Account": "Compte destinataire",
    "Loading existing accounts...": "Chargement des comptes existants...",
    "Select an existing reseller or sub-reseller":
      "Sélectionnez un revendeur ou sous-revendeur existant",
    "No reseller accounts available": "Aucun compte revendeur disponible",
    "Pick one of the existing accounts instead of typing a manual username or email.":
      "Choisissez un des comptes existants au lieu de saisir manuellement un nom d’utilisateur ou un e-mail.",
    "Notes (Optional)": "Notes (facultatif)",
    "Reason for transfer...": "Raison du transfert...",
    "Add Credits to Account": "Ajouter des crédits au compte",
    "Processing...": "Traitement...",
    "Invalid amount": "Montant invalide",
    "Enter a valid credit amount.": "Entrez un montant de crédits valide.",
    "Request submitted": "Demande envoyée",
    "Your credit request was submitted successfully.":
      "Votre demande de crédits a été soumise avec succès.",
    "Request failed": "Échec de la demande",
    "Failed to submit credit request.":
      "Échec de l’envoi de la demande de crédits.",
    "Submit a live request to your parent reseller using the backend.":
      "Soumettez une demande réelle à votre revendeur parent via le backend.",
    "Amount of Credits": "Montant des crédits",
    "Additional details...": "Détails supplémentaires...",
    "Submitting...": "Envoi...",
    "Submit Request": "Envoyer la demande",
    "Return request submitted": "Demande de retour envoyée",
    "Your credit return request was submitted successfully.":
      "Votre demande de retour de crédits a été soumise avec succès.",
    "Return request failed": "Échec de la demande de retour",
    "Failed to submit return request.":
      "Échec de l’envoi de la demande de retour.",
    "Send Credits Back": "Renvoyer les crédits",
    "Return unused credits to your parent reseller using the backend workflow.":
      "Retournez les crédits inutilisés à votre revendeur parent via le flux backend.",
    "Confirm Return": "Confirmer le retour",
    "Please enter your 4-digit PIN to confirm returning these credits.":
      "Veuillez entrer votre code PIN à 4 chiffres pour confirmer le retour de ces crédits.",
    "Pending Credit Requests": "Demandes de crédits en attente",
    "Review real pending requests from the backend and check payment notes before approving or rejecting them.":
      "Examinez les demandes réelles en attente depuis le backend et vérifiez les notes de paiement avant de les approuver ou de les rejeter.",
    "Request ID": "ID de la demande",
    Requester: "Demandeur",
    "Reseller Note / Payment Ref": "Note du revendeur / Réf. paiement",
    "No payment reference or notes provided.":
      "Aucune référence de paiement ou note fournie.",
    "Approve request": "Approuver la demande",
    "Reject request": "Rejeter la demande",
    "No pending requests right now.":
      "Aucune demande en attente pour le moment.",
    "Confirm Credit Transfer": "Confirmer le transfert de crédits",
    "Please enter your 4-digit PIN to confirm processing {{amount}} credits.":
      "Veuillez entrer votre code PIN à 4 chiffres pour confirmer le traitement de {{amount}} crédits.",
    "My Charge Requests": "Mes demandes de recharge",
    "Real request history loaded from the backend.":
      "Historique réel des demandes chargé depuis le backend.",
    "Search requests...": "Rechercher des demandes...",
    "No charge requests found matching your filters.":
      "Aucune demande de recharge ne correspond à vos filtres.",
    "You requested credits from Administrator":
      "Vous avez demandé des crédits à l’administrateur",
    "{{name}} requested credits from Administrator":
      "{{name}} a demandé des crédits à l’administrateur",
    "You requested credits from {{name}}":
      "Vous avez demandé des crédits à {{name}}",
    "{{requester}} requested credits from {{parent}}":
      "{{requester}} a demandé des crédits à {{parent}}",
    "You requested to return credits to {{name}}":
      "Vous avez demandé à retourner des crédits à {{name}}",
    "{{name}} requested to return credits to {{parent}}":
      "{{name}} a demandé à retourner des crédits à {{parent}}",
    "Administrator transferred credits to you":
      "L’administrateur vous a transféré des crédits",
    "{{name}} transferred credits to {{target}}":
      "{{name}} a transféré des crédits à {{target}}",
    "You completed a recharge plan purchase":
      "Vous avez terminé l’achat d’un plan de recharge",
    "{{name}} completed a recharge plan purchase":
      "{{name}} a terminé l’achat d’un plan de recharge",
    "Direct client": "Client direct",
    "{{name}} purchased a direct activation plan":
      "{{name}} a acheté un plan d’activation directe",
    "You transferred credits to {{name}}":
      "Vous avez transféré des crédits à {{name}}",
    "{{name}} transferred credits to you":
      "{{name}} vous a transféré des crédits",
    "You revoked credits from {{name}}":
      "Vous avez retiré des crédits à {{name}}",
    "Administrator revoked credits from you":
      "L’administrateur vous a retiré des crédits",
    "{{name}} revoked credits from you": "{{name}} vous a retiré des crédits",
    "{{name}} revoked credits from {{target}}":
      "{{name}} a retiré des crédits à {{target}}",
    "From {{name}}": "De {{name}}",
    "To {{name}}": "À {{name}}",
    "your parent reseller": "votre revendeur parent",
    "parent reseller": "revendeur parent",
    "the sub-reseller": "le sous-revendeur",
    reseller: "revendeur",
    "Search withdraw logs...": "Rechercher dans les journaux de retrait...",
    "Log ID": "ID du journal",
    "Amount Withdrawn": "Montant retiré",
    "No withdraw logs found matching your filters.":
      "Aucun journal de retrait ne correspond à vos filtres.",
  },
  AR: {
    "Search...": "بحث...",
    "Select language": "اختيار اللغة",
    Language: "اللغة",
    "Choose your panel language": "اختر لغة اللوحة",
    "Toggle theme": "تبديل المظهر",
    Notifications: "الإشعارات",
    "You're all caught up": "لا توجد إشعارات جديدة",
    "1 unread update": "إشعار واحد غير مقروء",
    "{{count}} unread updates": "{{count}} إشعارات غير مقروءة",
    "Mark all read": "تحديد الكل كمقروء",
    "Loading notifications...": "جارٍ تحميل الإشعارات...",
    "No notifications yet.": "لا توجد إشعارات بعد.",
    "Show all": "عرض الكل",
    Account: "الحساب",
    "System Settings": "إعدادات النظام",
    Logout: "تسجيل الخروج",
    Credits: "الرصيد",
    Dashboard: "لوحة التحكم",
    "Device Management": "إدارة الأجهزة",
    "Playlist Checker/Converter": "فاحص/محوّل القوائم",
    Reseller: "الموزعون",
    "Apps Management": "إدارة التطبيقات",
    Settings: "الإعدادات",
    Pages: "الصفحات",
    "Super Admin": "المدير العام",
    "Sub-Reseller": "موزع فرعي",
    "Sign in to your account": "سجّل الدخول إلى حسابك",
    "Secure access for admins, resellers, and sub-resellers.":
      "دخول آمن للمسؤولين والموزعين والموزعين الفرعيين.",
    "Need help signing in?": "هل تحتاج مساعدة في تسجيل الدخول؟",
    "Use the language and theme controls above to personalize your login experience.":
      "استخدم أدوات اللغة والمظهر بالأعلى لتخصيص تجربة تسجيل الدخول.",
    "Forgot password?": "هل نسيت كلمة المرور؟",
    "Show password": "إظهار كلمة المرور",
    "Hide password": "إخفاء كلمة المرور",
    "Phone number is required for password recovery and notifications.":
      "رقم الهاتف مطلوب لاستعادة كلمة المرور والإشعارات.",
    "Make sure this phone number is correct. It may be needed to recover the account if the user loses their credentials.":
      "تأكد من أن رقم الهاتف هذا صحيح، فقد نحتاجه لاستعادة الحساب إذا فقد المستخدم بيانات الدخول.",
    "If you want a login account, please provide both email and password.":
      "إذا كنت تريد حساب تسجيل دخول، يرجى إدخال البريد الإلكتروني وكلمة المرور معًا.",
    "Please provide the sub-reseller name, email, phone number, and password before creating the account.":
      "يرجى إدخال اسم الموزع الفرعي والبريد الإلكتروني ورقم الهاتف وكلمة المرور قبل إنشاء الحساب.",
    "Please enter the account email first.": "يرجى إدخال بريد الحساب أولًا.",
    "Please provide the registered phone number.":
      "يرجى إدخال رقم الهاتف المسجل.",
    "Please enter a new password with at least 8 characters.":
      "يرجى إدخال كلمة مرور جديدة لا تقل عن 8 أحرف.",
    "The new passwords do not match.": "كلمتا المرور الجديدتان غير متطابقتين.",
    "Registered phone number": "رقم الهاتف المسجل",
    "Verification code": "رمز التحقق",
    "New password": "كلمة المرور الجديدة",
    "Confirm new password": "تأكيد كلمة المرور الجديدة",
    "Reset password": "إعادة تعيين كلمة المرور",
    "Send code": "إرسال الرمز",
    "Sending...": "جارٍ الإرسال...",
    "Development code": "رمز التطوير",
    "Please enter the verification code sent by SMS.":
      "يرجى إدخال رمز التحقق المرسل عبر الرسائل النصية.",
    "Please enter the verification code sent to your phone.":
      "يرجى إدخال رمز التحقق المرسل إلى هاتفك.",
    "Verification code sent to your phone.": "تم إرسال رمز التحقق إلى هاتفك.",
    "Unable to send the verification code right now.":
      "تعذر إرسال رمز التحقق الآن.",
    "Confirm your account with the registered phone number, request an SMS code, then choose a new password.":
      "أكد حسابك باستخدام رقم الهاتف المسجل، واطلب رمزًا عبر SMS، ثم اختر كلمة مرور جديدة.",
    "Confirm your account with the registered phone number, request a verification code, then choose a new password.":
      "أكد حسابك باستخدام رقم الهاتف المسجل، واطلب رمز تحقق، ثم اختر كلمة مرور جديدة.",
    "Password reset successful. You can now sign in with your new password.":
      "تمت إعادة تعيين كلمة المرور بنجاح. يمكنك الآن تسجيل الدخول بكلمة المرور الجديدة.",
    "Unable to reset the password right now.":
      "تعذرت إعادة تعيين كلمة المرور الآن.",
    "Invalid email or password": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
    "Email address": "البريد الإلكتروني",
    Password: "كلمة المرور",
    "Password reset isn't automated yet. Please contact your administrator or support team to restore access.":
      "إعادة تعيين كلمة المرور ليست آلية بعد. يرجى التواصل مع المسؤول أو فريق الدعم لاستعادة الوصول.",
    "Password reset isn't automated yet. Please contact your administrator and mention {{email}}.":
      "إعادة تعيين كلمة المرور ليست آلية بعد. يرجى التواصل مع المسؤول وذكر البريد {{email}}.",
    "Signing in...": "جارٍ تسجيل الدخول...",
    "Sign in": "تسجيل الدخول",
    "Check MAC": "فحص MAC",
    "Switch MAC": "تبديل MAC",
    "Multi Apps Activation": "تفعيل عدة تطبيقات",
    "Activated Apps List": "قائمة التطبيقات المفعلة",
    "Direct Subscriptions": "الاشتراكات المباشرة",
    "Add Playlist": "إضافة قائمة",
    "Reset Playlist": "إعادة ضبط القائمة",
    "Change Domain Url": "تغيير رابط الدومين",
    "You do not have access to any features in this section.":
      "ليس لديك صلاحية للوصول إلى ميزات هذا القسم.",
    "Manage device activations, switch MAC addresses, and configure playlists.":
      "أدر تفعيلات الأجهزة وبدّل عناوين MAC واضبط القوائم.",
    "Profile Settings": "إعدادات الملف الشخصي",
    "Security & Password": "الأمان وكلمة المرور",
    "Reseller Branding": "هوية الموزع",
    "Security Policies": "سياسات الأمان",
    "API & Integrations": "API والتكاملات",
    "Pricing Plans": "خطط التسعير",
    "Global App Settings": "إعدادات التطبيقات العامة",
    "Account Settings": "إعدادات الحساب",
    "Manage global system configurations, security policies, and administrative tools.":
      "أدر إعدادات النظام العامة وسياسات الأمان والأدوات الإدارية.",
    "Manage your personal account settings, branding, and notification preferences.":
      "أدر إعدادات حسابك الشخصية والهوية الترويجية وتفضيلات الإشعارات.",
    General: "عام",
    Business: "الأعمال",
    Administration: "الإدارة",
    "Available Plans": "الخطط المتاحة",
    "Plans Management": "إدارة الخطط",
    "Credit Point Share Logs": "سجلات مشاركة الرصيد",
    "Withdraw Point Share Logs": "سجلات سحب الرصيد",
    "My Requests": "طلباتي",
    "Request Credits": "طلب رصيد",
    "Return Credits": "إرجاع الرصيد",
    "Pending Requests": "الطلبات المعلقة",
    "Credit Management": "إدارة الرصيد",
    "Manage pricing plans, monitor reseller credit activity, and review all system credit movements.":
      "أدر خطط التسعير وراقب نشاط أرصدة الموزعين وراجع جميع حركات الرصيد في النظام.",
    "My Credits & Plans": "رصيدي وخططي",
    "Review available recharge plans, purchase credits, and manage transfers with your sub-resellers.":
      "راجع خطط الشحن المتاحة واشترِ الرصيد وأدر التحويلات مع الموزعين الفرعيين.",
    "My Credits": "رصيدي",
    "Request or return credits and track your own credit activity in one place.":
      "اطلب الرصيد أو أعده وتابع نشاطك من مكان واحد.",
    "Manual Credit Action": "إجراء يدوي على الرصيد",
    "Transfer Credits": "تحويل الرصيد",
    "Manage Plans": "إدارة الخطط",
    "View & Purchase Plans": "عرض وشراء الخطط",
    "System Credit Balance": "رصيد النظام",
    "Available Balance": "الرصيد المتاح",
    "Credits Issued (30d)": "الرصيد المُصدر (30 يومًا)",
    "Credits Received (30d)": "الرصيد المستلم (30 يومًا)",
    "Credits Revoked (30d)": "الرصيد المسحوب (30 يومًا)",
    "Credits Spent (30d)": "الرصيد المصروف (30 يومًا)",
    Unlimited: "غير محدود",
    "Dashboard Overview": "نظرة عامة على اللوحة",
    "Download Report": "تنزيل التقرير",
    "Activate Device": "تفعيل جهاز",
    "Total Active Devices": "إجمالي الأجهزة النشطة",
    "Total Resellers": "إجمالي الموزعين",
    "Monthly Revenue": "الإيراد الشهري",
    "My Active Devices": "أجهزتي النشطة",
    "My Sub-Resellers": "الموزعون الفرعيون لدي",
    "Available Credits": "الرصيد المتاح",
    "Activations & Revenue": "التفعيلات والإيرادات",
    "My Activations": "تفعيلاتي",
    "Last 6 Months": "آخر 6 أشهر",
    "System Status": "حالة النظام",
    "API Servers": "خوادم API",
    Operational: "يعمل بشكل طبيعي",
    Database: "قاعدة البيانات",
    "Auth Service": "خدمة التوثيق",
    "Account Status": "حالة الحساب",
    Active: "نشط",
    "Credit Limit": "حد الرصيد",
    "Quick Links": "روابط سريعة",
    "Add Reseller": "إضافة موزع",
    "Manage Credits": "إدارة الرصيد",
    "View Logs": "عرض السجلات",
    "Recent Transactions": "أحدث المعاملات",
    "Search transactions...": "ابحث في المعاملات...",
    All: "الكل",
    "Transaction ID": "رقم المعاملة",
    User: "المستخدم",
    Type: "النوع",
    Amount: "المبلغ",
    "Notes / Details": "ملاحظات / تفاصيل",
    Date: "التاريخ",
    Status: "الحالة",
    ACTIVE: "نشط",
    INACTIVE: "غير نشط",
    EXPIRED: "منتهي",
    BLOCKED: "محظور",
    "Welcome to NOVA Panel — manage your workspace with ease. If you face any issue, please report it through the support link we will provide here soon.":
      "مرحبًا بك في NOVA Panel — أدر مساحة عملك بسهولة. إذا واجهت أي مشكلة، يُرجى الإبلاغ عنها عبر رابط الدعم الذي سنوفره قريبًا.",
    "No transactions found matching your filters.":
      "لا توجد معاملات تطابق عوامل التصفية الحالية.",
    Tabs: "علامات التبويب",
    "Loading...": "جارٍ التحميل...",
    "Show data as table": "عرض البيانات كجدول",
    "Table view": "عرض الجدول",
    Table: "جدول",
    "Show data as cards": "عرض البيانات كبطاقات",
    "Card view": "عرض البطاقات",
    Cards: "بطاقات",
    "Close confirmation modal": "إغلاق نافذة التأكيد",
    "Tools for checking, converting, and managing IPTV playlists.":
      "أدوات لفحص قوائم IPTV وتحويلها وإدارتها.",
    "Playlist Checker": "فاحص القوائم",
    "Playlist Converter": "محوّل القوائم",
    "Free IPTV Status Checker": "فاحص حالة IPTV مجاني",
    "Check your IPTV account status, expiration date, and connection limits in seconds. Secure, fast, and completely free IPTV verification tool.":
      "تحقق من حالة حساب IPTV وتاريخ الانتهاء وحدود الاتصال خلال ثوانٍ. أداة تحقق سريعة وآمنة ومجانية بالكامل.",
    "IPTV URL": "رابط IPTV",
    "Enter your IPTV URL with username and password parameters":
      "أدخل رابط IPTV مع اسم المستخدم وكلمة المرور",
    "Check Status": "فحص الحالة",
    About: "حول الأداة",
    "Frequently Asked Questions": "الأسئلة الشائعة",
    "Is my IPTV URL safe?": "هل رابط IPTV الخاص بي آمن؟",
    "Yes, your IPTV URL is processed securely and is never stored on our servers or shared with third parties.":
      "نعم، يتم التعامل مع رابط IPTV بشكل آمن ولا يتم حفظه على خوادمنا أو مشاركته مع أي طرف ثالث.",
    "What information can I check?": "ما المعلومات التي يمكنني فحصها؟",
    "You can check your account status, subscription expiration date, connection limits, and server information.":
      "يمكنك فحص حالة الحساب وتاريخ انتهاء الاشتراك وحدود الاتصال ومعلومات الخادم.",
    "Why is my check failing?": "لماذا يفشل الفحص؟",
    "Make sure your IPTV URL is correct and includes the username and password parameters. The server must also be online and accessible.":
      "تأكد من صحة رابط IPTV وأنه يتضمن اسم المستخدم وكلمة المرور، كما يجب أن يكون الخادم متصلًا ومتاحًا.",
    "How often can I check my status?": "كم مرة يمكنني فحص حالتي؟",
    "You can check your IPTV status as often as needed. There are no limits on the number of checks you can perform.":
      "يمكنك فحص حالة IPTV بالقدر الذي تحتاجه، ولا توجد قيود على عدد مرات الفحص.",
    "M3U URL Converter": "محوّل روابط M3U",
    "Convert your IPTV credentials to M3U playlist URLs or parse existing URLs":
      "حوّل بيانات IPTV إلى روابط قوائم M3U أو حلّل الروابط الموجودة",
    "Create URL": "إنشاء رابط",
    "Parse URL": "تحليل الرابط",
    "Hostname *": "اسم المضيف *",
    "Include http:// prefix": "أضف بادئة http://",
    Username: "اسم المستخدم",
    "Paste M3U URL": "ألصق رابط M3U",
    "Your Hostname": "اسم المضيف الخاص بك",
    "Your username": "اسم المستخدم الخاص بك",
    "Your password": "كلمة المرور الخاصة بك",
    "Paste your M3U URL here...": "ألصق رابط M3U هنا...",
    Clear: "مسح",
    "Convert to M3U URL": "تحويل إلى رابط M3U",
    "How to Create M3U URLs": "كيفية إنشاء روابط M3U",
    "Enter Your IPTV Server Details:": "أدخل تفاصيل خادم IPTV:",
    "Input your IPTV provider's hostname. Make sure to include the protocol (http://).":
      "أدخل اسم مضيف مزود IPTV الخاص بك، وتأكد من إضافة البروتوكول (http://).",
    "Add Authentication Credentials:": "أضف بيانات المصادقة:",
    "Enter your username and password.": "أدخل اسم المستخدم وكلمة المرور.",
    "Generate Your M3U URL:": "أنشئ رابط M3U الخاص بك:",
    'Click "Convert to M3U URL" to generate your playlist URL.':
      'انقر على "تحويل إلى رابط M3U" لإنشاء رابط قائمتك.',
    "How to Parse Existing M3U URLs": "كيفية تحليل روابط M3U الموجودة",
    "Paste Your M3U URL:": "ألصق رابط M3U الخاص بك:",
    "Copy and paste any M3U playlist URL into the text area.":
      "انسخ والصق أي رابط قائمة M3U داخل مربع النص.",
    "Extract Information:": "استخراج المعلومات:",
    'Click "Parse URL" to automatically extract the components.':
      'انقر على "تحليل الرابط" لاستخراج المكوّنات تلقائيًا.',
    "Copy Individual Components:": "نسخ المكوّنات بشكل منفصل:",
    "Each extracted component can be copied individually.":
      "يمكن نسخ كل مكوّن مستخرج بشكل منفصل.",
    "What is M3U and Why Use This Tool?": "ما هو M3U ولماذا تستخدم هذه الأداة؟",
    "Understanding M3U Format": "فهم صيغة M3U",
    "M3U is a computer file format for a multimedia playlist. Originally developed for audio files, M3U is now widely used for IPTV streaming.":
      "M3U هو تنسيق ملف لقوائم الوسائط المتعددة. تم تطويره في الأصل للملفات الصوتية وأصبح مستخدمًا على نطاق واسع في بث IPTV.",
    "Benefits of Our M3U Tool": "مزايا أداة M3U الخاصة بنا",
    "Instant Conversion": "تحويل فوري",
    "Reverse Engineering": "تحليل عكسي",
    "No Registration Required": "لا يتطلب تسجيلًا",
    "Privacy Focused": "يركّز على الخصوصية",
    "M3U Plus": "M3U Plus",
    "Extended M3U format with metadata support.":
      "صيغة M3U موسعة مع دعم البيانات الوصفية.",
    "Transport Stream": "دفق النقل",
    "Optimized for streaming with TS output.": "محسن للبث مع خرج TS.",
    "Fast & Reliable": "سريع وموثوق",
    "Quick URL generation and parsing.": "إنشاء وتحليل الروابط بسرعة.",
    "Check Device Activation": "فحص تفعيل الجهاز",
    "Verify activation using the device MAC address and player-generated key.":
      "تحقق من التفعيل باستخدام عنوان MAC للجهاز والمفتاح الذي أنشأه المشغل.",
    "Select Module": "اختر الوحدة",
    "All Modules": "كل الوحدات",
    "MAC Address": "عنوان MAC",
    "Format: 12 hexadecimal digits separated by colons.":
      "الصيغة: 12 رقمًا سداسيًا مفصولًا بنقطتين.",
    "Device Key": "مفتاح الجهاز",
    "Enter the player-generated key": "أدخل المفتاح الذي أنشأه المشغل",
    "Player-generated device key": "مفتاح الجهاز الذي أنشأه المشغل",
    "Use the same key shown inside the IPTV player application on the device.":
      "استخدم نفس المفتاح الظاهر داخل تطبيق IPTV على الجهاز.",
    "Enter a valid MAC address (12 hex digits)":
      "أدخل عنوان MAC صالحًا (12 رقمًا سداسيًا)",
    "Enter the player device key": "أدخل مفتاح جهاز المشغل",
    "Failed to check device": "فشل فحص الجهاز",
    "Checking...": "جارٍ الفحص...",
    "Check Device": "فحص الجهاز",
    "Device Found": "تم العثور على الجهاز",
    "Device Not Found": "لم يتم العثور على الجهاز",
    Verification: "التحقق",
    "Key mismatch": "المفتاح غير مطابق",
    Verified: "تم التحقق",
    Expired: "منتهي",
    "No active apps": "لا توجد تطبيقات نشطة",
    Unknown: "غير معروف",
    "Owner Reseller ID": "معرّف الموزع المالك",
    Registered: "تاريخ التسجيل",
    "The provided device key does not match the key saved for this MAC address.":
      "مفتاح الجهاز المُدخل لا يطابق المفتاح المحفوظ لهذا العنوان.",
    "This device has expired activations. Renew the app activation or reactivate it from the panel to restore access.":
      "انتهت تفعيلات هذا الجهاز. جدّد التفعيل أو أعد تفعيله من اللوحة لاستعادة الوصول.",
    "Applications Found": "التطبيقات الموجودة",
    Activated: "تم التفعيل",
    Expires: "ينتهي في",
    "No expiry set": "لا يوجد تاريخ انتهاء",
    "Linked Playlists": "القوائم المرتبطة",
    "Target app: {{app}}": "التطبيق المستهدف: {{app}}",
    "Target app ID: {{id}}": "معرّف التطبيق المستهدف: {{id}}",
    "Available to this device": "متاح لهذا الجهاز",
    "No device with MAC address": "لم يتم العثور على جهاز بعنوان MAC",
    "was found in the system.": "في النظام.",
    "Switch MAC Address": "تبديل عنوان MAC",
    "Transfer an active subscription from an old device to a new one.":
      "انقل اشتراكًا نشطًا من جهاز قديم إلى جهاز جديد.",
    "Select a module": "اختر وحدة",
    "Old MAC Address": "عنوان MAC القديم",
    "New MAC Address": "عنوان MAC الجديد",
    "Enter both MAC addresses": "أدخل عنواني MAC معًا",
    "Transfer successful": "تم النقل بنجاح",
    "Transfer failed": "فشل النقل",
    "Transferring...": "جارٍ النقل...",
    "Transfer Subscription": "نقل الاشتراك",
    "Enter a MAC address": "أدخل عنوان MAC",
    "Select at least one app": "اختر تطبيقًا واحدًا على الأقل",
    "Activation successful": "تم التفعيل بنجاح",
    "Activation failed": "فشل التفعيل",
    "Please note that each App should be installed before activating!":
      "يرجى ملاحظة أنه يجب تثبيت كل تطبيق قبل التفعيل!",
    "You can select up to 4 Apps Max, for 1 year 1-credit & for Lifetime 2-credits will be debited from your account":
      "يمكنك اختيار ما يصل إلى 4 تطبيقات كحد أقصى؛ سيتم خصم 1 رصيد لمدة سنة و2 رصيد لتفعيل مدى الحياة.",
    "Select Applications": "اختر التطبيقات",
    "Fetching App Catalog...": "جارٍ جلب كتالوج التطبيقات...",
    "No applications available in the catalog.":
      "لا توجد تطبيقات متاحة في الكتالوج.",
    "Select Duration": "اختر المدة",
    "1-Year Activation": "تفعيل لمدة سنة",
    "Standard 1 Credit activation": "تفعيل قياسي برصيد واحد",
    "Lifetime Activation": "تفعيل مدى الحياة",
    "Unlimited access for 2 Credits": "وصول غير محدود مقابل رصيدين",
    "Device Settings": "إعدادات الجهاز",
    "Use the unique key shown inside the IPTV player app on this device.":
      "استخدم المفتاح الفريد الظاهر داخل تطبيق IPTV على هذا الجهاز.",
    "Remarks (Optional)": "ملاحظات (اختياري)",
    "Note about this activation...": "ملاحظة حول هذا التفعيل...",
    "Total Cost": "التكلفة الإجمالية",
    "Activating...": "جارٍ التفعيل...",
    "Activate Now": "فعّل الآن",
    "Check app details before activation": "تحقق من تفاصيل التطبيق قبل التفعيل",
    "Make sure you select the correct app and version before continuing.":
      "تأكد من اختيار التطبيق والإصدار الصحيحين قبل المتابعة.",
    "Failed to load activated apps.": "فشل تحميل التطبيقات المفعلة.",
    "This row is missing a valid device record.":
      "هذا الصف يفتقد إلى سجل جهاز صالح.",
    "Enter a valid MAC address before saving.":
      "أدخل عنوان MAC صالحًا قبل الحفظ.",
    "Device {{mac}} has been blocked.": "تم حظر الجهاز {{mac}}.",
    "Device {{mac}} was updated successfully.":
      "تم تحديث الجهاز {{mac}} بنجاح.",
    "Failed to update this device.": "فشل تحديث هذا الجهاز.",
    "The device and its linked activations were deleted.":
      "تم حذف الجهاز وتفعيلاته المرتبطة.",
    "Failed to delete this device.": "فشل حذف هذا الجهاز.",
    "View and filter the active and expired app activations under your account.":
      "اعرض وفلتر التفعيلات النشطة والمنتهية لتطبيقاتك ضمن حسابك.",
    "Search MAC, key, or app...": "ابحث عن MAC أو مفتاح أو تطبيق...",
    "Hide Filters": "إخفاء الفلاتر",
    "Filter activated apps by application":
      "تصفية التطبيقات المفعلة حسب التطبيق",
    "All Applications": "كل التطبيقات",
    Application: "التطبيق",
    "Activation Date": "تاريخ التفعيل",
    "Expiry Date": "تاريخ الانتهاء",
    Actions: "الإجراءات",
    "Manage Device": "إدارة الجهاز",
    "No activated apps found matching your filters.":
      "لم يتم العثور على تطبيقات مفعلة تطابق عوامل التصفية.",
    "Showing all": "عرض",
    results: "نتائج",
    "Update the device info, block access, or delete the device.":
      "حدّث معلومات الجهاز أو امنع الوصول أو احذف الجهاز.",
    "Close device management dialog": "إغلاق نافذة إدارة الجهاز",
    "Device Status": "حالة الجهاز",
    Inactive: "غير نشط",
    Blocked: "محظور",
    "Activation Status": "حالة التفعيل",
    "Unblock Device": "إلغاء حظر الجهاز",
    "Block Device": "حظر الجهاز",
    "Delete Device": "حذف الجهاز",
    "Saving...": "جارٍ الحفظ...",
    "Save Changes": "حفظ التغييرات",
    "Delete this device?": "حذف هذا الجهاز؟",
    "This will remove the device and its linked activations from the panel. This action cannot be undone.":
      "سيؤدي هذا إلى إزالة الجهاز وتفعيلاته المرتبطة من اللوحة. لا يمكن التراجع عن هذا الإجراء.",
    "Deleting...": "جارٍ الحذف...",
    "MAC and playlist name are required": "عنوان MAC واسم القائمة مطلوبان",
    "Choose which app should receive this playlist":
      "اختر التطبيق الذي سيستقبل هذه القائمة",
    "Enter a valid M3U URL": "أدخل رابط M3U صالحًا",
    "Enter the Xtream host, username, and password":
      "أدخل رابط Xtream واسم المستخدم وكلمة المرور",
    "Playlist assigned successfully": "تم تعيين القائمة بنجاح",
    "Failed to assign playlist": "فشل تعيين القائمة",
    "Upload M3U URLs or Xtream Codes credentials to a specific MAC address.":
      "أضف روابط M3U أو بيانات Xtream Codes إلى عنوان MAC محدد.",
    "Target Application": "التطبيق المستهدف",
    "Loading apps...": "جارٍ تحميل التطبيقات...",
    "Select the app to update": "اختر التطبيق المراد تحديثه",
    "The playlist will be linked to this app for the selected MAC address.":
      "سيتم ربط القائمة بهذا التطبيق لعنوان MAC المحدد.",
    "Playlist Name": "اسم القائمة",
    "e.g., Premium Sports, Movies List": "مثال: رياضة بريميوم، قائمة أفلام",
    "Playlist Type": "نوع القائمة",
    "M3U Link": "رابط M3U",
    "Xtream Codes": "Xtream Codes",
    "Host URL / Portal": "رابط المضيف / البوابة",
    "Save Playlist": "حفظ القائمة",
    "Clear all playlists associated with a specific MAC address. This action cannot be undone.":
      "امسح كل القوائم المرتبطة بعنوان MAC محدد. لا يمكن التراجع عن هذا الإجراء.",
    Attention: "تنبيه",
    "Resetting the playlist will permanently delete all M3U links and Xtream Codes credentials associated with the provided MAC address. The user will need to re-enter their playlist information.":
      "إعادة ضبط القائمة ستحذف نهائيًا كل روابط M3U وبيانات Xtream Codes المرتبطة بعنوان MAC المُدخل، وسيتوجب على المستخدم إدخال بياناته من جديد.",
    "MAC Address to Reset": "عنوان MAC المراد إعادة ضبطه",
    "Playlists reset successfully": "تمت إعادة ضبط القوائم بنجاح",
    "Reset failed": "فشلت إعادة الضبط",
    "Resetting...": "جارٍ إعادة الضبط...",
    "Reset Playlists Now": "أعد ضبط القوائم الآن",
    "Reset playlists?": "إعادة ضبط القوائم؟",
    "This will delete all playlists for the selected MAC address. This action cannot be undone.":
      "سيؤدي هذا إلى حذف كل القوائم لعنوان MAC المحدد. لا يمكن التراجع عن هذا الإجراء.",
    "Reset now": "إعادة الضبط الآن",
    "MAC and New Domain required": "عنوان MAC والنطاق الجديد مطلوبان",
    "Domain updated successfully": "تم تحديث النطاق بنجاح",
    "Update failed": "فشل التحديث",
    "Update the portal or domain URL for specific devices.":
      "حدّث رابط البوابة أو الدومين لأجهزة محددة.",
    "Old Domain URL": "رابط النطاق القديم",
    "New Domain URL": "رابط النطاق الجديد",
    "Updating...": "جارٍ التحديث...",
    "Update Domain": "تحديث النطاق",
    "Direct Individual Subscriptions": "الاشتراكات الفردية المباشرة",
    "View subscriptions purchased directly by individuals via the landing page.":
      "اعرض الاشتراكات التي اشتراها الأفراد مباشرة عبر الصفحة العامة.",
    "Search MAC or Key...": "ابحث عن MAC أو مفتاح...",
    "Filter direct subscriptions by application":
      "تصفية الاشتراكات المباشرة حسب التطبيق",
    "Subscription Key": "مفتاح الاشتراك",
    Price: "السعر",
    "No direct subscriptions found.": "لم يتم العثور على اشتراكات مباشرة.",
    Filter: "تصفية",
    Edit: "تعديل",
    Delete: "حذف",
    Save: "حفظ",
    Confirm: "تأكيد",
    Enable: "تفعيل",
    Approve: "موافقة",
    Reject: "رفض",
    Request: "طلب",
    Details: "التفاصيل",
    Note: "ملاحظة",
    Log: "سجل",
    Transaction: "معاملة",
    Balance: "الرصيد",
    "All Types": "كل الأنواع",
    "All Status": "كل الحالات",
    "All Statuses": "كل الحالات",
    "Date & Time": "التاريخ والوقت",
    "Requester / Recipient": "الطالب / المستلم",
    "No note provided.": "لا توجد ملاحظة.",
    "Dismiss notification": "إغلاق الإشعار",
    "Reseller Management": "إدارة الموزعين",
    "Subreseller Management": "إدارة الموزعين الفرعيين",
    "Reseller List": "قائمة الموزعين",
    "Subreseller List": "قائمة الموزعين الفرعيين",
    "Add Subreseller": "إضافة موزع فرعي",
    "Change Reseller": "تغيير الموزع",
    "Parent Change Requests": "طلبات تغيير الموزع الأب",
    "Manage your resellers, sub-resellers, and handle credit requests.":
      "أدر الموزعين والموزعين الفرعيين وتعامل مع طلبات الرصيد.",
    "Manage your sub-resellers under your reseller account.":
      "أدر الموزعين الفرعيين التابعين لحسابك كموزع.",
    "Account Type": "نوع الحساب",
    "All Accounts": "كل الحسابات",
    "Main Resellers": "الموزعون الرئيسيون",
    "Join Date": "تاريخ الانضمام",
    Available: "متاح",
    Warning: "تحذير",
    Suspended: "معلّق",
    Showing: "عرض",
    "No {{type}} found.": "لم يتم العثور على {{type}}.",
    resellers: "موزعين",
    "sub-resellers": "موزعين فرعيين",
    "Edit reseller": "تعديل الموزع",
    Name: "الاسم",
    Email: "البريد الإلكتروني",
    "Save reseller changes?": "حفظ تغييرات الموزع؟",
    "Are you sure you want to update {{name}}?":
      "هل أنت متأكد أنك تريد تحديث {{name}}؟",
    "Delete {{name}}?": "حذف {{name}}؟",
    "The reseller": "الموزع",
    "Reseller updated": "تم تحديث الموزع",
    "Reseller deleted": "تم حذف الموزع",
    "Failed to update reseller.": "فشل تحديث الموزع.",
    "Failed to delete reseller.": "فشل حذف الموزع.",
    "Missing information": "معلومات ناقصة",
    "Please provide the reseller full name before creating the account.":
      "يرجى إدخال الاسم الكامل للموزع قبل إنشاء الحساب.",
    "Reseller created": "تم إنشاء الموزع",
    "{{name}} has been created successfully{{code}} and is now available in reseller management.":
      "تم إنشاء {{name}} بنجاح{{code}} وهو متاح الآن في إدارة الموزعين.",
    "with code": "بالرمز",
    "Unable to create reseller": "تعذر إنشاء الموزع",
    "Something went wrong while creating the reseller.":
      "حدث خطأ أثناء إنشاء الموزع.",
    "Add New Reseller": "إضافة موزع جديد",
    "Create a new reseller account and allocate initial credits.":
      "أنشئ حساب موزع جديدًا وخصص له رصيدًا أوليًا.",
    "Full Name": "الاسم الكامل",
    "Email Address": "عنوان البريد الإلكتروني",
    "Phone Number": "رقم الهاتف",
    "Email and password are required so the reseller can access their profile.":
      "البريد الإلكتروني وكلمة المرور مطلوبان ليتمكن الموزع من الوصول إلى ملفه الشخصي.",
    "Password must be at least 8 characters long.":
      "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل.",
    "Initial Credits": "الرصيد الأولي",
    "Creating…": "جارٍ الإنشاء…",
    "Create Reseller": "إنشاء موزع",
    "Please provide the sub-reseller full name before creating the account.":
      "يرجى إدخال الاسم الكامل للموزع الفرعي قبل إنشاء الحساب.",
    "Sub-reseller created": "تم إنشاء الموزع الفرعي",
    "{{name}}{{email}} has been created successfully{{code}} and is now available in the reseller list.":
      "تم إنشاء {{name}}{{email}} بنجاح{{code}} وهو متاح الآن في قائمة الموزعين.",
    "Unable to create sub-reseller": "تعذر إنشاء الموزع الفرعي",
    "Something went wrong while creating the sub-reseller.":
      "حدث خطأ أثناء إنشاء الموزع الفرعي.",
    "Create a sub-reseller account under an existing reseller.":
      "أنشئ حساب موزع فرعي تحت موزع موجود.",
    "Create a new sub-reseller account under your management.":
      "أنشئ حساب موزع فرعي جديد تحت إدارتك.",
    "Parent Reseller": "الموزع الأب",
    "Select a parent reseller...": "اختر موزعًا أبًا...",
    You: "أنت",
    "Sub Reseller Full Name": "الاسم الكامل للموزع الفرعي",
    "Sub-Reseller Permissions": "صلاحيات الموزع الفرعي",
    "Activate Devices (MAC)": "تفعيل الأجهزة (MAC)",
    "Activate devices permission": "صلاحية تفعيل الأجهزة",
    "View Credit Balance": "عرض رصيد الحساب",
    "View credit balance permission": "صلاحية عرض رصيد الحساب",
    "View Credit Logs": "عرض سجلات الرصيد",
    "View credit logs permission": "صلاحية عرض سجلات الرصيد",
    "Request Credits from Parent": "طلب الرصيد من الموزع الأب",
    "Request credits from parent permission":
      "صلاحية طلب الرصيد من الموزع الأب",
    "Manage Playlists": "إدارة القوائم",
    "Manage playlists permission": "صلاحية إدارة القوائم",
    "Create Sub Reseller": "إنشاء موزع فرعي",
    "Filter resellers by status": "تصفية الموزعين حسب الحالة",
    "Filter resellers by account type": "تصفية الموزعين حسب نوع الحساب",
    "Missing selection": "اختيار مفقود",
    "Select both the sub-reseller and the new parent reseller.":
      "اختر كلًا من الموزع الفرعي والموزع الأب الجديد.",
    "Parent updated": "تم تحديث الموزع الأب",
    "The reseller parent was updated successfully.":
      "تم تحديث الموزع الأب بنجاح.",
    "Move failed": "فشل النقل",
    "Failed to move reseller.": "فشل نقل الموزع.",
    "Change Reseller Parent": "تغيير الموزع الأب",
    "Move a sub-reseller to a different parent reseller.":
      "انقل موزعًا فرعيًا إلى موزع أب مختلف.",
    "Select Sub Reseller": "اختر موزعًا فرعيًا",
    "Select a sub reseller...": "اختر موزعًا فرعيًا...",
    "New Parent Reseller": "الموزع الأب الجديد",
    "Select a new parent...": "اختر أبًا جديدًا...",
    "Moving…": "جارٍ النقل…",
    "Move Reseller": "نقل الموزع",
    "Approval failed": "فشلت الموافقة",
    "Failed to approve request.": "فشلت الموافقة على الطلب.",
    "Rejection failed": "فشل الرفض",
    "Failed to reject request.": "فشل رفض الطلب.",
    "Review and approve requests from sub-resellers to change their parent reseller.":
      "راجع ووافق على طلبات الموزعين الفرعيين لتغيير الموزع الأب.",
    "Sub Reseller": "موزع فرعي",
    "Current Parent": "الموزع الأب الحالي",
    "Requested Parent": "الموزع الأب المطلوب",
    "No pending requests.": "لا توجد طلبات معلقة.",
    "Name is required": "الاسم مطلوب",
    "Email is required": "البريد الإلكتروني مطلوب",
    "Failed to save profile": "فشل حفظ الملف الشخصي",
    "Profile Information": "معلومات الملف الشخصي",
    "Update your account details and public profile.":
      "حدّث تفاصيل حسابك وملفك الشخصي العام.",
    "Update your administrator account details.": "حدّث تفاصيل حساب المسؤول.",
    "First name": "الاسم الأول",
    "Last name": "اسم العائلة",
    "Account role": "دور الحساب",
    Administrator: "المسؤول",
    "Company / Reseller Name": "الشركة / اسم الموزع",
    "Enter your company name": "أدخل اسم شركتك",
    "This is your administrator account profile.":
      "هذا هو الملف الشخصي لحساب المسؤول.",
    "This reseller name is managed from the reseller records.":
      "يتم إدارة اسم الموزع من سجلات الموزعين.",
    "Profile updated successfully!": "تم تحديث الملف الشخصي بنجاح!",
    "Change Password": "تغيير كلمة المرور",
    "Ensure your account is using a long, random password to stay secure.":
      "تأكد من أن حسابك يستخدم كلمة مرور طويلة وعشوائية للحفاظ على الأمان.",
    "Current Password": "كلمة المرور الحالية",
    "New Password": "كلمة المرور الجديدة",
    "Confirm New Password": "تأكيد كلمة المرور الجديدة",
    "Update Password": "تحديث كلمة المرور",
    "Two-Factor Authentication": "المصادقة الثنائية",
    "Add an extra layer of security to your account by enabling 2FA.":
      "أضف طبقة أمان إضافية إلى حسابك عبر تفعيل التحقق الثنائي.",
    "Authenticator App": "تطبيق المصادقة",
    "Use an app like Google Authenticator or Authy.":
      "استخدم تطبيقًا مثل Google Authenticator أو Authy.",
    "Notification Preferences": "تفضيلات الإشعارات",
    "Choose how you want to be notified about important events.":
      "اختر كيف تريد أن يتم إشعارك بالأحداث المهمة.",
    "Email Notifications": "إشعارات البريد الإلكتروني",
    "Account Activity": "نشاط الحساب",
    "Get notified about logins and security changes.":
      "احصل على إشعار حول عمليات تسجيل الدخول وتغييرات الأمان.",
    "Low Credit Alert": "تنبيه انخفاض الرصيد",
    "Get notified when your credit balance is low.":
      "احصل على إشعار عندما يكون رصيدك منخفضًا.",
    "Push Notifications": "الإشعارات الفورية",
    "New Device Activation": "تفعيل جهاز جديد",
    "Get notified when a new device is activated.":
      "احصل على إشعار عند تفعيل جهاز جديد.",
    "Save Preferences": "حفظ التفضيلات",
    "Failed to save webhook": "فشل حفظ الـ webhook",
    "Loading integrations...": "جارٍ تحميل التكاملات...",
    "API Keys": "مفاتيح API",
    "Use these keys to integrate with your own applications.":
      "استخدم هذه المفاتيح لربط تطبيقاتك الخاصة.",
    "No API integrations configured yet.": "لا توجد تكاملات API مهيأة بعد.",
    "API Key": "مفتاح API",
    "No key set": "لا يوجد مفتاح مضبوط",
    "Copy API Key": "نسخ مفتاح API",
    Regenerate: "إعادة توليد",
    "Webhook Settings": "إعدادات الـ webhook",
    "Receive real-time notifications about events in your account.":
      "استقبل إشعارات فورية حول الأحداث في حسابك.",
    "Webhook URL": "رابط الـ webhook",
    "Webhook saved successfully!": "تم حفظ الـ webhook بنجاح!",
    "Save Webhook": "حفظ الـ webhook",
    "Missing plan name": "اسم الخطة مفقود",
    "Please enter a plan name before saving.":
      "يرجى إدخال اسم الخطة قبل الحفظ.",
    "Invalid credits": "رصيد غير صالح",
    "Reseller credit plans must include credits greater than zero.":
      "يجب أن تتضمن خطط رصيد الموزع عددًا أكبر من صفر من الأرصدة.",
    "Invalid price": "سعر غير صالح",
    "Price cannot be negative.": "لا يمكن أن يكون السعر سالبًا.",
    "Missing activation duration": "مدة التفعيل مفقودة",
    "Direct activation plans must be either One Year or Lifetime.":
      "يجب أن تكون خطط التفعيل المباشر إما لمدة سنة أو مدى الحياة.",
    "Edit Pricing Plan": "تعديل خطة التسعير",
    "Add Pricing Plan": "إضافة خطة تسعير",
    "Plan Name": "اسم الخطة",
    "Plan Type": "نوع الخطة",
    "Example: Lifetime Activation": "مثال: تفعيل مدى الحياة",
    "Reseller Credit Plan": "خطة رصيد للموزع",
    "Direct Client Activation": "تفعيل مباشر للعميل",
    "Direct plans appear on the external client website. Credit plans stay inside the reseller panel for buying coins/credits.":
      "تظهر الخطط المباشرة على موقع العميل الخارجي، بينما تبقى خطط الرصيد داخل لوحة الموزع لشراء العملات/الأرصدة.",
    "Activation Length": "مدة التفعيل",
    "One Year": "سنة واحدة",
    Lifetime: "مدى الحياة",
    "Enter credits": "أدخل عدد الأرصدة",
    "Enter price": "أدخل السعر",
    Currency: "العملة",
    "Features (optional)": "المزايا (اختياري)",
    "Update pricing plan?": "تحديث خطة التسعير؟",
    "Create pricing plan?": "إنشاء خطة التسعير؟",
    "Are you sure you want to save these pricing plan changes?":
      "هل أنت متأكد من حفظ تغييرات خطة التسعير هذه؟",
    "Are you sure you want to create this pricing plan?":
      "هل أنت متأكد من إنشاء خطة التسعير هذه؟",
    "Create plan": "إنشاء الخطة",
    "Plan updated": "تم تحديث الخطة",
    "{{name}} was updated for direct client activations.":
      "تم تحديث {{name}} لتفعيلات العملاء المباشرة.",
    "{{name}} was updated for reseller credit purchases.":
      "تم تحديث {{name}} لعمليات شراء رصيد الموزعين.",
    "Update issue": "مشكلة في التحديث",
    "The server update failed, so the plan was only updated locally.":
      "فشل تحديث الخادم، لذلك تم تحديث الخطة محليًا فقط.",
    "Plan created": "تم إنشاء الخطة",
    "{{name}} is now available on the direct activation website.":
      "أصبحت {{name}} متاحة الآن على موقع التفعيل المباشر.",
    "{{name}} is now available for reseller credit purchases.":
      "أصبحت {{name}} متاحة الآن لشراء رصيد الموزعين.",
    "Create issue": "مشكلة في الإنشاء",
    "The server create failed, so the plan was only saved locally.":
      "فشل إنشاء الخطة على الخادم، لذا تم حفظها محليًا فقط.",
    "Plan deleted": "تم حذف الخطة",
    "Delete issue": "مشكلة في الحذف",
    "The server delete failed, so the plan was only removed locally.":
      "فشل حذف الخطة من الخادم، لذلك أزيلت محليًا فقط.",
    "Keep direct client activation plans separate from reseller credit recharge plans.":
      "أبقِ خطط التفعيل المباشر منفصلة عن خطط شحن رصيد الموزعين.",
    "Add Plan": "إضافة خطة",
    "Loading pricing plans...": "جارٍ تحميل خطط التسعير...",
    "Direct Activation Plans": "خطط التفعيل المباشر",
    "These appear on the external website for normal clients and should be used only for One Year or Lifetime activations.":
      "تظهر هذه الخطط على الموقع الخارجي للعملاء العاديين ويجب استخدامها فقط للتفعيل لمدة سنة أو مدى الحياة.",
    "No direct activation plans yet. Add One Year and Lifetime plans here for the public website.":
      "لا توجد خطط تفعيل مباشر بعد. أضف هنا خطط السنة الواحدة ومدى الحياة للموقع العام.",
    "Visible on the normal-client activation website.":
      "تظهر على موقع تفعيل العملاء العاديين.",
    "One-time activation payment": "دفعة تفعيل لمرة واحدة",
    "These are only for reseller coin/credit purchases inside the panel.":
      "هذه مخصصة فقط لشراء عملات/أرصدة الموزعين داخل اللوحة.",
    "Used only for reseller wallet/coin recharge.":
      "تُستخدم فقط لشحن محفظة/عملات الموزع.",
    "One-time payment": "دفعة لمرة واحدة",
    "Delete pricing plan?": "حذف خطة التسعير؟",
    "Are you sure you want to delete {{name}}? This action cannot be undone.":
      "هل أنت متأكد أنك تريد حذف {{name}}؟ لا يمكن التراجع عن هذا الإجراء.",
    "Delete plan": "حذف الخطة",
    "Development Payment Gateway": "بوابة الدفع الخاصة بالتطوير",
    "Simulate a successful payment to auto-recharge credits during development.":
      "قم بمحاكاة دفعة ناجحة لشحن الرصيد تلقائيًا أثناء التطوير.",
    "Close payment modal": "إغلاق نافذة الدفع",
    credits: "أرصدة",
    "Simulated payment": "دفعة تجريبية",
    "Payment method": "طريقة الدفع",
    "Bank Card": "بطاقة بنكية",
    "Bank Transfer": "تحويل بنكي",
    "Payer name": "اسم الدافع",
    "Payer email": "بريد الدافع الإلكتروني",
    "Payment reference": "مرجع الدفع",
    "Confirming…": "جارٍ التأكيد…",
    "Simulate successful payment": "محاكاة دفع ناجح",
    "Recharge completed": "اكتملت عملية الشحن",
    "{{count}} credits were added automatically after simulated payment confirmation. New balance: {{balance}}.":
      "تمت إضافة {{count}} من الأرصدة تلقائيًا بعد تأكيد الدفع التجريبي. الرصيد الجديد: {{balance}}.",
    "Purchase not completed": "لم يكتمل الشراء",
    "The payment was not confirmed, so no credits were added.":
      "لم يتم تأكيد الدفع، لذلك لم تتم إضافة أي أرصدة.",
    "Purchase failed": "فشل الشراء",
    "Failed to complete purchase.": "فشل إتمام عملية الشراء.",
    "Only resellers can purchase recharge plans directly. Sub-resellers should request credits from their reseller.":
      "يمكن للموزعين فقط شراء خطط الشحن مباشرة. يجب على الموزعين الفرعيين طلب الرصيد من الموزع التابعين له.",
    "Available Credit Plans": "خطط الرصيد المتاحة",
    "Credit Recharge Plans": "خطط شحن الرصيد",
    "Pick a plan and, once payment is confirmed, the credits are added to your balance automatically.":
      "اختر خطة، وبعد تأكيد الدفع ستتم إضافة الأرصدة إلى رصيدك تلقائيًا.",
    "No reseller credit plans were found in the backend.":
      "لم يتم العثور على خطط رصيد للموزعين في الـ backend.",
    Points: "نقاط",
    "Purchase credits to unlock features.": "اشترِ أرصدة لفتح المزايا.",
    "Automatic recharge after payment confirmation":
      "شحن تلقائي بعد تأكيد الدفع",
    "Pay & Recharge": "ادفع واشحن",
    "Enter 4-digit PIN": "أدخل رمز PIN المكوّن من 4 أرقام",
    "Recipient and amount are required before continuing.":
      "المستلم والمبلغ مطلوبان قبل المتابعة.",
    "Credits updated": "تم تحديث الأرصدة",
    "The credit operation completed successfully.":
      "اكتملت عملية الرصيد بنجاح.",
    "Close transfer modal": "إغلاق نافذة التحويل",
    "Action Type": "نوع الإجراء",
    "Add Credits": "إضافة أرصدة",
    "Revoke Credits": "سحب الأرصدة",
    "Recipient Account": "حساب المستلم",
    "Loading existing accounts...": "جارٍ تحميل الحسابات الموجودة...",
    "Select an existing reseller or sub-reseller":
      "اختر موزعًا أو موزعًا فرعيًا موجودًا",
    "No reseller accounts available": "لا توجد حسابات موزعين متاحة",
    "Pick one of the existing accounts instead of typing a manual username or email.":
      "اختر أحد الحسابات الموجودة بدلًا من كتابة اسم مستخدم أو بريد إلكتروني يدويًا.",
    "Notes (Optional)": "ملاحظات (اختياري)",
    "Reason for transfer...": "سبب التحويل...",
    "Add Credits to Account": "إضافة أرصدة إلى الحساب",
    "Processing...": "جارٍ المعالجة...",
    "Invalid amount": "مبلغ غير صالح",
    "Enter a valid credit amount.": "أدخل كمية رصيد صالحة.",
    "Request submitted": "تم إرسال الطلب",
    "Your credit request was submitted successfully.":
      "تم إرسال طلب الرصيد الخاص بك بنجاح.",
    "Request failed": "فشل الطلب",
    "Failed to submit credit request.": "فشل إرسال طلب الرصيد.",
    "Submit a live request to your parent reseller using the backend.":
      "أرسل طلبًا حقيقيًا إلى الموزع الأب عبر الـ backend.",
    "Amount of Credits": "كمية الأرصدة",
    "Additional details...": "تفاصيل إضافية...",
    "Submitting...": "جارٍ الإرسال...",
    "Submit Request": "إرسال الطلب",
    "Return request submitted": "تم إرسال طلب الإرجاع",
    "Your credit return request was submitted successfully.":
      "تم إرسال طلب إرجاع الرصيد الخاص بك بنجاح.",
    "Return request failed": "فشل طلب الإرجاع",
    "Failed to submit return request.": "فشل إرسال طلب الإرجاع.",
    "Send Credits Back": "إرجاع الأرصدة",
    "Return unused credits to your parent reseller using the backend workflow.":
      "أعد الأرصدة غير المستخدمة إلى الموزع الأب باستخدام سير عمل الـ backend.",
    "Confirm Return": "تأكيد الإرجاع",
    "Please enter your 4-digit PIN to confirm returning these credits.":
      "يرجى إدخال رمز PIN المكوّن من 4 أرقام لتأكيد إرجاع هذه الأرصدة.",
    "Pending Credit Requests": "طلبات الرصيد المعلقة",
    "Review real pending requests from the backend and check payment notes before approving or rejecting them.":
      "راجع الطلبات الحقيقية المعلقة من الـ backend وتحقق من ملاحظات الدفع قبل الموافقة أو الرفض.",
    "Request ID": "معرّف الطلب",
    Requester: "مقدّم الطلب",
    "Reseller Note / Payment Ref": "ملاحظة الموزع / مرجع الدفع",
    "No payment reference or notes provided.":
      "لم يتم توفير مرجع دفع أو ملاحظات.",
    "Approve request": "الموافقة على الطلب",
    "Reject request": "رفض الطلب",
    "No pending requests right now.": "لا توجد طلبات معلقة حاليًا.",
    "Confirm Credit Transfer": "تأكيد تحويل الرصيد",
    "Please enter your 4-digit PIN to confirm processing {{amount}} credits.":
      "يرجى إدخال رمز PIN المكوّن من 4 أرقام لتأكيد معالجة {{amount}} من الأرصدة.",
    "My Charge Requests": "طلبات الشحن الخاصة بي",
    "Real request history loaded from the backend.":
      "تم تحميل سجل الطلبات الحقيقي من الـ backend.",
    "Search requests...": "ابحث في الطلبات...",
    "No charge requests found matching your filters.":
      "لم يتم العثور على طلبات شحن تطابق عوامل التصفية.",
    "You requested credits from Administrator": "لقد طلبت أرصدة من المسؤول",
    "{{name}} requested credits from Administrator":
      "طلب {{name}} أرصدة من المسؤول",
    "You requested credits from {{name}}": "لقد طلبت أرصدة من {{name}}",
    "{{requester}} requested credits from {{parent}}":
      "طلب {{requester}} أرصدة من {{parent}}",
    "You requested to return credits to {{name}}":
      "لقد طلبت إعادة الأرصدة إلى {{name}}",
    "{{name}} requested to return credits to {{parent}}":
      "طلب {{name}} إعادة الأرصدة إلى {{parent}}",
    "Administrator transferred credits to you": "قام المسؤول بتحويل أرصدة إليك",
    "{{name}} transferred credits to {{target}}":
      "قام {{name}} بتحويل أرصدة إلى {{target}}",
    "You completed a recharge plan purchase": "لقد أكملت شراء خطة شحن",
    "{{name}} completed a recharge plan purchase": "أكمل {{name}} شراء خطة شحن",
    "Direct client": "عميل مباشر",
    "{{name}} purchased a direct activation plan":
      "اشترى {{name}} خطة تفعيل مباشر",
    "You transferred credits to {{name}}": "لقد حولت أرصدة إلى {{name}}",
    "{{name}} transferred credits to you": "حوّل {{name}} أرصدة إليك",
    "You revoked credits from {{name}}": "لقد سحبت الأرصدة من {{name}}",
    "Administrator revoked credits from you": "قام المسؤول بسحب الأرصدة منك",
    "{{name}} revoked credits from you": "سحب {{name}} الأرصدة منك",
    "{{name}} revoked credits from {{target}}":
      "سحب {{name}} الأرصدة من {{target}}",
    "From {{name}}": "من {{name}}",
    "To {{name}}": "إلى {{name}}",
    "your parent reseller": "الموزع الأب الخاص بك",
    "parent reseller": "الموزع الأب",
    "the sub-reseller": "الموزع الفرعي",
    reseller: "موزع",
    "Search withdraw logs...": "ابحث في سجلات السحب...",
    "Log ID": "معرّف السجل",
    "Amount Withdrawn": "المبلغ المسحوب",
    "No withdraw logs found matching your filters.":
      "لم يتم العثور على سجلات سحب تطابق عوامل التصفية.",
  },
};

const I18nContext = createContext<I18nContextType | undefined>(undefined);

function interpolate(
  template: string,
  params?: Record<string, string | number>,
) {
  if (!params) return template;
  return Object.entries(params).reduce(
    (result, [key, value]) => result.replaceAll(`{{${key}}}`, String(value)),
    template,
  );
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>(() => {
    const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return saved === "FR" || saved === "AR" || saved === "EN" ? saved : "EN";
  });

  const setLanguage = useCallback((nextLanguage: SupportedLanguage) => {
    setLanguageState(nextLanguage);
  }, []);

  // Keep the panel layout stable in LTR even when Arabic is selected.
  const dir: "ltr" = "ltr";
  const locale = LOCALE_MAP[language];

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [dir, language, locale]);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>) => {
      const translated =
        language === "EN" ? key : translations[language]?.[key] || key;
      return interpolate(translated, params);
    },
    [language],
  );

  const value = useMemo(
    () => ({ language, locale, dir, setLanguage, t }),
    [dir, language, locale, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
