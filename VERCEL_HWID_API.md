# HWID License API for Vercel

Endpoint:

```txt
POST /api/check-license
```

Required fields:

```txt
license_key
hwid
```

Optional fields:

```txt
app_name
version
machine_name
```

## Vercel Environment Variable

Create a Firebase service account key:

```txt
Firebase Console -> Project settings -> Service accounts -> Generate new private key
```

Do not commit that JSON file to GitHub.

Recommended Vercel variable:

```txt
FIREBASE_SERVICE_ACCOUNT_BASE64
```

Convert the JSON key to Base64 on Windows PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\service-account.json"))
```

Paste the output into Vercel:

```txt
Project -> Settings -> Environment Variables
```

## C# URL

After Vercel deploy, set the C# API URL to:

```txt
https://your-project.vercel.app/api/check-license
```

If the compiled program is already distributed, create `hwid-api-url.txt` next to the `.exe` and put the URL above in the file.
