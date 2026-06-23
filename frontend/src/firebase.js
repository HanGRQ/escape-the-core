/**
 * Firebase client SDK initialisation — Auth only.
 *
 * These are PUBLIC config values (safe to ship to the browser, unlike
 * the backend's private service-account key in backend/.env). They come
 * from your Firebase project settings > General > Your apps > Web app.
 *
 * Required Vite env vars (see frontend/.env.example):
 *   VITE_FIREBASE_API_KEY
 *   VITE_FIREBASE_AUTH_DOMAIN
 *   VITE_FIREBASE_PROJECT_ID
 *   VITE_FIREBASE_APP_ID
 *
 * In the Firebase Console, under Authentication > Sign-in method, make
 * sure these providers are enabled (the login screen offers all three):
 *   - Email/Password
 *   - Google
 *   - Anonymous
 */
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey:     import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId:      import.meta.env.VITE_FIREBASE_APP_ID,
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const googleProvider = new GoogleAuthProvider()
