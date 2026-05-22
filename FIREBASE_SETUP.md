# Firebase setup for TR-SYNTAX REMAP

## 1. Create Firebase project

Create a Firebase project, then enable:

- Authentication: Email/Password
- Firestore Database
- Storage

## 2. Add web app config

Open Firebase Console > Project settings > Your apps > Web app, then copy the config into `firebase-config.js`.

The Firebase config is public client config, but rules still protect data access.

## 3. Seed starter catalog

Create these Firestore collections:

- `products`
- `packages`
- `orders`
- `users`
- `admins`
- `hwidLicenses`

For admin access, create a document in `admins` where the document ID is the Firebase Auth UID of your admin user:

```json
{
  "email": "admin@example.com",
  "role": "admin"
}
```

## 4. Suggested Firestore rules

Start with these rules, then tighten them for production:

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function admin() {
      return signedIn() && exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    match /products/{id} {
      allow read: if true;
      allow write: if admin();
    }

    match /packages/{id} {
      allow read: if true;
      allow write: if admin();
    }

    match /users/{uid} {
      allow read, write: if signedIn() && request.auth.uid == uid;
      allow read: if admin();
    }

    match /orders/{id} {
      allow create: if signedIn() && request.resource.data.userId == request.auth.uid;
      allow read: if admin() || (signedIn() && resource.data.userId == request.auth.uid);
      allow update, delete: if admin();
    }

    match /admins/{uid} {
      allow read: if signedIn() && request.auth.uid == uid;
      allow write: if admin();
    }

    match /hwidLicenses/{id} {
      allow read, write: if admin();
    }
  }
}
```

## 5. Suggested Storage rules

```js
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    function signedIn() {
      return request.auth != null;
    }

    function admin() {
      return signedIn() && firestore.exists(/databases/(default)/documents/admins/$(request.auth.uid));
    }

    match /slips/{uid}/{fileName} {
      allow create: if signedIn() && request.auth.uid == uid && request.resource.size < 5 * 1024 * 1024;
      allow read: if signedIn() && request.auth.uid == uid || admin();
    }
  }
}
```
