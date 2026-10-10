const it = {
  appName: 'Calendario',
  auth: {
    login: 'Accedi',
    signup: 'Crea account',
    identifier: 'Username o email',
    email: 'Email',
    username: 'Username',
    displayName: 'Nome',
    password: 'Password',
    showPassword: 'Mostra password',
    hidePassword: 'Nascondi password',
    noAccount: 'Non hai un account?',
    haveAccount: 'Hai già un account?',
    wrongCredentials: 'Username/email o password errati.',
    usernameRule: 'Da 2 a 32 caratteri: lettere minuscole, numeri, . _ -',
    usernameTaken: 'Questo username è già usato.',
    full: 'Questo calendario ha già i suoi due account.',
    checkEmail: 'Ti abbiamo mandato una email: conferma l’indirizzo e poi accedi.',
    genericError: 'Qualcosa è andato storto. Riprova.',
    tooManyAttempts: 'Troppi tentativi. Aspetta un po’ e riprova.',
  },
  month: {
    today: 'Oggi',
    prev: 'Mese precedente',
    next: 'Mese successivo',
  },
  day: {
    back: 'Torna al mese',
    empty: 'Niente in programma.',
    emptyHint: 'Eventi, attività e note arriveranno nel prossimo passo.',
    prev: 'Giorno precedente',
    next: 'Giorno successivo',
  },
  settings: {
    title: 'Impostazioni',
    language: 'Lingua',
    theme: 'Tema',
    dark: 'Scuro',
    light: 'Chiaro',
    system: 'Sistema',
    signedInAs: 'Accesso come {{name}}',
    logout: 'Esci',
    close: 'Chiudi',
  },
}

export default it
export type Strings = typeof it
