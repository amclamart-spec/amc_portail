import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { StatusBar, Style } from '@capacitor/status-bar';

// Application mobile (Capacitor) : le portail web est chargé tel quel dans l'app,
// ce module regroupe les seuls comportements qui diffèrent du navigateur.
// Chaque appel natif est protégé par isPluginAvailable : une ancienne version de
// l'app installée peut ne pas encore embarquer un plugin ajouté depuis.

export const MOBILE_APP_SCHEME = 'fr.musulmansdeclamart.portail';

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

function hasPlugin(name) {
  return isNativeApp() && Capacitor.isPluginAvailable(name);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function saveBlobInBrowser(blob, fileName) {
  const objectUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(objectUrl);
}

// Enregistre un fichier reçu de l'API (Blob). Navigateur : téléchargement classique.
// Application : un lien blob/download ne fait rien dans la WebView — le fichier est
// écrit dans le cache de l'app puis proposé via la feuille de partage du téléphone
// (ouvrir dans un lecteur PDF, enregistrer dans Fichiers, envoyer…).
export async function saveFile(blob, fileName = 'fichier') {
  const safeName = String(fileName).replace(/[\\/:*?"<>|]+/g, '-').trim() || 'fichier';
  if (!hasPlugin('Filesystem') || !hasPlugin('Share')) {
    saveBlobInBrowser(blob, safeName);
    return;
  }
  const { uri } = await Filesystem.writeFile({
    path: safeName,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  try {
    await Share.share({ title: safeName, files: [uri] });
  } catch (error) {
    // Fermeture de la feuille de partage par l'utilisateur : pas une erreur.
    if (!/cancel/i.test(String(error?.message || error))) throw error;
  }
}

// Ouvre une URL externe (ancien fichier de uploads/, lien sortant) : onglet du
// navigateur intégré dans l'app, nouvel onglet sinon.
export function openExternalUrl(url) {
  if (hasPlugin('Browser')) {
    Browser.open({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}

// Retour de la connexion Google : le backend redirige vers
// fr.musulmansdeclamart.portail://auth/google/callback?mobileCode=… (ou ?error=…),
// relayé ici vers la page de callback du portail qui échange le code.
function handleAppUrlOpen({ url }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return;
  }
  const route = `${parsed.host}${parsed.pathname}`.replace(/^\/+/, '');
  if (route === 'auth/google/callback') {
    if (hasPlugin('Browser')) Browser.close().catch(() => {});
    window.location.replace(`/auth/google/callback${parsed.search}`);
  }
}

let initialized = false;

export function initNativeApp() {
  if (!isNativeApp() || initialized) return;
  initialized = true;
  document.documentElement.classList.add('native-app');

  if (hasPlugin('StatusBar')) {
    StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    StatusBar.setStyle({ style: Style.Dark }).catch(() => {});
    StatusBar.setBackgroundColor({ color: '#213B88' }).catch(() => {});
  }

  if (hasPlugin('App')) {
    // Bouton retour Android : page précédente, ou sortie de l'app depuis la première page.
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
    App.addListener('appUrlOpen', handleAppUrlOpen);
  }
}
