import type { Strings } from './it'

const en: Strings = {
  appName: 'Calendar',
  auth: {
    login: 'Log in',
    signup: 'Create account',
    identifier: 'Username or email',
    email: 'Email',
    username: 'Username',
    displayName: 'Name',
    password: 'Password',
    noAccount: 'No account yet?',
    haveAccount: 'Already have an account?',
    wrongCredentials: 'Wrong username/email or password.',
    usernameRule: '2 to 32 characters: lowercase letters, numbers, . _ -',
    usernameTaken: 'That username is already taken.',
    full: 'This calendar already has its two accounts.',
    checkEmail: 'We sent you an email: confirm your address, then log in.',
    genericError: 'Something went wrong. Please try again.',
  },
  month: {
    today: 'Today',
    prev: 'Previous month',
    next: 'Next month',
  },
  day: {
    back: 'Back to month',
    empty: 'Nothing planned.',
    emptyHint: 'Events, tasks and notes arrive in the next step.',
    prev: 'Previous day',
    next: 'Next day',
  },
  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    dark: 'Dark',
    light: 'Light',
    system: 'System',
    signedInAs: 'Signed in as {{name}}',
    logout: 'Log out',
    close: 'Close',
  },
}

export default en
